import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {};

  // Check env vars
  results.env = {
    PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || "not set",
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD || "not set",
  };

  // Try Puppeteer's bundled chromium
  let chromePath = "";
  try {
    const puppeteer = require("puppeteer");
    chromePath = puppeteer.executablePath();
    results.puppeteerBundledPath = chromePath;
    results.puppeteerBundledExists = fs.existsSync(chromePath);
  } catch (e: any) {
    results.puppeteerBundledPath = `error: ${e.message}`;
  }

  // Try `which`
  try {
    const whichResult = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null || echo 'not found'")
      .toString().trim();
    results.whichChromium = whichResult;
  } catch (e: any) {
    results.whichChromium = `error: ${e.message}`;
  }

  // Try to launch with bundled chromium
  const launchPath = chromePath && fs.existsSync(chromePath) ? chromePath : "chromium";
  try {
    const puppeteer = require("puppeteer");
    const browser = await puppeteer.launch({
      headless: true,
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
