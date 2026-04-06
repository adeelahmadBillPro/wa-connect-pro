import { createServiceClient } from "@/lib/supabase/service";
import fs from "fs";

// Since these are in serverExternalPackages in next.config.ts,
// Next.js will NOT bundle them — safe to use literal strings.
function loadWA(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("whatsapp-web.js");
}

// Lazy check — try to actually require the module on first call
let waAvailable: boolean | null = null; // null = not checked yet

function checkWAAvailable(): boolean {
  if (waAvailable !== null) return waAvailable;
  try {
    loadWA(); // attempt a real require
    waAvailable = true;
    console.log("[WA] whatsapp-web.js loaded successfully");
  } catch (err: any) {
    waAvailable = false;
    console.error("[WA] Failed to load whatsapp-web.js:", err?.message);
  }
  return waAvailable;
}

// In-memory store for active sessions
type SessionStatus = "connecting" | "qr_ready" | "connected" | "disconnected";

interface ActiveSession {
  client: any;
  qrCode: string | null;
  status: SessionStatus;
  orgId?: string;
  crashRestarts?: number;
}

// Use globalThis to persist across Next.js hot reloads in dev mode
const globalForWA = globalThis as typeof globalThis & {
  waActiveSessions?: Map<string, ActiveSession>;
  waHealthCheckStarted?: boolean;
};

if (!globalForWA.waActiveSessions) {
  globalForWA.waActiveSessions = new Map<string, ActiveSession>();
}

const activeSessions = globalForWA.waActiveSessions;

// Health check — runs every 2 minutes, detects dead Chrome and auto-restarts
function startHealthCheck() {
  if (globalForWA.waHealthCheckStarted) return;
  globalForWA.waHealthCheckStarted = true;

  setInterval(async () => {
    const supabase = createServiceClient();
    for (const [sessionId, session] of activeSessions.entries()) {
      if (session.status !== "connected" || !session.client) continue;
      try {
        const page = session.client.pupPage;
        if (!page || page.isClosed()) throw new Error("page closed");
        await page.evaluate(() => true);
      } catch {
        console.error(`[WA] Health check: Chrome dead for session ${sessionId} — restarting`);
        const orgId = session.orgId;
        session.status = "disconnected";
        activeSessions.delete(sessionId);
        await supabase.from("wa_sessions").update({ status: "disconnected", is_active: false }).eq("id", sessionId);
        if (orgId) {
          setTimeout(async () => {
            try {
              await startSession(sessionId, orgId);
            } catch (e: any) {
              console.error(`[WA] Health check restart failed:`, e?.message);
            }
          }, 5000);
        }
      }
    }
  }, 120000); // every 2 minutes
}

// Find Chrome executable
function getChromePath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    if (fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
      return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    console.log("[WA] PUPPETEER_EXECUTABLE_PATH set but not found:", process.env.PUPPETEER_EXECUTABLE_PATH);
  }

  // Try Puppeteer's bundled chromium (downloaded via npm ci)
  try {
    const puppeteer = require("puppeteer");
    const bundledPath = puppeteer.executablePath();
    if (bundledPath && fs.existsSync(bundledPath)) {
      console.log("[WA] Using Puppeteer bundled chromium:", bundledPath);
      return bundledPath;
    }
  } catch { /* puppeteer not available as full package */ }

  // Try `which chromium`
  try {
    const { execSync } = require("child_process");
    const whichResult = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null || true")
      .toString().trim();
    if (whichResult && fs.existsSync(whichResult)) {
      console.log("[WA] Found chromium via which:", whichResult);
      return whichResult;
    }
  } catch { /* ignore */ }

  // Check common paths
  const paths = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }

  console.log("[WA] No chromium binary found, falling back to 'chromium'");
  return "chromium";
}

function ensureWAAvailable() {
  if (!checkWAAvailable()) {
    throw new Error(
      "WhatsApp Web is not available on this server. Deploy on a VPS with Puppeteer support."
    );
  }
}


