import { createClient } from "@/lib/supabase/client";

// Wrapper around fetch that adds the Supabase auth token
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const supabase = createClient();

  // Force token refresh, then grab fresh session
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  console.log("[fetchWithAuth] getUser:", user?.id || "null", userError?.message || "ok");

  const { data: { session } } = await supabase.auth.getSession();
  console.log("[fetchWithAuth] session:", session ? `token=${session.access_token.substring(0, 20)}...` : "null");

  const headers = new Headers(options.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  } else {
    console.warn("[fetchWithAuth] NO TOKEN - request will be unauthenticated:", url);
  }

  return fetch(url, { ...options, headers });
}
