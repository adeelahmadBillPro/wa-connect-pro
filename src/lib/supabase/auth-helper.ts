import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { createServiceClient } from "./service";

// Extract user from request — supports both Supabase JWT and API key (wcp_*)
// API key can be passed as:
//   - Authorization: Bearer wcp_xxxxx
//   - x-api-key: wcp_xxxxx
export async function getAuthUser(request?: NextRequest) {
  let accessToken: string | null = null;
  let apiKey: string | null = null;

  // Check Authorization header
  if (request) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (token.startsWith("wcp_")) {
        apiKey = token;
      } else {
        accessToken = token;
      }
    }
    // Also check x-api-key header
    if (!apiKey) {
      const xApiKey = request.headers.get("x-api-key");
      if (xApiKey) apiKey = xApiKey;
    }
  }

  // API key auth — look up org by key, return owner as user
  if (apiKey) {
    try {
      const supabase = createServiceClient();
      const { data: org } = await supabase
        .from("organizations")
        .select("owner_id")
        .eq("api_key", apiKey)
        .single();

      if (!org) {
        console.log("[AUTH] Invalid API key");
        return null;
      }

      console.log("[AUTH] API key verified, owner:", org.owner_id);
      return { id: org.owner_id, _authMethod: "api_key" };
    } catch (e: any) {
      console.log("[AUTH] API key lookup error:", e?.message);
      return null;
    }
  }

  // Try next/headers for Authorization
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

  // Fall back to cookies
  if (!accessToken) {
    try {
      const cookieStore = await cookies();
      const allCookies = cookieStore.getAll();

      const authCookies = allCookies
        .filter((c) => c.name.includes("auth-token"))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (authCookies.length > 0) {
        const tokenValue = authCookies.map((c) => c.value).join("");
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
    console.log("[AUTH] No access token found");
    return null;
  }

  // Verify Supabase JWT
  try {
    const supabase = createServiceClient();
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      // Suppress noisy refresh token errors — these are expected for expired browser sessions
      if (!error?.message?.includes("Refresh Token")) {
        console.log("[AUTH] Token verification failed:", error?.message);
      }
      return null;
    }
    console.log("[AUTH] User verified:", user.id);
    return user;
  } catch (e: any) {
    console.log("[AUTH] Exception:", e?.message);
    return null;
  }
}
