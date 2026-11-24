import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { migrateSessionStorage } from "./session-storage";
import { API_URL } from "./api";
import { authClient } from "./auth";

// Same backend as the web app: Supabase for reads (RLS) and Realtime, the web origin for every write.
// Callers are Supabase anonymous users (session in the keychain). Staff sign in with Better Auth (lib/auth.ts) and
// read the database with a five-minute token minted from that session, kept in memory only.
export { API_URL };

let caller: SupabaseClient | null = null;
let staff: SupabaseClient | null = null;
let token: { value: string; exp: number } | null = null;
let pending: Promise<string | null> | null = null;

// Native credentials are accessible only on the unlocked device. Expo web uses its browser storage.
function callerClient(): SupabaseClient {
  if (caller) return caller;
  const storage = Platform.OS === "web" ? AsyncStorage : migrateSessionStorage({
    getItem: SecureStore.getItemAsync,
    setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
    removeItem: SecureStore.deleteItemAsync,
  }, AsyncStorage);
  caller = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  const c = caller;
  AppState.addEventListener("change", (s) => (s === "active" ? c.auth.startAutoRefresh() : c.auth.stopAutoRefresh()));
  return c;
}

// The staff token for the Better Auth session in the keychain; null without a session that passed a second factor.
export function staffToken(): Promise<string | null> {
  if (token && token.exp - Date.now() / 1000 > 60) return Promise.resolve(token.value);
  pending ??= authClient.getCookie()
    .then((cookie) => fetch(`${API_URL}/api/auth/supabase-token`, { method: "POST", credentials: "omit", headers: { cookie } }))
    .then(async (res) => {
      if (!res.ok) return (token = null);
      const body = (await res.json()) as { token: string; expires_at: number };
      token = { value: body.token, exp: body.expires_at };
      return body.token;
    })
    .catch(() => (token = null))
    .finally(() => { pending = null; });
  return pending;
}

export function enterStaffSession() {
  staff ??= createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    accessToken: async () => (await staffToken()) ?? "",
  });
}

// The app's database client: as the signed-in staff member once StaffGate let them in, otherwise as the caller.
export function sb(): SupabaseClient {
  return staff ?? callerClient();
}

// Callers only: their anonymous Supabase session (pairing signs in anonymously first).
export const callerAuth = () => callerClient().auth;

export async function bearer(): Promise<string> {
  const session = staff ? null : await callerClient().auth.getSession();
  if (session?.error) throw new Error("server");
  const value = staff ? await staffToken() : session?.data.session?.access_token;
  return `Bearer ${value ?? ""}`;
}

// Without a token, the Better Auth session cookie (if any) answers "who is this" (mine / me) for a staff member.
async function credentials(): Promise<Record<string, string>> {
  const auth = await bearer();
  if (auth !== "Bearer ") return { authorization: auth };
  // The staff cookie lives in the OS keychain, which Expo web does not have: there a caller has no staff session.
  const cookie = Platform.OS === "web" ? null : await authClient.getCookie();
  return cookie ? { cookie } : {};
}

// Call a server command with the signed-in user's token; throws the server's stable error code.
export async function cmd<T = unknown>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/cmd`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await credentials()) },
      body: JSON.stringify({ cmd: name, ...body }),
    });
  } catch {
    throw new Error("server");
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "server");
  return json as T;
}

// Staff sign-out: end the Better Auth session (server and keychain) and forget the database token.
export async function signOut() {
  await authClient.signOut().catch(() => undefined);
  if (staff) void staff.removeAllChannels();
  staff = null;
  token = null;
}
