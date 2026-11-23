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
