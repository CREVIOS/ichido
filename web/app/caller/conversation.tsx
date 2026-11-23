"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/components/kit";
import { cmd, sb } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { ANSWER, CALLER_FLAGS, FACT_KEYS, FRONTLINE, UI, callerPack, contentPack, errorText, urgentText, type Lang } from "@/content/catalogue";
import { CallerFlags } from "./faults";
import { ReadBack } from "./intake";
import type { CallerCase, Draft } from "./types";

type Turn = { seq: number; rev: number; speaker: string; words: string | null; wording: string; locale: Lang };
export function Conversation({ card, draft, lang, refresh }: { card: CallerCase; draft: Draft; lang: Lang; refresh: () => Promise<void> }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal: AbortSignal) => {
    const rows = await sb().from("frontline_turn").select("seq,rev,speaker,words,wording,locale").eq("incident",card.id).order("seq").abortSignal(signal);
    if (!signal.aborted && !rows.error) setTurns(rows.data as Turn[]);
  }, [card.id]);
  useLive(["frontline_turn"], load, true, { incident: card.id });
  const started = turns.some((t) => t.speaker === "caller" && t.wording === "start");
  const pack = callerPack(card.fault);
  const ready = pack.atm ? FACT_KEYS.some((k) => draft[k] !== "unknown") : card.flags.length > 0;
  async function submit(act: string, fields: Record<string, unknown> = {}) {
    setBusy(true);
    setNote("");
    try {
      const result = await cmd<{ withheld?: boolean }>("frontline_turn", { act, request_id: crypto.randomUUID(), base_rev: draft.rev, ...fields });
      if (act === "text") setText((current) => current === fields.text ? "" : current);
      if (result.withheld) setNote(UI.numbersWithheld[lang]);
      await Promise.all([load(new AbortController().signal), refresh()]);
    } catch (error) { setNote(errorText((error as Error).message,lang)); }
    finally { setBusy(false); }
  }
  const ai = card.handler === "ai";
  const warning = card.confirmed_rev === null ? null : urgentText(card.fault, card.flags, lang);
  const readback = turns.some((t) => t.speaker === "ai" && t.wording === "readback" && t.rev === draft.rev);
  const suggestions = [...new Set(draft.triage?.taps ?? [])].filter((t) => !card.flags.includes(t) && CALLER_FLAGS[t]);
  return <section className="flex flex-col gap-4">
    {ai && <h1 className="text-2xl leading-snug">{FRONTLINE.greeting[lang]}</h1>}
    {card.transfer_reason === "suspected_risk" && <Notice tone="warn">{FRONTLINE.risk[lang]}</Notice>}
    {card.handler === "queued" && <Notice tone="info">{["provider", "unclear", "limit"].includes(card.transfer_reason ?? "") && FRONTLINE.fallback[lang]} {FRONTLINE.queued[lang]} {contentPack(card.fault)?.hint[lang] ?? FRONTLINE.inPerson[lang]}</Notice>}
    {card.handler === "human" && <Notice tone="info">{FRONTLINE.connected[lang]}</Notice>}
    {warning && <Notice tone="warn">{warning}</Notice>}
    <p className="text-sm leading-6">{FRONTLINE.disclosure[lang]}</p>
    {!started ? <Button disabled={busy} onClick={() => submit("start")}>{ai ? FRONTLINE.start[lang] : FRONTLINE.write[lang]}</Button> : <>
      <Notice>{pack.neverAsk[lang]}</Notice>
      {pack.scope && <Notice>{pack.scope[lang]}</Notice>}
      {turns.filter((t) => t.words).map((t) => <p key={t.seq} lang={t.locale} className="border-l-2 pl-3">{t.words}</p>)}
      <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); void submit("text", { text }); }}>
        <label htmlFor="frontline-message">{UI.whatHappened[lang]}</label>
        <Textarea id="frontline-message" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />
        <Button disabled={busy || !text.trim()}>{UI.send[lang]}</Button>
      </form>
      {card.confirmed_rev === null && <>
        {ai && readback && <p>{FRONTLINE.readback[lang]}</p>}
        {suggestions.map((flag) => <Button key={flag} variant="secondary" disabled={busy} onClick={() => submit("tap", { flag,on:true })}>{CALLER_FLAGS[flag].label[lang]}</Button>)}
        {pack.atm && <ReadBack lang={lang} draft={{ ...draft, words: null }} busy={busy} onAnswer={(key,value) => submit("facts",{ key,value })} />}
        <CallerFlags card={card} lang={lang} submit={(flag,on) => submit("tap",{ flag,on })} />
        <Button disabled={busy || !ready} onClick={() => submit("confirm")}>{UI.confirm[lang]}</Button>
      </>}
      {ai && draft.rev > 0 && <div className="flex gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => submit("change")}>{FRONTLINE.change[lang]}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => submit("unsure")}>{ANSWER.unknown[lang]}</Button>
      </div>}
    </>}
    {note && <Notice tone="warn">{note}</Notice>}
  </section>;
}
