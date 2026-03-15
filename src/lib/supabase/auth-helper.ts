import { cookies, headers } from "next/headers";
import { createServiceClient } from "./service";

// Extract user from Authorization header or cookies
export async function getAuthUser() {
  let accessToken: string | null = null;

  // Method 1: Check Authorization header (most reliable)
  try {
    const headerStore = await headers();
    const authHeader = headerStore.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      accessToken = authHeader.slice(7);
    }
  } catch { /* ignore */ }

  // Method 2: Fall back to cookies
  if (!accessToken) {
    try {
      const cookieStore = await cookies();
      const allCookies = cookieStore.getAll();

      // Find Supabase auth token cookies
      const authCookies = allCookies
        .filter((c) => c.name.includes("auth-token"))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (authCookies.length > 0) {
        const tokenValue = authCookies.map((c) => c.value).join("");
        try {
          const parsed = JSON.parse(tokenValue);
          accessToken = parsed.access_token || null;
        } catch { /* invalid JSON */ }
      }
    } catch { /* ignore */ }
  }

  if (!accessToken) return null;

  // Verify the token using service client
  try {
    const supabase = createServiceClient();
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}
