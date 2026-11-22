"use client";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

// Staff sign-in in the browser (web/lib/auth.ts on the server). The session is an httpOnly cookie; nothing is stored
// in localStorage. Account administration goes through /api/admin, not Better Auth's admin endpoints.
export const authClient = createAuthClient({
  plugins: [twoFactorClient(), passkeyClient(), inferAdditionalFields({ session: { aal: { type: "string", required: true } } })],
});
