"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { usePresence } from "@/lib/presence";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Dot, MoreMenu, Notice } from "@/components/kit";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CASES, DESK, FRAUD_FAULT, OPS, packOfKind, STAFF, isFault, staffError, STAFF_JA } from "@/content/catalogue";
import { CaseAlerts } from "./alerts";
import { BotReminders } from "./bot";
import { MassBanner, PromiseAlerts, incidentOrder } from "./ops";
import { CaseView } from "./case";
import { DisasterProposals } from "@/components/disaster-proposals";
import { Peers, Queue, useClock, useQueueKeys } from "./queue";
import type { Desk, OpenDesk, Run, Station, Targets } from "./types";

const HISTORY = 12;
const hashId = () => window.location.hash.slice(1);
const noHash = () => "";
const select = (id: string) => { window.location.hash = id; };
function watchHash(change: () => void) {
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
}

export default function OperatorPage() {
  return <StaffGate need="case:act" title={DESK.title}>{(me) => <Console me={me} />}</StaffGate>;
}

type Snapshot = {
  open: OpenDesk[]; done: Desk[]; stations: Station[]; targets: Targets; selection: string; archived: Desk | null;
};

function useDesk(sel: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);

  // Open cases are fetched on their own so no amount of history can push one out of the queue.
  const load = useCallback(async (signal: AbortSignal) => {
    const db = sb();
    const [o, h, s, t] = await Promise.all([
      db.from("desk").select("*, escalation(reason), reply(id, sent_at), case_event(at)").is("finished_at", null)
        .eq("reply.author", "human").eq("case_event.kind", "claimed").order("at", { referencedTable: "case_event" })
        .limit(1, { referencedTable: "case_event" }).order("sent_at", { referencedTable: "reply", ascending: false })
        .limit(1, { referencedTable: "reply" }).order("created_at").abortSignal(signal),
      db.from("desk").select("*").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(HISTORY).abortSignal(signal),
      db.from("station").select("id, label, kind").order("id").abortSignal(signal),
      db.schema("ichido").from("sla_target").select("reason, seconds").abortSignal(signal),
    ]);
    if (signal.aborted) return;
    if (o.error || h.error || s.error || t.error) { setFailed(true); return; }
    const queue = incidentOrder(o.data as OpenDesk[]);
    const recent = h.data as Desk[];
    let archived: Desk | null = null;
    if (sel && ![...queue, ...recent].some((row) => row.id === sel)) {
      const valid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(sel);
      const row = valid ? await db.from("desk").select("*").eq("id", sel).abortSignal(signal).maybeSingle() : null;
      if (signal.aborted) return;
      if (row?.error) { setFailed(true); return; }
      archived = (row?.data ?? null) as Desk | null;
    }
    if (signal.aborted) return;
    const targets: Targets = Object.fromEntries(t.data.map((row) => [row.reason, row.seconds]));
    setSnapshot({ open: queue, done: recent, stations: s.data as Station[], targets, selection: sel, archived });
    setFailed(false);
  }, [sel]);
  useLive(["desk", "reply", "escalation"], load);

  return { snapshot, failed };
}

function Console({ me }: { me: Me }) {
  const sel = useSyncExternalStore(watchHash, hashId, noHash);
  const { snapshot, failed } = useDesk(sel);
  const now = useClock();
  const open = snapshot?.open ?? null;
  const escalated = open?.filter((c) => c.escalation.length) ?? [];
  const label = useMemo<Record<string, string>>(() => Object.fromEntries((snapshot?.stations ?? []).map((s) => [s.id, s.label.ja])), [snapshot]);
  const listed = snapshot && [...snapshot.open, ...snapshot.done].find((row) => row.id === sel);
  const current = sel ? listed ?? (snapshot?.selection === sel ? snapshot.archived : null) : open?.[0];
  // Pin the auto-selected case in the URL, so it stays on screen after it closes (for the record and hand-off)
  // and a newly arriving case never pulls the operator away mid-task.
  const pin = !sel && current ? current.id : null;
  useEffect(() => {
    if (!pin) return;
    history.replaceState(null, "", `#${pin}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, [pin]);
  let empty = CASES.loading;
  if (snapshot?.selection === sel) {
    empty = sel ? staffError("not_found") : snapshot.done.length ? DESK.pickCase : DESK.empty;
  }
  const run: Run = useCallback((name, body = {}) => cmd(name, body).catch((e: Error) => { toast.error(staffError(e.message)); }), []);
  useQueueKeys(open ?? [], current, select, run);
  const peers = usePresence(me, current?.id ?? null);
  const watching = peers.filter((p) => current && p.viewing === current.id).map((p) => p.name);
  const stations = snapshot?.stations ?? [];
  const commands = [
    ...(open ?? []).map((c) => ({ group: STAFF.palette.cases, label: `${label[c.station] ?? c.station} · ${isFault(c.fault) ? STAFF_JA.fault[c.fault] : DESK.unknownFault}`, onSelect: () => select(c.id) })),
    ...(current && !current.operator_id && !current.finished_at ? [{ group: STAFF.palette.actions, label: DESK.claim, hint: "C", onSelect: () => run("claim", { incident: current.id }) }] : []),
    ...stations.map((s) => ({ group: STAFF.palette.actions, label: DESK.manualFaultAt(s.label.ja), onSelect: () => run("simulate", { station: s.id }) })),
  ];

  return (
    <AppShell
      commands={commands}
      nav={navFor(me.role, { "/operator": open?.length })}
      footer={<><Peers peers={peers} /><MeFooter me={me} /></>}
      side={snapshot && <Queue open={snapshot.open} done={snapshot.done} targets={snapshot.targets} now={now} label={label} current={current?.id} onPick={select} />}
      crumb={DESK.title}
      title={current ? (label[current.station] ?? current.station) : DESK.queue}
      actions={<>
        {escalated.length > 0 && <DropdownMenu>
          <DropdownMenuTrigger className="rounded-md border border-alert px-2 py-1 text-sm font-medium text-alert">
            {DESK.escalations(escalated.length)}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-max max-w-screen">
            {escalated.map((c) => <DropdownMenuItem key={c.id} onClick={() => select(c.id)}>
              {label[c.station] ?? c.station} · {c.escalation.map((e) => DESK.escalationReason[e.reason]).join("・")}
            </DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>}
        {watching.length > 0 && <span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:inline-flex"><Dot s="live" />{DESK.alsoViewing(watching.join("・"))}</span>}
        <CaseAlerts open={open?.filter((d) => d.handler !== "ai") ?? null} labels={label} />
        <BotReminders open={open} labels={label} me={me.uid} />
        <PromiseAlerts open={open} labels={label} me={me.uid} />
        <MoreMenu label={DESK.manualFault} items={stations.flatMap((s) => [
          { label: DESK.manualFaultAt(s.label.ja), onClick: () => run("simulate", { station: s.id }) },
          ...(packOfKind(s.kind) === "atm" ? [{ label: OPS.fraud.manual(s.label.ja), onClick: () => run("simulate", { station: s.id, fault: FRAUD_FAULT }) }] : []),
        ])} />
      </>}
    >
      <MassBanner open={open} />
      <DisasterProposals label={label} />
      {failed && <Notice tone="warn">{CASES.loadError}</Notice>}
      {current
        ? <CaseView key={current.id} d={current} me={me} run={run} />
        : !failed && <div className="grid h-full min-h-[60dvh] place-items-center p-8 text-center"><p className="max-w-sm text-[14px] text-muted-foreground">{empty}</p></div>}
    </AppShell>
  );
}
