import { useState } from "react";
import { View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { CalendarDays, Code } from "lucide-react-native";
import { StaffGate } from "@/components/StaffGate";
import { Card, Crumb, Hairline, Icon, Notice, Screen, Segments, T } from "@/components/ui";
import { DEFAULT_DAYS, METRICS, PERIODS, isMetric, useInsights, type MetricKey } from "@/components/metrics";
import { INSIGHTS } from "@content/catalogue";

export default function MetricScreen() {
  const { metric, days } = useLocalSearchParams<{ metric: string; days?: string }>();
  if (!isMetric(metric)) return <Redirect href="/insights" />;
  const d = Number(days);
  return (
    <StaffGate need="insights:read" title={INSIGHTS.title}>
      {() => <Detail k={metric} initialDays={PERIODS.includes(d) ? d : DEFAULT_DAYS} />}
    </StaffGate>
  );
}

// One metric: its definition, the period, and the chart (web Insights detail pane).
function Detail({ k, initialDays }: { k: MetricKey; initialDays: number }) {
  const [days, setDays] = useState(initialDays);
  const { data, error, load } = useInsights(days);
  const m = INSIGHTS.metrics[k];
  return (
    <Screen back eyebrow={<Crumb parts={[INSIGHTS.title, m.title]} />} title={m.title} onRefresh={load}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, width: 64, alignSelf: "flex-start", paddingTop: 2 }}>
          <Icon icon={Code} size={14} tone="muted" /><T v="label" tone="muted">{INSIGHTS.definition}</T>
        </View>
        <T v="row" style={{ flex: 1, lineHeight: 22 }}>{m.def}</T>
      </View>
      <Hairline />
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon icon={CalendarDays} size={14} tone="muted" /><T v="label" tone="muted">{INSIGHTS.range}</T>
          <T v="label" tone="faint">·</T><T v="label" tone="muted">{INSIGHTS.interval}</T><T v="label" tone="ink">{INSIGHTS.everyDay}</T>
        </View>
        <Segments value={days} options={PERIODS.map((p) => ({ key: p, label: INSIGHTS.period(p) }))} onChange={setDays} />
      </View>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      <Card>{data ? METRICS[k].detail(data) : <View style={{ height: 220 }} />}</Card>
      <T v="small">{INSIGHTS.privacy}</T>
    </Screen>
  );
}
