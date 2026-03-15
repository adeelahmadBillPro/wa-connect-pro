export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Delay slightly to let the server fully initialize
    setTimeout(async () => {
      try {
        const { restoreSessions } = await import("@/lib/wa-session-manager");
        console.log("[STARTUP] Restoring WA sessions from database...");
        await restoreSessions();
        console.log("[STARTUP] WA session restore complete");
      } catch (e: any) {
        console.error("[STARTUP] Failed to restore sessions:", e?.message);
      }
    }, 5000); // Wait 5 seconds for server to be ready
  }
}
