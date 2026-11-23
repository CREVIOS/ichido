// A local stub of the two model APIs Ichido calls, for tests and local demos without keys:
//   OpenAI Responses API   POST /v1/responses                              (json_schema output, function calls, remote MCP, streaming)
//   Gemini generateContent POST /v1beta/models/{model}:generateContent     (function calling, then a JSON answer)
// Run it beside the dev server (`node tests/ai-stub.mjs`) and start the server with
//   OPENAI_API_KEY=stub OPENAI_BASE_URL=http://localhost:3198/v1 GEMINI_API_KEY=stub GEMINI_BASE_URL=http://localhost:3198/v1beta
// The response shapes follow the official docs. Control: GET /__stub/log (recorded requests), POST /__stub/reset,
// POST /__stub/script { key, value } (the next answer for "triage", "summary", "gemini" or "assistant").
import { createServer } from "node:http";

export const STUB_PORT = Number(process.env.AI_STUB_PORT ?? 3198);
export const STUB = `http://localhost:${STUB_PORT}`;

let log = [];
let script = {};
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const message = (text) => ({ id: "msg_stub", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] });
const response = (output) => ({ id: "resp_stub", object: "response", status: "completed", model: "stub", output });

// Structured outputs: a valid answer for each schema Ichido sends, unless a test scripted one.
function structured(body) {
  const f = body.text?.format;
  if (!f || f.type !== "json_schema") return message("");   // free text (translation, training): no output
  const name = f.name;
  if (script[name] !== undefined) { const v = script[name]; delete script[name]; return message(typeof v === "string" ? v : JSON.stringify(v)); }
  if (name === "frontline_risk") return message(JSON.stringify({ level: "none" }));
  if (name === "patch") return message(JSON.stringify({ card_back: "unchanged", cash_received: "unchanged", clarify: false }));
  if (name === "triage") {
    // A plausible reading for demos: the pack's symptom/need situation, a who/since tap, and one red flag to ask about.
    const p = f.schema.properties;
    const has = (list, x) => list.includes(x);
    const situation = p.situation.enum.find((s) => /symptom|needs|way|letter/.test(s)) ?? p.situation.enum[0];
    const taps = ["who_child", "since_today", "party_family", "letter_tax", "way_platform"].filter((t) => has(p.taps.items.enum, t)).slice(0, 2);
    const ask = ["red_breath"].filter((t) => has(p.ask.items.enum, t));
    return message(JSON.stringify({ situation, taps, ask, clarify: false }));
  }
  if (name === "summary") return message(JSON.stringify({ summary: "お客様が状況を確認し、担当者が承認済みの返答を送信しました。お客様は次の行動を自分の言葉で説明しました。" }));
  return message("");
}

// Ask Ichido: one tool call, then an answer citing the first case id the tool returned.
function assistantTurn(body) {
  const tools = body.tools ?? [];
  const fn = tools.filter((t) => t.type === "function").map((t) => t.name);
  const outputs = (body.input ?? []).filter((i) => i.type === "function_call_output");
  const planned = script.assistant;   // { call?: name, args?: {}, text?: string }
  if (tools.some((t) => t.type === "mcp")) {
    const call = planned?.call ?? "list_open_cases";
    return [{ id: "mcp_stub", type: "mcp_call", server_label: tools[0].server_label, name: call, arguments: JSON.stringify(planned?.args ?? {}), output: "[]", error: null },
      message(planned?.text ?? "対応中の案件はありません（list_open_cases）。")];
  }
  if (!outputs.length) {
    const call = planned?.call ?? (fn.includes("list_open_cases") ? "list_open_cases" : fn[0]);
    return [{ id: "fc_stub", type: "function_call", status: "completed", call_id: "call_1", name: call, arguments: JSON.stringify(planned?.args ?? {}) }];
  }
  delete script.assistant;
  const id = outputs.map((o) => String(o.output).match(UUID)?.[0]).find(Boolean);
  return [message(planned?.text ?? (id ? `対応中の案件があります（list_open_cases）：${id.slice(0, 8)}` : "該当する記録はツールの結果にありません。"))];
}

// Streaming per the Responses API: created, text deltas, each output item done, completed.
function sse(res, output) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  send("response.created", { response: { ...response([]), status: "in_progress" } });
  output.forEach((item, output_index) => {
    send("response.output_item.added", { output_index, item: { ...item, status: "in_progress" } });
    if (item.type === "message") for (const delta of item.content[0].text.match(/.{1,12}/gsu) ?? []) send("response.output_text.delta", { output_index, content_index: 0, delta });
    send("response.output_item.done", { output_index, item });
  });
  send("response.completed", { response: response(output) });
  res.end();
}

// Gemini: first ask for the case tools, then answer with the scripted (or a default) recommendation. The script stays
// until reset, since the Ichido Bot's own suggestion may run at the same time.
function gemini(body) {
  const answered = body.contents.some((c) => c.parts?.some((p) => p.functionResponse));
  const parts = answered
    ? [{ text: JSON.stringify(script.gemini ?? { intent: "NONE", dispatch: false, reasons: [], risks: [] }) }]
    : ["get_case", "list_replies", "get_pack_rules"].filter((n) => body.tools?.[0]?.functionDeclarations?.some((d) => d.name === n)).map((name) => ({ functionCall: { name, args: {} } }));
  return { candidates: [{ content: { role: "model", parts }, finishReason: "STOP", index: 0 }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 }, modelVersion: "stub" };
}

export function startStub(port = STUB_PORT) {
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const json = (status, v) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { return json(400, { error: { message: "invalid JSON" } }); }   // stray clients on the port
    if (req.url === "/__stub/log") return json(200, log);
    if (req.url === "/__stub/reset") { log = []; script = {}; return json(200, {}); }
    if (req.url === "/__stub/script") { script[body.key] = body.value; return json(200, {}); }
    log.push({ path: req.url, auth: req.headers.authorization ?? req.headers["x-goog-api-key"] ?? null, body });
    if (req.method === "POST" && req.url === "/v1/responses") {
      const isAssistant = Array.isArray(body.tools) && body.tools.length > 0;
      if (isAssistant) return body.stream ? sse(res, assistantTurn(body)) : json(200, response(assistantTurn(body)));
      return json(200, response([structured(body)]));
    }
    if (req.method === "POST" && /^\/v1beta\/models\/[^/]+:generateContent$/.test(req.url)) return json(200, gemini(body));
    json(404, { error: { message: "not found" } });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) startStub().then(() => console.log(`AI stub on ${STUB}`));
