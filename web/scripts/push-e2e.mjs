// Real Web Push end to end, by hand (needs Google Chrome and the internet; not part of npm test):
//   APP=http://localhost:3143 node --env-file=.env.local scripts/push-e2e.mjs
// Signs in as operator@ichido.demo, turns notifications on at /account in Chrome (permission granted), presses the
// TABLE-A Help Point and waits until Chrome's service worker receives the new-case push through Chrome's own push
// service (FCM), with the server's VAPID signature.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { APP, closeOpen, device, newKey, signIn, staff } from "../tests/helpers.mjs";
import { ACCOUNT_PUSH } from "../content/alerts.ts";

const op = await staff("operator@ichido.demo");
const j = await signIn("operator@ichido.demo");
const cookies = j.header().split("; ").map((c) => c.split(/=(.*)/s)).map(([name, value]) => ({ name, value, url: APP }));
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "ichido-push-")), {
  channel: "chrome", headless: process.env.HEADED !== "1", permissions: ["notifications"], baseURL: APP,
});
try {
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("page:", m.text()); });
  await page.goto("/account");
  await page.getByRole("button", { name: ACCOUNT_PUSH.on }).click();
  // Chrome registers with its push service on the first subscription of a profile, which can take a while.
  const done = await Promise.race([
    page.getByRole("button", { name: ACCOUNT_PUSH.off }).waitFor({ timeout: 120_000 }).then(() => "on"),
    page.getByText(ACCOUNT_PUSH.failed).waitFor({ timeout: 120_000 }).then(() => "failed"),
  ]);
  if (done !== "on") throw new Error("subscribing failed in the browser");
  const endpoint = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint);
  console.log("subscribed at", new URL(endpoint).origin);
  await page.evaluate(() => {
    window.__pushes = [];
    navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.type === "ichido-push") window.__pushes.push(e.data); });
  });

  await closeOpen(op);
  if ((await device(newKey())).status !== 204) throw new Error("device press refused");
  const { data: open } = await op.c.from("desk").select("id").is("finished_at", null);
  const tag = `new_case:${open[0].id}`;
  const got = await page.waitForFunction((t) => window.__pushes.find((p) => p.tag === t), tag, { timeout: 60_000 });
  console.log("service worker received", JSON.stringify(await got.jsonValue()));
  await closeOpen(op);
} finally {
  await ctx.close();
}
