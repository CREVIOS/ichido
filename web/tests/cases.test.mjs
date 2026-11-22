import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { allCases, firstReplySeconds, historyCsv, periodStart, readHistory, replySegments } from "../app/cases/history.ts";

test("period filters start at midnight in Japan and include today", () => {
  const now = new Date("2026-11-21T15:00:00Z");
  assert.equal(periodStart("today", now), now.toISOString());
  assert.equal(periodStart("week", now), "2026-11-15T15:00:00.000Z");
  assert.equal(periodStart("month", now), "2026-10-23T15:00:00.000Z");
  assert.equal(periodStart("all", now), null);
});

test("reply bars distinguish unanswered, immediate and slower first replies", () => {
  const row = { created_at: "2026-11-21T15:00:00Z", reply: [] };
  assert.equal(firstReplySeconds(row), null);
  row.reply.push({ sent_at: "2026-11-21T15:01:25Z" });
  assert.equal(firstReplySeconds(row), 85);
  assert.deepEqual([null, 0, 60, 120, 180, 240, 300, 999].map(replySegments), [0, 6, 5, 4, 3, 2, 1, 1]);
});

test("CSV includes only export fields and quotes spreadsheet-sensitive station names", () => {
  const row = {
    id: "incident", station: "station", atm: { label: { ja: '=ATM,"東"' } }, fault: "fault",
    status: "received", lang: null, created_at: "2026-11-21T15:00:00Z", finished_at: null,
    reply: [], abandoned: false, caller_words: "private", case_event: [{ actor_name: "private" }],
  };
  const [header, line] = historyCsv([row]).trim().split("\r\n");
  assert.equal(header, "id,station,station_label,fault,status,lang,created_at,first_reply_seconds,finished_at,abandoned");
  assert.equal(line, `"incident","station","'=ATM,""東""","fault","received","","2026-11-21T15:00:00Z","","","false"`);
});

test("history export continues past full batches using both timestamp and ID", async () => {
  const created_at = "2026-11-21T15:00:00+00:00";
  const batch = Array.from({ length: 500 }, (_, i) => ({ created_at, id: String(501 - i).padStart(3, "0") }));
  let requests = 0;
  const db = createClient("http://localhost", "test", { global: { fetch: async (url) => {
    const params = new URL(url).searchParams;
    assert.equal(params.get("reply.order"), "sent_at.asc");
    assert.equal(params.get("reply.limit"), "1");
    assert.equal(params.get("case_event.kind"), "eq.claimed");
    assert.equal(params.get("order"), "created_at.desc,id.desc");
    if (++requests === 1) return Response.json(batch);
    assert.equal(params.get("or"), `(created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.002))`);
    return Response.json([{ created_at, id: "001" }]);
  } } });
  const rows = await readHistory(db, allCases, Infinity);
  assert.equal(requests, 2);
  assert.equal(new Set(rows.map((r) => r.id)).size, 501);
});
