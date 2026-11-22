import { useCallback, useState, type ReactNode } from "react";
import { View } from "react-native";
import { sb } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { Bars, Donut, Lines } from "@/components/charts";
import { T } from "@/components/ui";
import { chart, color, tier } from "@/theme";
import { DESK, FUNNEL, INSIGHTS, LANG_NAME, RATING, RATINGS, staffError, type Lang } from "@content/catalogue";

// Mirrors web/app/insights/metrics.tsx: the same metrics, copy and RPCs, drawn with react-native-gifted-charts.
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
  targets: Partial<Record<string, number>>;
};

export const PERIODS = [7, 14, 30];
export const DEFAULT_DAYS = PERIODS[1];

// Counts only: insights() and insights_ratings() return no words and no identities.
export function useInsights(days: number) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const [main, ratings, t] = await Promise.all([
      sb().rpc("insights", { p_days: days }),
      sb().rpc("insights_ratings", { p_days: days }),
      sb().schema("ichido").from("sla_target").select("reason, seconds"), // operators only; managers see no target line
    ]);
    const e = main.error ?? ratings.error;
    const targets = Object.fromEntries(((t.data ?? []) as { reason: string; seconds: number }[]).map((r) => [r.reason, r.seconds]));
    if (e) setError(staffError(e.message));
    else { setError(""); setData({ ...(main.data as Insights), ratings: ratings.data ?? {}, targets }); }
  }, [days]);
  useLive(["desk"], load);
  return { data, error, load };
}

const HOURS_PER_SLOT = 2;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const dayLabel = (d: string) => new Date(d).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
const minutes = (s: number | null) => (s == null ? null : Math.round((s / 60) * 10) / 10);
const LANG_COLOR: Record<string, string> = { bn: chart.blue, en: chart.green, ja: color.violet };
const RATING_COLOR: Record<number, string> = { 3: tier.high, 2: tier.mid, 1: tier.low };
const CHOICE_COLOR: Record<string, string> = { wait: chart.blue, leave: chart.green };

function daily(d: Insights, compact = false) {
  return <Lines compact={compact} height={compact ? 72 : 220} labels={d.per_day.map((x) => dayLabel(x.day))}
    series={[{ name: INSIGHTS.series.received, color: chart.blue, values: d.per_day.map((x) => x.n) }, { name: INSIGHTS.series.guided, color: chart.green, values: d.per_day.map((x) => x.guided) }]} />;
}

function slots(d: Insights) {
  return Array.from({ length: d.per_hour.length / HOURS_PER_SLOT }, (_, i) => ({
    hour: i * HOURS_PER_SLOT,
    n: d.per_hour.slice(i * HOURS_PER_SLOT, (i + 1) * HOURS_PER_SLOT).reduce((sum, h) => sum + h.n, 0),
  }));
}
const peakOf = (s: { hour: number; n: number }[]) => s.reduce((b, h) => (h.n > b.n ? h : b), { hour: 0, n: 0 });

// Headline number: 30px on a metric card (as the web), the full 40px on a detail page.
const Big = ({ children, sub, large }: { children: ReactNode; sub?: ReactNode; large?: boolean }) => (
  <View style={{ gap: 2 }}>
    <T v="big" numberOfLines={1} adjustsFontSizeToFit style={large ? undefined : { fontSize: 30, lineHeight: 36, letterSpacing: -0.9 }}>{children}</T>
    {sub ? <T v="small">{sub}</T> : null}
  </View>
);

const Line = ({ label, value }: { label: string; value: string }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", minHeight: 32, alignItems: "center", borderTopWidth: 1, borderTopColor: color.line }}>
    <T v="row" tone="body">{label}</T><T v="label" mono tone="ink">{value}</T>
  </View>
);

const ratingTotal = (d: Insights) => RATINGS.reduce((n, r) => n + (d.ratings[r] ?? 0), 0);
const choiceTotal = (d: Insights) => (d.choices.wait ?? 0) + (d.choices.leave ?? 0);

