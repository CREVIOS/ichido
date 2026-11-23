// Local stand-in for Vercel Cron: call /api/cron/disaster once a minute (npm run feeds). APP defaults to the dev server.
const app = process.env.APP ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("set CRON_SECRET in web/.env.local");

async function poll() {
  try {
    const res = await fetch(`${app}/api/cron/disaster`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(60_000) });
    console.log(new Date().toISOString(), res.status, await res.text());
  } catch (e) {
    console.error(new Date().toISOString(), "poll failed:", e instanceof Error ? e.message : e);
  }
}
await poll();
if (!process.argv.includes("--once")) setInterval(poll, 60_000);
