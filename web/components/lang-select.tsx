"use client";
import { Languages } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LANGS, LANG_NAME, UI, type Lang } from "@/content/catalogue";

// One compact picker: the current language, the rest in a list. Each name is written in its own script.
export function LangSelect({ value, onChange, className }: { value: Lang; onChange: (l: Lang) => void; className?: string }) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as Lang)}>
      <SelectTrigger aria-label={UI.language[value]} className={cn("h-8 gap-1.5 rounded-md border-0 bg-secondary px-2.5 text-[13px] text-foreground shadow-none", className)}>
        <Languages className="size-3.5 stroke-[1.5] text-muted-foreground" />
        <SelectValue>{(v: string) => <span lang={v}>{LANG_NAME[v as Lang]}</span>}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {LANGS.map((l) => <SelectItem key={l} value={l} lang={l} className="text-[14px]">{LANG_NAME[l]}</SelectItem>)}
      </SelectContent>
    </Select>
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
