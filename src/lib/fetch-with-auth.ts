import { createClient } from "@/lib/supabase/client";

// Wrapper around fetch that adds the Supabase auth token
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const supabase = createClient();

  // Force token refresh, then grab fresh session
  await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(url, { ...options, headers });
}
