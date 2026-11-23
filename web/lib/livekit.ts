import "server-only";
import { ParticipantInfo_Kind } from "@livekit/protocol";
import { priv, rpc } from "@/lib/server";
import { RoomServiceClient, ServerError } from "livekit-server-sdk";
import { after } from "next/server";
import { roomFor } from "@/lib/speech";
import { entry, errorFields, ship } from "@/lib/log";

// End a case's voice room so no participant stays connected after the case closes or the caller is reset.
export async function closeVoice(incident: string, voiceRoom: string): Promise<void> {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return;
  const host = LIVEKIT_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  try {
    await new RoomServiceClient(host, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).deleteRoom(roomFor(voiceRoom));
  } catch (e) {
    // A room that was never created is fine; anything else is logged, the case itself is already closed.
    const line = entry("warn", "voice_close_failed", { incident, ...errorFields(e) });
    after(() => ship([line]));
  }
}

// Removing only the worker preserves the direct caller-to-operator subscription.
export async function revokeAgentAudio(incident:string) {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return;
  const {data:b} = await priv().from("binding").select("voice_room,desk!inner(handler)").eq("desk.handler","human").eq("incident",incident).maybeSingle().throwOnError();
  if (!b) return;
  const room = roomFor(b.voice_room);
  const client = new RoomServiceClient(LIVEKIT_URL.replace(/^ws/,"http"),LIVEKIT_API_KEY,LIVEKIT_API_SECRET);
  try {
    const participants = await client.listParticipants(room);
    await Promise.all(participants.filter(p => p.kind===ParticipantInfo_Kind.AGENT).map(p => client.removeParticipant(room,p.identity)));
  } catch (error) {
    const line = entry("warn","voice_revoke_failed",{incident,...errorFields(error)});
    after(() => ship([line]));
  }
}

// LiveKit JWT expiry bounds joining. Evict an already connected monitor on expiry or session revocation.
export async function expireMonitors() {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return;
  const client = new RoomServiceClient(LIVEKIT_URL.replace(/^ws/,"http"),LIVEKIT_API_KEY,LIVEKIT_API_SECRET);
  const grants = await rpc<{id:string;generation:string}[]>("expired_monitors",{});
  for (const grant of grants) {
    try {
      await client.removeParticipant(roomFor(grant.generation),`op-${grant.id}`,{revokeTokenTs:BigInt(Math.ceil(Date.now()/1000))});
    } catch (error) {
      if (!(error instanceof ServerError && error.status===404)) {
        after(() => ship([entry("warn","voice_monitor_revoke_failed",errorFields(error))]));
        continue;
      }
    }
    await priv().from("monitor_media").delete().eq("id",grant.id).throwOnError();
  }
}