export async function startSession(sessionId: string, orgId: string) {
  ensureWAAvailable();

  // If already active and not stuck in connecting, return existing
  if (activeSessions.has(sessionId)) {
    const existing = activeSessions.get(sessionId)!;
    if (existing.status === "connecting" && !existing.qrCode) {
      console.log("[WA] Cleaning up stuck connecting session:", sessionId);
      try {
        if (existing.client) await existing.client.destroy();
      } catch { /* ignore */ }
      activeSessions.delete(sessionId);
    } else {
      return {
        status: existing.status,
        qrCode: existing.qrCode,
      };
    }
  }

  const { Client, LocalAuth } = loadWA();
  const supabase = createServiceClient();

  // Update status to connecting
  await supabase
    .from("wa_sessions")
    .update({ status: "connecting" })
    .eq("id", sessionId);

  const existingRestarts = activeSessions.get(sessionId)?.crashRestarts || 0;
  const sessionData: ActiveSession = {
    client: null,
    qrCode: null,
    status: "connecting",
    orgId,
    crashRestarts: existingRestarts,
  };
  activeSessions.set(sessionId, sessionData);

  try {
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
      }),
      puppeteer: {
        headless: "new",
        executablePath: getChromePath(),
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--disable-software-rasterizer",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-default-apps",
          "--disable-sync",
          "--no-first-run",
          "--disable-translate",
          "--disable-features=site-per-process,TranslateUI",
          "--disable-breakpad",
          "--disable-component-update",
          "--disable-domain-reliability",
          "--disable-hang-monitor",
          "--disable-ipc-flooding-protection",
          "--disable-renderer-backgrounding",
          "--metrics-recording-only",
          "--mute-audio",
          "--js-flags=--max-old-space-size=128",
          "--disable-logging",
          "--disable-notifications",
          "--disable-popup-blocking",
          "--disable-prompt-on-repost",
          "--disable-client-side-phishing-detection",
          "--disable-web-security",
          "--disable-site-isolation-trials",
          "--disable-features=IsolateOrigins",
          "--disable-accelerated-2d-canvas",
          "--disable-canvas-aa",
          "--disable-2d-canvas-clip-aa",
          "--window-size=800,600",
        ],
        timeout: 120000,
      },
    });

    sessionData.client = client;

    // QR Code event
    client.on("qr", async (qr: string) => {
      console.log("[WA] QR code received for session:", sessionId);
      sessionData.qrCode = qr;
      sessionData.status = "qr_ready";
      activeSessions.set(sessionId, sessionData);

      await supabase
        .from("wa_sessions")
        .update({ status: "qr_ready" })
        .eq("id", sessionId);
    });

    // Authenticated event — QR scan succeeded, now loading WhatsApp
    client.on("authenticated", async () => {
      console.log("[WA] QR scan authenticated for session:", sessionId);
      sessionData.qrCode = null;
      sessionData.status = "connecting"; // Move past qr_ready
      activeSessions.set(sessionId, sessionData);

      await supabase
        .from("wa_sessions")
        .update({ status: "connecting" })
        .eq("id", sessionId);
    });

    // Ready event
    client.on("ready", async () => {
      console.log("[WA] Session connected:", sessionId);

      const info = client.info;
      const phoneNumber = info?.wid?.user || null;

      // Check if this phone number is already connected by another session
      if (phoneNumber) {
        const { data: existingSessions } = await supabase
          .from("wa_sessions")
          .select("id, org_id, session_name")
          .eq("phone_number", phoneNumber)
          .eq("is_active", true)
          .neq("id", sessionId);

        if (existingSessions && existingSessions.length > 0) {
          const otherOrg = existingSessions[0].org_id !== orgId;
          console.log(
            "[WA] Phone number already in use:",
            phoneNumber,
            otherOrg ? "(different org)" : "(same org, different session)"
          );

          // Disconnect this new session
          try { await client.destroy(); } catch { /* ignore */ }

          sessionData.status = "disconnected";
          sessionData.qrCode = null;
          activeSessions.delete(sessionId);

          await supabase
            .from("wa_sessions")
            .update({ status: "disconnected", is_active: false, phone_number: phoneNumber })
            .eq("id", sessionId);

          // The previous session was kicked by WhatsApp — mark it disconnected too
          for (const existing of existingSessions) {
            const mem = activeSessions.get(existing.id);
            if (mem) {
              mem.status = "disconnected";
              activeSessions.delete(existing.id);
            }
            await supabase
              .from("wa_sessions")
              .update({ status: "disconnected", is_active: false })
              .eq("id", existing.id);
          }

          return;
        }
      }

      sessionData.status = "connected";
      sessionData.qrCode = null;
      sessionData.crashRestarts = 0; // Reset crash counter on successful connect

      await supabase
        .from("wa_sessions")
        .update({
          status: "connected",
          is_active: true,
          phone_number: phoneNumber,
          last_connected_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      activeSessions.set(sessionId, sessionData);
    });

    // Disconnected event
    client.on("disconnected", async (reason: string) => {
      console.log("[WA] Session disconnected:", sessionId, reason);
      sessionData.status = "disconnected";
      sessionData.qrCode = null;

      // Check if this session had a phone number (was previously connected)
      const { data: sessionRow } = await supabase
        .from("wa_sessions")
        .select("phone_number, status")
        .eq("id", sessionId)
        .single();

      const hadPhoneNumber = !!sessionRow?.phone_number;
      const restartCount = sessionData.crashRestarts || 0;

      await supabase
        .from("wa_sessions")
        .update({ status: "disconnected", is_active: false })
        .eq("id", sessionId);

      activeSessions.delete(sessionId);

      // Auto-restart in all cases if session had a phone number
      // LOGOUT/CONFLICT = WhatsApp kicked us (heavy usage) — wait longer then reconnect
      // Other reasons = Chrome crash — restart sooner
      const isWhatsAppKick = reason === "LOGOUT" || reason === "CONFLICT" || reason === "UNPAIRED";
      const delayMs = isWhatsAppKick ? 600000 : Math.min(15000 * (restartCount + 1), 60000); // 10 min for WA kick, 15-60s for crash
      if (hadPhoneNumber && restartCount < 5) {
        console.log(`[WA] Auto-restarting session ${sessionId} in ${delayMs / 1000}s — reason: ${reason} (attempt ${restartCount + 1}/5)`);
        setTimeout(async () => {
          try {
            // Check still not manually deleted/disconnected
            const { data: check } = await supabase
              .from("wa_sessions")
              .select("is_active, phone_number")
              .eq("id", sessionId)
              .single();
            if (check?.phone_number && !activeSessions.has(sessionId)) {
              const session = activeSessions.get(sessionId);
              const currentRestarts = session?.crashRestarts || restartCount + 1;
              // Temporarily set restarts in map so startSession picks it up
              activeSessions.set(sessionId, { client: null, qrCode: null, status: "connecting", orgId, crashRestarts: currentRestarts });
              await startSession(sessionId, orgId);
            }
          } catch (e: any) {
            console.error("[WA] Auto-restart failed for session:", sessionId, e?.message);
          }
        }, delayMs);
      }
    });

    // Auth failure
    client.on("auth_failure", async (msg: string) => {
      console.log("[WA] Auth failure:", sessionId, msg);
      sessionData.status = "disconnected";

      await supabase
        .from("wa_sessions")
        .update({ status: "disconnected", is_active: false })
        .eq("id", sessionId);

      activeSessions.delete(sessionId);
    });

    // Listen for loading screen progress
    client.on("loading_screen", (percent: number, message: string) => {
      console.log("[WA] Loading screen:", sessionId, percent, message);
    });

    // Detect Chrome/puppeteer page crash
    client.on("change_state", (state: string) => {
      console.log("[WA] State change:", sessionId, state);
    });

    console.log("[WA] Initializing client for session:", sessionId);

    // Initialize and catch any silent errors
    client.initialize().catch(async (err: any) => {
      console.error("[WA] client.initialize() failed:", sessionId, err?.message);
      sessionData.status = "disconnected";
      sessionData.qrCode = null;
      activeSessions.delete(sessionId);

      await supabase
        .from("wa_sessions")
        .update({ status: "disconnected", is_active: false })
        .eq("id", sessionId);
    });

    // Safety timeout: if stuck in connecting/qr_ready for 2 minutes, check if Chrome died
    setTimeout(async () => {
      const current = activeSessions.get(sessionId);
      if (current && (current.status === "qr_ready" || current.status === "connecting")) {
        // Check if the browser is still alive
        try {
          const page = await client.pupPage;
          if (!page || page.isClosed()) {
            throw new Error("Browser page closed");
          }
          // Try to evaluate something simple
          await page.evaluate(() => true);
        } catch {
          console.error("[WA] Chrome appears dead for session:", sessionId, "— marking disconnected");
          current.status = "disconnected";
          current.qrCode = null;
          activeSessions.delete(sessionId);

          await supabase
            .from("wa_sessions")
            .update({ status: "disconnected", is_active: false })
            .eq("id", sessionId);
        }
      }
    }, 120000);

    return {
      status: "connecting",
      qrCode: null,
    };
  } catch (err) {
    console.error("[WA] Failed to create client:", err);
    activeSessions.delete(sessionId);
    throw err;
  }
}

