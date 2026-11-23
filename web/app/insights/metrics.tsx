import type { ReactNode } from "react";
import { Big } from "@/components/kit";
import { DailyArea, Donut, FunnelBars, HourBars, ReplyLine } from "@/components/insight-charts";
import { FRONT_DESK, DESK, FUNNEL, INSIGHTS, LANG_NAME, OPS, unansweredLabel, PACKS, PACK_DESK, PACK_IDS, RATING, RATINGS, type Lang, type PackId, type ShiftCounts } from "@/content/catalogue";

export type Insights = ShiftCounts & {
  frontline:{started:number;resolved:number;open:number;abandoned:number;contact_p50:number|null;contact_p95:number|null;contact_n:number;
    recontact:number;mature:number;covered:number;escalations:Record<string,number>};
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
  targets: Partial<Record<string, number>>;
  bot: { records: number; claim_s: number | null; first_reply_s: number | null; guard_arrival_s: number | null; total_s: number | null };
  ops: {
    fraud: number; abusive: number; takeovers: number; mass_incidents: number; broadcasts: number; promises: number; promises_expired: number;
    captured: number; resolved_same_day: number; per_day: { day: string; captured: number; resolved: number }[];
  };
  packs: Partial<Record<PackId, { received: number; guided: number }>>;   // insights_packs(): counts per station type
};
const dur = (s: number | null) => (s == null ? "—" : INSIGHTS.duration(s));

const HOURS_PER_SLOT = 2;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const dayLabel = (d: string) => new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
const minutes = (s: number | null) => (s == null ? null : Math.round((s / 60) * 10) / 10);
const series = INSIGHTS.series;

const daily = (d: Insights, compact = false) => (
  <DailyArea compact={compact} labels={series} data={d.per_day.map((x) => ({ day: dayLabel(x.day), received: x.n, guided: x.guided }))} />
);

function slots(d: Insights) {
  return Array.from({ length: d.per_hour.length / HOURS_PER_SLOT }, (_, i) => ({
    hour: i * HOURS_PER_SLOT,
    n: d.per_hour.slice(i * HOURS_PER_SLOT, (i + 1) * HOURS_PER_SLOT).reduce((sum, h) => sum + h.n, 0),
  }));
}

const centre = (n: ReactNode, sub?: ReactNode) => <span className="flex flex-col items-center gap-1"><Big className="text-[30px]">{n}</Big>{sub && <span className="text-[12px] text-muted-foreground">{sub}</span>}</span>;
const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const Pair = ({ items }: { items: [string, string][] }) => (
  <div className="grid max-w-2xl gap-x-8 gap-y-1.5 text-[14px] sm:grid-cols-2">
    {items.map(([k, v]) => <span key={k} className="flex justify-between border-t pt-1.5"><span>{k}</span><span className="num text-foreground">{v}</span></span>)}
  </div>
);

