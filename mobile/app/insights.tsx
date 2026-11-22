import { useCallback, useState } from "react";
import { View } from "react-native";
import { LogOut } from "lucide-react-native";
import { sb } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, type Me } from "@/components/StaffGate";
import { Brand, Card, Hairline, IconButton, Meter, Notice, Screen, T, Tag, Toggle } from "@/components/ui";
import { color } from "@/theme";
import { FUNNEL, LANG_NAME, MOBILE, STAFF, type Lang } from "@content/catalogue";

const I = MOBILE.insights;
type Insights = {
  since: string;
  funnel: Record<string, number>;
  dispatched: number;
  abandoned: number;
  per_day: { day: string; n: number }[];
  per_hour: { hour: number; n: number }[];
  languages: Record<string, number>;
  median_first_reply_s: number | null;
  choices: Record<string, number>;
};

const PERIODS = [7, 14, 30];
const HOURS_PER_SLOT = 2;
const MAX_DOTS = 5;
const CHART_HEIGHT = 120;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default function InsightsScreen() {
  return <StaffGate allow={["operator", "manager"]} title={I.title}>{(me) => <Board me={me} />}</StaffGate>;
}

function Board({ me }: { me: Me }) {
  const [days, setDays] = useState(PERIODS[1]);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");
  // Counts only: the insights() function returns no words and no identities.
  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("insights", { p_days: days });
    if (error) setError(error.message); else { setError(""); setData(data as Insights); }
  }, [days]);
  useLive(["desk"], load);

  const f = data?.funnel ?? {};
  const total = f.received ?? 0;
  const langs = Object.entries(data?.languages ?? {}).sort((a, b) => b[1] - a[1]);
  const langMax = Math.max(1, ...langs.map(([, n]) => n));
  const median = data?.median_first_reply_s;
  const choices = data?.choices ?? {};
  const chosen = (choices.wait ?? 0) + (choices.leave ?? 0);

  return (
    <Screen back eyebrow={<Brand />} title={I.title} onRefresh={load}
      right={me.role === "manager" ? <IconButton icon={LogOut} label={STAFF.signOut} onPress={me.signOut} /> : undefined}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {PERIODS.map((p) => <Toggle key={p} on={p === days} label={I.period(p)} onPress={() => setDays(p)} style={{ flex: 1 }} />)}
      </View>
      {error ? <Notice tone="alert">{error}</Notice> : null}

      <Card title={I.funnel}>
        <T v="label">{I.funnelBody}</T>
        <Funnel steps={FUNNEL.map((s) => ({ label: s.ja, value: f[s.key] ?? 0 }))} />
      </Card>

      <Card title={I.received}>
        <T v="h1" mono>{total.toLocaleString()}</T>
        <Hairline />
        {langs.length === 0 && <T v="label">{I.noData}</T>}
        {langs.map(([l, n]) => (
          <View key={l} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T v="body" tone="ink">{LANG_NAME[l as Lang] ?? I.noLanguage}</T><T v="label" mono>{n}</T>
            </View>
            <Meter value={n} max={langMax} />
          </View>
        ))}
      </Card>

      <Card title={I.perDay}>
        {data && <Bars values={data.per_day.map((d) => d.n)} labels={data.per_day.map((d) => new Date(d.day).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }))} />}
      </Card>

      <Hours perHour={data?.per_hour ?? []} />

      <Card title={I.firstReply}>
        <T v="h1" mono>{median == null ? "—" : median < 90 ? I.seconds(Math.round(median)) : I.minutes((median / 60).toFixed(1))}</T>
        <T v="label">{I.firstReplyBody}</T>
        <Hairline />
        <Line label={I.reachedGuided} value={`${pct(f.guided ?? 0, total)}%`} />
        <Line label={I.dispatched} value={MOBILE.staff.count(data?.dispatched ?? 0)} />
        <Line label={I.abandoned} value={MOBILE.staff.count(data?.abandoned ?? 0)} />
      </Card>

      <Card title={I.choices}>
        {([["wait", I.choiceWait], ["leave", I.choiceLeave]] as const).map(([k, l]) => (
          <View key={k} style={{ gap: 6 }}>
            <Line label={l} value={`${pct(choices[k] ?? 0, chosen)}%`} />
            <Meter value={choices[k] ?? 0} max={Math.max(1, chosen)} />
          </View>
        ))}
        <T v="small">{I.choicesNote}</T>
      </Card>
      <T v="small">{I.footer}</T>
    </Screen>
  );
}

const Line = ({ label, value }: { label: string; value: string }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T v="label">{label}</T><T v="label" mono tone="ink">{value}</T></View>
);

// Cumulative funnel as horizontal bars; each stage shows its pass rate from the previous one.
function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <View style={{ gap: 12 }}>
      {steps.map((s, i) => (
        <View key={s.label} style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <T v="label" tone="ink">{s.label}</T>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {i > 0 && steps[i - 1].value > 0 && <T v="small">{I.passRate(pct(s.value, steps[i - 1].value))}</T>}
              <T v="label" mono tone="ink">{s.value.toLocaleString()}</T>
            </View>
          </View>
          <Meter value={s.value} max={max} />
        </View>
      ))}
    </View>
  );
}

// One column per day; the busiest day is solid, the rest a quiet grey.
function Bars({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  const peak = values.indexOf(max);
  const every = Math.ceil(labels.length / 5);
  return (
    <View style={{ gap: 8 }} accessible accessibilityLabel={labels.map((l, i) => `${l}: ${values[i]}`).join(", ")}>
      <View style={{ height: CHART_HEIGHT, flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
        {values.map((v, i) => (
          <View key={labels[i]} style={{ flex: 1, height: Math.max(2, (v / max) * CHART_HEIGHT), borderRadius: 2, backgroundColor: i === peak && v > 0 ? color.primary : color.selected }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {labels.filter((_, i) => i % every === 0).map((l) => <T key={l} v="small" mono>{l}</T>)}
      </View>
    </View>
  );
}

// Two-hour slots as a dot matrix; dot count scaled to the busiest slot, which is drawn solid.
function Hours({ perHour }: { perHour: { hour: number; n: number }[] }) {
  const slots = Array.from({ length: perHour.length / HOURS_PER_SLOT }, (_, i) => ({
    hour: i * HOURS_PER_SLOT,
    n: perHour.slice(i * HOURS_PER_SLOT, (i + 1) * HOURS_PER_SLOT).reduce((sum, h) => sum + h.n, 0),
  }));
  const peak = slots.reduce((best, h) => (h.n > best.n ? h : best), { hour: 0, n: 0 });
  const max = Math.max(1, peak.n);
  return (
    <Card title={I.hours} action={peak.n > 0 ? <Tag value={I.peak(peak.hour, peak.hour + HOURS_PER_SLOT)} /> : undefined}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: MAX_DOTS * 14 }}
        accessible accessibilityLabel={slots.map((h) => `${I.hour(h.hour)}: ${h.n}`).join(", ")}>
        {slots.map((h) => (
          <View key={h.hour} style={{ gap: 4, alignItems: "center", flex: 1 }}>
            {Array.from({ length: h.n > 0 ? Math.max(1, Math.round((h.n / max) * MAX_DOTS)) : 1 }, (_, k) => (
              <View key={k} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: h.n === 0 ? color.press : h === peak ? color.primary : color.faint }} />
            ))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {slots.filter((_, i) => i % 3 === 0).map((h) => <T key={h.hour} v="small" mono>{I.hour(h.hour)}</T>)}
      </View>
    </Card>
  );
}
