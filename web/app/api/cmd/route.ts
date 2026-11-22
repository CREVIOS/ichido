import { createHash, randomBytes, randomInt } from "node:crypto";
import { MANUAL_VERSION, REPLIES, FACTS, looksLikeNumber, type Fact } from "@/content/catalogue";
import { extract } from "@/lib/extract";
import { actorFrom, admin, priv, event, setLight, fail, reply, HttpError, type Actor } from "@/lib/server";

type Body = Record<string, unknown>;
const str = (b: Body, k: string) => (typeof b[k] === "string" ? (b[k] as string) : fail(400, `missing ${k}`));
const FACT_VALUES = ["unknown", "yes", "no"];
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const digest = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

async function openCase(id: string) {
  const { data } = await admin.from("desk").select("*").eq("id", id).is("finished_at", null).maybeSingle();
  return data ?? fail(404, "no open case");
}

function staff(a: Actor, role: "operator" | "field") {
  if (a.kind !== "staff" || a.role !== role) fail(403, "forbidden");
  return a as Extract<Actor, { kind: "staff" }>;
}

function caller(a: Actor) {
  if (a.kind !== "caller" || !a.incident) fail(403, "forbidden");
  return a as Extract<Actor, { kind: "caller" }> & { incident: string };
}

const commands: Record<string, (a: Actor, b: Body) => Promise<object>> = {
  // Operator commands
  async simulate(a, b) {
    staff(a, "operator");
    const { data, error } = await admin.rpc("record_fault", {
      p_station: str(b, "station"), p_key: randomBytes(16).toString("hex"), p_source: "simulator",
    });
    if (error) throw error;
    return { incident: data };
  },

  async staff_list(a) {
    staff(a, "operator");
    const { data } = await priv().from("staff").select("uid, display_name").eq("role", "field");
    return { field: data ?? [] };
  },

  async issue_code(a, b) {
    staff(a, "operator");
    const d = await openCase(str(b, "incident"));
    const { data: bound } = await priv().from("binding").select("incident").eq("incident", d.id).maybeSingle();
    if (bound) fail(409, "a caller is already connected");
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    const { error } = await priv().from("pair_code").upsert({
      incident: d.id, digest: digest(code), expires: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    if (error) throw error;
    return { code, expires_in: 300 };
  },

  async claim(a, b) {
    const op = staff(a, "operator");
    const d = await openCase(str(b, "incident"));
    if (d.operator_id && d.operator_id !== op.uid) fail(409, "claimed by another operator");
    await admin.from("desk").update({ operator_id: op.uid, status: "review" }).eq("id", d.id);
    await admin.from("caller_card").update({ status: "review" }).eq("id", d.id);
    await setLight(d.station, "review");
    await event(d.id, "operator", "claimed", "担当者が対応を開始", op.name);
    return {};
  },

  async remote_release(a, b) {
    const op = staff(a, "operator");
    const d = await openCase(str(b, "incident"));
    const result = str(b, "result") === "released" ? "成功" : "失敗";
    await admin.from("desk").update({ remote_release: result }).eq("id", d.id);
    await event(d.id, "operator", "remote_release", `遠隔解除を試行 → ${result}`, op.name);
    return {};
  },

  async send(a, b) {
    const op = staff(a, "operator");
    const d = await openCase(str(b, "incident"));
    if (d.operator_id !== op.uid) fail(409, "claim the case first");
    if (d.confirmed_rev == null) fail(409, "the caller has not confirmed a report yet");
    const intent = str(b, "intent");
    if (!REPLIES[intent]) fail(400, "unknown reply");
    const slots = (b.slots ?? {}) as Record<string, string>;
    const { data, error } = await admin.from("reply")
      .insert({ incident: d.id, intent, slots, manual_version: MANUAL_VERSION, operator_id: op.uid })
      .select("id").single();
    if (error) throw error;
    await event(d.id, "operator", "reply", `承認済み返答を送信：${REPLIES[intent].title}`, op.name);
    return { id: data.id };
  },

  async assign(a, b) {
    const op = staff(a, "operator");
    const d = await openCase(str(b, "incident"));
    if (d.operator_id !== op.uid) fail(409, "claim the case first");
    const assignee = str(b, "assignee");
    const { data: f } = await priv().from("staff").select("display_name").eq("uid", assignee).eq("role", "field").maybeSingle();
    if (!f) fail(400, "not a field account");
    await admin.from("field_job").upsert({ incident: d.id, station: d.station, assignee, state: "requested", eta_text: null, updated_at: new Date().toISOString() });
    await admin.from("desk").update({ status: "field" }).eq("id", d.id);
    await admin.from("caller_card").update({ status: "field", field_state: "requested", eta_text: null }).eq("id", d.id);
    await setLight(d.station, "field");
    await event(d.id, "operator", "dispatch", `警備会社へ現地確認を依頼（${f!.display_name}）`, op.name);
    return {};
  },

  async outcome(a, b) {
    const op = staff(a, "operator");
    const d = await openCase(str(b, "incident"));
    if (d.operator_id !== op.uid) fail(409, "claim the case first");
    const { data: c } = await admin.from("caller_card").select("*").eq("id", d.id).single();
    if (!c?.teachback) fail(409, "no teach-back yet");
    const result = str(b, "result") === "understood" ? "understood" : "clarify";
    await admin.from("caller_card").update({ teachback_result: result, ...(result === "understood" ? { status: "guided" } : { teachback: null }) }).eq("id", d.id);
    if (result === "clarify") {
      await event(d.id, "operator", "clarify", "お客様の理解が不十分 → 再案内", op.name);
      return {};
    }
    const { data: job } = await admin.from("field_job").select("state").eq("incident", d.id).maybeSingle();
    const summary = [
      d.card_back === "no" && "カードが戻ってこなかったとの申告。",
      d.cash_received === "yes" && "現金は受け取ったとのこと（本人申告）。",
      d.remote_release && `遠隔解除${d.remote_release}。`,
      job && "警備会社へ現地確認を依頼。",
      c!.choice === "leave" && "お客様は帰宅を選択、銀行からの連絡を待つ。",
      c!.choice === "wait" && "お客様は現地で待機を選択。",
      "お客様が次の行動を自分の言葉で説明した。",
    ].filter(Boolean).join("");
    await admin.from("desk").update({ status: "guided", summary_draft: summary, finished_at: new Date().toISOString() }).eq("id", d.id);
    await admin.from("field_job").update({ case_closed: true }).eq("incident", d.id);
    await setLight(d.station, "guided");
    await event(d.id, "operator", "guided", "案内を確認しました（お客様が次の手順を説明）", op.name);
    return { summary };
  },

  // Caller commands (anonymous user bound to one incident)
  async pair(a, b) {
    if (a.kind !== "caller") fail(403, "forbidden");
    if ((a as Extract<Actor, { kind: "caller" }>).incident) fail(409, "already connected");
    const lang = str(b, "lang");
    if (!["bn", "en", "ja"].includes(lang)) fail(400, "bad language");
    // ponytail: no per-IP rate limit yet; codes are single-use, 31^6 space, 5-minute expiry
    const { data, error } = await admin.rpc("redeem_pair", {
      p_uid: (a as Extract<Actor, { kind: "caller" }>).uid, p_station: str(b, "station"), p_digest: digest(str(b, "code")), p_lang: lang,
    });
    if (error) fail(403, "unavailable"); // same error for wrong, expired, used and wrong-station codes
    return { incident: data };
  },

  async draft(a, b) {
    const c = caller(a);
    const { data: cur } = await admin.from("draft").select("*").eq("incident", c.incident).single();
    if (b.base_rev !== cur!.rev) fail(409, "stale");
    const next: { card_back: Fact; cash_received: Fact; words: string | null; needs_clarification: boolean } = {
      card_back: cur!.card_back, cash_received: cur!.cash_received, words: cur!.words, needs_clarification: false,
    };
    const text = typeof b.text === "string" ? b.text.trim().slice(0, 500) : "";
    if (text) {
      if (looksLikeNumber(text)) return { withheld: true };
      const patch = await extract(text, c.lang ?? "bn", { card_back: cur!.card_back, cash_received: cur!.cash_received });
      if (patch) {
        if (patch.card_back !== "unchanged") next.card_back = patch.card_back;
        if (patch.cash_received !== "unchanged") next.cash_received = patch.cash_received;
        next.needs_clarification = patch.clarify;
      }
      next.words = text;
    }
    for (const k of Object.keys(FACTS) as (keyof typeof FACTS)[]) {
      if (typeof b[k] === "string" && FACT_VALUES.includes(b[k] as string)) next[k] = b[k] as Fact;
    }
    const { error } = await admin.from("draft").update({ ...next, rev: cur!.rev + 1 }).eq("incident", c.incident).eq("rev", cur!.rev);
    if (error) throw error;
    return { rev: cur!.rev + 1 };
  },

  async confirm(a, b) {
    const c = caller(a);
    const { data: cur } = await admin.from("draft").select("*").eq("incident", c.incident).single();
    if (b.rev !== cur!.rev) fail(409, "stale");
    if (cur!.card_back === "unknown" && cur!.cash_received === "unknown") fail(409, "nothing to send yet");
    await admin.from("desk").update({
      card_back: cur!.card_back, cash_received: cur!.cash_received, confirmed_rev: cur!.rev, caller_words: cur!.words,
    }).eq("id", c.incident);
    await admin.from("caller_card").update({ confirmed_rev: cur!.rev }).eq("id", c.incident);
    const fact = (k: "card_back" | "cash_received") => FACTS[k][cur![k] as Fact].ja;
    await event(c.incident, "caller", "confirmed", `お客様が内容を確認（${fact("card_back")}／${fact("cash_received")}）`);
    return {};
  },

  async choose(a, b) {
    const c = caller(a);
    const choice = str(b, "choice");
    if (choice !== "wait" && choice !== "leave") fail(400, "bad choice");
    await admin.from("caller_card").update({ choice }).eq("id", c.incident);
    await event(c.incident, "caller", "choice", choice === "wait" ? "お客様：現地で待つ" : "お客様：帰宅し銀行からの連絡を待つ");
    return {};
  },

  async teachback(a, b) {
    const c = caller(a);
    const text = str(b, "text").trim().slice(0, 500);
    if (looksLikeNumber(text)) return { withheld: true };
    await admin.from("caller_card").update({ teachback: text, teachback_result: null }).eq("id", c.incident);
    await event(c.incident, "caller", "teachback", "お客様が次の手順を自分の言葉で説明（原文はカードに表示）");
    return {};
  },

  async human(a) {
    const c = caller(a);
    await event(c.incident, "caller", "human", "お客様が担当者との会話を希望");
    return {};
  },

  // Field (security guard) commands
  async field(a, b) {
    const f = staff(a, "field");
    const id = str(b, "incident");
    const { data: job } = await admin.from("field_job").select("*").eq("incident", id).maybeSingle();
    if (!job || job.assignee !== f.uid) fail(403, "not your assignment");
    const state = str(b, "state");
    if (!["on_way", "arrived", "done"].includes(state)) fail(400, "bad state");
    const eta = state === "on_way" && typeof b.eta === "string" && /^\d{1,3}(-\d{1,3})?$/.test(b.eta) ? b.eta : null;
    await admin.from("field_job").update({ state, eta_text: eta, updated_at: new Date().toISOString() }).eq("incident", id);
    await admin.from("caller_card").update({ field_state: state, eta_text: eta }).eq("id", id);
    const ja = { on_way: `向かっています（目安 ${eta ? eta + "分" : "未定"}）`, arrived: "到着", done: "対応完了（カードの扱いは銀行所定の手続きへ）" }[state];
    await event(id, "field", "field", ja!, f.name);
    return {};
  },
};

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const name = typeof body.cmd === "string" ? body.cmd : "";
    const handler = commands[name] ?? fail(404, "unknown command");
    return reply(200, await handler(await actorFrom(req), body));
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.message });
    console.error("cmd failed", e instanceof Error ? e.message : e);
    return reply(500, { error: "server error" });
  }
}
