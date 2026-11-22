import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { migrateSessionStorage } from "./session-storage";

// Same backend as the web app: Supabase for reads (RLS) and Realtime, the web origin for every write.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

let client: SupabaseClient | null = null;

// Native credentials are accessible only on the unlocked device. Expo web uses its browser storage.
export function sb(): SupabaseClient {
  if (client) return client;
  const storage = Platform.OS === "web" ? AsyncStorage : migrateSessionStorage({
    getItem: SecureStore.getItemAsync,
    setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
    removeItem: SecureStore.deleteItemAsync,
  }, AsyncStorage);
  client = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  const c = client;
  AppState.addEventListener("change", (s) => (s === "active" ? c.auth.startAutoRefresh() : c.auth.stopAutoRefresh()));
  return c;
}

export async function bearer(): Promise<string> {
  const { data } = await sb().auth.getSession();
  return `Bearer ${data.session?.access_token ?? ""}`;
}

// Call a server command with the signed-in user's token; throws the server's stable error code.
export async function cmd<T = unknown>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/cmd`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: await bearer() },
      body: JSON.stringify({ cmd: name, ...body }),
    });
  } catch {
    throw new Error("server");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "server");
  return json as T;
}

export async function signOut() {
  await sb().auth.signOut();
}
