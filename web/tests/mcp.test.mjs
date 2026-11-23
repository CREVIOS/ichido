// The MCP server: staff-only, read-only, and row-level security still applies.
import test from "node:test";
import assert from "node:assert/strict";
import { APP, staff, caller, cmd, ok, openPairedCase, closeOpen } from "./helpers.mjs";

async function rpc(who, method, params = {}) {
  const res = await fetch(`${APP}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(who ? { authorization: `Bearer ${who.token}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  return { status: res.status, body: line ? JSON.parse(line.slice(6)) : null };
}
const call = async (who, name, args = {}) => {
  const r = await rpc(who, "tools/call", { name, arguments: args });
  assert.equal(r.status, 200);
  return r.body.result;
};

test("only operators and managers reach the MCP tools, and the tools only read", async () => {
  const op = await staff("operator@ichido.demo");
  const g = await staff("guard1@ichido.demo");
  const a = await caller();
  assert.equal((await rpc(null, "tools/list")).status, 401);
  assert.equal((await rpc(g, "tools/list")).status, 401, "guards are not MCP clients");
  assert.equal((await rpc(a, "tools/list")).status, 401, "callers are not MCP clients");

  const tools = (await rpc(op, "tools/list")).body.result.tools;
  assert.deepEqual(tools.map((t) => t.name).sort(), ["field_jobs_open", "get_case", "insights", "list_open_cases", "nearest_shelters", "search_cases", "station_detail", "station_health", "suggest_next_step"]);
  assert.ok(tools.every((t) => t.annotations?.readOnlyHint), "every tool is read-only");

  await closeOpen(op);
  const incident = await openPairedCase(op, a);
  await ok(cmd(a, "draft", { base_rev: 0, card_back: "no", cash_received: "yes" }));
  const open = JSON.parse((await call(op, "list_open_cases")).content[0].text);
  assert.equal(open[0].id, incident);
  const detail = JSON.parse((await call(op, "get_case", { incident })).content[0].text);
  assert.equal(detail.case.confirmed_rev, null, "unconfirmed drafts stay invisible");
  assert.ok(!JSON.stringify(detail).includes("draft"), "no draft data");
  assert.ok(JSON.parse((await call(op, "insights", { days: 7 })).content[0].text).funnel);
  // Designated evacuation sites near a station, for the hazard, nearest first (the demo seed has some near TABLE-A).
  const sites = JSON.parse((await call(op, "nearest_shelters", { hazard: "tsunami", station: "TABLE-A", limit: 3 })).content[0].text);
  assert.ok(sites.length > 0 && sites.every((s, i) => s.hazards.includes("tsunami") && (i === 0 || s.distance_m >= sites[i - 1].distance_m)));
  await ok(cmd(op, "abandon", { incident }));
});
