// Staff sign-in with Better Auth, end to end against the running app (APP), local Supabase and the local Mailpit
// (MAILPIT_URL): invite-only accounts, email verification by invite link, mandatory TOTP enrolment, aal2, the minted
// Supabase token against PostgREST RLS and Realtime, one-time TOTP codes, lockout without user enumeration, password
// reset, revocation, the permission matrix, the audited role change, and passkeys through Chrome's virtual authenticator.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { APP, base32, closeOpen, cmd, device, jar, mint, newKey, ok, signIn, staff, totp } from "./helpers.mjs";
import { ACCOUNT, AUTH, MAIL } from "../content/catalogue.ts";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const asToken = (token) => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { accessToken: async () => token });
const claims = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
const cookieCmd = (j, name, body = {}) => j.post("/api/cmd", { cmd: name, ...body }).then((r) => ({ status: r.status, body: r.body }));
const adminApi = (j, action, body = {}) => j.post("/api/admin", { action, ...body });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stamp = Date.now().toString(36);
const email = `invitee-${stamp}@ichido.test`;
const name = `招待 ${stamp}`;
let password = `Kumo-${randomBytes(9).toString("base64url")}`;
const state = {};

// The newest message to `to` whose subject contains `subject`, from Mailpit's API.
async function mail(to, subject) {
  const base = process.env.MAILPIT_URL;
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${to}" subject:"${subject}"`)}`)).json();
    if (list.messages?.length) {
      const msg = await (await fetch(`${base}/api/v1/message/${list.messages[0].ID}`)).json();
      assert.ok(msg.HTML.includes('lang="en"') && msg.HTML.includes('lang="ja"'), "Japanese and English, marked up by language");
      return msg;
    }
    await sleep(250);
  }
  throw new Error(`no "${subject}" email to ${to}`);
}
async function mailLink(to, subject) {
  const link = (await mail(to, subject)).Text.match(/https?:\/\/\S+\/api\/auth\/reset-password\/\S+/)?.[0];
  assert.ok(link, "the email carries a set-password link");
  return link;
}
async function tokenFromLink(link) {
  const res = await fetch(link, { redirect: "manual" });
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get("location"), APP);
  assert.equal(to.pathname, "/staff/password");
  return to.searchParams.get("token");
}

test.after(async () => { await db.end(); });

test("sign-up is closed: staff accounts exist only by invitation", async () => {
  const r = await jar().post("/api/auth/sign-up/email", { email: `self-${stamp}@ichido.test`, password: "a-long-password-nobody-uses", name: "x" });
  assert.ok(r.status === 403 || r.status === 400, `sign-up refused (${r.status})`);
  const { rows } = await db.query(`select 1 from auth_ba."user" where email = $1`, [`self-${stamp}@ichido.test`]);
  assert.equal(rows.length, 0);
  // Better Auth's own admin endpoints are not reachable from a browser either, even for an admin.
  const admin = await staff("admin@ichido.demo");
  assert.equal((await admin.jar.post("/api/auth/admin/set-role", { userId: admin.uid, role: "field" })).status, 403);
  const op = await staff("operator@ichido.demo");
  assert.equal((await adminApi(op.jar, "invite", { email, name, role: "operator" })).status, 403, "an operator cannot invite");
});

