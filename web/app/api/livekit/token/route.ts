import { RoomAgentDispatch, RoomConfiguration, TrackSource } from "@livekit/protocol";
import { AccessToken } from "livekit-server-sdk";
import { actorFrom, admin, reply } from "@/lib/server";
import { boundedText, limitKey, limitSource } from "@/lib/request-security";
import { requestLog } from "@/lib/log";
import { roomFor } from "@/lib/speech";
import { LANG_LOCALE, VOICE_LANGS, type Lang } from "@/content/catalogue";

const MAX_TTL_S = 600;

// A caller bound to an open case gets a short token for that case's private room; the intake agent is dispatched into it.
// The token never outlives the binding; the room is deleted when the case closes or the caller is reset (lib/livekit.ts).
export async function POST(req: Request): Promise<Response> {
  const body = await boundedText(req, 0);
  if (body instanceof Response) return body;
  const log = requestLog("/api/livekit/token");
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    log.warn("voice_token", { status: 503, code: "voice_unavailable" });
    return reply(503, { error: "voice_unavailable" });
  }
  const sourceLimit = await limitSource(req.headers, "voice_requests", 60, 60);
  if (sourceLimit) return sourceLimit;
  const a = await actorFrom(req);
  const role = a.kind === "staff" ? a.role : a.kind;
  const refuse = (code: string, incident?: string) => {
    log.warn("voice_token", { role, incident, status: 403, code, duration_ms: log.ms() });
    return reply(403, { error: "forbidden" });
  };
  if (a.kind !== "caller" || !a.incident || !a.lang || !a.expires || !a.voiceRoom) return refuse(a.kind === "caller" ? "unpaired" : "not_caller");
  const { data: open } = await admin.from("desk").select("id,text_only,handler").eq("id", a.incident).is("finished_at", null).maybeSingle();
  if (!open) return refuse("case_closed", a.incident);
  if (open.text_only || open.handler !== "legacy") return refuse("text_only", a.incident);
  const limited = await limitKey("voice", a.uid, 10, 60);
  if (limited) return limited;
  // Nepali has no speech recognition: the caller types.
  if (!VOICE_LANGS.includes(a.lang as Lang)) {
    log.warn("voice_token", { role, incident: a.incident, status: 503, code: "voice_unavailable", duration_ms: log.ms() });
    return reply(503, { error: "voice_unavailable" });
  }
  const ttl = Math.min(MAX_TTL_S, Math.floor((Date.parse(a.expires) - Date.now()) / 1000));
  if (ttl <= 0) return refuse("binding_expired", a.incident);

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: `c-${a.uid}`, ttl });
  token.addGrant({
    roomJoin: true, room: roomFor(a.voiceRoom), canSubscribe: true, canPublish: true, canPublishData: true,
    canPublishSources: [TrackSource.MICROPHONE], canUpdateOwnMetadata: false,
  });
  token.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: process.env.AGENT_NAME ?? "ichido-intake", metadata: JSON.stringify({ locale: LANG_LOCALE[a.lang as Lang] }) })],
  });
  const jwt = await token.toJwt();
  log.info("voice_token", { role, incident: a.incident, status: 200, ttl_s: ttl, duration_ms: log.ms() });
  return reply(200, { url: LIVEKIT_URL, token: jwt });
}
