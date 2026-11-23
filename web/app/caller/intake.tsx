"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { cmd } from "@/lib/supabase";
import { VoiceIntake, type SignedSpeech } from "@/components/VoiceIntake";
import { Notice } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ACCESS, ANSWER, CALLER_FLAGS, FACTS, FACT_KEYS, STATUS, UI, callerPack, contentPack, errorText, type Fact, type Lang } from "@/content/catalogue";
import { CallerFlags, tapFlag } from "./faults";
import type { CallerCase, Draft, Triage } from "./types";

// textOnly: the caller cannot hear or speak, so no voice and no "use the handset" hints.
// An ATM caller confirms the read-back of two facts; any other pack's caller confirms their own taps (content/packs).
export function Intake({ lang, draft, card }: { lang: Lang; draft: Draft; card: CallerCase }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState<SignedSpeech | null>(null);
  const P = callerPack(card.fault);
  const textOnly = card.text_only;

  async function send(body: Record<string, unknown>) {
    setBusy(true); setNote("");
    try {
      const r = await cmd<{ withheld?: boolean; say?: SignedSpeech | null }>("draft", { base_rev: draft.rev, ...body });
      if (r.withheld) setNote(UI.numbersWithheld[lang]);
      else { setText(""); setSay(r.say ?? null); }
    } catch (e) {
      setNote(errorText((e as Error).message, lang));
    } finally { setBusy(false); }
  }
  const fail = (e: Error) => setNote(errorText(e.message, lang));
  const ready = P.atm ? FACT_KEYS.some((k) => draft[k] !== "unknown") : card.flags.length > 0;

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-[24px] leading-snug">{UI.aiNotice[lang]}</h1>
        <Notice>{P.neverAsk[lang]}</Notice>
        {P.scope && <Notice>{P.scope[lang]}</Notice>}
      </div>
      {!P.atm && <CallerFlags card={card} lang={lang} />}
      {!textOnly && <VoiceIntake lang={lang} onFinal={(t) => send({ text: t })} say={say} />}
      <form className="surface flex flex-col gap-2 p-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send({ text }); }}>
        <label className="px-1 text-[13px] text-muted-foreground" htmlFor="what">{UI.whatHappened[lang]}</label>
        <Textarea id="what" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} className="min-h-20 resize-none border-0 bg-transparent px-1 text-[16px] shadow-none focus-visible:ring-0" />
        <div className="flex justify-end"><Button type="submit" disabled={busy || !text.trim()}>{UI.send[lang]}</Button></div>
      </form>
      {note && <Notice tone="warn">{note}</Notice>}
      {draft.needs_clarification && <Notice tone="info">{UI.unsure[lang]}</Notice>}
      {P.atm ? <ReadBack lang={lang} draft={draft} busy={busy} onAnswer={(k, v) => send({ [k]: v })} />
        : draft.words && <p className="border-l-2 pl-3 text-[15px] leading-6">{draft.words}</p>}
      {!P.atm && draft.triage && <TriageReadBack lang={lang} card={card} triage={draft.triage} onError={fail} />}
      <Button size="lg" className="h-11" disabled={busy || !ready} onClick={() => cmd("confirm", { rev: draft.rev }).catch(fail)}>{UI.confirm[lang]}</Button>

    </>
  );
}

