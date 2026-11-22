import "server-only";
import { createHmac } from "node:crypto";

// The agent speaks only text the server signed for that case's room, so a client cannot make it say anything else.
// Same scheme is verified in agent/app.py: HMAC-SHA256 over "<room>\n<text>", base64url.
export const roomFor = (incident: string) => `case-${incident}`;

export function signSpeech(incident: string, text: string): { text: string; sig: string } | null {
  const secret = process.env.AGENT_BRIDGE_SECRET;
  if (!secret) return null;
  return { text, sig: createHmac("sha256", secret).update(`${roomFor(incident)}\n${text}`).digest("base64url") };
}
