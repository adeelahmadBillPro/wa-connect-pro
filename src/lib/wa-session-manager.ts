import { createServiceClient } from "@/lib/supabase/service";
import QRCode from "qrcode";
import { createSupabaseAuthState, clearAuth, hasAuth, filterRestorable } from "@/lib/baileys-supabase-auth";
import { classifyDisconnect, clampTrust } from "@/lib/disconnect-classifier";
import { notifyAdminSessionBanned, notifyAdminTrustWarning } from "@/lib/notify-admin";
import { markBanFreeze } from "@/lib/ban-freeze";

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
  // Phase 8 (C1): cancellable reconnect timer + a generation counter so
  // close handlers from a previous socket lifecycle can detect they're
  // stale and refuse to act.
  reconnectTimer?: ReturnType<typeof setTimeout>;
  generation?: number;
  // Phase 8 (H1): rotating presence heartbeat (available ↔ unavailable).
  presenceTimer?: ReturnType<typeof setInterval>;
  // Phase 8 (H3): periodic pre-key replenishment.
  preKeyTimer?: ReturnType<typeof setInterval>;
}

// Phase 8 (C3): absolute cap on reconnect attempts for a single down-up cycle.
// Past this, we stop, mark disconnected, alert admin, but PRESERVE auth.
const MAX_RECONNECT_ATTEMPTS = 12;
// Phase 8 (S2): stagger restoreSessions() — first session immediate, rest with
// jittered gaps so WhatsApp doesn't see N WebSocket opens in a tight burst.
const RESTORE_STAGGER_MIN_MS = 30_000;
const RESTORE_STAGGER_MAX_MS = 60_000;

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
// Phase 8 (C1/C4): generation counter for the session map. Every startSession
// call bumps the global counter and stamps the new sessionData. Any close
// handler / setTimeout from a PREVIOUS lifecycle checks this number; if it
// doesn't match, the handler exits silently (the session has been restarted).
let _sessionGeneration = 0;
function nextGeneration(): number { return ++_sessionGeneration; }

