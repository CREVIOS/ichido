import { useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform, View } from "react-native";
import type { Room, RemoteParticipant } from "livekit-client";
import { Mic, Square } from "lucide-react-native";
import { API_URL, bearer, cmd } from "@/lib/supabase";
import { livekit } from "@/lib/voice";
import { Button, T } from "@/components/ui";
import { MOBILE, VOICE, type Lang } from "@content/catalogue";
import { callerTranscript, type SignedSpeech } from "@content/speech";

export type { SignedSpeech };
type State = "idle" | "connecting" | "live" | "unavailable";
const AGENT_WAIT_MS = 12_000;

// Same protocol as web/components/VoiceIntake.tsx. Caller transcripts arrive on lk.transcription under the
// caller's own identity; the agent's audio plays through the native audio session without attaching anything.
function wire(r: Room, onFinal: (t: string) => void, onPartial: (t: string) => void) {
  r.registerTextStreamHandler("lk.transcription", async (reader, info) => {
    const text = await callerTranscript(reader, info.identity === r.localParticipant.identity);
    if (text === null) return;
    if (reader.info.attributes?.["lk.transcription_final"] !== "true") return onPartial(text);
    onPartial("");
    if (text.trim()) onFinal(text.trim());
  });
}

// Resolves true once an agent participant is in the room, false after the timeout.
function waitForAgent(r: Room): Promise<boolean> {
  const { RoomEvent } = livekit();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), AGENT_WAIT_MS);
    const check = (p: RemoteParticipant) => {
      if (!p.isAgent) return;
      clearTimeout(timer);
      resolve(true);
    };
    r.on(RoomEvent.ParticipantConnected, check);
    r.once(RoomEvent.Connected, () => r.remoteParticipants.forEach(check));
  });
}

async function micAllowed(): Promise<boolean> {
  if (Platform.OS !== "android") return true; // iOS asks on first use (NSMicrophoneUsageDescription)
  return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) === PermissionsAndroid.RESULTS.GRANTED;
}

// Joins the case's private LiveKit room. The agent transcribes; each final transcript of *this* caller goes to onFinal.
// `say` is server-signed text (the read-back) the agent may speak; the agent rejects anything unsigned.
export function VoiceIntake({ lang, onFinal, say, generation, handler }: { lang: Lang; generation?: string; handler?: string; onFinal?: (text: string) => void; say?: SignedSpeech | null }) {
  const room = useRef<Room | null>(null);
  const owner = useRef(handler);
  useEffect(() => {
    owner.current = handler;
    if (generation && handler !== "ai") room.current?.remoteParticipants.forEach(p => {
      if (p.isAgent) p.audioTrackPublications.forEach(pub => pub.setSubscribed(false));
    });
  }, [generation,handler]);
  const finalRef = useRef(onFinal);
  useEffect(() => { finalRef.current = onFinal; });
  const [state, setState] = useState<State>("idle");
  const [partial, setPartial] = useState("");

  useEffect(() => () => {
    if (!room.current) return;
    room.current.disconnect(); room.current = null; livekit().AudioSession.stopAudioSession();
  }, []);
  useEffect(() => {
    const r = room.current;
    if (say && r && state === "live") r.localParticipant.sendText(JSON.stringify(say), { topic: "ichido.say" }).catch(() => setState("unavailable"));
  }, [say, state]);

  async function start() {
    setState("connecting");
    const { Room, RoomEvent, AudioSession } = livekit();
    const r = new Room();
    room.current = r; // tracked from creation so any failure path can disconnect it
    let lease: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      clearTimeout(timer);
      if (!lease || !generation) return;
      const session = lease;
      lease = undefined;
      void cmd("voice_end",{generation,session}).catch(() => setState("unavailable"));
    };
    const fail = () => {
      const failedSession = lease;
      release();
      if (room.current !== r) return;
      room.current = null; void r.disconnect(); void AudioSession.stopAudioSession(); setState("unavailable");
      if (generation) void cmd("voice_failure",{generation,session:failedSession}).catch(() => setState("unavailable"));
    };
    try {
      if (!(await micAllowed())) return fail();
      const res = await fetch(`${API_URL}/api/livekit/token`, { method: "POST", headers: { authorization: await bearer() } });
      if (!res.ok) return fail(); // 503 when the server has no voice keys: the typed path stays available
      const { url, token, session, ttl, needsAgent } = await res.json();

      lease = session;
      if (room.current !== r) { release(); return; }
      await AudioSession.startAudioSession();
      if (onFinal) wire(r, (t) => finalRef.current?.(t), setPartial);
      if (generation) r.on(RoomEvent.TrackPublished, (pub,p) => {
        pub.setSubscribed(p.isAgent && owner.current === "ai");
      });
      r.on(RoomEvent.Reconnecting, () => { void r.disconnect(); });
      r.on(RoomEvent.Disconnected, () => { release(); if (room.current === r) { room.current = null; AudioSession.stopAudioSession(); setState("idle"); } });
      const agentJoined = needsAgent ? waitForAgent(r) : Promise.resolve(true);
      await r.connect(url, token, {autoSubscribe:!generation});
      if (room.current !== r) return r.disconnect();
      if (generation && owner.current === "ai") r.remoteParticipants.forEach(p => {
        if (p.isAgent) p.audioTrackPublications.forEach(pub => pub.setSubscribed(true));
      });
      await r.localParticipant.setMicrophoneEnabled(true);
      if (room.current !== r) return r.disconnect(); // stopped or unmounted meanwhile
      async function lostAgent() {
        if (room.current !== r || !generation || owner.current !== "ai") return;
        try {
          const {screen} = await cmd<{screen?:{generation:string;card:{handler:string}}}>("caller_screen");
          if (screen?.generation === generation && screen.card.handler === "ai") fail();
        } catch { fail(); }
      }
      if (generation && needsAgent) r.on(RoomEvent.ParticipantDisconnected,p => { if (p.isAgent) void lostAgent(); });
      if (!(await agentJoined)) {
        if (!generation) return fail();
        await lostAgent();
      }
      if (room.current !== r) return r.disconnect();
      timer = setTimeout(() => { void r.disconnect(); },ttl*1000);
      setState("live");
    } catch {
      fail();
    }
  }

  function stop() {
    room.current?.disconnect();
    room.current = null;
    livekit().AudioSession.stopAudioSession();
    setState("idle");
  }

  return (
    <View style={{ gap: 8 }}>
      <T v="small">{VOICE.notice[lang]}</T>
      {state === "live" ? (
        <Button icon={Square} label={MOBILE.stopSpeaking[lang]} onPress={stop} block />
      ) : (
        <Button kind="secondary" icon={Mic} label={state === "connecting" ? VOICE.connecting[lang] : MOBILE.speak[lang]}
          busy={state === "connecting"} onPress={start} block />
      )}
      {state === "live" && <T v="label">{partial || VOICE.hearing[lang]}</T>}
      {state === "unavailable" && <T v="label">{VOICE.unavailable[lang]}</T>}
    </View>
  );
}
