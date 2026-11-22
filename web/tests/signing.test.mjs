import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { callerTranscript } from "../content/speech.ts";

test("speech signs its room, caller, issuance, fresh nonce and verbatim text", () => {
  const voiceRoom = "8f510844-9a47-4bb1-9ed2-b89330db62ab";
  const text = "カード\nOK";
  const script = `import { signSpeech } from "./lib/speech.ts";
    console.log(JSON.stringify([signSpeech(${JSON.stringify(voiceRoom)}, "2", ${JSON.stringify(text)}), signSpeech(${JSON.stringify(voiceRoom)}, "2", ${JSON.stringify(text)})]));`;
  const start = Math.floor(Date.now() / 1000);
  const envelopes = JSON.parse(execFileSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: new URL("../", import.meta.url), env: { ...process.env, AGENT_BRIDGE_SECRET: "unit-test" }, encoding: "utf8",
  }));
  assert.notEqual(envelopes[0].nonce, envelopes[1].nonce);
  for (const m of envelopes) {
    assert.equal(m.text, text);
    assert.match(m.nonce, /^[0-9a-f]{32}$/);
    assert.ok(Number.isInteger(m.issued) && m.issued >= start && m.issued <= Math.floor(Date.now() / 1000));
    const message = `ichido-say/2\ncase-${voiceRoom}\nc-2\n${m.issued}\n${m.nonce}\n${text}`;
    assert.equal(m.sig, createHmac("sha256", "unit-test").update(message).digest("base64url"));
  }
});

test("voice clients accept only bounded transcripts for their caller", async () => {
  async function* stream(...chunks) { yield* chunks; }
  assert.equal(await callerTranscript(stream("確認", "する"), true), "確認する");
  assert.equal(await callerTranscript(stream("other"), false), null);
  assert.equal(await callerTranscript(stream("a".repeat(499), "ab"), true), null);
  assert.equal((await callerTranscript(stream("a".repeat(500)), true)).length, 500);
});
