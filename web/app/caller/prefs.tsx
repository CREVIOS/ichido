"use client";
import { useState } from "react";
import { Settings2, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CHAT } from "@/content/chat";
import { cn } from "@/lib/utils";
import { FAULT_UI, type Lang } from "@/content/catalogue";

// Elderly-friendly settings, kept on this phone only. Storage can be blocked (private mode, strict settings):
// then the toggles still work for this visit.
export type Prefs = { large: boolean; slow: boolean };
const KEY = "ichido.caller.prefs";
const DEFAULT: Prefs = { large: false, slow: false };

function read(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Prefs> | null;
    return { large: v?.large === true, slow: v?.slow === true };
  } catch {
    return DEFAULT;   // no storage on the server or when blocked
  }
}

export function usePrefs(): [Prefs, (p: Prefs) => void] {
  const [prefs, setPrefs] = useState<Prefs>(read);
  const set = (p: Prefs) => {
    setPrefs(p);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* blocked storage: this visit only, as above */ }
  };
  return [prefs, set];
}

// Slower speech for the read-aloud button.
export const speechRate = (p: Prefs) => (p.slow ? 0.7 : 1);

export function PrefsBar({ prefs, onChange, lang }: { prefs: Prefs; onChange: (p: Prefs) => void; lang: Lang }) {
  const toggle = (k: keyof Prefs, label: string) => (
    <button type="button" aria-pressed={prefs[k]} onClick={() => onChange({ ...prefs, [k]: !prefs[k] })}
      className={cn("min-h-11 rounded-lg border px-3 text-[14px] transition-colors", prefs[k] ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-accent")}>
      {label}
    </button>
  );
  return <Sheet><SheetTrigger aria-label={CHAT.settings[lang]} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-secondary"><Settings2 size={20} /></SheetTrigger>
    <SheetContent side="bottom" lang={lang} showCloseButton={false} className="mx-auto max-w-lg rounded-t-2xl px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between"><SheetTitle>{CHAT.settings[lang]}</SheetTitle>
        <SheetClose aria-label={CHAT.settings[lang]} className="grid size-11 place-items-center"><X size={20} /></SheetClose></div>
      {toggle("large", FAULT_UI.largeText[lang])}{toggle("slow", FAULT_UI.slowVoice[lang])}
    </SheetContent></Sheet>;
}