test("invite → email link sets the password (verifies the address) → forced TOTP enrolment → aal2 → token works in RLS and Realtime", async () => {
  const admin = await staff("admin@ichido.demo");
  const invited = await adminApi(admin.jar, "invite", { email, name, role: "operator" });
  assert.equal(invited.status, 200, JSON.stringify(invited.body));
  state.uid = invited.body.id;
  assert.equal((await adminApi(admin.jar, "invite", { email, name, role: "operator" })).body.error, "exists");

  // No password yet: signing in gives the same answer as a wrong password.
  const early = await jar().post("/api/auth/sign-in/email", { email, password });
  assert.equal(early.status, 401);

  const token = await tokenFromLink(await mailLink(email, MAIL.invite.ja.subject));
  const weak = await jar().post("/api/auth/reset-password", { newPassword: "password12345", token });
  assert.equal(weak.body.code, "PASSWORD_COMPROMISED", "breached passwords are refused (Have I Been Pwned)");
  assert.equal((await jar().post("/api/auth/reset-password", { newPassword: "short", token })).body.code, "PASSWORD_TOO_SHORT");
  assert.equal((await jar().post("/api/auth/reset-password", { newPassword: password, token })).status, 200);
  assert.equal((await jar().post("/api/auth/reset-password", { newPassword: password, token })).status, 400, "the link works once");
  assert.equal((await db.query(`select "emailVerified" from auth_ba."user" where id = $1`, [state.uid])).rows[0].emailVerified, true);

  // Password alone: an aal1 session that can do nothing but enrol.
  const j = jar();
  const first = await j.post("/api/auth/sign-in/email", { email, password });
  assert.equal(first.status, 200);
  assert.notEqual(first.body.twoFactorRedirect, true);
  const s1 = await (await fetch(`${APP}/api/auth/get-session`, { headers: { cookie: j.header() } })).json();
  assert.equal(s1.session.aal, "aal1");
  assert.equal((await j.post("/api/auth/supabase-token")).status, 403);
  assert.equal((await cookieCmd(j, "staff_list")).body.error, "mfa_required");

  const enabled = await j.post("/api/auth/two-factor/enable", { password });
  assert.equal(enabled.status, 200, JSON.stringify(enabled.body));
  assert.equal(enabled.body.backupCodes.length, 10);
  assert.equal((await j.post("/api/auth/two-factor/enable", { password, method: "otp" })).status, 400, "email codes are never the only factor");
  state.secret = base32(new URL(enabled.body.totpURI).searchParams.get("secret"));
  state.backup = enabled.body.backupCodes;
  assert.equal((await j.post("/api/auth/two-factor/verify-totp", { code: "000000" })).status, 401);
  const code = totp(state.secret);
  assert.equal((await j.post("/api/auth/two-factor/verify-totp", { code })).status, 200);
  const s2 = await (await fetch(`${APP}/api/auth/get-session`, { headers: { cookie: j.header() } })).json();
  assert.equal(s2.session.aal, "aal2");
  assert.equal(s2.user.twoFactorEnabled, true);

  // The minted token: short, aal2, this session; PostgREST reads as this operator.
  const minted = await mint(j);
  const c = claims(minted);
  assert.equal(c.sub, state.uid);
  assert.equal(c.aal, "aal2");
  assert.equal(c.role, "authenticated");
  assert.equal(c.aud, "authenticated");
  assert.equal(c.app_role, "operator");
  assert.equal(c.session_id, s2.session.id);
  assert.ok(c.exp - c.iat <= 600);
  const reader = asToken(minted);
  const { error: readError } = await reader.from("desk").select("id").limit(1);
  assert.ifError(readError);
  assert.ifError((await reader.rpc("insights", { p_days: 7 })).error);
  assert.equal((await ok(cmd({ token: minted }, "me"))).role, "operator");

  // Realtime with the same token: the private staff topic for a table this operator may read, and its broadcast.
  // Local Realtime can take about 5 s to authorise a private join, and on a fresh stack (this is the first test file)
  // it starts its message replication only now, so the first broadcast can be lost: keep touching the row until one
  // arrives. setAuth first, as lib/live.ts does: otherwise the join can go out before the token is attached.
  await reader.realtime.setAuth();
  const seen = new Promise((resolve, reject) => {
    let poke;
    const stop = () => { clearTimeout(timer); clearInterval(poke); reader.removeChannel(ch); };
    const timer = setTimeout(() => { stop(); reject(new Error("no realtime broadcast")); }, 60_000);
    const touch = () => service.from("light").update({ updated_at: new Date().toISOString() }).eq("station", "TABLE-A");
    const ch = reader.channel("live:light", { config: { private: true } }).on("broadcast", { event: "change" }, () => {
      stop(); resolve();
    });
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") { await touch(); poke = setInterval(touch, 1_000); }
      else if (status !== "CLOSED") { stop(); reject(new Error(`realtime join: ${status}`)); }
    }, 45_000);
  });
  await seen;

  // Signing in again needs the second factor; the enrolment code cannot be used a second time.
  const again = jar();
  assert.equal((await again.post("/api/auth/sign-in/email", { email, password })).body.twoFactorRedirect, true);
  assert.equal((await again.post("/api/auth/two-factor/verify-totp", { code })).status, 401, "a TOTP code works once");
  const backup = await again.post("/api/auth/two-factor/verify-backup-code", { code: state.backup[0] });
  assert.equal(backup.status, 200, "a backup code signs in");
  const s3 = await (await fetch(`${APP}/api/auth/get-session`, { headers: { cookie: again.header() } })).json();
  assert.equal(s3.session.aal, "aal2");
  state.jar = j;
  state.token = minted;
});

