// Shared helpers for tests that run against a live app and local Supabase (npm run test:fresh).
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const APP = process.env.APP ?? "http://localhost:3123";
const client = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

export async function staff(email) {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email, password: "ichido-demo" });
  assert.ifError(error);
  return { c, token: data.session.access_token, uid: data.user.id };
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
