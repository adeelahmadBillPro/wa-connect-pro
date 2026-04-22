import { createServiceClient } from "@/lib/supabase/service";

// Supabase-backed implementation of Baileys' AuthenticationState.
// Mirrors the shape of useMultiFileAuthState() but stores everything in
// public.wa_auth_state (one row per (session_id, key)).
//
// Key naming convention matches the file impl exactly so debugging stays easy:
//   "creds"                          → root credentials
//   "${type}-${id}"  e.g. "session-12345"  → signal protocol key store entries
//
// Buffer round-trip: jsonb cannot hold raw Buffer instances, so we run values
// through Baileys' BufferJSON.replacer/reviver pair on every read & write.

export async function createSupabaseAuthState(sessionId: string) {
  const { initAuthCreds } = await import("@whiskeysockets/baileys/lib/Utils/auth-utils.js");
  const { BufferJSON } = await import("@whiskeysockets/baileys/lib/Utils/generics.js");
  const { proto } = await import("@whiskeysockets/baileys/WAProto/index.js");

  const supabase = createServiceClient();

  // jsonb column requires Buffer instances be encoded; BufferJSON.replacer
  // turns them into { type: "Buffer", data: [...] } envelopes.
  const encode = (value: any) => JSON.parse(JSON.stringify(value, BufferJSON.replacer));
  const decode = (value: any) => JSON.parse(JSON.stringify(value), BufferJSON.reviver);

  async function readKey(key: string): Promise<any | null> {
    const { data, error } = await supabase
      .from("wa_auth_state")
      .select("value")
      .eq("session_id", sessionId)
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return decode(data.value);
  }

  async function readKeys(keys: string[]): Promise<Record<string, any>> {
    if (keys.length === 0) return {};
    const { data, error } = await supabase
      .from("wa_auth_state")
      .select("key, value")
      .eq("session_id", sessionId)
      .in("key", keys);
    const out: Record<string, any> = {};
    if (error || !data) return out;
    for (const row of data) {
      out[row.key] = decode(row.value);
    }
    return out;
  }

  async function writeKey(key: string, value: any): Promise<void> {
    const { error } = await supabase
      .from("wa_auth_state")
      .upsert(
        { session_id: sessionId, key, value: encode(value), updated_at: new Date().toISOString() },
        { onConflict: "session_id,key" }
      );
    if (error) console.error("[WA-AUTH] writeKey failed", key, error.message);
  }

  async function deleteKey(key: string): Promise<void> {
    const { error } = await supabase
      .from("wa_auth_state")
      .delete()
      .eq("session_id", sessionId)
      .eq("key", key);
    if (error) console.error("[WA-AUTH] deleteKey failed", key, error.message);
  }

  // Bootstrap creds: load existing or seed fresh
  const creds = (await readKey("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const lookupKeys = ids.map((id) => `${type}-${id}`);
          const rows = await readKeys(lookupKeys);
          const data: Record<string, any> = {};
          for (const id of ids) {
            let value = rows[`${type}-${id}`] ?? null;
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }
          return data;
        },
        set: async (data: Record<string, Record<string, any>>) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeKey(key, value) : deleteKey(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeKey("creds", creds);
    },
  };
}

// Wipe all auth state for a session (used on explicit logout / manual delete).
// On disconnectSession(deleteAuthFiles=true) and on 401 in connection.update.
export async function clearAuth(sessionId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("wa_auth_state").delete().eq("session_id", sessionId);
  if (error) console.error("[WA-AUTH] clearAuth failed", sessionId, error.message);
}

// Returns true if creds row exists for this session — i.e. it's restorable
// without re-scanning a QR. Used by restoreSessions() at startup.
export async function hasAuth(sessionId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("wa_auth_state")
    .select("session_id")
    .eq("session_id", sessionId)
    .eq("key", "creds")
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

// Batched version of hasAuth — given a list of session ids, returns the subset
// that have a creds row. One DB roundtrip instead of N.
export async function filterRestorable(sessionIds: string[]): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("wa_auth_state")
    .select("session_id")
    .eq("key", "creds")
    .in("session_id", sessionIds);
  if (error || !data) return new Set();
  return new Set(data.map((row) => row.session_id as string));
}
