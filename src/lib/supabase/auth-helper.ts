import { cookies } from "next/headers";
import { createServiceClient } from "./service";

// Extract user from cookies using service client
// This works even when NEXT_PUBLIC_* env vars aren't baked into server bundle
export async function getAuthUser() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  // Find the Supabase auth token cookie(s)
  // Cookie name format: sb-{ref}-auth-token or sb-{ref}-auth-token.0, .1, etc.
  const authCookies = allCookies
    .filter((c) => c.name.includes("auth-token"))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (authCookies.length === 0) {
    return null;
  }

  // Reassemble chunked cookie value
  let tokenValue = authCookies.map((c) => c.value).join("");

  // Parse the token - it's a JSON object with access_token
  try {
    const parsed = JSON.parse(tokenValue);
    const accessToken = parsed.access_token;
    if (!accessToken) return null;

    // Verify the token using service client
    const supabase = createServiceClient();
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}
