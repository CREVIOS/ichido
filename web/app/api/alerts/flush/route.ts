import { createHash, timingSafeEqual } from "node:crypto";
import { expireMonitors } from "@/lib/livekit";
import { flushAlerts } from "@/lib/alerts";
import { reply } from "@/lib/server";

// Delivers alerts the database wrote on its own (the escalation cron's SLA breaches) when no command, device call or
// bot step has done it yet. Called by a scheduler with Authorization: Bearer $CRON_SECRET (Vercel Cron sends exactly
// that); 404 without the secret.
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const hash = (v: string) => createHash("sha256").update(v).digest();
  if (!secret || !timingSafeEqual(hash(req.headers.get("authorization") ?? ""), hash(`Bearer ${secret}`))) return reply(404, { error: "not_found" });
  await Promise.all([flushAlerts(),expireMonitors()]);
  return new Response(null, { status: 204 });
}
