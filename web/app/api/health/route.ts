import { connection } from "next/server";
import { reply } from "@/lib/server";
import { limitSource } from "@/lib/request-security";
import { requestLog, VERSION } from "@/lib/log";

// For a Better Stack uptime monitor: 200 when the database answers, 503 otherwise. Only failures are logged.
export async function GET(req: Request): Promise<Response> {
  await connection();
  const limited = await limitSource(req.headers, "health", 120, 60);
  if (limited?.status === 503) {
    requestLog("/api/health").error("health", { status: 503, db: "error" });
    return reply(503, { ok: false, db: "error", version: VERSION });
  }
  if (limited) return limited;
  return reply(200, { ok: true, db: "ok", version: VERSION });
}
