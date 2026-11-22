import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Tinted status pill: colour carries the state, the word carries the meaning.
const TINT: Record<string, string> = {
  received: "bg-[oklch(0.97_0.035_80)] text-[oklch(0.5_0.1_70)]",
  review: "bg-[oklch(0.96_0.025_250)] text-[oklch(0.48_0.12_255)]",
  field: "bg-[oklch(0.96_0.03_295)] text-[oklch(0.48_0.13_295)]",
  guided: "bg-[oklch(0.96_0.04_150)] text-[oklch(0.45_0.1_150)]",
  alert: "bg-[oklch(0.96_0.025_25)] text-[oklch(0.52_0.15_25)]",
  neutral: "bg-secondary text-soft",
};
export const Pill = ({ tone, children, className }: { tone: string; children: ReactNode; className?: string }) => (
  <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-[13px] whitespace-nowrap", TINT[tone] ?? TINT.neutral, className)}>{children}</span>
);

// Segmented score bar, as in a ranked table: filled segments out of `of`, coloured by tier.
export function SegBar({ value, of = 6, label }: { value: number; of?: number; label?: ReactNode }) {
  const tier = value / of >= 0.8 ? "bg-[oklch(0.7_0.15_150)]" : value / of >= 0.5 ? "bg-[oklch(0.8_0.14_85)]" : "bg-[oklch(0.68_0.17_25)]";
  return (
    <span className="inline-flex items-center gap-3">
      <span className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: of }, (_, i) => <span key={i} className={cn("h-[3px] w-2.5 rounded-full", i < value ? tier : "bg-foreground/10")} />)}
      </span>
      {label != null && <span className="num text-[13px] text-muted-foreground">{label}</span>}
    </span>
  );
}