export function ReadBack({ lang, draft, busy, onAnswer }: { lang: Lang; draft: Draft; busy: boolean; onAnswer: (k: string, v: Fact) => void }) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted-foreground">{UI.understood[lang]}</span>
        {draft.rev > 0 && <span className="mono text-faint">v{draft.rev}</span>}
      </div>
      {draft.words && <p className="border-l-2 pl-3 text-[15px] leading-6">{draft.words}</p>}
      {FACT_KEYS.map((k) => (
        <div key={k} className="flex flex-col gap-2.5">
          <span className="text-[17px] text-foreground">{FACTS[k].question[lang]}</span>
          <div className="grid grid-cols-3 gap-1.5">
            {(["yes", "no", "unknown"] as Fact[]).map((v) => (
              <button key={v} type="button" disabled={busy} aria-pressed={draft[k] === v} onClick={() => onAnswer(k, v)}
                className={cn("h-11 rounded-lg border text-[15px] transition-colors disabled:opacity-50", draft[k] === v ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-accent")}>
                {ANSWER[v][lang]}
              </button>
            ))}
          </div>
          {draft[k] !== "unknown" && <span className="flex items-center gap-1.5 text-[14px] text-foreground"><Check className="size-4 stroke-[1.5] text-ok" />{FACTS[k][draft[k]][lang]}</span>}
        </div>
      ))}
    </section>
  );
}

// The AI's reading of a pack caller's words, as the pack's own taps: each one counts only when the caller taps it.
// A red flag is never suggested as a fact: it is asked, with the tap's approved wording, and the caller answers.
function TriageReadBack({ lang, card, triage, onError }: { lang: Lang; card: CallerCase; triage: Triage; onError: (e: Error) => void }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const p = contentPack(card.fault);
  if (!p) return null;
  const need = triage.situation ? Object.keys(p.taps).find((t) => p.taps[t].suggests === triage.situation) : undefined;
  const open = (t: string) => !card.flags.includes(t) && !dismissed.includes(t) && Object.hasOwn(CALLER_FLAGS, t);
  const suggested = [...new Set([...(need ? [need] : []), ...triage.taps])].filter(open);
  const asks = triage.ask.filter(open);
  if (!suggested.length && !asks.length) return null;
  const tap = (t: string) => tapFlag(card.flags, t, true).catch(onError);
  const answer = (t: string, v: Fact) => (v === "yes" ? tap(t) : setDismissed((d) => [...d, t]));
  return (
    <section className="flex flex-col gap-2.5" aria-live="polite">
      <span className="text-[13px] text-muted-foreground">{UI.aiRead[lang]}</span>
      {asks.map((t) => (
        <div key={t} className="flex flex-col gap-2 rounded-xl border border-alert/50 p-3.5">
          <span className="text-[15px] text-foreground">{UI.aiAsk[lang]}</span>
          <span className="text-[17px] leading-7 text-foreground">{CALLER_FLAGS[t].label[lang]}</span>
          <div className="grid grid-cols-2 gap-1.5">
            {(["yes", "no"] as Fact[]).map((v) => <Button key={v} variant={v === "yes" ? "default" : "secondary"} className="h-11" onClick={() => answer(t, v)}>{ANSWER[v][lang]}</Button>)}
          </div>
        </div>
      ))}
      {suggested.map((t) => (
        <div key={t} className="flex min-h-12 items-center gap-3 rounded-lg border border-dashed px-3.5 py-2">
          <span className="flex-1 text-[15px] leading-6 text-foreground">{CALLER_FLAGS[t].label[lang]}</span>
          <Button size="sm" onClick={() => tap(t)}>{ANSWER.yes[lang]}</Button>
          <Button size="sm" variant="ghost" onClick={() => answer(t, "no")}>{ANSWER.no[lang]}</Button>
        </div>
      ))}
    </section>
  );
}

// No timers in the caller flow: the "find a person" hint is there from the start, so nobody has to wait for it.
export function Waiting({ lang, textOnly, fault }: { lang: Lang; textOnly: boolean; fault: string }) {
  return (
    <section className="surface flex flex-col gap-2 p-5">
      <span className="flex items-center gap-2 text-[18px] text-foreground"><span className="size-2 animate-pulse rounded-full bg-info" aria-hidden />{STATUS.review[lang]}</span>
      <p className="text-[14px] leading-6">{textOnly ? ACCESS.waiting[lang] : callerPack(fault).waiting(lang)}</p>
    </section>
  );
}
