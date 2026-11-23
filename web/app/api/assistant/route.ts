import { actorFrom, reply } from "@/lib/server";
import { can } from "@/lib/rbac";
import { ask, type Event, type Turn } from "@/lib/assistant";
import { boundedJson, limitKey } from "@/lib/request-security";
import { errorFields, requestLog } from "@/lib/log";

// Ask Ichido (lib/assistant.ts). Staff with assistant:use and a second factor, with their minted token as the bearer:
// the same token then reads every tool, so the answer holds only what this person may read. Streams NDJSON events.
const MAX_QUESTION = 500;

async function staffOnly(req: Request) {
  const a = await actorFrom(req);
  const token = /^Bearer (\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  return a.kind === "staff" && a.aal === "aal2" && can(a.role, "assistant:use") && token ? { ...a, token } : null;
}

// Whether the panel is offered: hidden without a model key.
export async function GET(req: Request) {
  if (!(await staffOnly(req))) return reply(403, { error: "forbidden" });
  return reply(200, { enabled: Boolean(process.env.OPENAI_API_KEY) });
}

export async function POST(req: Request) {
  const log = requestLog("/api/assistant");
  const body = await boundedJson(req, 16384);
  if (body instanceof Response) return body;
  const me = await staffOnly(req);
  if (!me) return reply(403, { error: "forbidden" });
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION) return reply(400, { error: "bad_request" });
  const history: Turn[] = (Array.isArray(body.history) ? body.history : []).slice(-6)
    .filter((h): h is Turn => (h?.role === "user" || h?.role === "assistant") && typeof h.text === "string")
    .map((h) => ({ role: h.role, text: h.text.slice(0, 2000) }));
  const limited = await limitKey("assistant", me.uid, 20, 60);
  if (limited) return limited;
  if (!process.env.OPENAI_API_KEY) return reply(503, { error: "not_configured" });

  const origin = new URL(req.url).origin;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: Event) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      let tools = 0;
      try {
        await ask({ origin, token: me.token, role: me.role, question, history, emit: (e) => { if (e.t === "tool") tools++; emit(e); } });
        log.info("assistant", { role: me.role, status: 200, code: `tools_${tools}`, duration_ms: log.ms() });
      } catch (e) {
        // Never the question, the answer or the token: codes and timings only.
        log.error("assistant", { role: me.role, status: 500, code: "failed", duration_ms: log.ms(), ...errorFields(e) });
        emit({ t: "error", code: "server" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
