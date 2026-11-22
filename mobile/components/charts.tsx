import { useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { BarChart, LineChart, PieChart } from "react-native-gifted-charts";
import { T } from "@/components/ui";
import { color, font, radius, shadow, space } from "@/theme";

// Charts drawn by react-native-gifted-charts (MIT), styled like web/components/charts.tsx:
// hairline gridlines, a muted DM Mono value axis, thin series lines with point markers, tooltips on touch.
export type Series = { name: string; color: string; values: (number | null)[] };

const AXIS_W = 32;
const SECTIONS = 4;
const axisText = { color: color.muted, fontSize: 10, fontFamily: font.mono[400] };

function useWidth() {
  const [w, setW] = useState(0);
  return [w, (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))] as const;
}

// Round the axis to a clean step (1, 2, 5 × 10ⁿ) so ticks read as whole numbers, as on the web.
function axis(values: (number | null)[]) {
  const raw = Math.max(1, ...values.filter((v): v is number => v != null));
  const mag = 10 ** Math.floor(Math.log10(raw / SECTIONS));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((k) => k >= raw / SECTIONS) ?? raw / SECTIONS;
  const max = Math.max(step, Math.ceil(raw / step) * step);
  return { max, sections: Math.round(max / step) };
}

// Every n-th label under the plot, centred on its point or bar (kept inside the chart's width).
const LABEL_W = 56;
function XLabels({ labels, x, width, count = 5 }: { labels: string[]; x: (i: number) => number; width: number; count?: number }) {
  const every = Math.max(1, Math.ceil(labels.length / count));
  return (
    <View style={{ height: 14 }}>
      {labels.map((l, i) => (i % every === 0 ? (
        <T key={l} v="tiny" mono numberOfLines={1} style={{ position: "absolute", width: LABEL_W, textAlign: "center", left: Math.min(Math.max(0, x(i) - LABEL_W / 2), width - LABEL_W) }}>{l}</T>
      ) : null))}
    </View>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.lg }}>
      {items.map((s) => (
        <View key={s.name} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} />
          <T v="tiny">{s.name}</T>
        </View>
      ))}
    </View>
  );
}

// The floating label shown while a finger is on a chart.
function Tooltip({ title, rows }: { title: string; rows: { name: string; color: string; value: string }[] }) {
  return (
    <View style={{ backgroundColor: color.surface, borderRadius: radius.control + 2, borderWidth: 1, borderColor: color.line, paddingHorizontal: 10, paddingVertical: 8, gap: 4, ...shadow }}>
      <T v="tiny" mono>{title}</T>
      {rows.map((r) => (
        <View key={r.name} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: r.color }} />
          <T v="tiny" tone="body" style={{ flex: 1 }} numberOfLines={1}>{r.name}</T>
          <T v="tiny" mono tone="ink">{r.value}</T>
        </View>
      ))}
    </View>
  );
}

const TIP_W = 150;

// Up to two series as lines over a soft area fill. Compact = a sparkline for the metric card (no axis, no touch).
export function Lines({ series, labels, height = 220, compact, target, format = (n: number) => String(n) }: {
  series: Series[]; labels: string[]; height?: number; compact?: boolean; target?: { value: number; label: string }; format?: (n: number) => string;
}) {
  const [w, onLayout] = useWidth();
  const { max, sections } = axis([...series.flatMap((s) => s.values), target?.value ?? null]);
  const left = compact ? 0 : AXIS_W;
  const edge = compact ? 4 : 8;
  const plot = Math.max(0, w - left - edge * 2);
  const spacing = labels.length > 1 ? plot / (labels.length - 1) : plot;
  const data = (s: Series) => s.values.map((v) => ({ value: v ?? undefined }));
  const [a, b] = series;
  return (
    <View style={{ gap: space.sm }}>
      <View onLayout={onLayout} accessible accessibilityLabel={series.map((s) => `${s.name}: ${s.values.map((v, i) => `${labels[i]} ${v ?? "—"}`).join(", ")}`).join("; ")}>
        {w > 0 && (
          <LineChart
            data={data(a)} data2={b ? data(b) : undefined}
            width={plot + edge * 2} height={height} spacing={spacing} initialSpacing={edge} endSpacing={edge}
            maxValue={max} noOfSections={sections} yAxisLabelWidth={left} hideYAxisText={compact} formatYLabel={(l: string) => format(Number(l))}
            yAxisTextStyle={axisText} yAxisThickness={0} xAxisThickness={1} xAxisColor={color.line}
            rulesType="solid" rulesColor={color.line} hideRules={false}
            color1={a.color} color2={b?.color} thickness={compact ? 1.5 : 1.75}
            dataPointsColor1={a.color} dataPointsColor2={b?.color} dataPointsRadius={compact ? 2 : 3}
            areaChart startFillColor1={a.color} startFillColor2={b?.color} endFillColor1={a.color} endFillColor2={b?.color}
            startOpacity={0.16} endOpacity={0}
            showReferenceLine1={target != null} referenceLine1Position={target?.value}
            referenceLine1Config={{ color: color.alert, thickness: 1, dashWidth: 4, dashGap: 4, labelText: target?.label, labelTextStyle: { ...axisText, color: color.alert, marginLeft: 4 } }}
            disableScroll extrapolateMissingValues={false} isAnimated={!compact} animationDuration={500}
            pointerConfig={compact ? undefined : {
              pointerStripHeight: height, pointerStripColor: color.track, pointerStripWidth: 1, radius: 4,
              pointerColorsForDataSet: series.map((s) => s.color), pointer1Color: a.color, pointer2Color: b?.color,
              pointerLabelWidth: TIP_W, pointerLabelHeight: 30 + series.length * 18, autoAdjustPointerLabelPosition: true,
              activatePointersInstantlyOnTouch: true, persistPointer: false,
              pointerLabelComponent: (_items: unknown, _s: unknown, i: number) => (
                <Tooltip title={labels[i] ?? ""} rows={series.map((s) => ({ name: s.name, color: s.color, value: s.values[i] == null ? "—" : format(s.values[i]!) }))} />
              ),
            }}
          />
        )}
      </View>
      {!compact && <XLabels labels={labels} width={w} x={(i) => left + edge + i * spacing} />}
      <Legend items={series} />
    </View>
  );
}