export async function getSessionStatus(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return { status: "disconnected", qrCode: null };
  }
  return {
    status: session.status,
    qrCode: session.qrCode,
  };
}

export async function disconnectSession(sessionId: string, deleteAuthFiles = false) {
  const session = activeSessions.get(sessionId);
  if (session?.client) {
    try {
      await session.client.destroy();
    } catch {
      // Ignore destroy errors
    }
  }

  activeSessions.delete(sessionId);

  // Delete local auth files if requested (on session delete)
  if (deleteAuthFiles) {
    try {
      const authPath = `.wwebjs_auth/session-${sessionId}`;
      if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log("[WA] Deleted local auth files for session:", sessionId);
      }
    } catch (e: any) {
      console.error("[WA] Failed to delete auth files:", e?.message);
    }
  }

  const supabase = createServiceClient();
  await supabase
    .from("wa_sessions")
    .update({ status: "disconnected", is_active: false })
    .eq("id", sessionId);

  return { success: true };
}

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
  }
) {
  ensureWAAvailable();

  const session = activeSessions.get(sessionId);
  if (!session || session.status !== "connected" || !session.client) {
    throw new Error("Session not connected");
  }

  const chatId = to.replace(/[^0-9]/g, "") + "@c.us";

  try {
    // Check if number is registered on WhatsApp before sending
    const isRegistered = await session.client.isRegisteredUser(chatId);
    if (!isRegistered) {
      throw new Error(`Number ${to} is not on WhatsApp`);
    }

    let result;

    if (message.type === "text") {
      result = await session.client.sendMessage(chatId, message.content);
    } else if (message.mediaBase64) {
      const { MessageMedia } = loadWA();
      // Detect mimetype from base64 or filename
      let mimetype = "application/pdf";
      const ext = message.filename?.split(".").pop()?.toLowerCase();
      if (ext === "jpg" || ext === "jpeg") mimetype = "image/jpeg";
      else if (ext === "png") mimetype = "image/png";
      else if (ext === "pdf") mimetype = "application/pdf";
      else if (ext === "doc" || ext === "docx") mimetype = "application/msword";
      else if (ext === "mp4") mimetype = "video/mp4";

      const media = new MessageMedia(
        mimetype,
        message.mediaBase64,
        message.filename || "document.pdf"
      );
      result = await session.client.sendMessage(chatId, media, {
        caption: message.caption || message.content || undefined,
        sendMediaAsDocument: message.type === "document",
      });
    } else if (message.mediaData && message.mediaMimetype) {
      const { MessageMedia } = loadWA();
      const media = new MessageMedia(
        message.mediaMimetype,
        message.mediaData,
        message.filename || undefined
      );
      result = await session.client.sendMessage(chatId, media, {
        caption: message.caption || message.content || undefined,
        sendMediaAsDocument: message.type === "document",
      });
    } else if (message.mediaUrl) {
      const { MessageMedia } = loadWA();
      console.log("[WA] Downloading media from URL:", message.mediaUrl);
      const media = await MessageMedia.fromUrl(message.mediaUrl, { unsafeMime: true });
      console.log("[WA] Media downloaded, mimetype:", media.mimetype, "size:", media.data?.length || 0);
      result = await session.client.sendMessage(chatId, media, {
        caption: message.caption || message.content || undefined,
        sendMediaAsDocument: message.type === "document",
      });
      console.log("[WA] Media message sent, id:", result?.id?._serialized);
    } else {
      result = await session.client.sendMessage(chatId, message.content);
    }

    return {
      success: true,
      messageId: result?.id?._serialized || null,
    };
  } catch (error: any) {
    const msg = error?.message || "Failed to send message";
    // If Chrome frame crashed, mark session as disconnected and auto-restart
    if (msg.includes("detached") || msg.includes("Session closed") || msg.includes("Protocol error") || msg.includes("Chrome appears dead")) {
      console.error("[WA] Chrome crashed for session:", sessionId, msg);
      const orgIdForRestart = session.orgId;
      const restartCount = session.crashRestarts || 0;
      session.status = "disconnected";
      activeSessions.delete(sessionId);
      const supabase = createServiceClient();
      await supabase
        .from("wa_sessions")
        .update({ status: "disconnected", is_active: false })
        .eq("id", sessionId);

      // Auto-restart if under retry limit
      if (orgIdForRestart && restartCount < 3) {
        const delayMs = Math.min(15000 * (restartCount + 1), 60000);
        console.log(`[WA] Scheduling auto-restart for crashed session ${sessionId} in ${delayMs / 1000}s`);
        setTimeout(async () => {
          try {
            if (!activeSessions.has(sessionId)) {
              activeSessions.set(sessionId, { client: null, qrCode: null, status: "connecting", orgId: orgIdForRestart, crashRestarts: restartCount + 1 });
              await startSession(sessionId, orgIdForRestart);
            }
          } catch (e: any) {
            console.error("[WA] Auto-restart failed:", sessionId, e?.message);
          }
        }, delayMs);
      }
    }
    throw new Error(msg);
  }
}

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

