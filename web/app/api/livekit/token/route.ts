import { RoomAgentDispatch, RoomConfiguration, TrackSource } from "@livekit/protocol";
import { AccessToken } from "livekit-server-sdk";
import { actorFrom, reply } from "@/lib/server";

const LOCALE = { bn: "bn-BD", en: "en-US", ja: "ja-JP" } as const;

// A caller bound to a case gets a short token for that case's private room; the intake agent is dispatched into it.
export async function POST(req: Request): Promise<Response> {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return reply(503, { error: "voice not configured" });
  const a = await actorFrom(req);
  if (a.kind !== "caller" || !a.incident || !a.lang) return reply(403, { error: "unavailable" });

  const identity = `c-${a.uid}`;
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, ttl: 600 });
  token.addGrant({
    roomJoin: true, room: `case-${a.incident}`, canSubscribe: true, canPublish: true, canPublishData: true,
    canPublishSources: [TrackSource.MICROPHONE], canUpdateOwnMetadata: false,
  });
  token.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: "ichido-intake", metadata: JSON.stringify({ locale: LOCALE[a.lang] }) })],
  });
  return reply(200, { url: LIVEKIT_URL, token: await token.toJwt() });
}
