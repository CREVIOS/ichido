"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { cmd } from "@/lib/supabase";
import { VoiceIntake, type SignedSpeech } from "@/components/VoiceIntake";
import { Notice } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ACCESS, ANSWER, FACTS, FACT_KEYS, STATUS, UI, errorText, type Fact, type Lang } from "@/content/catalogue";
import type { Draft } from "./types";

// textOnly: the caller cannot hear or speak, so no voice and no "use the handset" hints.
export function Intake({ lang, draft, needsHuman, textOnly }: { lang: Lang; draft: Draft; needsHuman: boolean; textOnly: boolean }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState<SignedSpeech | null>(null);

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
  const known = FACT_KEYS.filter((k) => draft[k] !== "unknown");

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-[24px] leading-snug">{UI.aiNotice[lang]}</h1>
        <Notice>{UI.neverAsk[lang]}</Notice>
      </div>
      {!textOnly && <VoiceIntake lang={lang} onFinal={(t) => send({ text: t })} say={say} />}
      <form className="surface flex flex-col gap-2 p-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send({ text }); }}>
        <label className="px-1 text-[13px] text-muted-foreground" htmlFor="what">{UI.whatHappened[lang]}</label>
        <Textarea id="what" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} className="min-h-20 resize-none border-0 bg-transparent px-1 text-[16px] shadow-none focus-visible:ring-0" />
        <div className="flex justify-end"><Button type="submit" disabled={busy || !text.trim()}>{UI.send[lang]}</Button></div>
      </form>
      {note && <Notice tone="warn">{note}</Notice>}
      {draft.needs_clarification && <Notice tone="info">{UI.unsure[lang]}</Notice>}
      <ReadBack lang={lang} draft={draft} busy={busy} onAnswer={(k, v) => send({ [k]: v })} />
      <Button size="lg" className="h-11" disabled={busy || !known.length} onClick={() => cmd("confirm", { rev: draft.rev }).catch(fail)}>{UI.confirm[lang]}</Button>
      {needsHuman ? <Notice tone="info">{(textOnly ? ACCESS.humanAsked : UI.humanAsked)[lang]}</Notice>
        : <Button variant="secondary" size="lg" onClick={() => cmd("human").catch(fail)}>{UI.human[lang]}</Button>}
    </>
  );
}

function ReadBack({ lang, draft, busy, onAnswer }: { lang: Lang; draft: Draft; busy: boolean; onAnswer: (k: string, v: Fact) => void }) {
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

// No timers in the caller flow: the handset hint is there from the start, so nobody has to wait for it to appear.
export function Waiting({ lang, textOnly }: { lang: Lang; textOnly: boolean }) {
  return (
    <section className="surface flex flex-col gap-2 p-5">
      <span className="flex items-center gap-2 text-[18px] text-foreground"><span className="size-2 animate-pulse rounded-full bg-info" aria-hidden />{STATUS.review[lang]}</span>
      <p className="text-[14px] leading-6">{(textOnly ? ACCESS.waiting : UI.waiting)[lang]}</p>
    </section>
  );
}
