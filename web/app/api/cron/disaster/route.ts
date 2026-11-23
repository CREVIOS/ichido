import { bearerIs, reply } from "@/lib/server";
import { requestLog, errorFields } from "@/lib/log";
import { pollFeeds } from "@/lib/disaster-feeds";

// Vercel Cron (web/vercel.json, every minute) sends "Authorization: Bearer $CRON_SECRET". Locally: npm run feeds.
// Without CRON_SECRET nothing runs: the route refuses every request.
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const log = requestLog("/api/cron/disaster");
  if (!bearerIs(req, process.env.CRON_SECRET)) {
    log.warn("cron", { status: 401, code: "unauthorised" });
    return reply(401, { error: "unauthorised" });
  }
  try {
    const out = await pollFeeds(log.info);
    log.info("cron", { status: 200, duration_ms: log.ms(), count: out.alerts, ...(out.failed && { code: "partial" }) });
    return reply(200, out);
  } catch (e) {
    log.error("cron", { status: 500, code: "server", duration_ms: log.ms(), ...errorFields(e) });
    return reply(500, { error: "server" });
  }
}
