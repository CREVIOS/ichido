"use client";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANGS, LANG_NAME, UI, type Lang } from "@/content/catalogue";

// One compact picker: the current language, the rest in a list. Each name is written in its own script.
export function LangSelect({ value, onChange, className }: { value: Lang; onChange: (l: Lang) => void; className?: string }) {
  return (
    <label className={cn("inline-flex min-h-12 items-center gap-2 rounded-lg bg-secondary px-3", className)}>
      <Languages aria-hidden className="size-5" />
      <select aria-label={UI.language[value]} className="min-h-12 bg-transparent text-base" value={value} onChange={(e) => onChange(e.target.value as Lang)}>
        {LANGS.map((l) => <option key={l} value={l} lang={l}>{LANG_NAME[l]}</option>)}
      </select>
    </label>
  );
}

// The phone's preferred caller language, falling back to Bengali.
export function preferredLang(): Lang {
  if (typeof navigator === "undefined") return "bn";
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split("-")[0] as Lang;
    if ((LANGS as readonly string[]).includes(base)) return base;
  }
  return "bn";
}
