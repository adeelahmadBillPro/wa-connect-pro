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

  // Try to find chromium via `which`
  try {
    const whichResult = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null || echo 'not found'")
      .toString().trim();
    results.whichChromium = whichResult;
  } catch (e: any) {
    results.whichChromium = `error: ${e.message}`;
  }

  // Also try find in nix store
  try {
    const nixFind = execSync("find /nix -name 'chromium' -type f 2>/dev/null | head -5 || echo 'none'", { timeout: 5000 })
      .toString().trim();
    results.nixChromium = nixFind;
  } catch (e: any) {
    results.nixChromium = `error: ${e.message}`;
  }

  // Check common paths
  const chromePaths = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ];
  results.chromiumPaths = {};
  for (const p of chromePaths) {
    results.chromiumPaths[p] = fs.existsSync(p);
  }

  // Try to get chromium version using `which` result or fallback
  let chromePath = "chromium";
  try {
    const which = execSync("which chromium 2>/dev/null || true").toString().trim();
    if (which) chromePath = which;
  } catch { /* ignore */ }

  try {
    const version = execSync(`${chromePath} --version 2>&1`, { timeout: 5000 }).toString().trim();
    results.chromiumVersion = version;
  } catch (e: any) {
    results.chromiumVersion = `error: ${e.message}`;
  }

  // Try to launch puppeteer with found chromium
  try {
    const puppeteer = require("puppeteer-core");
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chromePath,
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
    results.puppeteerLaunch = { success: true, version, usedPath: chromePath };
  } catch (e: any) {
    results.puppeteerLaunch = { success: false, error: e.message, triedPath: chromePath };
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
