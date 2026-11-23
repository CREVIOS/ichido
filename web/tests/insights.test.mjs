import assert from "node:assert/strict";
import test from "node:test";
import {enableClosure,frontlineCase,shelterAnswer} from "./frontline-fixture.mjs";
import {cmd,ok,staff} from "./helpers.mjs";

test("open AI intake grows the denominator and only an acknowledged resolution grows the numerator",async t => {
  await enableClosure(t);
  const manager=await staff("manager@ichido.demo");
  const metrics=async ()=>(await manager.c.rpc("frontline_insights",{p_days:7}).throwOnError()).data;
  const before=await metrics();
  const f=await frontlineCase(t,"en","shelter");
  const b=await shelterAnswer(f);
  assert.equal((await metrics()).open,before.open+1);
  await ok(cmd(f.phone,"info_delivery",b));
  await ok(cmd(f.phone,"resolve_info",b));
  const after=await metrics();
  assert.equal(after.started,before.started+1);
  assert.equal(after.resolved,before.resolved+1);
  assert.equal(after.open,before.open);
  assert.equal(after.mature,before.mature);
});
