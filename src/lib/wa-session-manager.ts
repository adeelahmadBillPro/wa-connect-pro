import { createServiceClient } from "@/lib/supabase/service";
import fs from "fs";

// Since these are in serverExternalPackages in next.config.ts,
// Next.js will NOT bundle them — safe to use literal strings.
function loadWA(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("whatsapp-web.js");
}

function loadMongoStore(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("wwebjs-mongo");
}

function loadMongoose(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("mongoose");
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
}

// Use globalThis to persist across Next.js hot reloads in dev mode
const globalForWA = globalThis as typeof globalThis & {
  waActiveSessions?: Map<string, ActiveSession>;
  mongoConnected?: boolean;
  mongoStore?: any;
};

if (!globalForWA.waActiveSessions) {
  globalForWA.waActiveSessions = new Map<string, ActiveSession>();
}

const activeSessions = globalForWA.waActiveSessions;

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

// Connect to MongoDB and return MongoStore instance
async function getMongoStore(): Promise<any> {
  if (globalForWA.mongoStore && globalForWA.mongoConnected) {
    return globalForWA.mongoStore;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI environment variable is required for session persistence.");
  }

  const mongoose = loadMongoose();
  const { MongoStore } = loadMongoStore();

  if (!globalForWA.mongoConnected) {
    await mongoose.connect(mongoUri);
    globalForWA.mongoConnected = true;
    console.log("[WA] Connected to MongoDB for session storage");
  }

  const store = new MongoStore({ mongoose });
  globalForWA.mongoStore = store;
  return store;
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

  const { Client, RemoteAuth } = loadWA();
  const store = await getMongoStore();
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
    const client = new Client({
      authStrategy: new RemoteAuth({
        store: store,
        clientId: sessionId,
        backupSyncIntervalMs: 300000, // Backup session to MongoDB every 5 minutes
      }),
      puppeteer: {
        headless: true,
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
          "--no-zygote",
          "--single-process",
          "--disable-translate",
          "--js-flags=--max-old-space-size=256",
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

    // Session saved to MongoDB
    client.on("remote_session_saved", () => {
      console.log("[WA] Session backed up to MongoDB:", sessionId);
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
  ensureWAAvailable();

  const session = activeSessions.get(sessionId);
  if (!session || session.status !== "connected" || !session.client) {
    throw new Error("Session not connected");
  }

  const chatId = to.replace(/[^0-9]/g, "") + "@c.us";

  try {
    let result;

    if (message.type === "text") {
      result = await session.client.sendMessage(chatId, message.content);
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
      const media = await MessageMedia.fromUrl(message.mediaUrl);
      result = await session.client.sendMessage(chatId, media, {
        caption: message.caption || message.content || undefined,
        sendMediaAsDocument: message.type === "document",
      });
    } else {
      result = await session.client.sendMessage(chatId, message.content);
    }

    return {
      success: true,
      messageId: result?.id?._serialized || null,
    };
  } catch (error: any) {
    const msg = error?.message || "Failed to send message";
    // If Chrome frame crashed, mark session as disconnected so it can be reconnected
    if (msg.includes("detached") || msg.includes("Session closed") || msg.includes("Protocol error")) {
      console.error("[WA] Chrome crashed for session:", sessionId, msg);
      session.status = "disconnected";
      activeSessions.delete(sessionId);
      const supabase = createServiceClient();
      await supabase
        .from("wa_sessions")
        .update({ status: "disconnected", is_active: false })
        .eq("id", sessionId);
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

  const supabase = createServiceClient();
  const { data: sessions } = await supabase
    .from("wa_sessions")
    .select("id, org_id")
    .eq("is_active", true);

  if (sessions) {
    for (const session of sessions) {
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