test("wrong passwords: rate limited, then the address is locked — with the same answers whether or not it exists", async () => {
  const unknown = `nobody-${stamp}@ichido.test`;
  const known = await jar().post("/api/auth/sign-in/email", { email: "operator2@ichido.demo", password: "not-the-password" });
  const missing = await jar().post("/api/auth/sign-in/email", { email: unknown, password: "not-the-password" });
  assert.equal(known.status, 401);
  assert.deepEqual(missing.body, known.body, "no user enumeration");

  // Better Auth's per-source limit: a burst is refused with 429.
  const burst = [];
  for (let i = 0; i < 4; i++) burst.push((await jar().post("/api/auth/sign-in/email", { email: unknown, password: "wrong-again" }, { "x-no-retry": "1" })).status);
  assert.ok(burst.includes(429), `burst answered ${burst}`);

  // Five failures for one address lock it for 15 minutes, even for the right password (here: none exists).
  for (let n = 0; n < 5; n++) await jar().post("/api/auth/sign-in/email", { email: unknown, password: "wrong-again" });
  const locked = await jar().post("/api/auth/sign-in/email", { email: unknown, password: "wrong-again" });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.code, "TOO_MANY_ATTEMPTS");
});

test("auditor reads cases, insights and the audit log, and runs no command", async () => {
  const auditor = await staff("auditor@ichido.demo");
  for (const [name, body] of [["claim", { incident: randomUUID() }], ["staff_list", {}], ["disaster_set", { stations: ["TABLE-A"], notice: "earthquake" }], ["send", { incident: randomUUID(), intent: "HELD_WAIT_OR_LEAVE" }], ["field", { incident: randomUUID(), generation: 1, state: "on_way" }], ["takeover", { incident: randomUUID() }]]) {
    assert.equal((await cmd(auditor, name, body)).status, 403, `auditor ${name}`);
  }
  assert.ifError((await auditor.c.from("desk").select("id").limit(1)).error);
  const { count: seen } = await auditor.c.from("desk").select("id", { count: "exact", head: true });
  const { count: all } = await service.from("desk").select("id", { count: "exact", head: true });
  assert.equal(seen, all, "auditor reads the whole case history");
  assert.deepEqual((await auditor.c.from("draft").select("incident").limit(1)).data, [], "never callers' drafts");
  assert.ifError((await auditor.c.rpc("insights", { p_days: 7 })).error);
  assert.ifError((await auditor.c.schema("ichido").from("staff_audit").select("id").limit(1)).error);
  assert.equal((await adminApi(auditor.jar, "audit")).status, 200);
  assert.equal((await adminApi(auditor.jar, "users")).status, 403, "the audit log, not account management");
  const op = await staff("operator@ichido.demo");
  assert.deepEqual((await op.c.schema("ichido").from("staff_audit").select("id").limit(1)).data, [], "operators do not read the audit log");
});

test("a revoked session stops working: the console, the token mint and the database", async () => {
  const admin = await staff("admin@ichido.demo");
  const reader = asToken(state.token);
  assert.ifError((await reader.rpc("insights", { p_days: 7 })).error);
  assert.equal((await adminApi(admin.jar, "revoke_sessions", { userId: state.uid })).status, 200);
  assert.equal((await cmd({ token: state.token }, "me")).body.role, "none");
  assert.equal((await state.jar.post("/api/auth/supabase-token")).status, 401);
  assert.ok((await reader.rpc("insights", { p_days: 7 })).error, "RLS refuses the token of a revoked session before it expires");
  const { rows } = await db.query("select action, actor from ichido.staff_audit where target = $1 order by id desc limit 1", [state.uid]);
  assert.deepEqual(rows[0], { action: "sessions_revoked", actor: admin.uid });
});

