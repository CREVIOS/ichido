"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Dot, MoreMenu } from "@/components/kit";
import { cn } from "@/lib/utils";
import { DESK, DEVICE_FAULT, FAULTS, LANG_NAME, isFault, staffError } from "@/content/catalogue";
import { CaseView } from "./case";
import { when, type Desk, type Run, type Station } from "./types";

const HISTORY = 12;

export default function OperatorPage() {
  return <StaffGate allow={["operator"]} title={DESK.title}>{(me) => <Console me={me} />}</StaffGate>;
}

// Re-render once a minute so "n minutes ago" stays true.
function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  return now;
}

function Console({ me }: { me: Me }) {
  const [open, setOpen] = useState<Desk[]>([]);
  const [done, setDone] = useState<Desk[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [sel, setSel] = useState<string | null>(null);

  // Open cases are fetched on their own so no amount of history can push one out of the queue.
  const load = useCallback(async () => {
    const db = sb();
    const [o, h, s] = await Promise.all([
      db.from("desk").select("*").is("finished_at", null).order("created_at"),
      db.from("desk").select("*").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(HISTORY),
      db.from("station").select("id, label").order("id"),
    ]);
    setOpen((o.data ?? []) as Desk[]); setDone((h.data ?? []) as Desk[]); setStations((s.data ?? []) as Station[]);
  }, []);
  useLive(["desk"], load);

  const label = useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s.label.ja])), [stations]);
  const current = [...open, ...done].find((c) => c.id === sel) ?? open[0] ?? null;
  const run: Run = (name, body = {}) => cmd(name, body).catch((e: Error) => { toast.error(staffError(e.message)); });

  return (
    <AppShell
      nav={navFor(me.role, { "/operator": open.length })}
      footer={<MeFooter me={me} />}
      side={<Queue open={open} done={done} label={label} current={current?.id} onPick={setSel} />}
      crumb={DESK.title}
      title={current ? (label[current.station] ?? current.station) : DESK.queue}
      actions={<MoreMenu label={DESK.manualFault} items={stations.map((s) => ({ label: DESK.manualFaultAt(s.label.ja), onClick: () => run("simulate", { station: s.id, fault: DEVICE_FAULT }) }))} />}
    >
      {current
        ? <CaseView key={current.id} d={current} me={me} run={run} />
        : <div className="grid h-full min-h-[60dvh] place-items-center p-8 text-center"><p className="max-w-sm text-[14px] text-muted-foreground">{open.length || done.length ? DESK.pickCase : DESK.empty}</p></div>}
    </AppShell>
  );
}

function Queue({ open, done, label, current, onPick }: { open: Desk[]; done: Desk[]; label: Record<string, string>; current?: string; onPick: (id: string) => void }) {
  const now = useMinute();
  const ago = (t: string) => DESK.minutesAgo(Math.max(0, Math.round((now - Date.parse(t)) / 60000)));
  return (
    <div className="flex flex-col gap-4">
      <QueueGroup title={DESK.queue} empty={DESK.empty}>
        {open.map((c) => (
          <QueueRow key={c.id} on={c.id === current} onClick={() => onPick(c.id)} dot={c.status}
            title={label[c.station] ?? c.station} meta={ago(c.created_at)}
            sub={<>{isFault(c.fault) ? FAULTS[c.fault].ja : DESK.unknownFault}{c.lang && <> · {LANG_NAME[c.lang]}</>}</>} />
        ))}
      </QueueGroup>
      {done.length > 0 && (
        <QueueGroup title={DESK.recent}>
          {done.map((c) => (
            <QueueRow key={c.id} on={c.id === current} onClick={() => onPick(c.id)} dot={c.abandoned ? "alert" : "guided"} muted
              title={label[c.station] ?? c.station} meta={when(c.created_at)} />
          ))}
        </QueueGroup>
      )}
    </div>
  );
}

function QueueGroup({ title, empty, children }: { title: string; empty?: string; children: React.ReactNode[] }) {
  return (
    <div className="flex flex-col gap-px">
      <span className="px-2 pb-1 text-[12px] text-muted-foreground">{title}</span>
      {children.length ? children : empty && <p className="px-2 text-[12px] leading-5 text-faint">{empty}</p>}
    </div>
  );
}

function QueueRow({ on, onClick, dot, title, meta, sub, muted }: { on: boolean; onClick: () => void; dot: string; title: string; meta: string; sub?: React.ReactNode; muted?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-close
      className={cn("flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent aria-pressed:bg-accent", muted && "text-muted-foreground")}>
      <span className="flex items-center gap-2">
        <Dot s={dot} />
        <span className={cn("min-w-0 flex-1 truncate text-[14px]", !muted && "text-foreground")}>{title}</span>
        <span className="num shrink-0 text-[11px] text-muted-foreground">{meta}</span>
      </span>
      {sub && <span className="truncate pl-3.5 text-[12px] text-muted-foreground">{sub}</span>}
    </button>
  );
}