// Restore sessions on server start
export async function restoreSessions() {
  if (!checkWAAvailable()) return;
  startHealthCheck();

  const supabase = createServiceClient();
  const { data: sessions } = await supabase
    .from("wa_sessions")
    .select("id, org_id, phone_number, status")
    .not("phone_number", "is", null);

  if (!sessions || sessions.length === 0) {
    console.log("[STARTUP] No sessions to restore");
    return;
  }

  // Only restore sessions that have local auth files on disk
  // This prevents wasting Chrome instances on stale DB records
  const sessionsToRestore = sessions.filter((session) => {
    const authPath = `.wwebjs_auth/session-${session.id}`;
    const exists = fs.existsSync(authPath);
    if (!exists) {
      console.log(`[STARTUP] Skipping ${session.id} — no local auth files found`);
      // Mark as disconnected in DB since we can't restore it
      supabase.from("wa_sessions")
        .update({ status: "disconnected", is_active: false })
        .eq("id", session.id)
        .then(() => {});
    }
    return exists;
  });

  if (sessionsToRestore.length === 0) {
    console.log("[STARTUP] No sessions with local auth files — all need QR scan");
    return;
  }

  console.log(`[STARTUP] Restoring ${sessionsToRestore.length} session(s) with local auth files...`);
  for (const session of sessionsToRestore) {
    try {
      console.log(`[WA] Restoring session: ${session.id} (${session.phone_number})`);
      await startSession(session.id, session.org_id);
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (err: any) {
      console.error(`[WA] Failed to restore session ${session.id}:`, err?.message);
      await supabase
        .from("wa_sessions")
        .update({ status: "disconnected", is_active: false })
        .eq("id", session.id);
    }
  }
}
