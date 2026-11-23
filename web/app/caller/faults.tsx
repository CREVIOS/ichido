"use client";
import type { FollowUpCase } from "@/content/caller-session";
import { Human } from "./human";
import { Fragment, useState } from "react";
import { Check } from "lucide-react";
import { cmd } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Phone } from "@/components/phone";
import { Notice } from "@/components/kit";
import { LangSelect } from "@/components/lang-select";
import { cn } from "@/lib/utils";
import { CALLER_FLAGS, FAULTS, FAULT_UI, GROUP_TITLE, JOURNEY, CONSULTATION, UI, bankStatusText, errorText, exclusiveOff, flagsFor, packOfFault, pick, sentText, urgentText, type Lang } from "@/content/catalogue";
import { PrefsBar, type Prefs } from "./prefs";
import type { CallerCase } from "./types";

// The caller's own taps: what happened and who is with them. Each tap is their statement, shown to the operator as is.
// A pack groups its taps under headings (who, where, since when, how much it hurts…); a one-answer group turns the
// others off. A red-flag tap shows the pack's urgent approved text at once, the same words the operator would send.
// One tap as the caller's own statement: a one-answer group turns its other answers off first.
export async function tapFlag(flags: readonly string[], flag: string, on: boolean) {
  for (const f of on ? exclusiveOff(flag, flags) : []) await cmd("flag", { flag: f, on: false });
  await cmd("flag", { flag, on });
}

export function CallerFlags({ card, lang, submit }: { card: CallerCase; lang: Lang; submit?: (flag: string, on: boolean) => Promise<void> }) {
  const [note, setNote] = useState("");
  const tap = async (flag: string, on: boolean) => {
    try {
      if (submit) await submit(flag, on);
      else await tapFlag(card.flags, flag, on);
      setNote("");
    } catch (e) { setNote(errorText((e as Error).message, lang)); }
  };
  const taps = flagsFor(card.fault, card.flags);
  const urgent = urgentText(card.fault, card.flags, lang);
  return (
    <section className="flex flex-col gap-2.5">
      {urgent && <p role="alert" className="rounded-xl border border-alert bg-[oklch(0.98_0.02_25)] p-4 text-[17px] leading-7 text-foreground">{urgent}</p>}
      {taps.map((f, i) => {
        const on = card.flags.includes(f);
        const g = CALLER_FLAGS[f].group;
        const heading = i === 0 || g !== CALLER_FLAGS[taps[i - 1]].group ? (g && GROUP_TITLE[g]) ?? FAULT_UI.flagsTitle : null;
        return (
          <Fragment key={f}>
            {heading && <span className={cn("text-[13px] text-muted-foreground", i > 0 && "pt-2")}>{heading[lang]}</span>}
            <button type="button" aria-label={`${((g && GROUP_TITLE[g]) || FAULT_UI.flagsTitle)[lang]} — ${CALLER_FLAGS[f].label[lang]}`} aria-pressed={on} onClick={() => tap(f, !on)}
              className={cn("flex min-h-12 items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-[15px] leading-6 transition-colors", on ? "border-primary bg-primary text-primary-foreground" : CALLER_FLAGS[f].urgent ? "border-alert/50 bg-card text-foreground hover:bg-accent" : "bg-card text-foreground hover:bg-accent")}>
              <Check className={cn("size-4 shrink-0 stroke-[1.5]", on ? "opacity-100" : "opacity-0")} />{CALLER_FLAGS[f].label[lang]}
            </button>
          </Fragment>
        );
      })}
      <div role="status">{note && <Notice tone="warn">{note}</Notice>}</div>
    </section>
  );
}

// The bank's latest status, in the caller's language; stays on the page after the case closes.
export function BankStatus({ status, due, lang }: { status: string | null; due: string | null; lang: Lang }) {
  return (
    <section className="surface flex flex-col gap-1.5 p-4">
      <span className="text-[13px] text-muted-foreground">{FAULT_UI.bankTitle[lang]}</span>
      <span className="text-[17px] leading-7 text-foreground">{status ? bankStatusText(status, due, lang) : FAULT_UI.bankNone[lang]}</span>
    </section>
  );
}

// After the two-hour pairing has expired: the closed case, what the caller was told, and the bank's status.
export type Sync = { offline:boolean; updated?: Date; retry:() => void };
export function SyncStatus({sync, lang}: {sync:Sync;lang:Lang}) {
  return <>{sync.offline && <div role="status"><Notice>{JOURNEY.offline[lang]}</Notice><Button onClick={sync.retry}>{JOURNEY.retry[lang]}</Button></div>}
    {sync.updated && <small>{JOURNEY.updated[lang]} · {sync.updated.toLocaleTimeString(lang)}</small>}</>;
}
export function FollowUp({ f, prefs, onPrefs, sync }: { sync:Sync; f: FollowUpCase; prefs: Prefs; onPrefs: (p: Prefs) => void }) {
  const [chosen, setLang] = useState<Lang | null>(null);
  const lang = chosen ?? f.lang ?? "bn";
  const told = f.reply && (sentText(f.reply, lang) ?? errorText("server",lang));
  return (
    <Phone lang={lang} large={prefs.large} right={<LangSelect value={lang} onChange={setLang} />}>
      <Human lang={lang} />
      <SyncStatus sync={sync} lang={lang} />
      <PrefsBar prefs={prefs} onChange={onPrefs} lang={lang} />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">{pick(f.station?.label, lang)} · {pick(FAULTS[f.fault], lang)}</span>
        <h1 className="text-[24px] leading-snug">{FAULT_UI.followTitle[lang]}</h1>
        <p className="text-[15px] leading-6">{FAULT_UI.followLead[lang]}</p>
      </div>
      {packOfFault(f.fault) === "atm" && <BankStatus status={(f.bank_status === "contact_by" || f.bank_status === "contacted") && !f.callback_channel ? null : f.bank_status} due={f.bank_due} lang={lang} />}
      {told && (
        <section className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted-foreground">{FAULT_UI.lastReply[lang]}</span>
          <p className="text-[16px] leading-7 text-foreground">{told}</p>
        </section>
      )}
      <details className="surface p-4"><summary>{JOURNEY.receipt[lang]}</summary><div>
        <span className="text-[12px] opacity-60">{UI.caseNo[lang]}</span>
        <span className="font-mono text-[20px]">{f.id.slice(0, 8)}</span>
      </div></details>
      <p>{pick(f.station?.branch,lang)} · {pick(f.station?.counter_hours,lang)}</p>
      <p className="text-[12px] leading-5 text-muted-foreground">{UI.helpDesk[lang]} {CONSULTATION.phone} · {CONSULTATION.email}</p>
    </Phone>
  );
}
