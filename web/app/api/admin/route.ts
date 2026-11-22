import { APIError } from "better-auth/api";
import { auth, pool, sendInvite } from "@/lib/auth";
import { actorFrom, fail, reply, staffWith, HttpError, type Staff } from "@/lib/server";
import { boundedJson } from "@/lib/request-security";
import { isRole, type Permission } from "@/lib/rbac";
import { requestLog, errorFields } from "@/lib/log";

// Account administration for the /admin page. Each action checks its permission in lib/rbac.ts (Better Auth's admin
// endpoints check the same roles again) and is written to the append-only ichido.staff_audit before it answers.
// Better Auth's own /admin/* endpoints refuse browser calls (lib/auth.ts), so every change passes through here.

type Body = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const uuid = (b: Body, k: string) => (typeof b[k] === "string" && UUID.test(b[k] as string) ? (b[k] as string) : fail(400, "bad_request"));

async function audit(actor: Staff, action: string, target: string | null, data: Record<string, unknown> = {}) {
  await pool.query("insert into ichido.staff_audit (actor, action, target, data) values ($1, $2, $3, $4)", [actor.uid, action, target, data]);
}
async function userRow(id: string) {
  const { rows } = await pool.query(`select id, email, name, role, "emailVerified" as verified from auth_ba."user" where id = $1`, [id]);
  return rows[0] ?? fail(404, "not_found");
}
// Nobody changes, disables or resets themselves here: another admin must, so the last admin cannot lock everyone out.
const notSelf = (a: Staff, id: string) => { if (a.uid === id) fail(409, "conflict"); };

type Action = { need: Permission; run: (a: Staff, b: Body, headers: Headers) => Promise<object> };
const ACTIONS: Record<string, Action> = {
  users: {
    need: "user:list",
    async run() {
      const { rows } = await pool.query(`
        select u.id, u.email, u.name, u.role, u.banned, u."emailVerified" as verified, u."twoFactorEnabled" as totp,
               (select count(*)::int from auth_ba.passkey p where p."userId" = u.id) as passkeys,
               (select max(x."updatedAt") from auth_ba."session" x where x."userId" = u.id and x."expiresAt" > now()) as active_at,
               u."createdAt" as created_at
          from auth_ba."user" u order by u."createdAt"`);
      return { users: rows };
    },
  },
  audit: {
    need: "audit:read",
    async run() {
      const { rows } = await pool.query(`
        select a.id, a.at, a.action, a.data, a.actor, a.target, ua.name as actor_name, ut.name as target_name
          from ichido.staff_audit a left join auth_ba."user" ua on ua.id = a.actor left join auth_ba."user" ut on ut.id = a.target
         order by a.id desc limit 200`);
      return { audit: rows };
    },
  },
  invite: {
    need: "user:create",
    async run(a, b, headers) {
      const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
      const name = typeof b.name === "string" ? b.name.trim() : "";
      if (!EMAIL.test(email) || !name || name.length > 60 || !isRole(b.role)) fail(400, "bad_request");
      const { user } = await auth.api.createUser({ body: { email, name, role: b.role as "field" }, headers });
      await audit(a, "user_invited", user.id, { role: b.role });
      await sendInvite({ id: user.id, email, name });
      return { id: user.id };
    },
  },
  resend_invite: {
    need: "user:create",
    async run(a, b) {
      const u = await userRow(uuid(b, "userId"));
      if (u.verified) fail(409, "conflict");
      await audit(a, "invite_resent", u.id);
      await sendInvite(u);
      return {};
    },
  },
  set_role: {
    need: "user:set-role",
    async run(a, b, headers) {
      const id = uuid(b, "userId");
      notSelf(a, id);
      if (!isRole(b.role)) fail(400, "bad_request");
      const u = await userRow(id);
      if (u.role === b.role) return {};
      await auth.api.setRole({ body: { userId: id, role: b.role as "field" }, headers });
      await audit(a, "role_changed", id, { from: u.role, to: b.role });
      return {};
    },
  },
  disable: {
    need: "user:ban",
    async run(a, b, headers) {
      const id = uuid(b, "userId");
      notSelf(a, id);
      await auth.api.banUser({ body: { userId: id, banReason: "disabled_by_admin" }, headers });   // also ends their sessions
      await audit(a, "user_disabled", id);
      return {};
    },
  },
  enable: {
    need: "user:ban",
    async run(a, b, headers) {
      const id = uuid(b, "userId");
      notSelf(a, id);
      await auth.api.unbanUser({ body: { userId: id }, headers });
      await audit(a, "user_enabled", id);
      return {};
    },
  },
  // Their authenticator, backup codes and passkeys go; the next sign-in enrols a second factor again.
  reset_mfa: {
    need: "user:reset-mfa",
    async run(a, b) {
      const id = uuid(b, "userId");
      notSelf(a, id);
      await userRow(id);
      const db = await pool.connect();
      try {
        await db.query("begin");
        await db.query(`delete from auth_ba."twoFactor" where "userId" = $1`, [id]);
        await db.query(`delete from auth_ba.passkey where "userId" = $1`, [id]);
        await db.query(`delete from auth_ba."session" where "userId" = $1`, [id]);
        await db.query(`update auth_ba."user" set "twoFactorEnabled" = false, "updatedAt" = now() where id = $1`, [id]);
        await db.query("insert into ichido.staff_audit (actor, action, target) values ($1, 'mfa_reset', $2)", [a.uid, id]);
        await db.query("commit");
      } catch (e) {
        await db.query("rollback");
        throw e;
      } finally {
        db.release();
      }
      return {};
    },
  },
  revoke_sessions: {
    need: "session:revoke",
    async run(a, b, headers) {
      const id = uuid(b, "userId");
      await auth.api.revokeUserSessions({ body: { userId: id }, headers });
      await audit(a, "sessions_revoked", id);
      return {};
    },
  },
};

const BETTER_AUTH_STATUS: Record<string, [number, string]> = {
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: [409, "exists"], USER_NOT_FOUND: [404, "not_found"],
};

export async function POST(req: Request): Promise<Response> {
  const log = requestLog("/api/admin");
  let action = "unknown";
  try {
    const body = await boundedJson(req, 8192);
    if (body instanceof Response) return body;
    action = typeof body.action === "string" && Object.hasOwn(ACTIONS, body.action) ? body.action : fail(404, "not_found");
    const a = staffWith(await actorFrom(req), ACTIONS[action].need);
    const out = await ACTIONS[action].run(a, body, req.headers);
    log.info("admin", { cmd: action, role: a.role, uid: a.uid, status: 200, duration_ms: log.ms() });
    return reply(200, out);
  } catch (e) {
    if (e instanceof HttpError) {
      log.warn("admin", { cmd: action, status: e.status, code: e.message, duration_ms: log.ms() });
      return reply(e.status, { error: e.message });
    }
    if (e instanceof APIError) {
      const [status, code] = BETTER_AUTH_STATUS[String(e.body?.code)] ?? [e.statusCode === 403 ? 403 : 400, e.statusCode === 403 ? "forbidden" : "bad_request"];
      log.warn("admin", { cmd: action, status, code, duration_ms: log.ms() });
      return reply(status, { error: code });
    }
    log.error("admin", { cmd: action, status: 500, code: "server", duration_ms: log.ms(), ...errorFields(e) });
    return reply(500, { error: "server" });
  }
}
