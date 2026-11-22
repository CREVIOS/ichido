import { connection } from "next/server";
import { admin, reply } from "@/lib/server";
import { requestLog, errorFields, VERSION } from "@/lib/log";

// For a Better Stack uptime monitor: 200 when the database answers, 503 otherwise. Only failures are logged.
export async function GET(req: Request): Promise<Response> {
  await connection();
  const { error } = await admin.from("station").select("id").limit(1);
  if (error) {
    requestLog("/api/health", req).error("health", { status: 503, db: "error", ...errorFields(error) });
    return reply(503, { ok: false, db: "error", version: VERSION });
  }
  return reply(200, { ok: true, db: "ok", version: VERSION });
}
