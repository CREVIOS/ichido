import { CalendarDays, ChartLine, Code, GripVertical } from "lucide-react";
import { DailyArea } from "@/components/lazy-charts";
import { HOME, INSIGHTS } from "@/content/catalogue";

const M = HOME.measure;
const data = M.received.map((n, i) => ({ day: `${i + 1}`, received: n, guided: M.guided[i] }));

// Illustration of the insights board (sample numbers, labelled as such).
export function MeasurePreview() {
  return (
    <div aria-hidden className="pointer-events-none relative flex select-none gap-3 overflow-hidden rounded-xl border bg-[oklch(0.95_0_0)] p-4 pr-0 sm:p-8 sm:pr-0">
      <span className="absolute top-3 right-4 font-mono text-[10px] tracking-wide text-faint uppercase">{M.sample}</span>
      <div className="hidden w-[250px] shrink-0 flex-col gap-3 md:flex">
        <Card title={INSIGHTS.metrics.daily.title} active><DailyArea compact labels={INSIGHTS.series} data={data} /></Card>
        <Card title={INSIGHTS.metrics.reply.title}><span className="num text-[26px] tracking-[-0.03em] text-foreground">{M.reply}</span></Card>
        <Card title={INSIGHTS.guidedRate}><span className="num text-[26px] tracking-[-0.03em] text-foreground">{M.rate}</span></Card>
      </div>
      <div className="flex min-w-[560px] flex-1 flex-col gap-5 rounded-l-xl border border-r-0 bg-card p-6">
        <span className="flex items-center gap-2 text-[13px] text-foreground"><ChartLine className="size-4 stroke-[1.5]" />{INSIGHTS.title} / {INSIGHTS.metrics.daily.title}</span>
        <span className="text-[24px] tracking-[-0.03em] text-foreground">{INSIGHTS.metrics.daily.title}</span>
        <span className="grid grid-cols-[80px_minmax(0,1fr)] gap-3 text-[13px]"><span className="flex items-center gap-1.5 text-muted-foreground"><Code className="size-3.5 stroke-[1.5]" />{INSIGHTS.definition}</span><span className="text-foreground">{INSIGHTS.metrics.daily.def}</span></span>
        <span className="flex gap-2 text-[12px]">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2"><CalendarDays className="size-3.5 stroke-[1.5]" />{INSIGHTS.range}<span className="text-foreground">{INSIGHTS.period(14)}</span></span>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2"><ChartLine className="size-3.5 stroke-[1.5]" />{INSIGHTS.interval}<span className="text-foreground">{INSIGHTS.everyDay}</span></span>
        </span>
        <DailyArea labels={INSIGHTS.series} data={data} />
      </div>
    </div>
  );
}

function Card({ title, active, children }: { title: string; active?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex min-h-36 flex-col gap-2 rounded-xl border bg-card p-3 ${active ? "border-[oklch(0.8_0.07_255)] ring-3 ring-[oklch(0.8_0.07_255/0.25)]" : ""}`}>
      <span className="flex items-center gap-1.5 text-[13px] text-foreground"><GripVertical className="size-3.5 stroke-[1.5] text-faint" />{title}</span>
      <span className="flex flex-1 items-center justify-center">{children}</span>
    </div>
  );
}
