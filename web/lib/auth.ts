import "server-only";
import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { nextCookies } from "better-auth/next-js";
import { admin, haveIBeenPwned, twoFactor } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { passkey } from "@better-auth/passkey";
import { expo } from "@better-auth/expo";
import { Pool } from "pg";
import { MATRIX, ROLES, STATEMENTS, type Role } from "@/lib/rbac";
import { sendMail } from "@/lib/mail";
import { entry } from "@/lib/log";

// Staff sign-in (Better Auth 1.7). Callers never come here: they stay Supabase anonymous users.
// Tables: schema auth_ba (supabase/migrations/20261124000100_better_auth.sql), reached over DATABASE_URL.

const g = globalThis as { ichidoAuthPool?: Pool };
// One pool per server instance, also across dev reloads. auth_ba first, so Better Auth's unqualified table names resolve.
export const pool = g.ichidoAuthPool ??= new Pool({ connectionString: process.env.DATABASE_URL, options: "-c search_path=auth_ba,public", max: 5 });

const baseURL = process.env.BETTER_AUTH_URL;
const origin = baseURL ? new URL(baseURL).origin : undefined;
const extraOrigins = (process.env.AUTH_TRUSTED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const dev = process.env.NODE_ENV === "development";

// Better Auth access control, built from the one matrix in lib/rbac.ts.
export const ac = createAccessControl(STATEMENTS);
export const roles = Object.fromEntries(ROLES.map((r) => [r, ac.newRole(MATRIX[r])])) as Record<Role, ReturnType<typeof ac.newRole>>;

// A session is aal2 only when it was created by a second factor (or a user-verified passkey), or replaces an aal2
// session for the same person (a password change). Everything else, including password-only sign-in, is aal1.
const SECOND_FACTOR = new Set(["/two-factor/verify-totp", "/two-factor/verify-otp", "/two-factor/verify-backup-code", "/passkey/verify-authentication"]);
const KEEPS_AAL = new Set(["/change-password"]);
// Handled by /api/admin, which checks lib/rbac.ts and writes the audit log: never called straight from a browser.
const SERVER_ONLY = [/^\/admin\//, /^\/two-factor\/disable$/, /^\/update-user$/, /^\/delete-user/, /^\/change-email$/, /^\/sign-up\//];

const LOCK_AFTER = 5;             // failed passwords for one address…
const LOCK_S = 15 * 60;           // …within this window lock it until the window ends
const INVITE_TTL_S = 72 * 3600;
const GENERIC = "INVALID_EMAIL_OR_PASSWORD";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function take(scope: string, key: string, limit: number, seconds: number, checkOnly = false): Promise<boolean> {
  const { rows } = await pool.query("select public.take_rate_limit($1, $2, $3, $4, $5) as ok", [scope, hash(key), limit, seconds, checkOnly]);
  return rows[0]?.ok === true;
}
const unlock = (email: string) => pool.query("delete from ichido.rate_bucket where scope = 'staff_sign_in' and key = $1", [hash(email)]);

// Who a TOTP code is for: the signed-in user (enrolment) or the pending two-factor challenge (sign-in).
type HookCtx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
async function challengeUser(ctx: HookCtx): Promise<string | null> {
  const session = await getSessionFromCtx(ctx).catch(() => null);
  if (session) return session.user.id;
  const challenge = await ctx.getSignedCookie(ctx.context.createAuthCookie("two_factor").name, ctx.context.secret);
  if (!challenge) return null;
  return (await ctx.context.internalAdapter.findVerificationValue(challenge))?.value ?? null;
}

const EVENTS = new Set(["/sign-in/email", "/sign-in/passkey", "/passkey/verify-authentication", "/two-factor/verify-totp", "/two-factor/verify-otp",
  "/two-factor/verify-backup-code", "/two-factor/enable", "/passkey/verify-registration", "/reset-password", "/request-password-reset", "/change-password",
  "/sign-out", "/revoke-session", "/revoke-sessions", "/revoke-other-sessions", "/verify-email"]);

export const auth = betterAuth({
  appName: "Ichido",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  trustedOrigins: [...(origin ? [origin] : []), ...extraOrigins, "ichido://", ...(dev ? ["exp://"] : [])],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,                 // invite-only: an admin creates the account (/api/admin invite)
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 3600,
    async sendResetPassword({ user, url }) {
      await sendMail({ to: user.email, kind: user.emailVerified ? "reset" : "invite", url, vars: { name: user.name } });
    },
    // The link came to this mailbox, so the address is proven (an invite is verified by setting the first password).
    async onPasswordReset({ user }) {
      await pool.query(`update auth_ba."user" set "emailVerified" = true, "updatedAt" = now() where id = $1`, [user.id]);
      entry("info", "auth_password_reset", { uid: user.id });
    },
  },
  emailVerification: {
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    expiresIn: 3600,
    async sendVerificationEmail({ user, url }) {
      await sendMail({ to: user.email, kind: "verify", url });
    },
  },
  user: { changeEmail: { enabled: false }, deleteUser: { enabled: false } },
  account: { accountLinking: { enabled: false } },
  session: {
    expiresIn: 4 * 3600,                 // idle for four hours and the session ends…
    updateAge: 5 * 60,                   // …while use rolls it forward every five minutes
    freshAge: 15 * 60,
    additionalFields: { aal: { type: "string", required: true, defaultValue: "aal1", input: false } },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/request-password-reset": { window: 300, max: 3 },
      "/send-verification-email": { window: 300, max: 3 },
      "/two-factor/send-otp": { window: 60, max: 3 },
    },
  },
  advanced: {
    cookiePrefix: "ichido",
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    database: { generateId: "uuid" },
    // Vercel overwrites this header. Elsewhere no client header is trusted, and limits share one bucket.
    ipAddress: { ipAddressHeaders: process.env.VERCEL === "1" ? ["x-vercel-forwarded-for"] : [] },
  },
  databaseHooks: {
    session: {
      create: {
        async before(session, ctx) {
          const path = ctx?.path ?? "";
          const aal = SECOND_FACTOR.has(path) || (KEEPS_AAL.has(path) && ctx?.context.session?.session.aal === "aal2") ? "aal2" : "aal1";
          return { data: { ...session, aal } };
        },
        // A second-factor sign-in from a device this person has not used before: tell them by email.
        async after(session) {
          if (session.aal !== "aal2" || !session.userAgent) return;
          const added = await pool.query(
            `insert into auth_ba.known_device (user_id, device) values ($1, $2) on conflict do nothing
             returning (select count(*) from auth_ba.known_device where user_id = $1) as before`, [session.userId, hash(session.userAgent)]);
          if (!added.rowCount || Number(added.rows[0].before) === 0) return;
          const { rows } = await pool.query(`select email from auth_ba."user" where id = $1`, [session.userId]);
          if (!rows[0]) return;
          const time = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" });
          await sendMail({ to: rows[0].email, kind: "newSignIn", vars: { time, device: session.userAgent.slice(0, 120) } })
            .catch((e: Error) => entry("error", "auth_alert_failed", { uid: session.userId, error: e.name }));
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.request && SERVER_ONLY.some((re) => re.test(ctx.path))) throw new APIError("FORBIDDEN", { message: "Forbidden", code: "FORBIDDEN" });
      if (ctx.path.startsWith("/two-factor/")) {
        // MFA stays mandatory: no "trust this device" skip, and email codes are a fallback, never the only factor.
        if (ctx.path === "/two-factor/enable" && ctx.body?.method === "otp") throw new APIError("BAD_REQUEST", { message: "Choose an authenticator app", code: "TOTP_REQUIRED" });
        if (ctx.body?.trustDevice) return { context: { body: { ...ctx.body, trustDevice: false } } };
      }
      if (ctx.path === "/two-factor/verify-totp" && typeof ctx.body?.code === "string") {
        // A TOTP code works once (RFC 6238 §5.2): a second use within its 90-second acceptance window is refused.
        const uid = await challengeUser(ctx);
        if (uid && !(await take("totp_used", `${uid}:${ctx.body.code}`, 1, 90))) {
          throw new APIError("UNAUTHORIZED", { message: "Invalid code", code: "INVALID_CODE" });
        }
      }
      if (ctx.path === "/sign-in/email") {
        const email = String(ctx.body?.email ?? "").trim().toLowerCase();
        // Same answer whether or not the address exists: the lock is counted per address typed.
        if (!(await take("staff_sign_in", email, LOCK_AFTER, LOCK_S, true))) {
          entry("warn", "auth_locked", { code: "sign_in" });
          throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts", code: "TOO_MANY_ATTEMPTS" });
        }
      }
      if (ctx.path === "/change-password") return { context: { body: { ...ctx.body, revokeOtherSessions: true } } };
      if (ctx.path === "/passkey/delete-passkey") {
        // Never remove someone's last second factor.
        const session = await getSessionFromCtx(ctx);
        if (!session) return;
        const { rows } = await pool.query(`select count(*)::int as n from auth_ba.passkey where "userId" = $1`, [session.user.id]);
        if (!session.user.twoFactorEnabled && rows[0].n <= 1) throw new APIError("BAD_REQUEST", { message: "Last second factor", code: "LAST_FACTOR" });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned;
      const failed = returned instanceof APIError;
      if (ctx.path === "/sign-in/email") {
        const email = String(ctx.body?.email ?? "").trim().toLowerCase();
        if (failed && returned.body?.code === GENERIC) await take("staff_sign_in", email, LOCK_AFTER, LOCK_S);
        if (!failed) await unlock(email);
      }
      if (!EVENTS.has(ctx.path)) return;
      const uid = ctx.context.newSession?.user.id ?? ctx.context.session?.user.id;
      const status = failed ? returned.statusCode : 200;
      entry(failed ? "warn" : "info", "auth", { code: ctx.path.slice(1).replace(/\//g, "."), status, uid });
    }),
  },
  plugins: [
    twoFactor({
      issuer: "Ichido",
      skipVerificationOnEnable: false,
      twoFactorCookieMaxAge: 600,
      backupCodeOptions: { amount: 10, length: 10 },
      otpOptions: {
        period: 5,
        async sendOTP({ user, otp }) {
          await sendMail({ to: user.email, kind: "otp", vars: { code: otp } });
        },
      },
    }),
    passkey({
      rpID: process.env.PASSKEY_RP_ID || (baseURL ? new URL(baseURL).hostname : "localhost"),
      rpName: "Ichido",
      origin: [...(origin ? [origin] : []), ...extraOrigins],
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    }),
    admin({ ac, roles, defaultRole: "field", adminRoles: ["admin"] }),
    haveIBeenPwned({ customPasswordCompromisedMessage: "PASSWORD_COMPROMISED" }),
    expo(),
    nextCookies(),
  ],
});

// An invite is a set-password link (the same one-time token as a reset) that lives for 72 hours.
export async function sendInvite(user: { id: string; email: string; name: string }) {
  const ctx = await auth.$context;
  const token = generateRandomString(32);
  await ctx.internalAdapter.createVerificationValue({ value: user.id, identifier: `reset-password:${token}`, expiresAt: new Date(Date.now() + INVITE_TTL_S * 1000) });
  const url = `${ctx.baseURL}/reset-password/${token}?callbackURL=${encodeURIComponent("/staff/password?invite=1")}`;
  await sendMail({ to: user.email, kind: "invite", url, vars: { name: user.name } });
}
