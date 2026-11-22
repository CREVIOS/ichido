import "server-only";
import { RoomServiceClient } from "livekit-server-sdk";
import { after } from "next/server";
import { roomFor } from "@/lib/speech";
import { entry, errorFields, ship } from "@/lib/log";

// End a case's voice room so no participant stays connected after the case closes or the caller is reset.
export async function closeVoice(incident: string): Promise<void> {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return;
  const host = LIVEKIT_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  try {
    await new RoomServiceClient(host, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).deleteRoom(roomFor(incident));
  } catch (e) {
    // A room that was never created is fine; anything else is logged, the case itself is already closed.
    const line = entry("warn", "voice_close_failed", { incident, ...errorFields(e) });
    after(() => ship([line]));
  }
}
