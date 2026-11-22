import * as SecureStore from "expo-secure-store";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import { API_URL } from "./api";

// Staff sign-in against the web app's Better Auth (web/lib/auth.ts). The session cookie lives in the OS keychain,
// readable only while this device is unlocked; it never leaves the device except to the web origin.
const keychain = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const storage = {
  getItem: (k: string) => SecureStore.getItem(k, keychain),
  getItemAsync: (k: string) => SecureStore.getItemAsync(k, keychain),
  setItem: (k: string, v: string) => SecureStore.setItem(k, v, keychain),
  setItemAsync: (k: string, v: string) => SecureStore.setItemAsync(k, v, keychain),
};

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({ scheme: "ichido", storagePrefix: "ichido", cookiePrefix: "ichido", storage }),
    twoFactorClient(),
    inferAdditionalFields({ session: { aal: { type: "string", required: true } } }),
  ],
});
