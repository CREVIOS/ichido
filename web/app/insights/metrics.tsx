import type { ReactNode } from "react";
import { Big, Dots, Funnel, Meter } from "@/components/kit";
import { BLUE, GREEN, LineChart } from "@/components/charts";
import { DESK, FUNNEL, INSIGHTS, LANG_NAME, RATING, RATINGS, type Lang } from "@/content/catalogue";

export type Insights = {
  since: string;
  funnel: Record<string, number>;
  dispatched: number;
  abandoned: number;
  per_day: { day: string; n: number; guided: number; first_reply_s: number | null }[];
  per_hour: { hour: number; n: number }[];
  languages: Record<string, number>;
  median_first_reply_s: number | null;
  choices: Record<string, number>;
  ratings: Record<string, number>;
};

const HOURS_PER_SLOT = 2;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const dayLabel = (d: string) => new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
const minutes = (s: number | null) => (s == null ? null : Math.round((s / 60) * 10) / 10);

function daily(d: Insights, compact = false) {
  return <LineChart compact={compact} height={compact ? 120 : 320} labels={d.per_day.map((x) => dayLabel(x.day))}
    series={[{ name: INSIGHTS.series.received, color: BLUE, values: d.per_day.map((x) => x.n) }, { name: INSIGHTS.series.guided, color: GREEN, values: d.per_day.map((x) => x.guided) }]} />;
}

function slots(d: Insights) {
  return Array.from({ length: d.per_hour.length / HOURS_PER_SLOT }, (_, i) => ({
    hour: i * HOURS_PER_SLOT,
    n: d.per_hour.slice(i * HOURS_PER_SLOT, (i + 1) * HOURS_PER_SLOT).reduce((sum, h) => sum + h.n, 0),
  }));
}

function Meters({ rows }: { rows: { label: string; value: number; shown: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {rows.length === 0 && <span className="text-[14px] text-muted-foreground">{INSIGHTS.noData}</span>}
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-2">
          <span className="flex justify-between text-[15px]"><span className="text-foreground">{r.label}</span><span className="num">{r.shown}</span></span>
          <Meter value={r.value} max={max} />
        </div>
      ))}
    </div>
  );
}

const centre = (n: ReactNode, sub?: ReactNode) => <span className="flex flex-col items-center gap-1"><Big className="text-[30px]">{n}</Big>{sub && <span className="text-[12px] text-muted-foreground">{sub}</span>}</span>;

export const METRICS = {
  daily: { card: (d: Insights) => daily(d, true), detail: (d: Insights) => daily(d) },
  funnel: {
    card: (d: Insights) => centre(INSIGHTS.count(d.funnel.received ?? 0), `${INSIGHTS.guidedRate} ${pct(d.funnel.guided ?? 0, d.funnel.received ?? 0)}%`),
    detail: (d: Insights) => (
      <div className="flex flex-col gap-6">
        <Funnel steps={FUNNEL.map((s) => ({ label: s.ja, value: d.funnel[s.key] ?? 0 }))} conversion={INSIGHTS.conversion} unit={INSIGHTS.count} />
        <div className="grid max-w-2xl gap-x-8 gap-y-1.5 text-[14px] sm:grid-cols-2">
          <span className="flex justify-between border-t pt-1.5"><span>{INSIGHTS.dispatched}</span><span className="num text-foreground">{INSIGHTS.count(d.dispatched)}</span></span>
          <span className="flex justify-between border-t pt-1.5"><span>{INSIGHTS.abandoned}</span><span className="num text-foreground">{INSIGHTS.count(d.abandoned)}</span></span>
        </div>
      </div>
    ),
  },
  reply: {
    card: (d: Insights) => centre(d.median_first_reply_s == null ? "—" : INSIGHTS.duration(d.median_first_reply_s)),
    detail: (d: Insights) => (
      <div className="flex flex-col gap-6">
        <Big>{d.median_first_reply_s == null ? "—" : INSIGHTS.duration(d.median_first_reply_s)}</Big>
        <LineChart height={280} labels={d.per_day.map((x) => dayLabel(x.day))} format={(n) => `${n}`}
          series={[{ name: INSIGHTS.series.reply, color: BLUE, values: d.per_day.map((x) => minutes(x.first_reply_s)) }]} />
      </div>
    ),
  },
  langs: {
    card: (d: Insights) => centre(Object.keys(d.languages).filter((l) => l !== "none").map((l) => LANG_NAME[l as Lang]).join(" · ") || "—"),
    detail: (d: Insights) => <Meters rows={Object.entries(d.languages).sort((a, b) => b[1] - a[1]).map(([l, n]) => ({ label: LANG_NAME[l as Lang] ?? INSIGHTS.noLang, value: n, shown: INSIGHTS.count(n) }))} />,
  },
  hours: {
    card: (d: Insights) => { const s = slots(d); const p = s.reduce((b, h) => (h.n > b.n ? h : b), { hour: 0, n: 0 }); return centre(p.n ? INSIGHTS.hourRange(p.hour, p.hour + HOURS_PER_SLOT) : "—", INSIGHTS.peak); },
    detail: (d: Insights) => {
      const s = slots(d);
      return (
        <div className="flex max-w-2xl flex-col gap-3">
          <Dots values={s.map((h) => h.n)} labels={s.map((h) => INSIGHTS.hour(h.hour))} maxDots={8} />
          <div className="flex justify-between text-[11px] text-muted-foreground">{s.filter((_, i) => i % 3 === 0).map((h) => <span key={h.hour}>{INSIGHTS.hour(h.hour)}</span>)}</div>
        </div>
      );
    },
  },
  choices: {
    card: (d: Insights) => { const t = (d.choices.wait ?? 0) + (d.choices.leave ?? 0); return centre(`${pct(d.choices.wait ?? 0, t)}% / ${pct(d.choices.leave ?? 0, t)}%`, Object.values(DESK.choiceText).join(" / ")); },
    detail: (d: Insights) => {
      const t = (d.choices.wait ?? 0) + (d.choices.leave ?? 0);
      return <Meters rows={Object.keys(DESK.choiceText).map((k) => ({ label: DESK.choiceText[k], value: d.choices[k] ?? 0, shown: `${pct(d.choices[k] ?? 0, t)}%` }))} />;
    },
  },
  ratings: {
    card: (d: Insights) => { const t = RATINGS.reduce((n, r) => n + (d.ratings[r] ?? 0), 0); return centre(t ? `${pct(d.ratings[3] ?? 0, t)}%` : "—", RATING[3].ja); },
    detail: (d: Insights) => {
      const t = RATINGS.reduce((n, r) => n + (d.ratings[r] ?? 0), 0);
      return <Meters rows={RATINGS.map((r) => ({ label: RATING[r].ja, value: d.ratings[r] ?? 0, shown: `${INSIGHTS.count(d.ratings[r] ?? 0)} · ${pct(d.ratings[r] ?? 0, t)}%` }))} />;
    },
  },
} satisfies Record<string, { card: (d: Insights) => ReactNode; detail: (d: Insights) => ReactNode }>;

export type MetricKey = keyof typeof METRICS;
