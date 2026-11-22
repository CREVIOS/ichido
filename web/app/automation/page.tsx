"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { sb } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Notice } from "@/components/kit";
import { Pill, SegBar } from "@/components/charts";
import { BOT, CASES, DESK, isFault, type L10n, STAFF_JA } from "@/content/catalogue";
import { hhmm, type BotStep } from "../operator/types";

type Row = { id: string; station: string; fault: string; created_at: string; bot_step: BotStep[] };

// The step a case's workflow is waiting on now. A guard reminder without a due time waits for a dispatch that may never come.
function current(steps: BotStep[]) {
  const by = new Map(steps.map((s) => [s.step, s]));
  return BOT.order.map((k) => by.get(k)).find((s) => s?.status === "waiting" && (s.step !== "remind_guard" || s.due_at));
}

export default function AutomationPage() {
  return <StaffGate allow={["operator"]} title={BOT.automation.title}>{(me) => <Board me={me} />}</StaffGate>;
}

// Every open case's Ichido Bot run and where it is (bot_step, live). Read-only: the bot advises, people act.
function Board({ me }: { me: Me }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const load = useCallback(async (signal: AbortSignal) => {
    const db = sb();
    const [d, s] = await Promise.all([
      db.from("desk").select("id, station, fault, created_at, bot_step(step, status, code, due_at, data, at)").is("finished_at", null).order("created_at").abortSignal(signal),
      db.from("station").select("id, label").abortSignal(signal),
    ]);
    if (signal.aborted) return;
    setFailed(Boolean(d.error || s.error));
    setRows(((d.data ?? []) as Row[]).filter((r) => r.bot_step.length));
    setLabels(Object.fromEntries(((s.data ?? []) as { id: string; label: L10n }[]).map((x) => [x.id, x.label.ja])));
  }, []);
  useLive(["desk", "bot_step"], load);

  return (
    <AppShell nav={navFor(me.role)} footer={<MeFooter me={me} />} crumb={BOT.name} title={BOT.automation.title}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-5 lg:p-8">
        <p className="text-[14px] leading-6">{BOT.automation.lead}</p>
        {failed && <Notice tone="warn">{CASES.loadError}</Notice>}
        {rows?.length === 0 && <p className="py-16 text-center text-[14px] text-muted-foreground">{BOT.automation.empty}</p>}
        <ul className="flex flex-col divide-y rounded-xl border">
          {rows?.map((r) => {
            const now = current(r.bot_step);
            const settled = r.bot_step.filter((s) => s.status !== "waiting").length;
            return (
              <li key={r.id}>
                <Link href={`/operator#${r.id}`} className="grid gap-3 px-4 py-3 hover:bg-accent sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-center">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[14px] text-foreground">{labels[r.station] ?? r.station}</span>
                    <span className="text-[12px] text-muted-foreground"><span className="mono">{hhmm(r.created_at)}</span>　{isFault(r.fault) ? STAFF_JA.fault[r.fault] : DESK.unknownFault}</span>
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="label">{BOT.automation.current}</span>
                    <span className="text-[13px] text-foreground">{now ? BOT.steps[now.step] : BOT.automation.finished}{now?.due_at ? `・${BOT.due(hhmm(now.due_at))}` : ""}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <SegBar value={settled} of={BOT.order.length} />
                    <Pill tone={now ? "review" : "guided"}>{now ? BOT.status.waiting : BOT.status.done}</Pill>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}
