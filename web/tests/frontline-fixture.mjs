import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { caller, cmd, newKey, ok, staff } from "./helpers.mjs";

export async function frontlineCase(t, lang = "en", kind = "atm", { pair = true } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname));
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const station = randomUUID();
  const phone = await caller();
  const op = await staff("operator@ichido.demo");
  await admin.from("station").insert({ id: station, kind, label: {}, branch: {}, counter_hours: {}, security_company: "fixture" }).throwOnError();
  t.after(async () => {
    await admin.from("desk").delete().eq("station", station).throwOnError();
    await admin.from("light").delete().eq("station", station).throwOnError();
    await admin.from("station").delete().eq("id", station).throwOnError();
  });
  const code = randomUUID().slice(0, 6).toUpperCase();
  const fault = kind === "shelter" ? "shelter_checkin" : "card_retained";
  const args = { p_station: station, p_key: newKey(), p_code: code, p_fault: fault, p_digest: createHash("sha256").update(code).digest("hex") };
  const { data: incident } = await admin.rpc("cmd_display_press", args).throwOnError();
  if (pair) await ok(cmd(phone, "pair", { station, code, lang, frontline: true }));
  const turn = async (act, fields = {}) => {
    const { data } = await phone.c.from("draft").select("rev").eq("incident", incident).single().throwOnError();
    return ok(cmd(phone, "frontline_turn", { act, request_id: randomUUID(), base_rev: data.rev, ...fields }));
  };
  const monitor = async () => (await ok(cmd(op, "frontline_monitor", { incident }))).turns;
  const desk = async () => (await op.c.from("desk").select("*").eq("id", incident).single().throwOnError()).data;
  return { admin, op, phone, incident, station, turn, monitor, desk, args };
}

// HTTP requests use separate transactions. Serialize the local pilot switch and restore the previous value.
export async function enableClosure(t) {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));
  const {Client} = (await import("pg")).default;
  const db = new Client({connectionString:url.href});
  await db.connect();
  let prior;
  t.after(async () => {
    try { if (prior!==undefined) await db.query("update ichido.ops_setting set value=$1 where key='ai_closure'",[prior]); }
    finally { await db.end(); }
  });
  await db.query("select pg_advisory_lock(841000)");
  const {rows} = await db.query("select value from ichido.ops_setting where key='ai_closure'");
  assert.equal(rows.length,1,"local database needs 20261124100000_voice_resolution.sql");
  prior = rows[0].value;
  await db.query("update ichido.ops_setting set value=1 where key='ai_closure'");
}
export async function shelterAnswer(f) {
  await f.turn("start");
  await f.turn("tap",{flag:"need_news",on:true});
  await f.turn("confirm");
  const {screen} = await ok(cmd(f.phone,"caller_screen"));
  return {reply:screen.reply.id,rev:screen.draft.rev,lang:screen.card.lang,ack:true};
}
