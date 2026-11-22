"use client";
import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import { sb } from "@/lib/supabase";
import { VOICE, type Lang } from "@/content/catalogue";

export type SignedSpeech = { text: string; sig: string };
type State = "idle" | "connecting" | "live" | "unavailable";
const AGENT_WAIT_MS = 12_000;

// Caller transcripts arrive on lk.transcription under the caller's own identity; the agent's audio is attached for playback.
function wire(r: Room, audioEl: () => HTMLElement | null, onFinal: (t: string) => void, onPartial: (t: string) => void) {
  r.registerTextStreamHandler("lk.transcription", async (reader, info) => {
    const text = await reader.readAll();
    if (info.identity !== r.localParticipant.identity) return;
    if (reader.info.attributes?.["lk.transcription_final"] !== "true") return onPartial(text);
    onPartial("");
    if (text.trim()) onFinal(text.trim());
  });
  r.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Audio) audioEl()?.appendChild(track.attach());
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
export function VoiceIntake({ lang, onFinal, say }: { lang: Lang; onFinal: (text: string) => void; say?: SignedSpeech | null }) {
  const room = useRef<Room | null>(null);
  const audio = useRef<HTMLDivElement | null>(null);
  const finalRef = useRef(onFinal);
  useEffect(() => { finalRef.current = onFinal; });
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
    const fail = () => { if (room.current === r) { r.disconnect(); room.current = null; setState("unavailable"); } };
    try {
      const { data } = await sb().auth.getSession();
      const res = await fetch("/api/livekit/token", { method: "POST", headers: { authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      if (!res.ok) return fail();
      const { url, token } = await res.json();

      wire(r, () => audio.current, (t) => finalRef.current(t), setPartial);
      r.on(RoomEvent.Disconnected, () => { if (room.current === r) { room.current = null; setState("idle"); } });
      const agentJoined = waitForAgent(r);
      await r.connect(url, token);
      await r.startAudio();  // inside the Speak gesture, so the browser allows playback
      await r.localParticipant.setMicrophoneEnabled(true);
      if (room.current !== r) return r.disconnect();  // stopped or unmounted meanwhile
      if (!(await agentJoined)) return fail();
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

  return (
    <div className="stack" style={{ "--gap": "6px" } as React.CSSProperties}>
      <p className="tiny muted">{VOICE.notice[lang]}</p>
      {state === "live" ? (
        <button className="btn dark block" onClick={stop}>{VOICE.stop[lang]}</button>
      ) : (
        <button className="btn blue block" disabled={state === "connecting"} onClick={start}>
          {state === "connecting" ? VOICE.connecting[lang] : VOICE.start[lang]}
        </button>
      )}
      {state === "live" && <p className="small soft">{partial || VOICE.hearing[lang]}</p>}
      {state === "unavailable" && <p className="small soft">{VOICE.unavailable[lang]}</p>}
      <div ref={audio} hidden />
    </div>
  );
}
