import "server-only";
import type { SignedSpeech } from "@/content/speech";
import { createHmac, randomBytes } from "node:crypto";

// The agent speaks only text the server signed for that caller binding's room, so a client cannot make it say anything else.
// agent/app.py verifies the room and sender from LiveKit and consumes each nonce once.
export const roomFor = (voiceRoom: string) => `case-${voiceRoom}`;

export function signSpeech(voiceRoom: string, uid: string, text: string): SignedSpeech | null {
  const secret = process.env.AGENT_BRIDGE_SECRET;
  if (!secret) return null;
  const issued = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const message = `ichido-say/2\n${roomFor(voiceRoom)}\nc-${uid}\n${issued}\n${nonce}\n${text}`;
  return { text, issued, nonce, sig: createHmac("sha256", secret).update(message).digest("base64url") };
}
