import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { chromium } from "playwright-core";
import { ANSWER, FACTS, FAULT_UI, REPLIES, CALLER_FLAGS, RATING, ACCESS, FRONTLINE, FRONT_DESK, JOURNEY, STATION, UI } from "../content/catalogue.ts";
import { CHAT } from "../content/chat.ts";
import { APP, cmd, ok } from "./helpers.mjs";
import { enableClosure, frontlineCase } from "./frontline-fixture.mjs";

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
  if (lang === "en") await page.getByRole("log").getByText(FRONTLINE.greeting.en,{exact:true}).waitFor();
  else await page.getByText(ACCESS.textOnly.ne,{exact:true}).waitFor();
  await page.getByRole("button",{name:CHAT.settings[lang],exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:FAULT_UI.largeText[lang],exact:true}).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:(lang === "en" ? FRONTLINE.start : FRONTLINE.write)[lang]}).click();
  const message = lang === "en" ? "I have a question about the machine." : "मलाई यहाँ सहयोग चाहिन्छ।";
  const input = page.getByLabel(UI.whatHappened[lang],{exact:true});
  await input.fill(message);
  await page.setViewportSize({width:390,height:480});
  // The page keeps the focused composer in view after the resize; give layout and that scroll up to 2 s to settle.
  let composer = null;
  for (const until = Date.now() + 2000; Date.now() < until;) {
    composer = await input.boundingBox();
    if (composer && composer.y + composer.height <= 480) break;
    await page.waitForTimeout(100);
  }
  assert.ok(composer && composer.y + composer.height <= 480,"the focused composer stays inside the shorter viewport");
  await page.setViewportSize({width:390,height:844});
  if (lang === "en") {
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByText(JOURNEY.offline.en,{exact:true}).waitFor();
    assert.equal(await input.inputValue(),message);
    await context.setOffline(false);
    await page.getByText(JOURNEY.offline.en,{exact:true}).waitFor({state:"hidden"});
  }
  const chips = page.locator(".chat-chips").getByRole("button");
  assert.ok(await chips.count() > 1);
  assert.equal(await chips.first().evaluate(el => el.closest(".chat-chips").scrollWidth > el.closest(".chat-chips").clientWidth),true);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const attempts = [];
  await page.route("**/api/cmd",async route => {
    const body = route.request().postDataJSON();
    if (body?.act === "text") {
      attempts.push(body.request_id);
      if (lang === "en" && attempts.length === 1) return route.abort("failed");
      await gate;
    }
    await route.continue();
  });
  const submitted = page.waitForResponse(r => r.url().endsWith("/api/cmd") && r.request().postDataJSON()?.act === "text");
  if (lang === "en") await input.press("Enter");
  else await page.getByRole("button",{name:UI.send[lang],exact:true}).click();
  if (lang === "en") {
    await page.getByRole("button",{name:CHAT.retry.en}).waitFor();
    assert.equal(await input.inputValue(),message);
    await page.getByRole("button",{name:CHAT.retry.en}).click();
  }
  try {
    await page.getByText(CHAT.sending[lang],{exact:true}).waitFor();
    if (lang === "en") await page.getByRole("status",{name:CHAT.typing[lang]}).waitFor();
    assert.equal(await page.getByText(CHAT.delivered[lang],{exact:true}).count(),0);
  } finally { release(); }
  assert.equal((await submitted).status(),200);
  if (lang === "en") assert.deepEqual(attempts,[attempts[0],attempts[0]]);
  await page.locator('[data-from="caller"]').getByText(message,{exact:true}).waitFor();
  await page.getByText(CHAT.delivered[lang],{exact:true}).waitFor();
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
  await page.getByRole("button",{name:FACTS.card_back.question[lang],exact:true}).click();
  await page.getByRole("button",{name:FACTS.card_back.question[lang] + " — " + ANSWER.no[lang],exact:true}).click();
  await page.getByRole("button",{name:UI.confirm[lang],exact:true}).click();
  await page.getByRole("log").getByText(UI.confirm[lang],{exact:true}).waitFor();
  await ok(cmd(op,"send",{incident,intent:"OFFICIAL_CHANNEL"}));
  const approved = page.locator('[data-from="operator"]');
  await approved.getByText(CHAT.operator[lang],{exact:true}).waitFor();
  assert.ok((await approved.innerText()).includes(REPLIES.OFFICIAL_CHANNEL.text({})[lang]));
  assert.deepEqual(documents,[`/s/${station}`,"/caller"]);
});

test("shelter caller confirms the displayed answer, rates the receipt and asks for more help",async t => {
  await enableClosure(t);
  const f = await frontlineCase(t,"en","shelter",{pair:false});
  const {data:display} = await f.admin.rpc("device_display",{p_station:f.station}).throwOnError();
  const browser = await chromium.launch({channel:"chrome",headless:true});
  t.after(() => browser.close());
  const page = await browser.newPage({locale:"en"});
  await page.goto(APP+"/s/"+f.station);
  await page.getByRole("combobox").selectOption("en");
  await page.getByLabel(STATION.code.en,{exact:true}).fill(display.code);
  await page.getByRole("button",{name:STATION.go.en,exact:true}).click();
  await page.getByRole("button",{name:FRONTLINE.start.en}).click();
  await page.getByRole("button",{name:new RegExp(CALLER_FLAGS.need_news.label.en)}).click();
  await page.getByRole("button",{name:UI.confirm.en,exact:true}).click();
  await page.getByRole("button",{name:FRONTLINE.answered.en,exact:true}).click();
  await page.getByRole("button",{name:RATING[3].en,exact:true}).click();
  await page.getByText(UI.rateThanks.en).waitFor();
  await page.reload();
  await page.getByRole("button",{name:FRONTLINE.stillHelp.en}).click();
  await page.getByText(FRONTLINE.queued.en,{exact:false}).waitFor();
  assert.equal((await f.desk()).resolved_by,"ai");
});
