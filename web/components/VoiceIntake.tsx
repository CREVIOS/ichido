"use client";
import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import { sb } from "@/lib/supabase";
import type { Lang } from "@/content/catalogue";

const COPY = {
  start: { bn: "🎙 কথা বলুন", en: "🎙 Speak", ja: "🎙 はなす" },
  stop: { bn: "■ থামুন", en: "■ Stop", ja: "■ とめる" },
  notice: {
    bn: "আপনার কণ্ঠ LiveKit হয়ে স্পিচ সেবায় যাবে লেখায় রূপান্তরের জন্য। চাইলে নিচে লিখেও বলতে পারেন।",
    en: "Your voice goes through LiveKit to a speech service to be turned into text. You can type below instead.",
    ja: "声は LiveKit を とおって 文字に かえる サービスに おくられます。下に 書くことも できます。",
  },
  hearing: { bn: "শুনছি…", en: "Listening…", ja: "きいています…" },
  unavailable: { bn: "এখন কণ্ঠ চালু নেই — লিখে বলুন।", en: "Voice is not available now — please type.", ja: "いまは 声が つかえません。書いて ください。" },
} satisfies Record<string, Record<Lang, string>>;

// Joins the case's private LiveKit room. The agent transcribes; each final transcript of *this* caller is handed to onFinal.
// `say` asks the agent to read text aloud (the read-back or the operator's approved reply).
export function VoiceIntake({ lang, onFinal, say }: { lang: Lang; onFinal: (text: string) => void; say?: string }) {
  const room = useRef<Room | null>(null);
  const finalRef = useRef(onFinal);
  useEffect(() => { finalRef.current = onFinal; });
  const [state, setState] = useState<"idle" | "connecting" | "live" | "unavailable">("idle");
  const [partial, setPartial] = useState("");

  useEffect(() => () => { room.current?.disconnect(); }, []);
  useEffect(() => {
    const r = room.current;
    if (say && r && state === "live") r.localParticipant.sendText(say, { topic: "ichido.say" }).catch(() => {});
  }, [say, state]);

  async function start() {
    setState("connecting");
    try {
      const { data } = await sb().auth.getSession();
      const res = await fetch("/api/livekit/token", { method: "POST", headers: { authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      if (!res.ok) throw new Error(`token ${res.status}`);
      const { url, token } = await res.json();
      const r = new Room();
      r.registerTextStreamHandler("lk.transcription", async (reader, info) => {
        const text = await reader.readAll();
        if (info.identity !== r.localParticipant.identity) return; // ignore the agent's own speech
        if (reader.info.attributes?.["lk.transcription_final"] === "true") { setPartial(""); if (text.trim()) finalRef.current(text.trim()); }
        else setPartial(text);
      });
      r.on(RoomEvent.Disconnected, () => setState("idle"));
      await r.connect(url, token);
      await r.localParticipant.setMicrophoneEnabled(true);
      room.current = r;
      setState("live");
    } catch {
      setState("unavailable");
    }
  }

  function stop() {
    room.current?.disconnect();
    room.current = null;
    setState("idle");
  }

  return (
    <div className="stack" style={{ "--gap": "6px" } as React.CSSProperties}>
      <p className="small secondary">{COPY.notice[lang]}</p>
      {state === "live" ? (
        <button className="btn danger big" onClick={stop}>{COPY.stop[lang]}</button>
      ) : (
        <button className="btn primary big" disabled={state === "connecting"} onClick={start}>{COPY.start[lang]}</button>
      )}
      {state === "live" && <p className="small muted">{partial || COPY.hearing[lang]}</p>}
      {state === "unavailable" && <p className="small secondary">{COPY.unavailable[lang]}</p>}
    </div>
  );
}
