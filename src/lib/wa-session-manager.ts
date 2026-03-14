import { createServiceClient } from "@/lib/supabase/service";
import path from "path";
import fs from "fs";

// In-memory store for active sessions
type SessionStatus = "connecting" | "qr_ready" | "connected" | "disconnected";

interface ActiveSession {
  client: any;
  qrCode: string | null;
  status: SessionStatus;
}

// Use globalThis to persist across Next.js hot reloads in dev mode
// Without this, the Map resets on every file change and QR events are lost
const globalForWA = globalThis as typeof globalThis & {
  waActiveSessions?: Map<string, ActiveSession>;
};

if (!globalForWA.waActiveSessions) {
  globalForWA.waActiveSessions = new Map<string, ActiveSession>();
}

const activeSessions = globalForWA.waActiveSessions;

const SESSION_DIR = path.join(process.cwd(), "wa-sessions");

// Ensure session directory exists
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// Find Chrome executable
function getChromePath(): string {
  const paths = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return "chrome";
}

export async function startSession(sessionId: string, orgId: string) {
  // If already active and not stuck in connecting, return existing
  if (activeSessions.has(sessionId)) {
    const existing = activeSessions.get(sessionId)!;
    // If stuck in connecting with no QR for too long, clean up and retry
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

  // Lazy load whatsapp-web.js
  const { Client, LocalAuth } = await import("whatsapp-web.js");

  const supabase = createServiceClient();

  // Update status to connecting
  await supabase
    .from("wa_sessions")
    .update({ status: "connecting" })
    .eq("id", sessionId);

  const sessionData: ActiveSession = {
    client: null,
    qrCode: null,
    status: "connecting",
  };
  activeSessions.set(sessionId, sessionData);

  try {
    // Clean up any stale SingletonLock files that prevent Chrome from launching
    const sessionPath = path.join(SESSION_DIR, sessionId);
    if (fs.existsSync(sessionPath)) {
      const lockFiles = ["SingletonLock", "SingletonSocket", "SingletonCookie"];
      for (const lock of lockFiles) {
        const lockPath = path.join(sessionPath, lock);
        if (fs.existsSync(lockPath)) {
          console.log("[WA] Removing stale lock file:", lockPath);
          try { fs.rmSync(lockPath, { force: true }); } catch { /* ignore */ }
        }
      }
      // Also check nested directories for lock files
      try {
        const walkForLocks = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (lockFiles.includes(entry.name)) {
              const fp = path.join(dir, entry.name);
              console.log("[WA] Removing nested lock file:", fp);
              try { fs.rmSync(fp, { force: true }); } catch { /* ignore */ }
            } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
              walkForLocks(path.join(dir, entry.name));
            }
          }
        };
        walkForLocks(sessionPath);
      } catch { /* ignore walk errors */ }
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: path.join(SESSION_DIR, sessionId),
      }),
      puppeteer: {
        headless: true,
        executablePath: getChromePath(),
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
        ],
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

    // Ready event
    client.on("ready", async () => {
      console.log("[WA] Session connected:", sessionId);
      sessionData.status = "connected";
      sessionData.qrCode = null;

      // Get phone number
      const info = client.info;
      const phoneNumber = info?.wid?.user || null;

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

      await supabase
        .from("wa_sessions")
        .update({ status: "disconnected", is_active: false })
        .eq("id", sessionId);

      activeSessions.delete(sessionId);
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
      console.log("[WA] Loading screen:", percent, message);
    });

    console.log("[WA] Initializing client for session:", sessionId);

    // Initialize and catch any silent errors
    client.initialize().catch(async (err: any) => {
      console.error("[WA] client.initialize() failed:", err);
      sessionData.status = "disconnected";
      sessionData.qrCode = null;
      activeSessions.delete(sessionId);

      await supabase
        .from("wa_sessions")
        .update({ status: "disconnected", is_active: false })
        .eq("id", sessionId);
    });

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

export async function disconnectSession(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (session?.client) {
    try {
      await session.client.destroy();
    } catch {
      // Ignore destroy errors
    }
  }

  // Clean up session files
  const sessionPath = path.join(SESSION_DIR, sessionId);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }

  activeSessions.delete(sessionId);

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
    mediaData?: string;
    mediaMimetype?: string;
    caption?: string;
    filename?: string;
  }
) {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== "connected" || !session.client) {
    throw new Error("Session not connected");
  }

  // Format phone number for WhatsApp (add @c.us)
  const chatId = to.replace(/[^0-9]/g, "") + "@c.us";

  try {
    let result;

    if (message.type === "text") {
      result = await session.client.sendMessage(chatId, message.content);
    } else if (message.mediaData && message.mediaMimetype) {
      // Direct base64 media (from file upload)
      const { MessageMedia } = await import("whatsapp-web.js");
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
      // Download from URL
      const { MessageMedia } = await import("whatsapp-web.js");
      const media = await MessageMedia.fromUrl(message.mediaUrl);
      result = await session.client.sendMessage(chatId, media, {
        caption: message.caption || message.content || undefined,
        sendMediaAsDocument: message.type === "document",
      });
    } else {
      // Fallback to text
      result = await session.client.sendMessage(chatId, message.content);
    }

    return {
      success: true,
      messageId: result?.id?._serialized || null,
    };
  } catch (error: any) {
    throw new Error(error?.message || "Failed to send message");
  }
}

// Check if a session is active in memory
export function isSessionActive(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  return session?.status === "connected";
}

// Get all active sessions
export function getActiveSessions(): string[] {
  const active: string[] = [];
  activeSessions.forEach((session, id) => {
    if (session.status === "connected") active.push(id);
  });
  return active;
}

// Restore sessions on server start
export async function restoreSessions() {
  const supabase = createServiceClient();
  const { data: sessions } = await supabase
    .from("wa_sessions")
    .select("id, org_id")
    .eq("is_active", true);

  if (sessions) {
    for (const session of sessions) {
      const sessionPath = path.join(SESSION_DIR, session.id);
      if (fs.existsSync(sessionPath)) {
        try {
          await startSession(session.id, session.org_id);
        } catch {
          await supabase
            .from("wa_sessions")
            .update({ status: "disconnected", is_active: false })
            .eq("id", session.id);
        }
      }
    }
  }
}
