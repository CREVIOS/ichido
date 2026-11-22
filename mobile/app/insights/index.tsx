import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, LogOut } from "lucide-react-native";
import { StaffGate, type Me } from "@/components/StaffGate";
import { Brand, Icon, IconButton, Notice, Screen, Segments, T } from "@/components/ui";
import { DEFAULT_DAYS, METRICS, METRIC_KEYS, PERIODS, useInsights } from "@/components/metrics";
import { color, radius, shadow, space } from "@/theme";
import { INSIGHTS, STAFF } from "@content/catalogue";

export default function InsightsScreen() {
  return <StaffGate need="insights:read" title={INSIGHTS.title}>{(me) => <Board me={me} />}</StaffGate>;
}

// The metric-card list of the web Insights page; each card opens its chart.
function Board({ me }: { me: Me }) {
  const [days, setDays] = useState(DEFAULT_DAYS);
  const { data, error, load } = useInsights(days);
  return (
    <Screen back eyebrow={<Brand />} title={INSIGHTS.title} onRefresh={load}
      right={me.role === "manager" ? <IconButton icon={LogOut} label={STAFF.signOut} onPress={me.signOut} /> : undefined}>
      <Segments value={days} options={PERIODS.map((p) => ({ key: p, label: INSIGHTS.period(p) }))} onChange={setDays} />
      {error ? <Notice tone="alert">{error}</Notice> : null}
      <View style={{ gap: 10 }}>
        {METRIC_KEYS.map((k) => (
          <Pressable key={k} accessibilityRole="button" accessibilityLabel={INSIGHTS.metrics[k].title}
            onPress={() => router.push({ pathname: "/insights/[metric]", params: { metric: k, days: String(days) } })}
            style={({ pressed }) => [{ backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: pressed ? color.focus : color.line, padding: space.md, gap: space.sm, minHeight: 112 }, shadow]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <T v="label" tone="ink">{INSIGHTS.metrics[k].title}</T>
              <Icon icon={ChevronRight} size={14} tone="faint" />
            </View>
            <View style={{ flex: 1, justifyContent: "center" }} pointerEvents="none">{data ? METRICS[k].card(data) : null}</View>
          </Pressable>
        ))}
      </View>
      <T v="small">{INSIGHTS.privacy}</T>
    </Screen>
  );
}
