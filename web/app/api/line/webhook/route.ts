import { validateSignature } from "@line/bot-sdk";
import { reply } from "@/lib/server";
import { boundedText, limitKey } from "@/lib/request-security";
import { requestLog, errorFields } from "@/lib/log";
import { handleEvent, lineEnabled, type LineEvent } from "@/lib/line";

// LINE Messaging API webhook: the raw body is checked against X-Line-Signature (HMAC-SHA256 with the channel secret)
// before anything is parsed. Up to 64 KiB. LINE retries on non-2xx, so a failing event is logged and skipped.
export async function POST(req: Request): Promise<Response> {
  const log = requestLog("/api/line/webhook");
  if (!lineEnabled()) return reply(404, { error: "not_found" });
  const body = await boundedText(req, 65536);
  if (body instanceof Response) return body;
  const signature = req.headers.get("x-line-signature") ?? "";
  if (!signature || !validateSignature(body, process.env.LINE_CHANNEL_SECRET!, signature)) {
    log.warn("line_webhook", { status: 401, code: "bad_signature" });
    return reply(401, { error: "unauthorised" });
  }
  let events: LineEvent[];
  try {
    const parsed = JSON.parse(body) as { events?: unknown };
    events = Array.isArray(parsed.events) ? (parsed.events as LineEvent[]).slice(0, 20) : [];
  } catch (e) {
    log.warn("line_webhook", { status: 400, code: "bad_request", ...errorFields(e) });
    return reply(400, { error: "bad_request" });
  }
  // Ten code attempts per LINE user per ten minutes: codes are 8 characters from 31, valid 15 minutes, used once.
  const allowCode = async (user: string) => !(await limitKey("line_code", user, 10, 600));
  for (const e of events) {
    await handleEvent(e, allowCode).catch((err: unknown) => log.warn("line_event", { code: "failed", ...errorFields(err) }));
  }
  log.info("line_webhook", { status: 200 });
  return reply(200, {});
}
