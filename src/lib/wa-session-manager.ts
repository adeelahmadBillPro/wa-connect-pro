import { createServiceClient } from "@/lib/supabase/service";
import QRCode from "qrcode";
import { createSupabaseAuthState, clearAuth, hasAuth, filterRestorable } from "@/lib/baileys-supabase-auth";
import { classifyDisconnect, clampTrust } from "@/lib/disconnect-classifier";
import { notifyAdminSessionBanned } from "@/lib/notify-admin";

// ── Types ────────────────────────────────────────────────────────────────────
type SessionStatus = "connecting" | "qr_ready" | "connected" | "disconnected";

interface ActiveSession {
  socket: any;
  qrCode: string | null;
  status: SessionStatus;
  orgId?: string;
  restartCount?: number;
  phoneNumber?: string | null;
  intentionalDisconnect?: boolean;
}

// ── Global store (survives Next.js hot reloads) ───────────────────────────────
const globalForWA = globalThis as typeof globalThis & {
  waActiveSessions?: Map<string, ActiveSession>;
  waRestoreStarted?: boolean;
};

if (!globalForWA.waActiveSessions) {
  globalForWA.waActiveSessions = new Map<string, ActiveSession>();
}

const activeSessions = globalForWA.waActiveSessions;

// ── Load Baileys lazily (ESM) ─────────────────────────────────────────────────
async function loadBaileys() {
  const mod = await import("@whiskeysockets/baileys");
  return mod;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Random delay between [min, max] ms — used for human-like pacing.
function sleep(min: number, max?: number): Promise<void> {
  const ms = max == null ? min : min + Math.floor(Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Stable per-session browser fingerprint. Same session always gets the same
// Chrome version (so WhatsApp sees a consistent device); different sessions
// rotate across recent versions to avoid the bot-tell of every connection
// reporting the exact same UA.
const CHROME_VERSIONS = ["131.0.0", "132.0.0", "133.0.0"];
function fingerprintFor(sessionId: string): [string, string, string] {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  const version = CHROME_VERSIONS[hash % CHROME_VERSIONS.length];
  return ["WA Connect Pro", "Chrome", version];
}

// ── Start / restore a session ─────────────────────────────────────────────────
export async function startSession(sessionId: string, orgId: string): Promise<{ status: string; qrCode: string | null }> {
  // If already running and not stuck, return current state
  if (activeSessions.has(sessionId)) {
    const existing = activeSessions.get(sessionId)!;
    if (existing.status === "connected" || existing.status === "qr_ready") {
      return { status: existing.status, qrCode: existing.qrCode };
    }
    // Clean up stuck session
    try { existing.socket?.end?.(); } catch { /* ignore */ }
    activeSessions.delete(sessionId);
  }

  const supabase = createServiceClient();

  await supabase.from("wa_sessions").update({ status: "connecting" }).eq("id", sessionId);

  const sessionData: ActiveSession = {
    socket: null,
    qrCode: null,
    status: "connecting",
    orgId,
    restartCount: 0,
  };
  activeSessions.set(sessionId, sessionData);

  try {
    const {
      default: makeWASocket,
      fetchLatestBaileysVersion,
      makeCacheableSignalKeyStore,
    } = await loadBaileys();

    // Load auth state from Supabase (survives server restart / VPS migration)
    const { state, saveCreds } = await createSupabaseAuthState(sessionId);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`[WA] Starting Baileys session: ${sessionId}`);

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, {
          level: "silent",
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          child: () => ({ level: "silent", trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => ({} as any) }),
        } as any),
      },
      printQRInTerminal: false,
      browser: fingerprintFor(sessionId),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 30000,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 3000,
      maxMsgRetryCount: 2,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
    });

    sessionData.socket = sock;

    // Save credentials on update
    sock.ev.on("creds.update", saveCreds);

    // Connection state handler
    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      // New QR code
      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr);
          sessionData.qrCode = qrDataUrl;
          sessionData.status = "qr_ready";
          activeSessions.set(sessionId, sessionData);
          console.log(`[WA] QR ready for session: ${sessionId}`);
          await supabase.from("wa_sessions").update({ status: "qr_ready" }).eq("id", sessionId);
        } catch (e: any) {
          console.error("[WA] QR generation failed:", e?.message);
        }
      }

      // Connected
      if (connection === "open") {
        console.log(`[WA] Session connected: ${sessionId}`);
        sessionData.status = "connected";
        sessionData.qrCode = null;
        sessionData.restartCount = 0;

        // Extract phone number from JID
        const rawId = sock.user?.id || "";
        const phoneNumber = rawId.split(":")[0].split("@")[0] || null;
        sessionData.phoneNumber = phoneNumber;

        await supabase.from("wa_sessions").update({
          status: "connected",
          is_active: true,
          phone_number: phoneNumber,
          last_connected_at: new Date().toISOString(),
          // Healthy connection — clear the repeat-failure counter so the
          // 5-disconnects-in-1-hour ban heuristic only catches actual
          // repeat-failure clusters, not noise across long uptimes.
          consecutive_disconnects: 0,
        }).eq("id", sessionId);

        activeSessions.set(sessionId, sessionData);
      }

      // Disconnected
      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const wasIntentional = sessionData.intentionalDisconnect === true;
        const cls = classifyDisconnect(statusCode);

        console.log(`[WA] Session disconnected: ${sessionId}, code: ${statusCode}, kind: ${cls.kind}, intentional: ${wasIntentional}`);

        sessionData.status = "disconnected";
        sessionData.qrCode = null;
        activeSessions.delete(sessionId);

        // Pull current row to make trust + counter updates atomic-ish from
        // the JS side. Race-safe enough for real traffic; worst case a
        // counter loses a tick across a parallel close.
        const { data: current } = await supabase
          .from("wa_sessions")
          .select("trust_score, consecutive_disconnects, last_disconnect_at, org_id")
          .eq("id", sessionId)
          .single();

        const prevTrust = current?.trust_score ?? 100;
        const newTrust = clampTrust(prevTrust - cls.trustPenalty);

        // Increment consecutive_disconnects only if the previous one was
        // recent (<1h ago). Otherwise reset to 1 — old failures shouldn't
        // poison long-stable sessions that hiccup once.
        const ONE_HOUR_MS = 60 * 60 * 1000;
        const lastAt = current?.last_disconnect_at ? new Date(current.last_disconnect_at).getTime() : 0;
        const recent = Date.now() - lastAt < ONE_HOUR_MS;
        const newConsecutive = recent ? (current?.consecutive_disconnects ?? 0) + 1 : 1;

        // Repeat-failure escalation: 5 disconnects within 1 hour = treat as
        // banned even if the individual codes were "recoverable". WhatsApp
        // is clearly refusing this number for some reason.
        const escalateToBanned =
          cls.kind !== "logout" && cls.kind !== "banned" && newConsecutive >= 5;

        const finalKind = escalateToBanned ? "banned" : cls.kind;
        const baseUpdate: Record<string, unknown> = {
          status: finalKind === "banned" ? "banned" : "disconnected",
          is_active: false,
          trust_score: newTrust,
          consecutive_disconnects: newConsecutive,
          last_disconnect_code: statusCode ?? null,
          last_disconnect_at: new Date().toISOString(),
        };
        await supabase.from("wa_sessions").update(baseUpdate).eq("id", sessionId);

        // Branch on the (possibly escalated) classification.
        if (wasIntentional) {
          console.log(`[WA] Intentional disconnect: ${sessionId} — no restart`);
          return;
        }

        if (finalKind === "logout") {
          console.log(`[WA] Explicit logout: ${sessionId} — clearing auth state`);
          try { await clearAuth(sessionId); } catch (e: any) {
            console.error("[WA] Failed to clear auth state:", e?.message);
          }
          return;
        }

        if (finalKind === "banned") {
          const reason = escalateToBanned
            ? `Repeat-failure escalation: ${newConsecutive} disconnects in <1h`
            : cls.reason;
          console.log(`[WA] BANNED: ${sessionId} — ${reason}. No restart.`);

          // Wipe auth so the next deploy / restoreSessions() doesn't try to
          // resurrect a dead session, and so the admin must consciously
          // re-scan after investigating.
          try { await clearAuth(sessionId); } catch (e: any) {
            console.error("[WA] Failed to clear auth state on ban:", e?.message);
          }

          // Best-effort admin alert + webhook fan-out.
          notifyAdminSessionBanned({
            sessionId,
            phoneNumber: sessionData.phoneNumber ?? null,
            orgName: null,
            reason,
            statusCode: statusCode ?? null,
          }).catch(() => {});

          fireBannedWebhook(supabase, current?.org_id as string | undefined, {
            sessionId,
            phoneNumber: sessionData.phoneNumber ?? null,
            reason,
            statusCode: statusCode ?? null,
          }).catch(() => {});

          return;
        }

        // Recoverable / warning → reconnect with backoff.
        const restartCount = sessionData.restartCount || 0;
        const delayMs = Math.min(10000 * Math.pow(2, restartCount), 300000);
        const tag = finalKind === "warning" ? "WARNING" : "RECOVER";
        console.log(`[WA] ${tag} restart: ${sessionId} in ${delayMs / 1000}s (code: ${statusCode}, trust: ${newTrust})`);
        setTimeout(async () => {
          try {
            if (!activeSessions.has(sessionId)) {
              if (await hasAuth(sessionId)) {
                activeSessions.set(sessionId, {
                  socket: null, qrCode: null, status: "connecting",
                  orgId, restartCount: restartCount + 1,
                });
                await startSession(sessionId, orgId);
              }
            }
          } catch (e: any) {
            console.error("[WA] Auto-restart failed:", e?.message);
          }
        }, delayMs);
      }
    });

    return { status: "connecting", qrCode: null };

  } catch (err: any) {
    console.error("[WA] Failed to start session:", sessionId, err?.message);
    activeSessions.delete(sessionId);
    await supabase.from("wa_sessions").update({ status: "disconnected", is_active: false }).eq("id", sessionId);
    throw err;
  }
}

