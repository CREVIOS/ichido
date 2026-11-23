import "server-only";
import { createHash, randomInt } from "node:crypto";
import { messagingApi } from "@line/bot-sdk";
import { LANGS, LINE_MESSAGES, LINE_STOP_WORDS, bankStatusText, replyOf, type L10n, type Lang } from "@/content/catalogue";
import { admin, priv } from "@/lib/server";

// LINE follow-up for callers (opt-in). The caller asks for a one-time code on their case screen, adds the bank's
// LINE account and sends the code; the webhook (app/api/line/webhook) links that LINE user to that case only, for at
// most 7 days. From then on the bank's approved replies and statuses for the case are pushed in the caller's language,
// plus a "case closed" message; "stop" (or blocking the account) deletes the link. Nothing else is ever sent.
// Off unless LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN and LINE_OA_URL are set.

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // no 0/O, 1/I/L
const CODE_LEN = 8;
const CODE_TTL_MS = 15 * 60_000;
const LINK_TTL_MS = 7 * 24 * 3600_000;

export const lineEnabled = () => Boolean(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_OA_URL);
const digest = (code: string) => createHash("sha256").update(code).digest("hex");
export const normalizeCode = (text: string) => text.normalize("NFKC").toUpperCase().replace(/[\s-]/g, "");

let api: messagingApi.MessagingApiClient | null = null;
const client = () => (api ??= new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  ...(process.env.LINE_API_BASE ? { baseURL: process.env.LINE_API_BASE } : {}),
}));
const text = (t: string) => [{ type: "text" as const, text: t.slice(0, 5000) }];
// Before we know the caller's language: every language, one per line.
const all = (m: L10n) => LANGS.map((l) => m[l]).join("\n");

// The caller's opt-in state for their case, and a fresh code when asked. A linked case keeps its link.
export async function lineStatus(incident: string) {
  if (!lineEnabled()) return { enabled: false, linked: false };
  const { data } = await priv().from("line_link").select("line_user").eq("incident", incident).gt("expires", new Date().toISOString()).maybeSingle();
  return { enabled: true, linked: Boolean(data?.line_user) };
}

export async function issueCode(incident: string): Promise<{ code: string | null; url: string; linked: boolean }> {
  const url = process.env.LINE_OA_URL!;
  const { data: cur } = await priv().from("line_link").select("line_user, expires").eq("incident", incident).maybeSingle();
  if (cur?.line_user && Date.parse(cur.expires) > Date.now()) return { code: null, url, linked: true };
  const code = Array.from({ length: CODE_LEN }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  const now = Date.now();
  const { error } = await priv().from("line_link").upsert({
    incident, code_digest: digest(code), code_expires: new Date(now + CODE_TTL_MS).toISOString(),
    line_user: null, linked_at: null, expires: new Date(now + LINK_TTL_MS).toISOString(),
  });
  if (error) throw error;
  return { code, url, linked: false };
}

async function langOf(incident: string): Promise<Lang> {
  const { data } = await admin.from("desk").select("lang").eq("id", incident).maybeSingle();
  return (LANGS as readonly string[]).includes(data?.lang) ? (data!.lang as Lang) : "en";
}

// One webhook event. Replies (free) rather than pushes wherever LINE gave us a reply token.
export type LineEvent = { type: string; replyToken?: string; source?: { type?: string; userId?: string }; message?: { type?: string; text?: string } };
export async function handleEvent(e: LineEvent, allowCode: (user: string) => Promise<boolean>): Promise<void> {
  const user = e.source?.type === "user" ? e.source.userId : undefined;
  if (!user || !/^U[0-9a-f]{32}$/.test(user)) return;
  if (e.type === "unfollow") return void (await priv().from("line_link").delete().eq("line_user", user));
  const reply = (t: string) => (e.replyToken ? client().replyMessage({ replyToken: e.replyToken, messages: text(t) }) : null);
  if (e.type === "follow") return void (await reply(all(LINE_MESSAGES.hello)));
  if (e.type !== "message" || e.message?.type !== "text" || typeof e.message.text !== "string") return;
  const said = e.message.text.trim().slice(0, 64);

  if (LINE_STOP_WORDS.includes(said.toLowerCase())) {
    const { data: gone } = await priv().from("line_link").delete().eq("line_user", user).select("incident");
    const lang = gone?.[0] ? await langOf(gone[0].incident) : null;
    return void (await reply(lang ? LINE_MESSAGES.stopped[lang] : all(LINE_MESSAGES.stopped)));
  }
  const code = normalizeCode(said);
  if (code.length !== CODE_LEN || ![...code].every((c) => CODE_ALPHABET.includes(c)) || !(await allowCode(user))) {
    return void (await reply(all(LINE_MESSAGES.badCode)));
  }
  const now = new Date().toISOString();
  const { data: linked } = await priv().from("line_link")
    .update({ line_user: user, linked_at: now, code_digest: null, code_expires: null })
    .eq("code_digest", digest(code)).gt("code_expires", now).is("line_user", null).select("incident").maybeSingle();
  if (!linked) return void (await reply(all(LINE_MESSAGES.badCode)));
  await reply(LINE_MESSAGES.linked[await langOf(linked.incident)]);
}

// An outbox row for a linked case (lib/alerts.ts): the approved reply, the bank's status, or "case closed".
export async function deliverLine(o: { kind: string; incident: string | null; data: Record<string, unknown> }): Promise<void> {
  if (!lineEnabled() || !o.incident) return;
  const { data: link } = await priv().from("line_link").select("line_user").eq("incident", o.incident).gt("expires", new Date().toISOString()).maybeSingle();
  if (!link?.line_user) return;
  const lang = await langOf(o.incident);
  let t = "";
  if (o.kind === "line_reply") {
    const { data: r } = await admin.from("reply").select("intent, slots").eq("id", String(o.data.reply ?? "")).eq("incident", o.incident).maybeSingle();
    const approved = replyOf(r?.intent);
    if (approved) t = approved.text(r!.slots ?? {})[lang];
  } else if (o.kind === "line_bank") {
    t = bankStatusText(String(o.data.status ?? ""), (o.data.due as string | null) ?? null, lang);
  } else if (o.kind === "line_closed") {
    t = LINE_MESSAGES.closed[lang];
  }
  if (t) await client().pushMessage({ to: link.line_user, messages: text(t) });
}
