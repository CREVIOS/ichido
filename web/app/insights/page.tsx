"use client";
import { useCallback, useState } from "react";
import { sb } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Big, Chip, Dots, Funnel, Meter, Notice, Panel, Steps } from "@/components/kit";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import { DESK, FUNNEL, INSIGHTS, LANG_NAME, staffError, type Lang } from "@/content/catalogue";

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
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default function InsightsPage() {
  return <StaffGate allow={["operator", "manager"]} title={INSIGHTS.title}>{(me) => <Board me={me} />}</StaffGate>;
}

function Board({ me }: { me: Me }) {
  const [days, setDays] = useState(PERIODS[1]);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("insights", { p_days: days });
    if (error) setError(staffError(error.message)); else { setError(""); setData(data as Insights); }
  }, [days]);
  useLive(["desk"], load);

  return (
    <AppShell
      nav={navFor(me.role)}
      footer={<MeFooter me={me} />}
      title={INSIGHTS.title}
      actions={
        <ToggleGroup value={[String(days)]} onValueChange={(v: string[]) => v[0] && setDays(Number(v[0]))} className="rounded-md bg-secondary p-0.5">
          {PERIODS.map((p) => <ToggleGroupItem key={p} value={String(p)} className="h-7 rounded-[5px] px-2.5 text-[12px] data-[pressed]:bg-card data-[pressed]:shadow-xs">{INSIGHTS.period(p)}</ToggleGroupItem>)}
        </ToggleGroup>
      }
    >
      <div className="flex flex-col gap-10 p-5 lg:p-8">
        {error && <Notice tone="warn">{error}</Notice>}
        <Overview data={data} />
        <Separator />
        <Detail data={data} />
        <p className="text-[12px] text-muted-foreground">{INSIGHTS.privacy}</p>
      </div>
    </AppShell>
  );
}

function Overview({ data }: { data: Insights | null }) {
  const f = data?.funnel ?? {};
  const total = f.received ?? 0;
  const langs = Object.entries(data?.languages ?? {}).sort((a, b) => b[1] - a[1]);
  const langMax = Math.max(1, ...langs.map(([, n]) => n));
  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel title={INSIGHTS.flow}>
        <p className="max-w-xl text-[14px] leading-6">{INSIGHTS.flowNote}</p>
        <Funnel steps={FUNNEL.map((s) => ({ label: s.ja, value: f[s.key] ?? 0 }))} conversion={INSIGHTS.conversion} unit={INSIGHTS.count} />
      </Panel>
      <Panel title={INSIGHTS.received}>
        <Big>{total.toLocaleString()}</Big>
        <div className="mt-4 flex flex-col gap-4">
          {langs.length === 0 && <span className="text-[13px] text-muted-foreground">{INSIGHTS.noData}</span>}
          {langs.map(([l, n]) => (
            <div key={l} className="flex flex-col gap-1.5">
              <span className="flex justify-between text-[14px]"><span className="text-foreground">{LANG_NAME[l as Lang] ?? INSIGHTS.noLang}</span><span className="num">{n}</span></span>
              <Meter value={n} max={langMax} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Detail({ data }: { data: Insights | null }) {
  const f = data?.funnel ?? {};
  const total = f.received ?? 0;
  // Two-hour slots keep the dot matrix readable.
  const hours = data?.per_hour ?? [];
  const slots = Array.from({ length: hours.length / HOURS_PER_SLOT }, (_, i) => ({
    hour: i * HOURS_PER_SLOT,
    n: hours.slice(i * HOURS_PER_SLOT, (i + 1) * HOURS_PER_SLOT).reduce((sum, h) => sum + h.n, 0),
  }));
  const peak = slots.reduce((best, h) => (h.n > best.n ? h : best), { hour: 0, n: 0 });
  const median = data?.median_first_reply_s;
  const choices = data?.choices ?? {};
  const chosen = (choices.wait ?? 0) + (choices.leave ?? 0);
  return (
    <div className="grid gap-10 md:grid-cols-2 xl:grid-cols-4">
      <Panel title={INSIGHTS.perDay}>
        {data && <Steps values={data.per_day.map((d) => d.n)} labels={data.per_day.map((d) => new Date(d.day).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }))} />}
      </Panel>
      <Panel title={INSIGHTS.hours} action={peak.n > 0 ? <Chip>{INSIGHTS.peak} {INSIGHTS.hourRange(peak.hour, peak.hour + HOURS_PER_SLOT)}</Chip> : undefined}>
        <Dots values={slots.map((h) => h.n)} labels={slots.map((h) => INSIGHTS.hour(h.hour))} maxDots={6} />
        <div className="flex justify-between text-[11px] text-muted-foreground">{slots.filter((_, i) => i % 3 === 0).map((h) => <span key={h.hour}>{INSIGHTS.hour(h.hour)}</span>)}</div>
      </Panel>
      <Panel title={INSIGHTS.firstReply}>
        <Big>{median == null ? "—" : INSIGHTS.duration(median)}</Big>
        <span className="text-[13px]">{INSIGHTS.firstReplyNote}</span>
        <div className="mt-2 flex flex-col gap-1.5 text-[14px]">
          <Row label={INSIGHTS.guidedRate} value={`${pct(f.guided ?? 0, total)}%`} />
          <Row label={INSIGHTS.dispatched} value={INSIGHTS.count(data?.dispatched ?? 0)} />
          <Row label={INSIGHTS.abandoned} value={INSIGHTS.count(data?.abandoned ?? 0)} />
        </div>
      </Panel>
      <Panel title={INSIGHTS.choices}>
        <div className="flex flex-col gap-4">
          {Object.keys(DESK.choiceText).map((k) => (
            <div key={k} className="flex flex-col gap-1.5">
              <span className="flex justify-between text-[14px]"><span className="text-foreground">{DESK.choiceText[k]}</span><span className="num">{pct(choices[k] ?? 0, chosen)}%</span></span>
              <Meter value={choices[k] ?? 0} max={Math.max(1, chosen)} />
            </div>
          ))}
        </div>
        <span className="text-[12px] text-muted-foreground">{INSIGHTS.choiceNote}</span>
      </Panel>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <span className="flex justify-between border-t pt-1.5"><span>{label}</span><span className="num text-foreground">{value}</span></span>
);
