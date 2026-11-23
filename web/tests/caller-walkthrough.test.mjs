import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { chromium } from "playwright-core";
import { ACCESS, FRONTLINE, FRONT_DESK, JOURNEY, STATION, UI } from "../content/catalogue.ts";
import { APP } from "./helpers.mjs";
import { frontlineCase } from "./frontline-fixture.mjs";

test("pairing opens with the code as its first textbox and an unpaired phone has a staff fallback", async t => {
  const browser = await chromium.launch({channel:"chrome",headless:true});
  t.after(() => browser.close());
  const page = await browser.newPage({locale:"en",viewport:{width:390,height:844}});
  await page.goto(`${APP}/s/TABLE-A`);
  const code = page.getByRole("textbox").first();
  assert.equal(await code.getAttribute("id"),"code");
  await code.focus();
  assert.equal(await page.getByRole("listbox").count(),0);
  await page.getByRole("combobox").selectOption("ne");
  await page.getByLabel(STATION.code.ne,{exact:true}).fill("A1B2C3");
  assert.equal(await page.getByRole("button",{name:STATION.go.ne}).isEnabled(),true);
  await page.goto(`${APP}/caller`);
  await page.getByRole("heading",{name:UI.notConnected.en}).waitFor();
  await page.getByRole("button",{name:UI.human.en}).click();
  await page.getByText(FRONTLINE.inPerson.en,{exact:true}).waitFor();
});

for (const lang of ["en","ne"]) test(`display-paired ${lang} caller sends words and sees the operator join`,async t => {
  // Check the local fixture schema before creating users, cases or sessions.
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));
  const db = new pg.Client({connectionString:url.href});
  await db.connect();
  try {
    const {rows} = await db.query("select to_regprocedure('public.caller_screen(uuid)') is not null as ready");
    assert.ok(rows[0].ready,"The local test database needs 20261124090000_caller_journeys.sql");
  } finally { await db.end(); }
  const {station,incident,op,admin} = await frontlineCase(t,lang,"atm",{pair:false});
  const {data:display} = await admin.rpc("device_display",{p_station:station}).throwOnError();
  assert.match(display.code,/^[A-Z0-9]{6}$/);
  const browser = await chromium.launch({channel:"chrome",headless:true});
  t.after(() => browser.close());
  const context = await browser.newContext({locale:lang,viewport:{width:390,height:844}});
  const page = await context.newPage();
  const documents = [];
  page.on("request",r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents.push(new URL(r.url()).pathname); });
  await page.goto(`${APP}/s/${station}`);
  const textbox = page.getByRole("textbox").first();
  assert.equal(await textbox.getAttribute("id"),"code");
  await page.getByRole("combobox").focus();
  assert.equal(await page.getByRole("listbox").count(),0);
  await page.getByRole("combobox").selectOption(lang);
  if (lang === "ne") {
    await page.getByRole("button",{name:ACCESS.cantHear.ne,exact:true}).click();
    await page.getByText(ACCESS.alertSent.ne,{exact:true}).waitFor();
  }
  await textbox.fill(display.code);
  await page.getByRole("button",{name:STATION.go[lang],exact:true}).click();
  await page.waitForURL("**/caller");
  if (lang === "en") await page.getByRole("heading",{name:FRONTLINE.greeting.en}).waitFor();
  else await page.getByText(ACCESS.textOnly.ne,{exact:true}).waitFor();
  await page.getByRole("button",{name:(lang === "en" ? FRONTLINE.start : FRONTLINE.write)[lang]}).click();
  const message = lang === "en" ? "I have a question about the machine." : "मलाई यहाँ सहयोग चाहिन्छ।";
  const input = page.getByLabel(UI.whatHappened[lang],{exact:true});
  await input.fill(message);
  if (lang === "en") {
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByText(JOURNEY.offline.en,{exact:true}).waitFor();
    assert.equal(await input.inputValue(),message);
    await context.setOffline(false);
    await page.getByText(JOURNEY.offline.en,{exact:true}).waitFor({state:"hidden"});
  }
  const submitted = page.waitForResponse(r => r.url().endsWith("/api/cmd") && r.request().postDataJSON()?.act === "text");
  await page.getByRole("button",{name:UI.send[lang],exact:true}).click();
  assert.equal((await submitted).status(),200);
  await page.getByText(message,{exact:true}).waitFor();
  assert.equal(await input.inputValue(),"");
  if (lang === "en") await page.getByRole("button",{name:UI.human.en,exact:true}).click();
  await page.getByText(FRONTLINE.queued[lang],{exact:false}).waitFor();
  assert.equal(await page.getByRole("button",{name:UI.human[lang],exact:true}).count(),0);
  const desk = await browser.newContext();
  await desk.addCookies(op.jar.header().split("; ").map(pair => {
    const i = pair.indexOf("=");
    return {name:pair.slice(0,i),value:pair.slice(i+1),url:APP};
  }));
  const operator = await desk.newPage();
  await operator.goto(`${APP}/operator#${incident}`);
  await operator.getByText(FRONT_DESK.consent,{exact:false}).waitFor();
  await operator.getByRole("button",{name:FRONT_DESK.takeover,exact:true}).click();
  await page.getByText(FRONTLINE.connected[lang],{exact:true}).waitFor({timeout:40000});
  assert.deepEqual(documents,[`/s/${station}`,"/caller"]);
});