export async function startSession(sessionId: string, orgId: string): Promise<{ status: string; qrCode: string | null }> {
  // If already running and not stuck, return current state
  if (activeSessions.has(sessionId)) {
    const existing = activeSessions.get(sessionId)!;
    if (existing.status === "connected" || existing.status === "qr_ready") {
      return { status: existing.status, qrCode: existing.qrCode };
    }
    // Clean up stuck session — cancel any pending timers so they don't
    // fire against the new lifecycle below.
    if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer);
    if (existing.presenceTimer) clearInterval(existing.presenceTimer);
    if (existing.preKeyTimer) clearInterval(existing.preKeyTimer);
    try { existing.socket?.end?.(); } catch { /* ignore */ }
    activeSessions.delete(sessionId);
  }

  const supabase = createServiceClient();

  await supabase.from("wa_sessions").update({ status: "connecting" }).eq("id", sessionId);

  const myGeneration = nextGeneration();
  const sessionData: ActiveSession = {
    socket: null,
    qrCode: null,
    status: "connecting",
    orgId,
    restartCount: 0,
    generation: myGeneration,
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

    // ── Phase 8 (H1, part 2): auto-read incoming messages ────────────────────
    // Real WhatsApp clients fire a read receipt when the user opens the chat.
    // A bot that never reads anything stands out instantly. Auto-read every
    // inbound message after a small jittered delay (0.5-2s) so it looks like
    // a user noticing the notification. Best-effort; failures must not break
    // anything else on the socket.
    sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
      if (type !== "notify" || !Array.isArray(messages)) return;
      for (const m of messages) {
        if (!m?.key || m.key.fromMe) continue;
        if (!m.key.remoteJid) continue;
        setTimeout(() => {
          if (sessionData.generation !== myGeneration) return;
          try { sock.readMessages?.([m.key]); } catch { /* ignore */ }
        }, 500 + Math.floor(Math.random() * 1500));
      }
    });

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

        // ── Phase 8 (H3): Pre-key replenishment ────────────────────────────
        // Baileys uploads a small pre-key batch at registration; each is
        // consumed when a new recipient opens an E2E session. For high-fanout
        // senders (a lab messaging hundreds of patients) this runs out and
        // recipients see "Waiting for this message" — a strong ban signal.
        // Top up shortly after connect, then every 6h thereafter.
        setTimeout(() => {
          if (sessionData.generation !== myGeneration) return;
          try { sock.uploadPreKeysToServerIfRequired?.()?.catch?.(() => {}); } catch { /* old Baileys */ }
        }, 8000);
        if (sessionData.preKeyTimer) clearInterval(sessionData.preKeyTimer);
        sessionData.preKeyTimer = setInterval(() => {
          if (sessionData.generation !== myGeneration) return;
          try { sock.uploadPreKeysToServerIfRequired?.()?.catch?.(() => {}); } catch { /* ignore */ }
        }, 6 * 60 * 60 * 1000);

        // ── Phase 8 (H1, part 1): rotating presence heartbeat ──────────────
        // Real users don't stay permanently "available" — that's a bot tell.
        // Cycle available/unavailable on a 90-180s jittered interval.
        if (sessionData.presenceTimer) clearInterval(sessionData.presenceTimer);
        let presenceState: "available" | "unavailable" = "available";
        try { sock.sendPresenceUpdate?.(presenceState); } catch { /* ignore */ }
        sessionData.presenceTimer = setInterval(() => {
          if (sessionData.generation !== myGeneration) return;
          presenceState = presenceState === "available" ? "unavailable" : "available";
          try { sock.sendPresenceUpdate?.(presenceState); } catch { /* ignore */ }
        }, 90_000 + Math.floor(Math.random() * 90_000));
      }

      // Disconnected
      if (connection === "close") {
        // Phase 8 (C4): if a previous lifecycle's close fires after we've
        // already been restarted, bail. Detected via generation mismatch.
        const liveSession = activeSessions.get(sessionId);
        if (liveSession && liveSession.generation !== myGeneration) {
          console.log(`[WA] Ignoring stale close handler for ${sessionId} (gen ${myGeneration} vs ${liveSession.generation})`);
          return;
        }

        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const wasIntentional = sessionData.intentionalDisconnect === true;
        const cls = classifyDisconnect(statusCode);

        console.log(`[WA] Session disconnected: ${sessionId}, code: ${statusCode}, kind: ${cls.kind}, intentional: ${wasIntentional}`);

        // Stop intervals so they don't leak across reconnects.
        if (sessionData.presenceTimer) { clearInterval(sessionData.presenceTimer); sessionData.presenceTimer = undefined; }
        if (sessionData.preKeyTimer) { clearInterval(sessionData.preKeyTimer); sessionData.preKeyTimer = undefined; }

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
        const trustWarningCrossed = prevTrust >= 40 && newTrust < 40 && cls.kind !== "banned";

        const ONE_HOUR_MS = 60 * 60 * 1000;
        const lastAt = current?.last_disconnect_at ? new Date(current.last_disconnect_at).getTime() : 0;
        const recent = Date.now() - lastAt < ONE_HOUR_MS;
        const newConsecutive = recent ? (current?.consecutive_disconnects ?? 0) + 1 : 1;

        // Phase 6 heuristic: 5 disconnects in 1h → treat as banned. Phase 8
        // (S1) softens this: heuristic escalation does NOT clear auth — only
        // a TRUE classifier-detected ban (403/405/419) does. False positives
        // shouldn't cost a forced rescan.
        const escalateToBanned =
          cls.kind !== "logout" && cls.kind !== "banned" && newConsecutive >= 5;

        const finalKind = escalateToBanned ? "banned" : cls.kind;
        const isTrueBan = cls.kind === "banned"; // distinguishes real 403/405/419 from heuristic

        const baseUpdate: Record<string, unknown> = {
          status: finalKind === "banned" ? "banned" : "disconnected",
          is_active: false,
          trust_score: newTrust,
          consecutive_disconnects: newConsecutive,
          last_disconnect_code: statusCode ?? null,
          last_disconnect_at: new Date().toISOString(),
        };
        await supabase.from("wa_sessions").update(baseUpdate).eq("id", sessionId);

        if (trustWarningCrossed) {
          notifyAdminTrustWarning({
            sessionId,
            phoneNumber: sessionData.phoneNumber ?? null,
            trustScore: newTrust,
            lastDisconnectCode: statusCode ?? null,
          }).catch(() => {});
        }

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

          // Phase 8 (S1): only clear auth for a CONFIRMED ban code (403/405/
          // 419). Heuristic escalation might be a noisy network; preserving
          // auth lets admin retry from the dashboard without a rescan.
          if (isTrueBan) {
            try { await clearAuth(sessionId); } catch (e: any) {
              console.error("[WA] Failed to clear auth state on ban:", e?.message);
            }
            // Phase 8 (H4): WhatsApp correlates bans by IP. Block creating
            // NEW QR-scan sessions on this VPS for 24h so we don't burn
            // more numbers in a cascade. Existing sessions can still
            // reconnect — those are already-trusted devices.
            markBanFreeze(supabase, reason, statusCode ?? null, sessionId).catch(() => {});
          } else {
            console.log(`[WA] Heuristic escalation only — auth preserved for retry`);
          }

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

        // Recoverable / warning → reconnect with backoff (C3: capped attempts).
        const restartCount = sessionData.restartCount || 0;
        if (restartCount >= MAX_RECONNECT_ATTEMPTS) {
          console.log(`[WA] Reconnect cap reached for ${sessionId} (${MAX_RECONNECT_ATTEMPTS} attempts). Stopping — auth preserved.`);
          notifyAdminTrustWarning({
            sessionId,
            phoneNumber: sessionData.phoneNumber ?? null,
            trustScore: newTrust,
            lastDisconnectCode: statusCode ?? null,
          }).catch(() => {});
          return;
        }
        const delayMs = Math.min(10000 * Math.pow(2, restartCount), 300000);
        const tag = finalKind === "warning" ? "WARNING" : "RECOVER";
        console.log(`[WA] ${tag} restart ${restartCount + 1}/${MAX_RECONNECT_ATTEMPTS}: ${sessionId} in ${delayMs / 1000}s (code: ${statusCode}, trust: ${newTrust})`);

        // Phase 8 (C1): cancellable timer. Store on sessionData so
        // disconnectSession() can abort the pending reconnect. The
        // callback re-checks state to refuse to act on a stale schedule.
        sessionData.reconnectTimer = setTimeout(async () => {
          sessionData.reconnectTimer = undefined;
          try {
            // Refuse if anything else has already claimed this id.
            if (activeSessions.has(sessionId)) return;
            // Refuse if auth was cleared in the interim.
            if (!(await hasAuth(sessionId))) return;
            await startSession(sessionId, orgId);
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
  // Callers pre-filter by wa_sessions.status='connected'; that's the truth
  // source. Adding isSessionActive() here re-introduces the Map-visibility
  // bug that made every API-route send fail even when startup logs showed
  // sessions connected. Trust the DB — sendWAMessage() is the real liveness
  // check and throws if the socket is actually dead.
  const eligible = dbSessions
    .filter((s) => s.messages_sent_today < s.daily_limit)
    .sort((a, b) => a.messages_sent_today - b.messages_sent_today);
  return eligible[0] || null;
}

// ── Disconnect / delete session ───────────────────────────────────────────────
export async function disconnectSession(sessionId: string, deleteAuthFiles = false) {
  const session = activeSessions.get(sessionId);
  if (session) {
    // Mark as intentional so the close handler doesn't auto-restart
    session.intentionalDisconnect = true;
    // Phase 8 (C1): cancel any pending reconnect / heartbeat / pre-key
    // timers so they can't fire against the new lifecycle.
    if (session.reconnectTimer) { clearTimeout(session.reconnectTimer); session.reconnectTimer = undefined; }
    if (session.presenceTimer) { clearInterval(session.presenceTimer); session.presenceTimer = undefined; }
    if (session.preKeyTimer) { clearInterval(session.preKeyTimer); session.preKeyTimer = undefined; }
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
    .select("id, org_id, phone_number, status, last_connected_at")
    .not("phone_number", "is", null)
    .order("last_connected_at", { ascending: false, nullsFirst: false });

  if (!sessions || sessions.length === 0) {
    console.log("[STARTUP] No sessions to restore");
    return;
  }

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

  console.log(`[STARTUP] Restoring ${toRestore.length} session(s) with staggered gaps...`);

  // Phase 8 (S2): bring up sessions back-to-back is exactly the "N WebSocket
  // opens from one IP in 30s" pattern WhatsApp watches for. Most-recent
  // session first (immediate), the rest spaced out 30-60s with jitter.
  // We don't await all of them — restore happens lazily across minutes,
  // which is fine because the worker / send endpoints just check
  // isSessionActive() and skip until each one comes up.
  for (let i = 0; i < toRestore.length; i++) {
    const session = toRestore[i];
    const delay = i === 0
      ? 0
      : RESTORE_STAGGER_MIN_MS + Math.floor(Math.random() * (RESTORE_STAGGER_MAX_MS - RESTORE_STAGGER_MIN_MS));
    setTimeout(async () => {
      try {
        console.log(`[WA] Restoring (${i + 1}/${toRestore.length}): ${session.id} (${session.phone_number})`);
        await startSession(session.id, session.org_id);
      } catch (err: any) {
        console.error(`[WA] Failed to restore ${session.id}:`, err?.message);
        await supabase.from("wa_sessions").update({ status: "disconnected", is_active: false }).eq("id", session.id);
      }
    }, i === 0 ? 0 : delay * i);
  }

  console.log(`[STARTUP] WA session restore scheduled (last one fires in ~${Math.round((toRestore.length - 1) * 45)}s)`);
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
