"use client";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Dot, MoreMenu, Notice } from "@/components/kit";
import { cn } from "@/lib/utils";
import { CASES, DESK, DEVICE_FAULT, FAULTS, LANG_NAME, isFault, staffError } from "@/content/catalogue";
import { CaseAlerts } from "./alerts";
import { CaseView } from "./case";
import { when, type Desk, type Run, type Station } from "./types";

const HISTORY = 12;
const hashId = () => window.location.hash.slice(1);
const noHash = () => "";
function watchHash(change: () => void) {
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
}

export default function OperatorPage() {
  return <StaffGate allow={["operator"]} title={DESK.title}>{(me) => <Console me={me} />}</StaffGate>;
}

type Snapshot = {
  open: Desk[]; done: Desk[]; stations: Station[]; selection: string; archived: Desk | null; now: number;
};

function useDesk(sel: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);

  // Open cases are fetched on their own so no amount of history can push one out of the queue.
  const load = useCallback(async (signal: AbortSignal) => {
    const db = sb();
    const [o, h, s] = await Promise.all([
      db.from("desk").select("*").is("finished_at", null).order("created_at").abortSignal(signal),
      db.from("desk").select("*").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(HISTORY).abortSignal(signal),
      db.from("station").select("id, label").order("id").abortSignal(signal),
    ]);
    if (signal.aborted) return;
    if (o.error || h.error || s.error) { setFailed(true); return; }
    const queue = o.data as Desk[];
    const recent = h.data as Desk[];
    let archived: Desk | null = null;
    if (sel && ![...queue, ...recent].some((row) => row.id === sel)) {
      const valid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(sel);
      const row = valid ? await db.from("desk").select("*").eq("id", sel).abortSignal(signal).maybeSingle() : null;
      if (signal.aborted) return;
      if (row?.error) { setFailed(true); return; }
      archived = (row?.data ?? null) as Desk | null;
    }
    setSnapshot({ open: queue, done: recent, stations: s.data as Station[], selection: sel, archived, now: Date.now() });
    setFailed(false);
  }, [sel]);
  useLive(["desk"], load);

  return { snapshot, failed };
}

function Console({ me }: { me: Me }) {
  const sel = useSyncExternalStore(watchHash, hashId, noHash);
  const { snapshot, failed } = useDesk(sel);
  const open = snapshot?.open ?? null;
  const label = useMemo<Record<string, string>>(() => Object.fromEntries((snapshot?.stations ?? []).map((s) => [s.id, s.label.ja])), [snapshot]);
  const listed = snapshot && [...snapshot.open, ...snapshot.done].find((row) => row.id === sel);
  const current = sel ? listed ?? (snapshot?.selection === sel ? snapshot.archived : null) : open?.[0];
  let empty = CASES.loading;
  if (snapshot?.selection === sel) {
    empty = sel ? staffError("not_found") : snapshot.done.length ? DESK.pickCase : DESK.empty;
  }
  const run: Run = (name, body = {}) => cmd(name, body).catch((e: Error) => { toast.error(staffError(e.message)); });

  return (
    <AppShell
      nav={navFor(me.role, { "/operator": open?.length })}
      footer={<MeFooter me={me} />}
      side={snapshot && <Queue open={snapshot.open} done={snapshot.done} now={snapshot.now} label={label} current={current?.id} onPick={(id) => { window.location.hash = id; }} />}
      crumb={DESK.title}
      title={current ? (label[current.station] ?? current.station) : DESK.queue}
      actions={<>
        <CaseAlerts open={open} labels={label} />
        <MoreMenu label={DESK.manualFault} items={(snapshot?.stations ?? []).map((s) => ({
          label: DESK.manualFaultAt(s.label.ja), onClick: () => run("simulate", { station: s.id, fault: DEVICE_FAULT }),
        }))} />
      </>}
    >
      {failed && <Notice tone="warn">{CASES.loadError}</Notice>}
      {current
        ? <CaseView key={current.id} d={current} me={me} run={run} />
        : !failed && <div className="grid h-full min-h-[60dvh] place-items-center p-8 text-center"><p className="max-w-sm text-[14px] text-muted-foreground">{empty}</p></div>}
    </AppShell>
  );
}

function Queue({ open, done, now, label, current, onPick }: { open: Desk[]; done: Desk[]; now: number; label: Record<string, string>; current?: string; onPick: (id: string) => void }) {
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
