"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { usePresence, type Peer } from "@/lib/presence";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Dot, MoreMenu } from "@/components/kit";
import { cn } from "@/lib/utils";
import { DESK, DEVICE_FAULT, FAULTS, LANG_NAME, SLA, STAFF, isFault, staffError } from "@/content/catalogue";
import { CaseView } from "./case";
import { when, type Desk, type Run, type Station } from "./types";

const HISTORY = 12;

export default function OperatorPage() {
  return <StaffGate allow={["operator"]} title={DESK.title}>{(me) => <Console me={me} />}</StaffGate>;
}

// Re-render once a minute so "n minutes ago" stays true.
function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  return now;
}

function Console({ me }: { me: Me }) {
  const [open, setOpen] = useState<Desk[]>([]);
  const [done, setDone] = useState<Desk[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [replied, setReplied] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);

  // Open cases are fetched on their own so no amount of history can push one out of the queue.
  const load = useCallback(async () => {
    const db = sb();
    const [o, h, s] = await Promise.all([
      db.from("desk").select("*").is("finished_at", null).order("created_at"),
      db.from("desk").select("*").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(HISTORY),
      db.from("station").select("id, label").order("id"),
    ]);
    const openCases = (o.data ?? []) as Desk[];
    const r = openCases.length ? await db.from("reply").select("incident").in("incident", openCases.map((c) => c.id)) : { data: [] };
    setOpen(openCases); setDone((h.data ?? []) as Desk[]); setStations((s.data ?? []) as Station[]);
    setReplied(new Set(((r.data ?? []) as { incident: string }[]).map((x) => x.incident)));
  }, []);
  useLive(["desk", "reply"], load);

  const label = useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s.label.ja])), [stations]);
  const current = [...open, ...done].find((c) => c.id === sel) ?? open[0] ?? null;
  const run: Run = (name, body = {}) => cmd(name, body).catch((e: Error) => { toast.error(staffError(e.message)); });

  useQueueKeys(open, current, setSel, run);
  const peers = usePresence(me, current?.id ?? null);
  const watching = peers.filter((p) => current && p.viewing === current.id).map((p) => p.name);
  const commands = [
    ...open.map((c) => ({ group: STAFF.palette.cases, label: `${label[c.station] ?? c.station} · ${isFault(c.fault) ? FAULTS[c.fault].ja : DESK.unknownFault}`, onSelect: () => setSel(c.id) })),
    ...(current && !current.operator_id && !current.finished_at ? [{ group: STAFF.palette.actions, label: DESK.claim, hint: "C", onSelect: () => run("claim", { incident: current.id }) }] : []),
    ...stations.map((s) => ({ group: STAFF.palette.actions, label: DESK.manualFaultAt(s.label.ja), onSelect: () => run("simulate", { station: s.id, fault: DEVICE_FAULT }) })),
  ];

  return (
    <AppShell
      commands={commands}
      nav={navFor(me.role, { "/operator": open.length })}
      footer={<><Peers peers={peers} /><MeFooter me={me} /></>}
      side={<Queue open={open} done={done} replied={replied} label={label} current={current?.id} onPick={setSel} />}
      crumb={DESK.title}
      title={current ? (label[current.station] ?? current.station) : DESK.queue}
      actions={<>{watching.length > 0 && <span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:inline-flex"><Dot s="live" />{DESK.alsoViewing(watching.join("・"))}</span>}<MoreMenu label={DESK.manualFault} items={stations.map((s) => ({ label: DESK.manualFaultAt(s.label.ja), onClick: () => run("simulate", { station: s.id, fault: DEVICE_FAULT }) }))} /></>}
    >
      {current
        ? <CaseView key={current.id} d={current} me={me} run={run} />
        : <div className="grid h-full min-h-[60dvh] place-items-center p-8 text-center"><p className="max-w-sm text-[14px] text-muted-foreground">{open.length || done.length ? DESK.pickCase : DESK.empty}</p></div>}
    </AppShell>
  );
}

// Which target applies to an open case, and how close it is: unclaimed → claim target; claimed without a reply → first-reply target.
function slaOf(c: Desk, replied: boolean, now: number): { kind: string; tone: "ok" | "warn" | "late"; left: number } | null {
  if (c.finished_at || replied || c.status === "guided") return null;
  const kind = c.operator_id ? "reply" : "claim";
  const target = kind === "claim" ? SLA.claimS : SLA.firstReplyS;
  const left = Math.round(target - (now - Date.parse(c.created_at)) / 1000);
  return { kind, tone: left < 0 ? "late" : left < target * (1 - SLA.warn) ? "warn" : "ok", left };
}

// J / K move through open cases, C claims the selected one. Ignored while typing.
function useQueueKeys(open: Desk[], current: Desk | null, select: (id: string) => void, run: Run) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const i = open.findIndex((c) => c.id === current?.id);
      const k = e.key.toLowerCase();
      if (k === "j" && open.length) select(open[Math.min(open.length - 1, i + 1)].id);
      else if (k === "k" && open.length) select(open[Math.max(0, i - 1)].id);
      else if (k === "c" && current && !current.operator_id && !current.finished_at) run("claim", { incident: current.id });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, current, select, run]);
}

function Peers({ peers }: { peers: Peer[] }) {
  if (!peers.length) return null;
  return (
    <div className="flex items-center gap-2 px-2 pb-2 text-[12px] text-muted-foreground">
      <span className="flex -space-x-1.5">{peers.slice(0, 4).map((p) => <span key={p.uid} title={p.name} className="grid size-5 place-items-center rounded-full border-2 border-background bg-secondary text-[10px] text-foreground">{p.name.slice(0, 1)}</span>)}</span>
      {DESK.online(peers.length)}
    </div>
  );
}

function Queue({ open, done, replied, label, current, onPick }: { open: Desk[]; done: Desk[]; replied: Set<string>; label: Record<string, string>; current?: string; onPick: (id: string) => void }) {
  const now = useMinute();
  const ago = (t: string) => DESK.minutesAgo(Math.max(0, Math.round((now - Date.parse(t)) / 60000)));
  return (
    <div className="flex flex-col gap-4">
      <QueueGroup title={DESK.queue} empty={DESK.empty}>
        {open.map((c) => (
          <QueueRow key={c.id} on={c.id === current} onClick={() => onPick(c.id)} dot={c.status} sla={slaOf(c, replied.has(c.id), now)}
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

function QueueRow({ on, onClick, dot, title, meta, sub, muted, sla }: { on: boolean; onClick: () => void; dot: string; title: string; meta: string; sub?: React.ReactNode; muted?: boolean; sla?: ReturnType<typeof slaOf> }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-close
      className={cn("flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent aria-pressed:bg-accent", muted && "text-muted-foreground")}>
      <span className="flex items-center gap-2">
        <Dot s={dot} />
        <span className={cn("min-w-0 flex-1 truncate text-[14px]", !muted && "text-foreground")}>{title}</span>
        <span className={cn("num shrink-0 text-[11px]", sla?.tone === "late" ? "text-alert" : sla?.tone === "warn" ? "text-warn" : "text-muted-foreground")}>
          {sla && sla.tone !== "ok" ? (sla.tone === "late" ? SLA.late(Math.ceil(-sla.left / 60)) : SLA.left(sla.left)) : meta}
        </span>
      </span>
      {sub && <span className="truncate pl-3.5 text-[12px] text-muted-foreground">{sub}</span>}
    </button>
  );
}
