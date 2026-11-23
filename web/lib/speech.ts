import "server-only";
import type { SignedSpeech } from "@/content/speech";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// The agent speaks only text the server signed for that caller binding's room, so a client cannot make it say anything else.
// agent/app.py verifies the room and sender from LiveKit and consumes each nonce once.
export const roomFor = (voiceRoom: string) => `case-${voiceRoom}`;

export function signSpeech(voiceRoom: string, uid: string, text: string, turn?: {seq:number; lang:string; epoch:number}): SignedSpeech | null {
  const secret = process.env.AGENT_BRIDGE_SECRET;
  if (!secret) return null;
  const issued = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const version = turn ? `3\n${turn.seq}\n${turn.lang}\n${turn.epoch}` : "2";
  const message = `ichido-say/${version}\n${roomFor(voiceRoom)}\nc-${uid}\n${issued}\n${nonce}\n${text}`;
  return { ...turn, text, issued, nonce, sig: createHmac("sha256", secret).update(message).digest("base64url") };
}

// The worker authenticates each request, including its job scope and body. No worker secret enters a room token.
export function verifyVoiceRequest(body: string, issued: string | null, signature: string | null) {
  const key = process.env.AGENT_BRIDGE_SECRET;
  if (!key || !issued || !/^\d{10}$/.test(issued) || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const age = Date.now()/1000 - Number(issued);
  if (age < -5 || age >= 30) return false;
  const mac = createHmac("sha256",key).update(`ichido-job/1\n${issued}\n${body}`).digest();
  return timingSafeEqual(mac,Buffer.from(signature,"hex"));
}
