"use client";
import { useState } from "react";
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
      className={cn("h-10 rounded-lg border px-3 text-[14px] transition-colors", prefs[k] ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-accent")}>
      {label}
    </button>
  );
  return <div className="grid grid-cols-2 gap-2">{toggle("large", FAULT_UI.largeText[lang])}{toggle("slow", FAULT_UI.slowVoice[lang])}</div>;
}
