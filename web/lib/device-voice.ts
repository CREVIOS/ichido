import "server-only";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { VOICE_LANGS, contentPack, exclusiveOff, type Lang } from "@/content/catalogue";
import { signalBot } from "@/lib/bot";
import { frontlineTurn } from "@/lib/frontline";
import { closeVoice } from "@/lib/livekit";
import { HttpError, admin, fail, rpc, type Actor } from "@/lib/server";
import { callerVoiceGrant, type VoiceGrant } from "@/lib/voice-token";

// Device voice: a Help Point with a microphone and speaker takes the phone's place in an AI case's voice session.
// The server holds an anonymous caller for the device session (supabase/migrations/*_device_voice.sql), so the
// token, intake agent, front line and operator monitor run exactly as for a paired phone, under identity c-<uid>.

type Staff = Extract<Actor, { kind: "staff" }>;
type DeviceBinding = {
  uid: string; incident: string; lang: Lang; expires: string; voice_room: string; rev: number;
  triage: { taps?: string[] } | null; fault: string; handler: string;
};

function operator(a: Actor): Staff {
  if (a.kind !== "staff" || a.role !== "operator" || a.aal !== "aal2") fail(403, "forbidden");
  return a as Staff;
}

const incidentOf = (b: Record<string, unknown>) =>
  typeof b.incident === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(b.incident) ? b.incident : fail(400, "bad_request");

// A new anonymous user for one device session. Hosted Supabase rate-limits anonymous sign-ins per IP, and every
// device start comes from the server's address (docs/DEPLOY.md).
async function anonymousCaller(): Promise<string> {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw new HttpError(error?.status === 429 ? 429 : 503, error?.status === 429 ? "rate_limited" : "voice_unavailable");
  return data.user.id;
}

export const deviceVoiceCommands = {
  // Operator: start voice on the Help Point for an unclaimed AI case, in the language heard on the handset.
  async device_voice(a: Actor, b: Record<string, unknown>) {
    const op = operator(a);
    const incident = incidentOf(b);
    const lang = b.lang;
    if (typeof lang !== "string" || !VOICE_LANGS.includes(lang as Lang)) return fail(400, "bad_request");
    const device = await anonymousCaller();
    try {
      await rpc("device_voice_start", { p_uid: op.uid, p_session: op.session, p_incident: incident, p_lang: lang, p_device: device });
    } catch (error) {
      await admin.auth.admin.deleteUser(device).catch(() => undefined);
      throw error;
    }
    return {};
  },

  // Operator: end the device session; the room is deleted so the device and the agent leave.
  async device_voice_stop(a: Actor, b: Record<string, unknown>) {
    const op = operator(a);
    const incident = incidentOf(b);
    const room = await rpc<string>("device_voice_stop", { p_uid: op.uid, p_session: op.session, p_incident: incident });
    await closeVoice(incident, room);
    return {};
  },
};

export async function deviceBinding(station: string): Promise<DeviceBinding | null> {
  const { data, error } = await admin.rpc("device_voice", { p_station: station });
  if (error) throw error;
  return (data ?? null) as DeviceBinding | null;
}

// The device's join grant, or null when the station has no live device session.
export async function deviceVoiceGrant(station: string): Promise<VoiceGrant | null> {
  const v = await deviceBinding(station);
  if (!v) return null;
  return callerVoiceGrant({ uid: v.uid, incident: v.incident, lang: v.lang, expires: v.expires, voiceRoom: v.voice_room }, v.handler);
}

// The 32-hex event id of the press, as the request id of the confirm turn: a retried press is a replay.
const requestId = (key: string) => `${key.slice(0, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}-${key.slice(16, 20)}-${key.slice(20)}`;

// A button press during a device session confirms the read-back the agent just spoke. A pack case (no ATM facts)
// takes the AI's suggested taps of that revision first, because the device has no screen to tap them on.
export async function deviceConfirm(station: string, key: string) {
  const v = await deviceBinding(station);
  if (!v) return fail(409, "no_voice");
  const taps = v.triage?.taps ?? [];
  if (contentPack(v.fault) && taps.length) {
    const flags = taps.reduce<string[]>((on, flag) => [...on.filter((f) => !exclusiveOff(flag, on).includes(f)), flag], []);
    await rpc("device_accept_triage", { p_uid: v.uid, p_rev: v.rev, p_flags: [...new Set(flags)] });
  }
  const caller = { kind: "caller" as const, uid: v.uid, incident: v.incident, lang: v.lang, expires: v.expires, voiceRoom: v.voice_room };
  const result = await frontlineTurn(caller, { act: "confirm", request_id: requestId(key), base_rev: v.rev });
  after(() => signalBot(v.incident, "frontline_turn"));
  return result;
}