// Vertical bars with a value on top; `peak` bars are solid, the rest a quiet grey. Touch a bar for its tooltip.
export function Bars({ values, labels, height = 200, highlight, fill = color.primary, tip, top }: {
  values: number[]; labels: string[]; height?: number; highlight?: (i: number) => boolean; fill?: string; tip: (i: number) => string; top?: (i: number) => ReactNode;
}) {
  const [w, onLayout] = useWidth();
  const { max, sections } = axis(values);
  const n = Math.max(1, values.length);
  const slot = Math.max(0, w - AXIS_W - 8) / n;
  const barW = Math.max(4, slot * 0.62);
  return (
    <View style={{ gap: space.sm }}>
      <View onLayout={onLayout} accessible accessibilityLabel={labels.map((l, i) => `${l}: ${values[i]}`).join(", ")}>
        {w > 0 && (
          <BarChart
            data={values.map((v, i) => ({
              value: v, frontColor: highlight ? (highlight(i) ? fill : color.track) : fill,
              topLabelComponent: top ? () => top(i) : undefined,
            }))}
            width={w - AXIS_W} height={height} barWidth={barW} spacing={slot - barW} initialSpacing={(slot - barW) / 2} endSpacing={0}
            barBorderTopLeftRadius={3} barBorderTopRightRadius={3}
            maxValue={max} noOfSections={sections} yAxisLabelWidth={AXIS_W} yAxisTextStyle={axisText} yAxisThickness={0}
            xAxisThickness={1} xAxisColor={color.line} rulesType="solid" rulesColor={color.line}
            disableScroll isAnimated animationDuration={500}
            renderTooltip={(_item: unknown, i: number) => <View style={{ marginBottom: 6, marginLeft: -20, width: 110 }}><Tooltip title={labels[i]} rows={[{ name: tip(i), color: fill, value: String(values[i]) }]} /></View>}
          />
        )}
      </View>
      <XLabels labels={labels} width={w} x={(i) => AXIS_W + slot * (i + 0.5)} count={labels.length > 6 ? 4 : labels.length} />
    </View>
  );
}

// Donut with the total (or the touched slice) in the middle, and a legend with counts below.
export function Donut({ slices, centre, centreSub, shown }: {
  slices: { name: string; color: string; value: number }[]; centre: string; centreSub?: string; shown: (value: number, total: number) => string;
}) {
  const [on, setOn] = useState<number | null>(null);
  const total = slices.reduce((n, s) => n + s.value, 0);
  const live = slices.filter((s) => s.value > 0);
  const sel = on != null ? live[on] : null;
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ alignItems: "center" }} accessible accessibilityLabel={slices.map((s) => `${s.name}: ${s.value}`).join(", ")}>
        <PieChart
          data={live.length ? live.map((s) => ({ value: s.value, color: s.color })) : [{ value: 1, color: color.press }]}
          donut radius={96} innerRadius={70} innerCircleColor={color.surface} strokeWidth={2} strokeColor={color.surface}
          focusOnPress={live.length > 0} toggleFocusOnPress sectionAutoFocus={false} extraRadius={6}
          onPress={(_: unknown, i: number) => setOn((p) => (p === i ? null : i))}
          centerLabelComponent={() => (
            <View style={{ alignItems: "center", gap: 2, maxWidth: 120 }}>
              <T v="h1" mono>{sel ? shown(sel.value, total) : centre}</T>
              <T v="tiny" numberOfLines={2} style={{ textAlign: "center" }}>{sel ? sel.name : centreSub}</T>
            </View>
          )}
        />
      </View>
      <View style={{ gap: 2 }}>
        {slices.map((s) => (
          <View key={s.name} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32, borderTopWidth: 1, borderTopColor: color.line }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} />
            <T v="row" style={{ flex: 1 }}>{s.name}</T>
            <T v="label" mono tone="muted">{shown(s.value, total)}</T>
          </View>
        ))}
      </View>
    </View>
  );
}