// ── Get session status ────────────────────────────────────────────────────────
export async function getSessionStatus(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (!session) return { status: "disconnected", qrCode: null };
  return { status: session.status, qrCode: session.qrCode };
}

// ── Check if session is alive ─────────────────────────────────────────────────
export function isSessionActive(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  return session?.status === "connected";
}

export function getActiveSessions(): string[] {
  const active: string[] = [];
  activeSessions.forEach((session, id) => {
    if (session.status === "connected") active.push(id);
  });
  return active;
}

// Pick the best session for sending — least used today, under daily limit
// Pass all connected sessions from DB; returns the best session id or null
export function pickBestSession(
  dbSessions: { id: string; daily_limit: number; messages_sent_today: number }[]
): { id: string; daily_limit: number; messages_sent_today: number } | null {
  const eligible = dbSessions
    .filter((s) => isSessionActive(s.id) && s.messages_sent_today < s.daily_limit)
    .sort((a, b) => a.messages_sent_today - b.messages_sent_today); // least used first
  return eligible[0] || null;
}

// ── Disconnect / delete session ───────────────────────────────────────────────
export async function disconnectSession(sessionId: string, deleteAuthFiles = false) {
  const session = activeSessions.get(sessionId);
  if (session) {
    // Mark as intentional so the close handler doesn't auto-restart
    session.intentionalDisconnect = true;
    if (session.socket) {
      try { session.socket.end?.(); } catch { /* ignore */ }
    }
  }

  activeSessions.delete(sessionId);

  if (deleteAuthFiles) {
    try {
      await clearAuth(sessionId);
      console.log("[WA] Cleared auth state:", sessionId);
    } catch (e: any) {
      console.error("[WA] Failed to clear auth state:", e?.message);
    }
  }

  const supabase = createServiceClient();
  await supabase.from("wa_sessions").update({ status: "disconnected", is_active: false }).eq("id", sessionId);

  return { success: true };
}

