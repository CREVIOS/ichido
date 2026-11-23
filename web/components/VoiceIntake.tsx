"use client";
import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import { Mic, Square } from "lucide-react";
import { cmd, sb, staffToken } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { FRONTLINE, FRONT_DESK, VOICE, VOICE_LANGS, type Lang } from "@/content/catalogue";
import { callerTranscript, type SignedSpeech } from "@/content/speech";

export type { SignedSpeech };
type State = "idle" | "connecting" | "live" | "unavailable";
const AGENT_WAIT_MS = 12_000;

// Caller transcripts arrive on lk.transcription under the caller's own identity; the agent's audio is attached for playback.
function wire(r: Room, audioEl: () => HTMLElement | null, onFinal: ((t: string) => void) | null, onPartial: (t: string) => void, acceptAudio: (p:RemoteParticipant) => boolean) {
  if (onFinal) r.registerTextStreamHandler("lk.transcription", async (reader, info) => {
    const text = await callerTranscript(reader, info.identity === r.localParticipant.identity);
    if (text === null) return;
    if (reader.info.attributes?.["lk.transcription_final"] !== "true") return onPartial(text);
    onPartial("");
    if (text.trim()) onFinal(text.trim());
  });
  r.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    if (acceptAudio(participant) && track.kind === Track.Kind.Audio) audioEl()?.appendChild(track.attach());
  });
  r.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
}

// Resolves true once an agent participant is in the room, false after the timeout.
function waitForAgent(r: Room): Promise<boolean> {
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

// Joins the case's private LiveKit room. The agent transcribes; each final transcript of *this* caller goes to onFinal.
// `say` is server-signed text (the read-back) the agent may speak; the agent rejects anything unsigned.
export function VoiceIntake({ lang, onFinal, say, generation, monitor, handler }: {
  lang: Lang; onFinal?: (text: string) => void; say?: SignedSpeech | null; generation?: string; monitor?: string; handler?: string;
}) {
  const room = useRef<Room | null>(null);
  const audio = useRef<HTMLDivElement | null>(null);
  const finalRef = useRef(onFinal);
  const owner = useRef(handler);
  useEffect(() => {
    owner.current = handler;
    finalRef.current = onFinal;
    if (generation && handler !== "ai") audio.current?.replaceChildren();
  }, [handler,generation,onFinal]);
  const [state, setState] = useState<State>("idle");
  const [partial, setPartial] = useState("");

  useEffect(() => () => { room.current?.disconnect(); room.current = null; }, []);
  useEffect(() => {
    const r = room.current;
    if (say && r && state === "live") r.localParticipant.sendText(JSON.stringify(say), { topic: "ichido.say" }).catch(() => setState("unavailable"));
  }, [say, state]);

  async function start() {
    setState("connecting");
    const r = new Room();
    room.current = r;  // tracked from creation so any failure path can disconnect it
    let lease: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function release() {
      clearTimeout(timer);
      if (!lease || !generation) return;
      const session = lease;
      lease = undefined;
      void cmd("voice_end",{generation,session}).catch(() => setState("unavailable"));
    }
    const fail = () => {
      release();
      if (room.current !== r) return;
      room.current = null;
      void r.disconnect();
      setState("unavailable");
      if (generation) void cmd("voice_failure",{generation}).catch(() => setState("unavailable"));
    };
    try {
      const bearer = monitor ? await staffToken() : (await sb().auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/livekit/token" + (monitor ? "?incident=" + encodeURIComponent(monitor) : ""), { method: "POST", headers: { authorization: `Bearer ${bearer ?? ""}` } });
      if (!res.ok) return fail();
      const { url, token, needsAgent, session, ttl } = await res.json();
      lease = session;
      if (room.current !== r) { release(); return; }

      wire(r, () => audio.current, onFinal ? (t) => finalRef.current?.(t) : null, setPartial,
        p => monitor ? p.identity.startsWith("c-") : p.isAgent && (!generation || owner.current === "ai"));
      r.on(RoomEvent.Disconnected, () => { release(); if (room.current === r) { room.current = null; setState("idle"); } });
      r.on(RoomEvent.Reconnecting, () => { void r.disconnect(); });
      const agentJoined = needsAgent ? waitForAgent(r) : Promise.resolve(true);
      await r.connect(url, token);
      if (room.current !== r) return r.disconnect();
      await r.startAudio();  // inside the Speak gesture, so the browser allows playback
      if (!monitor && room.current === r) await r.localParticipant.setMicrophoneEnabled(true);
      if (room.current !== r) return r.disconnect();  // stopped or unmounted meanwhile
      if (!(await agentJoined)) return fail();
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
    setState("idle");
  }

  // No speech recognition for this language (Nepali): the caller types.
  if (!VOICE_LANGS.includes(lang)) return (
    <div className="flex flex-col gap-2">
      <p className="text-[14px]">{VOICE.unavailable[lang]}</p>
      <p className="text-[12px] leading-5 text-muted-foreground">{VOICE.notice[lang]}</p>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      {state === "live" ? (
        <Button size="lg" className="h-12 text-[16px]" onClick={stop}><Square className="fill-current" />{VOICE.stop[lang]}</Button>
      ) : (
        <Button size="lg" className="h-12 text-[16px]" disabled={state === "connecting"} onClick={start}>
          <Mic className="stroke-[1.5]" />{state === "connecting" ? VOICE.connecting[lang] : monitor ? FRONT_DESK.listen : VOICE.start[lang]}
        </Button>
      )}
      {state === "live" && <p className="flex items-center gap-2 text-[15px] text-foreground"><span className="dot" data-s="live" />{partial || VOICE.hearing[lang]}</p>}
      {state === "unavailable" && <p className="text-[14px]">{VOICE.unavailable[lang]}</p>}
      {!monitor && <p className="text-[12px] leading-5 text-muted-foreground">{generation && FRONTLINE.voicePrivacy[lang]} {VOICE.notice[lang]}</p>}
      <div ref={audio} hidden />
    </div>
  );
}
