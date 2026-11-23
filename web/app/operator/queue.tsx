"use client";
import { useEffect, useState } from "react";
import { Dot, useSidebar } from "@/components/kit";
import { cn } from "@/lib/utils";
import { DESK, FRONT_DESK, LANG_NAME, SLA, isFault, STAFF_JA } from "@/content/catalogue";
import type { Peer } from "@/lib/presence";
import { TextOnlyBadge } from "./access";
import { opsTags } from "./ops";
import { when, type Desk, type OpenDesk, type Targets, type Run } from "./types";

// A clock for countdowns and "n minutes ago", ticking every 15 seconds.
export function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  return now;
}

type Sla = { tone: "ok" | "warn" | "late"; left: number };

// Which target applies to an open case, and how close it is: unclaimed → claim target; claimed without a reply → first-reply target.
function slaOf(c: OpenDesk, targets: Targets, now: number): Sla | null {
  if (c.handler === "ai") return null;
  const start = c.queued_at ?? (c.operator_id ? c.case_event[0]?.at : c.created_at);
  const target = targets[c.operator_id ? "no_reply" : "unclaimed"];
  if (c.reply.length || !start || !target) return null;
  const left = Math.round(target - (now - Date.parse(start)) / 1000);
  return { tone: left < 0 ? "late" : left < target * (1 - SLA.warn) ? "warn" : "ok", left };
}

// J / K move through open cases, C claims the selected one. Ignored while typing or in a dialog.
export function useQueueKeys(open: Desk[], current: Desk | null | undefined, select: (id: string) => void, run: Run) {
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

export function Peers({ peers }: { peers: Peer[] }) {
  const { collapsed } = useSidebar();
  if (!peers.length) return null;
  if (collapsed) return <span title={DESK.online(peers.length)} className="mx-auto mb-2 grid size-6 place-items-center rounded-full bg-secondary text-[10px] text-foreground">+{peers.length}</span>;
  return (
    <div className="flex items-center gap-2 px-2 pb-2 text-[12px] text-muted-foreground">
      <span className="flex -space-x-1.5">{peers.slice(0, 4).map((p) => <span key={p.uid} title={p.name} className="grid size-5 place-items-center rounded-full border-2 border-background bg-secondary text-[10px] text-foreground">{p.name.slice(0, 1)}</span>)}</span>
      {DESK.online(peers.length)}
    </div>
  );
}

export function Queue({ open, done, targets, now, label, current, onPick }: {
  open: OpenDesk[]; done: Desk[]; targets: Targets; now: number; label: Record<string, string>; current?: string; onPick: (id: string) => void;
}) {
  const ago = (t: string) => DESK.minutesAgo(Math.max(0, Math.round((now - Date.parse(t)) / 60000)));
  return (
    <div className="flex flex-col gap-6">
      {[
        { title: FRONT_DESK.queued, empty: FRONT_DESK.emptyQueued, rows: open.filter((c) => c.handler === "queued") },
        { title: FRONT_DESK.ai, empty: FRONT_DESK.emptyAI, rows: open.filter((c) => c.handler === "ai") },
        { title: DESK.queue, empty: DESK.empty, rows: open.filter((c) => c.handler === "human" || c.handler === "legacy") },
      ].map(({ title, empty, rows }) => <QueueGroup key={title} title={title} empty={empty}>
        {rows.map((c) => (
          <QueueRow key={c.id} on={c.id === current} onClick={() => onPick(c.id)} dot={c.status} sla={slaOf(c, targets, now)}
            title={label[c.station] ?? c.station} meta={ago(c.queued_at ?? c.created_at)}
            sub={<>{c.priority != null && <>P{c.priority} · </>}{c.text_only && <><TextOnlyBadge />{" "}</>}{isFault(c.fault) ? STAFF_JA.fault[c.fault] : DESK.unknownFault}{c.lang && <> · {LANG_NAME[c.lang]}</>}{opsTags(c) && <span className="text-alert"> · {opsTags(c)}</span>}</>} />
        ))}
      </QueueGroup>)}
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
      <span className="px-2 pb-2 text-[14px] font-medium text-foreground">{title}</span>
      {children.length ? children : empty && <p className="px-2 text-[13px] leading-5 text-muted-foreground">{empty}</p>}
    </div>
  );
}

function QueueRow({ on, onClick, dot, title, meta, sub, muted, sla }: { on: boolean; onClick: () => void; dot: string; title: string; meta: string; sub?: React.ReactNode; muted?: boolean; sla?: Sla | null }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-close
      className={cn("flex min-h-12 w-full flex-col justify-center gap-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent aria-pressed:bg-accent", muted && "text-muted-foreground")}>
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
