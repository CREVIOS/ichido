import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Better Auth: staff sign-in, second factors, passkeys, password reset, sessions (web/lib/auth.ts).
export const { GET, POST } = toNextJsHandler(auth);
