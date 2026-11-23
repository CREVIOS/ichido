"use client";
import { useCallback, useState } from "react";
import { Notice, Panel } from "@/components/kit";
import { useLive } from "@/lib/live";
import { cmd } from "@/lib/supabase";
import { ANSWER, CALLER_FLAGS, DESK, FACTS, LANG_NAME, FRONTLINE, FRONT_DESK, UI, replyOf, staffError, type Fact, type Lang, type ReplySlots } from "@/content/catalogue";
import type { Desk } from "./types";

type Turn = {
  seq: number; slots: ReplySlots | null; locale: Lang; words: string | null; ja: string | null; speaker: string; wording: string;
  facts: { flag?: string; on?: boolean; card_back?: Fact; cash_received?: Fact; triage?: { taps: string[]; ask: string[]; situation: string | null } };
};

function turnText(t: Turn) {
  if (t.words) return t.words;
  if (t.wording === "withheld") return UI.numbersWithheld[t.locale];
  if (t.wording === "tap" && t.facts.flag) return `${CALLER_FLAGS[t.facts.flag]?.label[t.locale]} · ${ANSWER[t.facts.on ? "yes" : "no"][t.locale]}`;
  if (t.wording === "confirm") return UI.confirm[t.locale];
  if (t.wording === "unsure") return UI.unsure[t.locale];
  if (Object.hasOwn(FRONTLINE,t.wording)) return FRONTLINE[t.wording as keyof typeof FRONTLINE][t.locale];
  return replyOf(t.wording)?.text(t.slots ?? {})[t.locale] ?? null;
}

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
  return <Panel title={FRONT_DESK.monitor}>
    {desk.transfer_reason && <p>{FRONT_DESK.transfer} · P{desk.priority} · {FRONT_DESK.reasons[desk.transfer_reason]}</p>}
    {error && <Notice tone="warn">{error}</Notice>}
    <ol className="grid gap-3">{turns.map((t) => {
      if (t.wording === "start") return <li key={t.seq} className="text-sm text-muted-foreground">{FRONT_DESK.event} · {FRONT_DESK.consent}</li>;
      const read = t.facts.triage;
      return <li key={t.seq} className="border-l-2 pl-3">
        <span className="text-xs text-muted-foreground">{t.speaker === "caller" ? FRONT_DESK.submitted : t.speaker === "ai" ? FRONT_DESK.aiSpeaker : FRONT_DESK.joined} · {t.locale}</span>
        <p lang={t.locale}>{turnText(t)}</p>
        {t.words && !t.ja && t.locale !== "ja" && <p className="text-sm">{DESK.teach.noMt(LANG_NAME[t.locale])}</p>}
        {t.ja && <p className="text-sm">{FRONT_DESK.translation} · {t.ja}</p>}
        {(["card_back","cash_received"] as const).map((k) => t.facts[k] && t.facts[k] !== "unknown" &&
          <p key={k}>{t.speaker === "ai" ? UI.aiRead.ja : FRONT_DESK.submitted} · {FACTS[k][t.facts[k]].ja}</p>)}
        {read?.taps.map((f) => <p key={f}>{UI.aiRead.ja} · {CALLER_FLAGS[f]?.staff}</p>)}
        {read?.ask.map((f) => <p key={f}>{UI.aiAsk.ja} · {CALLER_FLAGS[f]?.staff}</p>)}
      </li>;
    })}</ol>
  </Panel>;
}
