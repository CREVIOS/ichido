import "server-only";
import { RoomAgentDispatch, RoomConfiguration, TrackSource } from "@livekit/protocol";
import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";
import { HttpError, rpc } from "@/lib/server";
import { roomFor } from "@/lib/speech";
import { LANG_LOCALE, type Lang } from "@/content/catalogue";

export const MAX_TTL_S = 600;

export type VoiceCaller = { uid: string; incident: string; lang: Lang; expires: string; voiceRoom: string };
export type VoiceGrant = { url: string; token: string; session?: string; ttl: number; needsAgent: boolean };

// The caller's join grant for the case's private room, shared by the phone (/api/livekit/token) and the Help Point
// (/api/device/voice), which both hold an anonymous caller binding. A front-line case starts a voice lease
// (voice_begin) and dispatches the intake agent with its scope when the AI handles the case; a legacy case attaches
// the agent through the token. Null when the binding has expired. Throws HttpError(…, "voice_unavailable").
export async function callerVoiceGrant(c: VoiceCaller, handler: string): Promise<VoiceGrant | null> {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) throw new HttpError(503, "voice_unavailable");
  const ttl = Math.min(MAX_TTL_S, Math.floor((Date.parse(c.expires) - Date.now()) / 1000));
  if (ttl <= 0) return null;

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: `c-${c.uid}`, ttl });
  token.addGrant({
    roomJoin: true, room: roomFor(c.voiceRoom), canSubscribe: true, canPublish: true, canPublishData: handler === "legacy",
    canPublishSources: [TrackSource.MICROPHONE], canUpdateOwnMetadata: false,
  });
  let session: string | undefined;
  let needsAgent = handler === "legacy";
  if (handler !== "legacy") {
    try {
      const lease = await rpc<{session:string;epoch:number;handler:string}>("voice_begin",{p_uid:c.uid,p_generation:c.voiceRoom,p_lang:c.lang});
      session = lease.session;
      needsAgent = lease.handler === "ai";
      if (needsAgent) {
        if (!process.env.AGENT_BRIDGE_SECRET) throw new Error("missing_bridge");
        const scope = {uid:c.uid,incident:c.incident,generation:c.voiceRoom,lang:c.lang,session,epoch:lease.epoch};
        const dispatch = new AgentDispatchClient(LIVEKIT_URL.replace(/^ws/,"http"),LIVEKIT_API_KEY,LIVEKIT_API_SECRET);
        await dispatch.createDispatch(roomFor(c.voiceRoom),process.env.AGENT_NAME ?? "ichido-intake",{
          metadata:JSON.stringify({locale:LANG_LOCALE[c.lang],scope}),
        });
      }
    } catch (error) {
      if (session) await rpc("voice_end",{p_uid:c.uid,p_generation:c.voiceRoom,p_session:session});
      throw new HttpError(error instanceof HttpError ? error.status : 503, "voice_unavailable");
    }
  } else token.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: process.env.AGENT_NAME ?? "ichido-intake", metadata: JSON.stringify({ locale: LANG_LOCALE[c.lang] }) })],
  });
  return { url: LIVEKIT_URL, token: await token.toJwt(), session, ttl, needsAgent };
}
