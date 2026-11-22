// Shared helpers for tests that run against a live app and local Supabase (npm run test:fresh).
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

export const APP = process.env.APP ?? "http://localhost:3123";
const client = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

// Seeded by scripts/seed-staff.mjs (local only): one password, and an authenticator secret per account.
export const STAFF_PASSWORD = "ichido-demo-local";
export const totpSecret = (email) => `local-totp-${email}`;

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s), the same as Better Auth's; `secret` is the key's bytes or a UTF-8 string.
export function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", Buffer.isBuffer(secret) ? secret : Buffer.from(secret, "utf8")).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
export function base32(s) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
}

// A small cookie jar over fetch for Better Auth, which checks the Origin of cookie requests.
export function jar(initial = "") {
  const cookies = new Map(initial.split(/;\s*/).filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)));
  const header = () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  return {
    header,
    async post(path, body = {}, extra = {}) {
      for (;;) {
        const res = await fetch(`${APP}${path}`, {
          method: "POST", redirect: "manual",
          headers: { origin: APP, "content-type": "application/json", cookie: header(), ...extra },
          body: JSON.stringify(body),
        });
        for (const c of res.headers.getSetCookie()) {
          const [pair, ...attrs] = c.split(/;\s*/);
          const [k, v] = pair.split(/=(.*)/s);
          if (attrs.some((a) => /^max-age=0$/i.test(a)) || v === "") cookies.delete(k); else cookies.set(k, v);
        }
        // Better Auth's own limits (3 sign-ins / 10 s locally): wait as told and try again.
        if (res.status === 429 && res.headers.get("x-retry-after") && !extra["x-no-retry"]) {
          await new Promise((r) => setTimeout(r, (Number(res.headers.get("x-retry-after")) + 0.5) * 1000));
          continue;
        }
        return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
      }
    },
  };
}

// Password, then a TOTP code for the pending challenge. A code is accepted once, so after a refusal wait for the next one.
export async function signIn(email, { password = STAFF_PASSWORD, secret = totpSecret(email) } = {}) {
  const j = jar();
  const first = await j.post("/api/auth/sign-in/email", { email, password });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.twoFactorRedirect, true, "staff sign-in always asks for a second factor");
  for (let attempt = 0; ; attempt++) {
    const r = await j.post("/api/auth/two-factor/verify-totp", { code: totp(secret) });
    if (r.status === 200) return j;
    assert.ok(attempt < 2 && r.body.code === "INVALID_CODE", JSON.stringify(r.body));
    await new Promise((res) => setTimeout(res, 30_000 - (Date.now() % 30_000) + 200));
  }
}

export async function mint(j) {
  const r = await j.post("/api/auth/supabase-token");
  return r.status === 200 ? r.body.token : null;
}

// Signed-in sessions are kept between test files (one process each) so the suite does not sign in again and again.
const cacheFile = join(tmpdir(), `ichido-staff-sessions-${new URL(APP).port || "80"}.json`);
const readCache = () => { try { return JSON.parse(readFileSync(cacheFile, "utf8")); } catch { return {}; } };
let queue = Promise.resolve();

// A staff member as the browser has them: the Better Auth session cookie, and a minted Supabase token used both
// for /api/cmd (bearer) and for PostgREST and Realtime (accessToken), so RLS sees exactly what the app sees.
export async function staff(email) {
  const run = queue.then(async () => {
    const cached = readCache()[email];
    let j = cached ? jar(cached) : null;
    let token = j && await mint(j);
    if (!token) {
      j = await signIn(email);
      token = await mint(j);
      writeFileSync(cacheFile, JSON.stringify({ ...readCache(), [email]: j.header() }), { mode: 0o600 });
    }
    assert.ok(token, `no Supabase token for ${email}`);
    const uid = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { accessToken: async () => token });
    return { c, token, uid, jar: j };
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function caller() {
  const c = client();
  const { data, error } = await c.auth.signInAnonymously();
  assert.ifError(error);
  return { c, token: data.session.access_token, uid: data.user.id };
}

export async function cmd(who, name, body = {}) {
  const res = await fetch(`${APP}/api/cmd`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${who.token}` },
    body: JSON.stringify({ cmd: name, ...body }),
  });
  return { status: res.status, body: await res.json() };
}

export const ok = async (p) => { const r = await p; assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };

export const device = (key, secret = "local-device-secret") =>
  fetch(`${APP}/api/device`, { method: "POST", headers: { "x-station": "TABLE-A", authorization: `Bearer ${secret}` }, body: key });

export const newKey = () => randomBytes(16).toString("hex");

// Open a fresh case at TABLE-A, claimed by `op`, with `who` paired to it in `lang`.
export async function openPairedCase(op, who, lang = "bn") {
  assert.equal((await device(newKey())).status, 204);
  const { data: open } = await op.c.from("desk").select("id").is("finished_at", null);
  assert.equal(open.length, 1);
  const incident = open[0].id;
  await ok(cmd(op, "claim", { incident }));
  const { code } = await ok(cmd(op, "issue_code", { incident }));
  await ok(cmd(who, "pair", { station: "TABLE-A", code, lang }));
  return incident;
}

// Close any open case so the next test starts with a free station.
export async function closeOpen(op) {
  const { data: open } = await op.c.from("desk").select("id, operator_id").is("finished_at", null);
  for (const d of open ?? []) {
    if (!d.operator_id) await ok(cmd(op, "claim", { incident: d.id }));
    await cmd(op, "abandon", { incident: d.id });
  }
}
