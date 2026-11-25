"use client";
import { ChatBubble } from "@/components/chat-bubble";
import { Fragment, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { VoiceIntake } from "@/components/VoiceIntake";
import { Notice, Panel } from "@/components/kit";
import { useLive } from "@/lib/live";
import { cmd } from "@/lib/supabase";
import { monitorEvent, monitorText, sameMonitorGroup, type MonitorTurn as Turn } from "@/content/chat";
import { CALLER_FLAGS, DESK, FACTS, LANG_NAME, FRONT_DESK, UI, staffError } from "@/content/catalogue";
import type { Desk } from "./types";
import { DeviceVoiceCard } from "./access";

export function FrontlineMonitor({ desk }: { desk: Desk }) {
  const [turns,setTurns] = useState<Turn[]>([]);
  const [error,setError] = useState("");
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const r = await cmd<{ turns: Turn[] }>("frontline_monitor",{ incident: desk.id });
      if (!signal.aborted) { setTurns(r.turns); setError(""); }
    } catch (e) {
      if (!signal.aborted) { setTurns([]); setError(staffError((e as Error).message)); }
    }
  },[desk.id]);
  useLive(["frontline_turn","frontline_translation","desk"],load);
  const deviceVoice = desk.handler === "ai" && !desk.operator_id && !desk.text_only && (desk.device_voice || !desk.lang);
  return <>{deviceVoice && <DeviceVoiceCard incident={desk.id} active={Boolean(desk.device_voice)} />}<Panel title={FRONT_DESK.monitor}>
    {desk.transfer_reason && <p>{FRONT_DESK.transfer} · P{desk.priority} · {FRONT_DESK.reasons[desk.transfer_reason]}</p>}
    {error && <Notice tone="warn">{error}</Notice>}
    <ol className="space-y-1">{turns.map((t,i) => {
      if (t.wording === "start") return <li key={t.seq} className="chat-system">{FRONT_DESK.event} · {FRONT_DESK.consent}</li>;
      const read = t.facts.triage;
      const event = monitorEvent(t.wording);
      const gap = i > 0 && Date.parse(t.at) - Date.parse(turns[i-1].at) >= 300000;
      const role = t.speaker === "caller" ? "caller" : t.speaker === "ai" ? "ai" : "operator";
      const translation = t.locale === "ja" ? null : monitorText(t,"ja");
      return <Fragment key={t.seq}>{gap && <li className="chat-system"><time dateTime={t.at}>{new Date(t.at).toLocaleString("ja",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</time></li>}
        <li>{event ? <p className="chat-system">{monitorText(t)}{t.speaker === "ai" && <> · {FRONT_DESK.delivery[t.delivery]}</>}</p> :
        <ChatBubble from={role} first={!sameMonitorGroup(t,turns[i-1])} last={!sameMonitorGroup(t,turns[i+1])} label={role === "caller" ? FRONT_DESK.submitted : role === "ai" ? FRONT_DESK.aiSpeaker : FRONT_DESK.joined}>
        <p lang={t.locale}>{monitorText(t)}</p>
        {t.speaker==="ai" && <small>{FRONT_DESK.delivery[t.delivery]}</small>}
        {t.words && !t.ja && t.locale !== "ja" && <p className="text-sm">{DESK.teach.noMt(LANG_NAME[t.locale])}</p>}
        {translation && <p lang="ja" className="mt-2 text-sm">{t.words ? FRONT_DESK.translation : LANG_NAME.ja} · {translation}</p>}
        {(["card_back","cash_received"] as const).map((k) => t.facts[k] && t.facts[k] !== "unknown" &&
          <p key={k}>{t.speaker === "ai" ? UI.aiRead.ja : FRONT_DESK.submitted} · {FACTS[k][t.facts[k]].ja}</p>)}
        {read?.taps?.map((f) => <p key={f}>{UI.aiRead.ja} · {CALLER_FLAGS[f]?.staff}</p>)}
        {read?.ask?.map((f) => <p key={f}>{UI.aiAsk.ja} · {CALLER_FLAGS[f]?.staff}</p>)}
        </ChatBubble>}</li></Fragment>;
    })}</ol>
    {desk.lang && desk.lang !== "ne" && !desk.text_only && turns.some(t => t.wording==="start") && <VoiceIntake key={desk.id + desk.lang} lang="ja" monitor={desk.id} />}
    <Button variant="secondary" onClick={() => cmd("report_safety_miss",{incident:desk.id}).catch(e => setError(staffError(e.message)))}>{FRONT_DESK.safetyMiss}</Button>

  </Panel></>;
}