export const METRICS = {
  daily: { card: (d: Insights) => daily(d, true), detail: (d: Insights) => daily(d) },
  funnel: {
    card: (d: Insights) => centre(INSIGHTS.count(d.funnel.received ?? 0), `${INSIGHTS.guidedRate} ${pct(d.funnel.guided ?? 0, d.funnel.received ?? 0)}%`),
    detail: (d: Insights) => (
      <div className="flex flex-col gap-6">
        <FunnelBars label={INSIGHTS.unit} data={FUNNEL.map((s, i) => {
          const v = d.funnel[s.key] ?? 0;
          const prev = i ? d.funnel[FUNNEL[i - 1].key] ?? 0 : 0;
          return { stage: s.ja, value: v, rate: i ? `${INSIGHTS.count(v)} · ${pct(v, prev)}%` : INSIGHTS.count(v) };
        })} />
        <Pair items={[[INSIGHTS.dispatched, INSIGHTS.count(d.dispatched)], [INSIGHTS.abandoned, INSIGHTS.count(d.abandoned)]]} />
      </div>
    ),
  },
  reply: {
    card: (d: Insights) => centre(d.median_first_reply_s == null ? "—" : INSIGHTS.duration(d.median_first_reply_s),unansweredLabel(d.unanswered)),
    detail: (d: Insights) => (
      <div className="flex flex-col gap-6">
        <Big>{d.median_first_reply_s == null ? "—" : INSIGHTS.duration(d.median_first_reply_s)}</Big>
        <ReplyLine label={series.reply} target={d.targets.no_reply != null ? d.targets.no_reply / 60 : undefined} targetLabel={d.targets.no_reply != null ? INSIGHTS.target(INSIGHTS.duration(d.targets.no_reply)) : ""}
          data={d.per_day.map((x) => ({ day: dayLabel(x.day), minutes: minutes(x.first_reply_s) }))} />
      </div>
    ),
  },
  langs: {
    card: (d: Insights) => {
      const [top] = Object.entries(d.languages).filter(([l]) => l !== "none").sort((a, b) => b[1] - a[1]);
      const all = total(Object.values(d.languages));
      return top ? centre(`${pct(top[1], all)}%`, LANG_NAME[top[0] as Lang]) : centre("—");
    },
    detail: (d: Insights) => {
      const rows = Object.entries(d.languages).sort((a, b) => b[1] - a[1]);
      return <Donut total={INSIGHTS.count(total(rows.map(([, n]) => n)))} totalLabel={INSIGHTS.received}
        data={rows.map(([l, n]) => ({ key: l, label: LANG_NAME[l as Lang] ?? INSIGHTS.noLang, value: n }))} />;
    },
  },
  hours: {
    card: (d: Insights) => { const s = slots(d); const p = s.reduce((b, h) => (h.n > b.n ? h : b), { hour: 0, n: 0 }); return centre(p.n ? INSIGHTS.hourRange(p.hour, p.hour + HOURS_PER_SLOT) : "—", INSIGHTS.peak); },
    detail: (d: Insights) => <HourBars label={INSIGHTS.unit} data={slots(d).map((h) => ({ slot: INSIGHTS.hour(h.hour), n: h.n }))} />,
  },
  choices: {
    card: (d: Insights) => { const t = (d.choices.wait ?? 0) + (d.choices.leave ?? 0); return centre(`${pct(d.choices.wait ?? 0, t)}% / ${pct(d.choices.leave ?? 0, t)}%`, Object.values(DESK.choiceText).join(" / ")); },
    detail: (d: Insights) => {
      const keys = Object.keys(DESK.choiceText);
      return <Donut total={INSIGHTS.count(total(keys.map((k) => d.choices[k] ?? 0)))} totalLabel={INSIGHTS.choices}
        data={keys.map((k) => ({ key: k, label: DESK.choiceText[k], value: d.choices[k] ?? 0 }))} />;
    },
  },
  ratings: {
    card: (d: Insights) => { const t = total(RATINGS.map((r) => d.ratings[r] ?? 0)); return centre(t ? `${pct(d.ratings[3] ?? 0, t)}%` : "—", RATING[3].ja); },
    detail: (d: Insights) => <Donut total={INSIGHTS.count(total(RATINGS.map((r) => d.ratings[r] ?? 0)))} totalLabel={INSIGHTS.metrics.ratings.title}
      data={RATINGS.map((r) => ({ key: `r${r}`, label: RATING[r].ja, value: d.ratings[r] ?? 0 }))} />,
  },
  bot: {
    card: (d: Insights) => centre(dur(d.bot.total_s), `${INSIGHTS.bot.total}・${INSIGHTS.bot.median}`),
    detail: (d: Insights) => (
      <div className="flex flex-col gap-6">
        <Big>{dur(d.bot.total_s)}</Big>
        <Pair items={[
          [INSIGHTS.bot.claim, dur(d.bot.claim_s)], [INSIGHTS.bot.reply, dur(d.bot.first_reply_s)],
          [INSIGHTS.bot.guard, dur(d.bot.guard_arrival_s)], [INSIGHTS.bot.records, INSIGHTS.count(d.bot.records)],
        ]} />
      </div>
    ),
  },
  packs: {
    card: (d: Insights) => {
      const beyond = PACK_IDS.filter((p) => p !== "atm").reduce((a, p) => a + (d.packs[p]?.received ?? 0), 0);
      return centre(INSIGHTS.count(total(PACK_IDS.map((p) => d.packs[p]?.received ?? 0))), `${PACK_IDS.filter((p) => p !== "atm").map((p) => PACKS[p].name.staff).join("・")} ${INSIGHTS.count(beyond)}`);
    },
    detail: (d: Insights) => (
      <div className="flex flex-col gap-6">
        <Donut total={INSIGHTS.count(total(PACK_IDS.map((p) => d.packs[p]?.received ?? 0)))} totalLabel={INSIGHTS.received}
          data={PACK_IDS.map((p) => ({ key: p, label: PACKS[p].name.staff, value: d.packs[p]?.received ?? 0 }))} />
        <Pair items={PACK_IDS.map((p) => [PACKS[p].name.staff, `${PACK_DESK.insights.received} ${INSIGHTS.count(d.packs[p]?.received ?? 0)}・${PACK_DESK.insights.guided} ${pct(d.packs[p]?.guided ?? 0, d.packs[p]?.received ?? 0)}%`])} />
      </div>
    ),
  },
  ops: {
    card: (d: Insights) => centre(INSIGHTS.count(d.ops.fraud), OPS.insights.fraud),
    detail: (d: Insights) => (
      <div className="flex flex-col gap-6">
        <DailyArea labels={{ received: OPS.insights.captured, guided: OPS.insights.resolved }}
          data={d.ops.per_day.map((x) => ({ day: dayLabel(x.day), received: x.captured, guided: x.resolved }))} />
        <Pair items={[
          [OPS.insights.captured, INSIGHTS.count(d.ops.captured)], [OPS.insights.resolved, INSIGHTS.count(d.ops.resolved_same_day)],
          [OPS.insights.fraud, INSIGHTS.count(d.ops.fraud)], [OPS.insights.mass, INSIGHTS.count(d.ops.mass_incidents)],
          [OPS.insights.broadcasts, INSIGHTS.count(d.ops.broadcasts)], [OPS.insights.abusive, INSIGHTS.count(d.ops.abusive)],
          [OPS.insights.takeovers, INSIGHTS.count(d.ops.takeovers)], [OPS.insights.promises, INSIGHTS.count(d.ops.promises)],
          [OPS.insights.expired, INSIGHTS.count(d.ops.promises_expired)],
        ]} />
      </div>
    ),
  },
} satisfies Record<string, { card: (d: Insights) => ReactNode; detail: (d: Insights) => ReactNode }>;

export type MetricKey = keyof typeof METRICS;

export function FrontlineMetrics({data:f}:{data:Insights["frontline"]}) {
  const ratio = (n:number,d:number) => d ? `${n} / ${d} (${pct(n,d)}%)` : "0 / 0";
  return <section className="grid gap-3"><h2>{FRONT_DESK.outcomes}</h2>
    <Pair items={[[FRONT_DESK.resolved,ratio(f.resolved,f.started)],[FRONT_DESK.open,String(f.open)],
      [FRONT_DESK.abandoned,String(f.abandoned)],[FRONT_DESK.repeat,ratio(f.recontact,f.covered)],
      [FRONT_DESK.coverage,ratio(f.covered,f.mature)]]}/>
    <h3>{FRONT_DESK.contact}</h3><Pair items={[["p50",dur(f.contact_p50)],["p95",dur(f.contact_p95)],[FRONT_DESK.contacts,String(f.contact_n)]]}/>
    <h3>{FRONT_DESK.transfer}</h3><Pair items={Object.entries(f.escalations).map(([k,n])=>[FRONT_DESK.reasons[k] ?? k,String(n)])}/>
  </section>;
}
