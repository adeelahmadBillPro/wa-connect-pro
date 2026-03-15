import { createClient } from "@/lib/supabase/client";

// Wrapper around fetch that adds the Supabase auth token
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const supabase = createClient();

  // Use getUser() first to force a token refresh if needed,
  // then getSession() to grab the (now-fresh) access token.
  await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(url, { ...options, headers });
}