// ── Send message ──────────────────────────────────────────────────────────────
export async function sendWAMessage(
  sessionId: string,
  to: string,
  message: {
    type: "text" | "image" | "document" | "video";
    content: string;
    mediaUrl?: string;
    mediaBase64?: string;
    mediaData?: string;
    mediaMimetype?: string;
    caption?: string;
    filename?: string;
  },
  // simulateHuman defaults to true for text (cheap pause looks human),
  // false for media uploads (the upload itself takes time, presence is
  // less needed and adds 3s per message to bulk PDF runs).
  simulateHuman?: boolean,
) {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== "connected" || !session.socket) {
    throw new Error("Session not connected");
  }

  const phone = to.replace(/[^0-9]/g, "");
  const jid = `${phone}@s.whatsapp.net`;

  // Basic phone number length check
  if (phone.length < 10 || phone.length > 15) {
    throw new Error(`Invalid phone number: ${to}. Must be 10-15 digits with country code (e.g. 923001234567)`);
  }

  // Default: simulate for text, skip for media
  const shouldSimulate = simulateHuman ?? message.type === "text";

  try {
    // Check if number is registered on WhatsApp (3s timeout — skip if slow)
    try {
      const checkResult = await Promise.race([
        session.socket.onWhatsApp(phone),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
      ]) as any[];

      if (Array.isArray(checkResult) && checkResult.length === 0) {
        throw new Error(`NOT_ON_WHATSAPP: ${phone} is not registered on WhatsApp`);
      }
    } catch (e: any) {
      if (e?.message?.startsWith("NOT_ON_WHATSAPP")) throw e;
      // timeout or network error — skip check, proceed with send
    }

    // Human-like typing simulation: composing → 1.5-3.5s → paused → brief
    // settle. Best-effort — failures must NOT block the actual send.
    if (shouldSimulate) {
      try {
        await session.socket.sendPresenceUpdate("composing", jid);
        await sleep(1500, 3500);
        await session.socket.sendPresenceUpdate("paused", jid);
        await sleep(300, 700);
      } catch {
        // Presence update isn't critical — proceed with send.
      }
    }

    let result: any;

    if (message.type === "text") {
      result = await session.socket.sendMessage(jid, { text: message.content });

    } else if (message.mediaBase64) {
      // Base64 file
      const buffer = Buffer.from(message.mediaBase64, "base64");
      const ext = message.filename?.split(".").pop()?.toLowerCase() || "";
      const mimetype = getMimetype(ext, message.type);

      if (message.type === "image") {
        result = await session.socket.sendMessage(jid, {
          image: buffer,
          caption: message.caption || message.content || undefined,
          mimetype,
        });
      } else {
        result = await session.socket.sendMessage(jid, {
          document: buffer,
          caption: message.caption || message.content || undefined,
          mimetype,
          fileName: message.filename || "document",
        });
      }

    } else if (message.mediaData && message.mediaMimetype) {
      // Raw base64 with mimetype
      const buffer = Buffer.from(message.mediaData, "base64");
      if (message.type === "image") {
        result = await session.socket.sendMessage(jid, {
          image: buffer,
          caption: message.caption || message.content || undefined,
          mimetype: message.mediaMimetype,
        });
      } else {
        result = await session.socket.sendMessage(jid, {
          document: buffer,
          caption: message.caption || message.content || undefined,
          mimetype: message.mediaMimetype,
          fileName: message.filename || "document",
        });
      }

    } else if (message.mediaUrl) {
      // Download from URL then send
      console.log("[WA] Downloading media from URL:", message.mediaUrl);
      const buffer = await downloadUrl(message.mediaUrl);
      const ext = message.mediaUrl.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
      const mimetype = getMimetype(ext, message.type);

      if (message.type === "image") {
        result = await session.socket.sendMessage(jid, {
          image: buffer,
          caption: message.caption || message.content || undefined,
          mimetype,
        });
      } else {
        result = await session.socket.sendMessage(jid, {
          document: buffer,
          caption: message.caption || message.content || undefined,
          mimetype,
          fileName: message.filename || `file.${ext || "pdf"}`,
        });
      }
    } else {
      // Fallback to text
      result = await session.socket.sendMessage(jid, { text: message.content });
    }

    return {
      success: true,
      messageId: result?.key?.id || null,
    };
  } catch (error: any) {
    const msg = error?.message || "Failed to send message";
    throw new Error(msg);
  }
}

