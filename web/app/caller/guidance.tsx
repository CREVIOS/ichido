"use client";
import { useEffect, useState } from "react";
import { CircleCheck, Frown, Meh, Smile, Volume2 } from "lucide-react";
import { cmd } from "@/lib/supabase";
import { Notice } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FIELD_STATE, LANG_LOCALE, RATING, RATINGS, STATUS, UI, errorText, etaText, replyOf, type Lang } from "@/content/catalogue";
import type { CallerCase, Reply } from "./types";

// Whether the device has a speech voice for this language (Bengali often has none).
function useHasVoice(lang: Lang) {
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const check = () => setHas(window.speechSynthesis.getVoices().some((v) => v.lang.startsWith(lang)));
    const t = setTimeout(check, 0);
    window.speechSynthesis.addEventListener("voiceschanged", check);
    return () => { clearTimeout(t); window.speechSynthesis.removeEventListener("voiceschanged", check); };
  }, [lang]);
  return has;
}

export function Guidance({ lang, card, reply }: { lang: Lang; card: CallerCase; reply: Reply }) {
  const r = replyOf(reply.intent);
  const text = r ? r.text(reply.slots)[lang] : errorText("server", lang);
  const done = card.teachback_result === "understood";
  const [note, setNote] = useState("");
  const act = (name: string, body: Record<string, unknown> = {}) => cmd(name, body).then(() => setNote("")).catch((e: Error) => setNote(errorText(e.message, lang)));
  const hasVoice = useHasVoice(lang);
  const speak = () => { const u = new SpeechSynthesisUtterance(text); u.lang = LANG_LOCALE[lang]; window.speechSynthesis.speak(u); };

  return (
    <>
      <div className="flex flex-col gap-3">
        <span className="text-[13px] text-muted-foreground">{UI.approved[lang]}</span>
        <p className="text-[22px] leading-[1.45] tracking-[-0.01em] text-foreground">{text}</p>
        {hasVoice && !card.text_only && <Button variant="secondary" className="self-start" onClick={speak}><Volume2 className="stroke-[1.5]" />{UI.listen[lang]}</Button>}
      </div>
      {note && <Notice tone="warn">{note}</Notice>}
      {card.field_state !== "none" && (
        <section className="surface flex flex-col gap-1 p-4">
          <span className="text-[17px] text-foreground">{FIELD_STATE[card.field_state][lang]}</span>
          {card.field_state === "on_way" && <span className="text-[14px]">{etaText(card.eta, lang)}</span>}
        </section>
      )}
      {r?.offersChoice && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] text-muted-foreground">{UI.waitOrLeave[lang]}</span>
          <div className="grid grid-cols-2 gap-2">
            {(["wait", "leave"] as const).map((c) => (
              <button key={c} type="button" disabled={done} aria-pressed={card.choice === c} onClick={() => act("choose", { choice: c })}
                className={cn("h-12 rounded-lg border text-[16px] transition-colors disabled:opacity-60", card.choice === c ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-accent")}>
                {UI[c][lang]}
              </button>
            ))}
          </div>
        </div>
      )}
      <TeachBack lang={lang} card={card} onNote={setNote} />
    </>
  );
}

function TeachBack({ lang, card, onNote }: { lang: Lang; card: CallerCase; onNote: (n: string) => void }) {
  const [teach, setTeach] = useState("");
  if (card.teachback_result === "understood") return (
    <>
      <section className="flex items-center gap-2.5 rounded-xl bg-[oklch(0.96_0.04_155)] p-4 text-[17px] text-[oklch(0.4_0.1_155)]">
        <CircleCheck className="size-5 stroke-[1.5]" />{STATUS.guided[lang]}
      </section>
      <Rate lang={lang} rating={card.rating} onNote={onNote} />
    </>
  );
  if (card.teachback) return <p className="text-[14px]">{UI.teachBackSent[lang]}</p>;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    cmd<{ withheld?: boolean }>("teachback", { text: teach }).then((x) => onNote(x.withheld ? UI.numbersWithheld[lang] : "")).catch((er: Error) => onNote(errorText(er.message, lang)));
  };
  return (
    <form className="surface flex flex-col gap-2 p-3" onSubmit={submit}>
      <label className="px-1 text-[13px] text-muted-foreground" htmlFor="teach">{UI.teachBack[lang]}</label>
      {card.teachback_result === "clarify" && <p className="px-1 text-[14px]">{UI.clarify[lang]}</p>}
      <Textarea id="teach" value={teach} onChange={(e) => setTeach(e.target.value)} maxLength={500} className="min-h-20 resize-none border-0 bg-transparent px-1 text-[16px] shadow-none focus-visible:ring-0" />
      <div className="flex justify-end"><Button type="submit" disabled={!teach.trim()}>{UI.send[lang]}</Button></div>
    </form>
  );
}

const FACE = { 3: Smile, 2: Meh, 1: Frown } as const;

// Three faces after a guided close; one tap, no text, counted in insights.
function Rate({ lang, rating, onNote }: { lang: Lang; rating: number | null; onNote: (n: string) => void }) {
  if (rating) return <p className="text-[14px]">{UI.rateThanks[lang]}</p>;
  return (
    <section className="flex flex-col gap-2.5">
      <span className="text-[13px] text-muted-foreground">{UI.rateTitle[lang]}</span>
      <div className="grid grid-cols-3 gap-2">
        {RATINGS.map((r) => {
          const Icon = FACE[r];
          return (
            <button key={r} type="button" onClick={() => cmd("rate", { rating: r }).catch((e: Error) => onNote(errorText(e.message, lang)))}
              className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border bg-card text-[14px] text-foreground transition-colors hover:bg-accent">
              <Icon className="size-6 stroke-[1.5]" />{RATING[r][lang]}
            </button>
          );
        })}
      </div>
    </section>
  );
}
