import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// The bridge from a Better Auth staff session to Supabase row-level security: a short HS256 token signed with the
// project's JWT secret, so PostgREST and Realtime accept it. auth.uid() is the staff uid; ichido.my_role() reads
// the role from the database and checks that session_id is still a live aal2 session, so revoking the session
// cuts access before the token expires. Claims are informative except sub and session_id.

export const STAFF_ISSUER = "ichido-staff";
export const STAFF_TOKEN_TTL_S = 300;

type Claims = { sub: string; session_id: string; exp: number; iss: string; aud: string; role: string };

function key(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("SUPABASE_JWT_SECRET is not set (at least 32 characters)");
  return secret;
}
const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (data: string) => createHmac("sha256", key()).update(data).digest();

export function mintStaffToken(who: { uid: string; role: string; aal: string; session: string }) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + STAFF_TOKEN_TTL_S;
  const body = `${part({ alg: "HS256", typ: "JWT" })}.${part({
    iss: STAFF_ISSUER, sub: who.uid, aud: "authenticated", role: "authenticated", iat: now, exp,
    app_role: who.role, aal: who.aal, amr: [{ method: who.aal === "aal2" ? "mfa" : "password", timestamp: now }],
    session_id: who.session, is_anonymous: false,
  })}`;
  return { token: `${body}.${sign(body).toString("base64url")}`, expires_at: exp };
}

// Only our own tokens: right algorithm, signature, issuer, audience and lifetime. Anything else returns null.
export function verifyStaffToken(token: string): Claims | null {
  const [h, p, s, extra] = token.split(".");
  if (!h || !p || !s || extra !== undefined) return null;
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    if (header.alg !== "HS256") return null;
    const given = Buffer.from(s, "base64url");
    const expected = sign(`${h}.${p}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const c = JSON.parse(Buffer.from(p, "base64url").toString()) as Claims;
    const ok = c.iss === STAFF_ISSUER && c.aud === "authenticated" && c.role === "authenticated"
      && typeof c.sub === "string" && typeof c.session_id === "string" && typeof c.exp === "number" && c.exp > Date.now() / 1000;
    return ok ? c : null;
  } catch (e) {
    if (e instanceof SyntaxError) return null;
    throw e;
  }
}
