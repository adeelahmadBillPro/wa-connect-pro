import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {};

  // Check env vars
  results.env = {
    PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || "not set",
    MONGODB_URI: !!process.env.MONGODB_URI,
    SUPABASE_URL: !!process.env.SUPABASE_URL,
  };

  // Check if chromium binary exists
  const chromePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ];

  results.chromium = {};
  for (const p of chromePaths) {
    results.chromium[p] = fs.existsSync(p);
  }

  // Try to get chromium version
  try {
    const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";
    const version = execSync(`${chromePath} --version 2>&1`, { timeout: 5000 }).toString().trim();
    results.chromiumVersion = version;
  } catch (e: any) {
    results.chromiumVersion = `error: ${e.message}`;
  }

  // Try to actually launch puppeteer
  try {
    const puppeteer = require("puppeteer-core");
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-zygote",
        "--single-process",
      ],
    });
    const version = await browser.version();
    await browser.close();
    results.puppeteerLaunch = { success: true, version };
  } catch (e: any) {
    results.puppeteerLaunch = { success: false, error: e.message };
  }

  // Check whatsapp-web.js
  try {
    require("whatsapp-web.js");
    results.waModule = "loaded";
  } catch (e: any) {
    results.waModule = `error: ${e.message}`;
  }

  return NextResponse.json(results);
}