export const METRICS = {
  daily: { card: (d: Insights) => daily(d, true), detail: (d: Insights) => daily(d) },
  funnel: {
    card: (d: Insights) => <Big sub={`${INSIGHTS.guidedRate} ${pct(d.funnel.guided ?? 0, d.funnel.received ?? 0)}%`}>{INSIGHTS.count(d.funnel.received ?? 0)}</Big>,
    detail: (d: Insights) => {
      const v = FUNNEL.map((s) => d.funnel[s.key] ?? 0);
      return (
        <View style={{ gap: 16 }}>
          <Bars values={v} labels={FUNNEL.map((s) => s.ja)} height={180} fill={chart.blue} tip={(i) => FUNNEL[i].ja}
            top={(i) => <T v="tiny" mono>{v[i]}</T>} />
          <View>
            {FUNNEL.map((s, i) => (
              <Line key={s.key} label={s.ja} value={i > 0 && v[i - 1] > 0 ? `${INSIGHTS.count(v[i])} · ${INSIGHTS.conversion} ${pct(v[i], v[i - 1])}%` : INSIGHTS.count(v[i])} />
            ))}
            <Line label={INSIGHTS.dispatched} value={INSIGHTS.count(d.dispatched)} />
            <Line label={INSIGHTS.abandoned} value={INSIGHTS.count(d.abandoned)} />
          </View>
        </View>
      );
    },
  },
  reply: {
    card: (d: Insights) => <Big>{d.median_first_reply_s == null ? "—" : INSIGHTS.duration(d.median_first_reply_s)}</Big>,
    detail: (d: Insights) => (
      <View style={{ gap: 16 }}>
        <Big large sub={INSIGHTS.firstReplyNote}>{d.median_first_reply_s == null ? "—" : INSIGHTS.duration(d.median_first_reply_s)}</Big>
        <Lines height={200} labels={d.per_day.map((x) => dayLabel(x.day))}
          target={d.targets.no_reply != null ? { value: d.targets.no_reply / 60, label: INSIGHTS.target(INSIGHTS.duration(d.targets.no_reply)) } : undefined}
          series={[{ name: INSIGHTS.series.reply, color: chart.blue, values: d.per_day.map((x) => minutes(x.first_reply_s)) }]} />
      </View>
    ),
  },
  langs: {
    card: (d: Insights) => {
      const [top] = Object.entries(d.languages).filter(([l]) => l !== "none").sort((a, b) => b[1] - a[1]);
      const all = Object.values(d.languages).reduce((n, v) => n + v, 0);
      return top ? <Big sub={LANG_NAME[top[0] as Lang]}>{`${pct(top[1], all)}%`}</Big> : <Big>—</Big>;
    },
    detail: (d: Insights) => {
      const rows = Object.entries(d.languages).sort((a, b) => b[1] - a[1]);
      const total = rows.reduce((n, [, v]) => n + v, 0);
      return <Donut centre={INSIGHTS.count(total)} centreSub={INSIGHTS.received} shown={(v, t) => `${INSIGHTS.count(v)} · ${pct(v, t)}%`}
        slices={rows.map(([l, n]) => ({ name: LANG_NAME[l as Lang] ?? INSIGHTS.noLang, color: LANG_COLOR[l] ?? color.faint, value: n }))} />;
    },
  },
  hours: {
    card: (d: Insights) => { const p = peakOf(slots(d)); return <Big sub={INSIGHTS.peak}>{p.n ? INSIGHTS.hourRange(p.hour, p.hour + HOURS_PER_SLOT) : "—"}</Big>; },
    detail: (d: Insights) => {
      const s = slots(d);
      const p = peakOf(s);
      return <Bars values={s.map((h) => h.n)} labels={s.map((h) => INSIGHTS.hour(h.hour))} highlight={(i) => p.n > 0 && s[i] === p}
        tip={(i) => INSIGHTS.hourRange(s[i].hour, s[i].hour + HOURS_PER_SLOT)} />;
    },
  },
  choices: {
    card: (d: Insights) => { const t = choiceTotal(d); return <Big sub={Object.values(DESK.choiceText).join(" / ")}>{`${pct(d.choices.wait ?? 0, t)}% / ${pct(d.choices.leave ?? 0, t)}%`}</Big>; },
    detail: (d: Insights) => (
      <View style={{ gap: 12 }}>
        <Donut centre={INSIGHTS.count(choiceTotal(d))} centreSub={INSIGHTS.choices} shown={(v, t) => `${INSIGHTS.count(v)} · ${pct(v, t)}%`}
          slices={Object.keys(DESK.choiceText).map((k) => ({ name: DESK.choiceText[k], color: CHOICE_COLOR[k] ?? color.faint, value: d.choices[k] ?? 0 }))} />
        <T v="small">{INSIGHTS.choiceNote}</T>
      </View>
    ),
  },
  ratings: {
    card: (d: Insights) => { const t = ratingTotal(d); return <Big sub={RATING[3].ja}>{t ? `${pct(d.ratings[3] ?? 0, t)}%` : "—"}</Big>; },
    detail: (d: Insights) => {
      const t = ratingTotal(d);
      return <Donut centre={t ? `${pct(d.ratings[3] ?? 0, t)}%` : "—"} centreSub={RATING[3].ja} shown={(v, all) => `${INSIGHTS.count(v)} · ${pct(v, all)}%`}
        slices={RATINGS.map((r) => ({ name: RATING[r].ja, color: RATING_COLOR[r], value: d.ratings[r] ?? 0 }))} />;
    },
  },
} satisfies Record<string, { card: (d: Insights) => ReactNode; detail: (d: Insights) => ReactNode }>;

export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];
export const isMetric = (k: unknown): k is MetricKey => typeof k === "string" && Object.hasOwn(METRICS, k);
