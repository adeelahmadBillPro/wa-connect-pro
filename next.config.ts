import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@whiskeysockets/baileys",
    "@hapi/boom",
    "whatsapp-web.js",
    "puppeteer",
    "puppeteer-core",
    "sharp",
    "qrcode",
    "mongoose",
    "wwebjs-mongo",
  ],
};

export default nextConfig;
