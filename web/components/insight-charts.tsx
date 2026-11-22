"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

// Insights charts on Recharts (MIT) through shadcn's chart wrapper: one palette, hairline grids, tooltips everywhere.
export const BLUE = "oklch(0.66 0.14 255)";
export const GREEN = "oklch(0.72 0.16 145)";
export const SHADES = ["oklch(0.3 0 0)", BLUE, GREEN, "oklch(0.78 0.13 80)", "oklch(0.65 0.15 300)", "oklch(0.8 0 0)"];
const AXIS = { tickLine: false, axisLine: false, tickMargin: 8, fontSize: 11 } as const;

export function DailyArea({ data, labels, compact }: { data: { day: string; received: number; guided: number }[]; labels: { received: string; guided: string }; compact?: boolean }) {
  const config = { received: { label: labels.received, color: BLUE }, guided: { label: labels.guided, color: GREEN } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className={compact ? "aspect-auto h-[96px] w-full" : "aspect-auto h-[320px] w-full"}>
      <AreaChart data={data} margin={{ left: compact ? 0 : -16, right: 8, top: 8 }}>
        <defs>
          {(["received", "guided"] as const).map((k) => (
            <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.28} />
              <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        {!compact && <CartesianGrid vertical={false} strokeOpacity={0.6} />}
        {!compact && <XAxis dataKey="day" {...AXIS} minTickGap={24} />}
        {!compact && <YAxis {...AXIS} allowDecimals={false} width={44} />}
        <ChartTooltip cursor={!compact} content={<ChartTooltipContent indicator="dot" />} />
        <Area dataKey="received" type="monotone" stroke="var(--color-received)" strokeWidth={1.75} fill="url(#fill-received)" dot={compact ? false : { r: 2.5 }} />
        <Area dataKey="guided" type="monotone" stroke="var(--color-guided)" strokeWidth={1.75} fill="url(#fill-guided)" dot={compact ? false : { r: 2.5 }} />
        {!compact && <ChartLegend content={<ChartLegendContent />} />}
      </AreaChart>
    </ChartContainer>
  );
}

export function ReplyLine({ data, label, target, targetLabel }: { data: { day: string; minutes: number | null }[]; label: string; target: number; targetLabel: string }) {
  const config = { minutes: { label, color: BLUE } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
      <LineChart data={data} margin={{ left: -16, right: 12, top: 12 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.6} />
        <XAxis dataKey="day" {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={44} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ReferenceLine y={target} stroke="oklch(0.6 0.19 27)" strokeDasharray="4 4" label={{ value: targetLabel, position: "insideTopRight", fontSize: 11, fill: "oklch(0.6 0.19 27)" }} />
        <Line dataKey="minutes" type="monotone" stroke="var(--color-minutes)" strokeWidth={1.75} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ChartContainer>
  );
}

// Horizontal funnel: each stage's bar, with its count and conversion from the stage before.
export function FunnelBars({ data, label }: { data: { stage: string; value: number; rate: string }[]; label: string }) {
  const config = { value: { label, color: "oklch(0.3 0 0)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 64 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="stage" {...AXIS} width={84} fontSize={12} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
        <Bar dataKey="value" radius={4} barSize={26}>
          {data.map((d, i) => <Cell key={d.stage} fill={i === data.length - 1 ? GREEN : `oklch(0.3 0 0 / ${0.85 - i * 0.12})`} />)}
          <LabelList dataKey="rate" position="right" fontSize={12} className="fill-muted-foreground" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function HourBars({ data, label }: { data: { slot: string; n: number }[]; label: string }) {
  const max = Math.max(0, ...data.map((d) => d.n));
  const config = { n: { label, color: BLUE } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.6} />
        <XAxis dataKey="slot" {...AXIS} />
        <YAxis {...AXIS} allowDecimals={false} width={44} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
        <Bar dataKey="n" radius={4}>{data.map((d) => <Cell key={d.slot} fill={d.n === max && max > 0 ? "oklch(0.3 0 0)" : "oklch(0.3 0 0 / 0.18)"} />)}</Bar>
      </BarChart>
    </ChartContainer>
  );
}

// Donut with the total in the middle and a legend underneath.
export function Donut({ data, total, totalLabel }: { data: { key: string; label: string; value: number }[]; total: string; totalLabel: string }) {
  const color = (i: number) => SHADES[i % SHADES.length];
  const config = Object.fromEntries(data.map((d, i) => [d.key, { label: d.label, color: color(i) }])) satisfies ChartConfig;
  const sum = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4">
      <ChartContainer config={config} className="aspect-square h-[260px]">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
          <Pie data={data.map((d) => ({ ...d, fill: `var(--color-${d.key})` }))} dataKey="value" nameKey="key" innerRadius={80} outerRadius={118} strokeWidth={2} stroke="var(--card)" cx="50%" cy="50%" animationDuration={500} />
          <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-[28px] tracking-[-0.03em]">{total}</text>
          <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground text-[12px]">{totalLabel}</text>
        </PieChart>
      </ChartContainer>
      <ul className="grid w-full max-w-md grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
        {data.map((d, i) => (
          <li key={d.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color(i) }} />
            <span className="flex-1 text-foreground">{d.label}</span>
            <span className="num text-muted-foreground">{d.value} · {sum ? Math.round((d.value / sum) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
