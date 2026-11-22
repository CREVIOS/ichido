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

export type Series = { name: string; color: string; values: (number | null)[] };

// Line chart with point markers, horizontal gridlines and a left value axis.
export function LineChart({ series, labels, height = 300, format = (n: number) => String(n), compact }: {
  series: Series[]; labels: string[]; height?: number; format?: (n: number) => string; compact?: boolean;
}) {
  const w = 640;
  const left = compact ? 4 : 44;
  const pad = 10;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  // Round the axis to a clean step (1, 2, 5 × 10ⁿ) so ticks read as whole numbers.
  const raw = Math.max(1, ...all);
  const mag = 10 ** Math.floor(Math.log10(raw / 4));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((k) => k >= raw / 4) ?? raw / 4;
  const max = Math.max(step, Math.ceil(raw / step) * step);
  const n = Math.max(1, labels.length - 1);
  const x = (i: number) => left + (i / n) * (w - left - pad);
  const y = (v: number) => pad + (1 - v / max) * (height - pad * 2);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => (i * step) / max);
  const every = Math.ceil(labels.length / 6);
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full overflow-visible" role="img"
        aria-label={series.map((s) => `${s.name}: ${s.values.map((v, i) => `${labels[i]} ${v ?? "—"}`).join(", ")}`).join("; ")}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={w - pad} y1={y(max * t)} y2={y(max * t)} stroke="currentColor" strokeOpacity="0.07" />
            {!compact && <text x={left - 8} y={y(max * t) + 3} textAnchor="end" className="fill-current text-[10px]" fillOpacity="0.45">{format(Math.round(max * t))}</text>}
          </g>
        ))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)] as const)).filter((p): p is readonly [number, number] => p != null);
          return (
            <g key={s.name}>
              <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth={compact ? 1.5 : 1.75} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map(([px, py]) => <circle key={`${px}`} cx={px} cy={py} r={compact ? 2 : 3} fill={s.color} />)}
            </g>
          );
        })}
      </svg>
      {!compact && <div className="flex justify-between pl-11 text-[11px] text-muted-foreground">{labels.filter((_, i) => i % every === 0).map((l) => <span key={l}>{l}</span>)}</div>}
      <div className="flex gap-4 text-[11px] text-muted-foreground">
        {series.map((s) => <span key={s.name} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: s.color }} />{s.name}</span>)}
      </div>
    </div>
  );
}

export const BLUE = "oklch(0.66 0.14 255)";
export const GREEN = "oklch(0.72 0.16 145)";