// ── Restore sessions on startup ───────────────────────────────────────────────
export async function restoreSessions() {
  if (globalForWA.waRestoreStarted) return;
  globalForWA.waRestoreStarted = true;

  console.log("[STARTUP] Restoring WA sessions from database...");

  const supabase = createServiceClient();
  const { data: sessions } = await supabase
    .from("wa_sessions")
    .select("id, org_id, phone_number, status")
    .not("phone_number", "is", null);

  if (!sessions || sessions.length === 0) {
    console.log("[STARTUP] No sessions to restore");
    return;
  }

  // Only restore sessions with auth rows in Supabase
  const restorable = await filterRestorable(sessions.map((s) => s.id));
  const toRestore = sessions.filter((s) => {
    if (restorable.has(s.id)) return true;
    console.log(`[STARTUP] Skipping ${s.id} — no auth state in DB`);
    supabase.from("wa_sessions").update({ status: "disconnected", is_active: false }).eq("id", s.id).then(() => {});
    return false;
  });

  if (toRestore.length === 0) {
    console.log("[STARTUP] No sessions with auth state — all need QR scan");
    return;
  }

  console.log(`[STARTUP] Restoring ${toRestore.length} session(s)...`);

  for (const session of toRestore) {
    try {
      console.log(`[WA] Restoring: ${session.id} (${session.phone_number})`);
      await startSession(session.id, session.org_id);
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err: any) {
      console.error(`[WA] Failed to restore ${session.id}:`, err?.message);
      await supabase.from("wa_sessions").update({ status: "disconnected", is_active: false }).eq("id", session.id);
    }
  }

  console.log("[STARTUP] WA session restore complete");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getMimetype(ext: string, type: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    mp4: "video/mp4",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || (type === "image" ? "image/jpeg" : "application/octet-stream");
}

async function downloadUrl(url: string): Promise<Buffer> {
  const protocol = url.startsWith("https") ? await import("https") : await import("http");
  return new Promise((resolve, reject) => {
    protocol.get(url, (res: any) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// Fire-and-forget webhook for banned sessions. Looks up the org's webhook_url
// and POSTs a session.banned event. Failures are swallowed — the caller has
// already disabled the session, so a missed webhook is non-fatal.
async function fireBannedWebhook(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string | undefined,
  payload: { sessionId: string; phoneNumber: string | null; reason: string; statusCode: number | null },
): Promise<void> {
  if (!orgId) return;
  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("webhook_url")
      .eq("id", orgId)
      .single();
    const url = org?.webhook_url as string | undefined;
    if (!url) return;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "session.banned",
        session_id: payload.sessionId,
        phone_number: payload.phoneNumber,
        reason: payload.reason,
        status_code: payload.statusCode,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch {
    // Webhook delivery is best-effort.
  }
}
