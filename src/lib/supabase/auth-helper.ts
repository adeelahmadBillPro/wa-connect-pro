import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { createServiceClient } from "./service";

// Extract user from request Authorization header or cookies
export async function getAuthUser(request?: NextRequest) {
  let accessToken: string | null = null;

  // Method 1: Check Authorization header from request object
  if (request) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      accessToken = authHeader.slice(7);
    }
  }

  // Method 2: Check Authorization header from next/headers
  if (!accessToken) {
    try {
      const { headers } = await import("next/headers");
      const headerStore = await headers();
      const authHeader = headerStore.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        accessToken = authHeader.slice(7);
      }
    } catch { /* ignore */ }
  }

  // Method 3: Fall back to cookies
  if (!accessToken) {
    try {
      const cookieStore = await cookies();
      const allCookies = cookieStore.getAll();

      const authCookies = allCookies
        .filter((c) => c.name.includes("auth-token"))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (authCookies.length > 0) {
        const tokenValue = authCookies.map((c) => c.value).join("");
        // Handle base64- prefix
        const jsonStr = tokenValue.startsWith("base64-")
          ? Buffer.from(tokenValue.slice(7), "base64").toString("utf-8")
          : tokenValue;
        try {
          const parsed = JSON.parse(jsonStr);
          accessToken = parsed.access_token || null;
        } catch { /* invalid JSON */ }
      }
    } catch { /* ignore */ }
  }

  if (!accessToken) {
    console.log("[AUTH] No access token found from any method");
    return null;
  }

  console.log("[AUTH] Token found, length:", accessToken.length);

  // Verify the token using service client
  try {
    const supabase = createServiceClient();
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      console.log("[AUTH] Token verification failed:", error?.message);
      return null;
    }
    console.log("[AUTH] User verified:", user.id);
    return user;
  } catch (e: any) {
    console.log("[AUTH] Exception verifying token:", e?.message);
    return null;
  }
}
