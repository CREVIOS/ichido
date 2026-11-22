import { actorFrom, reply, sameSite } from "@/lib/server";
import { limitKey } from "@/lib/request-security";
import { mintStaffToken } from "@/lib/staff-jwt";
import { requestLog } from "@/lib/log";

// A five-minute Supabase token for the signed-in staff member's Better Auth session (web/lib/staff-jwt.ts).
// The browser keeps it in memory and asks again before it expires; the session itself stays in an httpOnly cookie
// (the mobile app sends it from the OS keychain). Only a session that passed a second factor gets one.
export async function POST(req: Request): Promise<Response> {
  const log = requestLog("/api/auth/supabase-token");
  if (!sameSite(req)) return reply(403, { error: "forbidden" });
  // The session cookie only: a bearer token cannot mint another.
  const a = await actorFrom(new Request(req.url, { headers: { cookie: req.headers.get("cookie") ?? "" } }));
  if (a.kind !== "staff") return reply(401, { error: "unauthorised" });
  if (a.aal !== "aal2") return reply(403, { error: "mfa_required" });
  const limited = await limitKey("staff_token", a.session, 60, 60);
  if (limited) return limited;
  log.info("staff_token", { status: 200, role: a.role, uid: a.uid });
  return reply(200, mintStaffToken(a));
}