test("admin role change is audited, append-only, and takes effect at once; field sees only their own jobs", async () => {
  const admin = await staff("admin@ichido.demo");
  assert.equal((await adminApi(admin.jar, "set_role", { userId: admin.uid, role: "field" })).status, 409, "not on yourself");
  assert.equal((await adminApi(admin.jar, "set_role", { userId: state.uid, role: "boss" })).status, 400);
  assert.equal((await adminApi(admin.jar, "set_role", { userId: state.uid, role: "field" })).status, 200);
  const { rows } = await db.query("select actor, action, data from ichido.staff_audit where target = $1 and action = 'role_changed' order by id desc limit 1", [state.uid]);
  assert.deepEqual(rows[0], { actor: admin.uid, action: "role_changed", data: { from: "operator", to: "field" } });
  assert.equal((await db.query("select role::text from ichido.staff where uid = $1", [state.uid])).rows[0].role, "field");
  await assert.rejects(db.query("update ichido.staff_audit set action = 'x' where target = $1", [state.uid]), /append-only/);
  await assert.rejects(db.query("delete from ichido.staff_audit where target = $1", [state.uid]), /append-only/);

  // Sign in again (the sessions were revoked) as the new guard.
  state.jar = await signIn(email, { password, secret: state.secret });
  const newGuard = { token: await mint(state.jar) };
  newGuard.c = asToken(newGuard.token);
  assert.equal((await ok(cmd(newGuard, "me"))).role, "field");
  assert.equal((await cmd(newGuard, "claim", { incident: randomUUID() })).status, 403);

  // A job for guard1 is invisible to guard2 and to the new guard, and so is the desk.
  const op = await staff("operator@ichido.demo");
  const g1 = await staff("guard1@ichido.demo");
  const g2 = await staff("guard2@ichido.demo");
  await closeOpen(op);
  assert.equal((await device(newKey())).status, 204);
  const { data: open } = await op.c.from("desk").select("id").is("finished_at", null);
  const incident = open[0].id;
  await ok(cmd(op, "claim", { incident }));
  await ok(cmd(op, "assign", { incident, assignee: g1.uid }));
  assert.equal((await g1.c.from("field_job").select("incident").eq("incident", incident)).data.length, 1);
  assert.deepEqual((await g2.c.from("field_job").select("incident").eq("incident", incident)).data, []);
  assert.deepEqual((await newGuard.c.from("field_job").select("incident").eq("incident", incident)).data, []);
  assert.deepEqual((await g2.c.from("desk").select("id").eq("id", incident)).data, []);
  assert.equal((await cmd(g2, "field", { incident, generation: 1, state: "on_way" })).status, 403);
  await closeOpen(op);
});

test("password reset by email: same answer for any address, one-time link, every session signed out", async () => {
  const before = state.jar;
  assert.ok(await mint(before));
  const a = await jar().post("/api/auth/request-password-reset", { email, redirectTo: "/staff/password" });
  const b = await jar().post("/api/auth/request-password-reset", { email: `nobody-${stamp}@ichido.test`, redirectTo: "/staff/password" });
  assert.equal(a.status, 200);
  assert.deepEqual(a.body, b.body, "no user enumeration");
  const token = await tokenFromLink(await mailLink(email, MAIL.reset.ja.subject));
  password = `Mizu-${randomBytes(9).toString("base64url")}`;
  assert.equal((await jar().post("/api/auth/reset-password", { newPassword: password, token })).status, 200);
  assert.equal(await mint(before), null, "the reset signed out every session");
  state.jar = await signIn(email, { password, secret: state.secret });
  assert.ok(await mint(state.jar));
});

test("passkey: register on the account page, then sign in with it (Chrome virtual authenticator)", async (t) => {
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch (e) {
    return t.skip(`Chrome is not available here: ${e.message.split("\n")[0]}`);
  }
  try {
    const context = await browser.newContext({ locale: "ja-JP" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    const cookies = state.jar.header().split("; ").map((c) => c.split(/=(.*)/s)).map(([n, value]) => ({ name: n, value, url: APP }));
    await context.addCookies(cookies);

    await page.goto(`${APP}/account`);
    await page.getByRole("button", { name: ACCOUNT.addPasskey }).click();
    await page.getByText(AUTH.enrol.passkeyName).first().waitFor({ timeout: 15_000 });
    assert.equal((await db.query(`select count(*)::int as n from auth_ba.passkey where "userId" = $1`, [state.uid])).rows[0].n, 1);

    await context.clearCookies();
    await page.goto(`${APP}/account`);
    await page.getByRole("button", { name: AUTH.passkey }).click();
    await page.getByRole("heading", { name: ACCOUNT.sessions }).waitFor({ timeout: 15_000 });   // the account page itself, not the sign-in screen
    const session = await page.evaluate(async () => (await fetch("/api/auth/get-session")).json());
    assert.equal(session.user.id, state.uid);
    assert.equal(session.session.aal, "aal2", "a user-verified passkey is a second factor");
    // Chrome is a device this person had not signed in from: they are told by email.
    assert.match((await mail(email, MAIL.newSignIn.ja.subject)).Text, /Chrome/);
  } finally {
    await browser.close();
  }
});
