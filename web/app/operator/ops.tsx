"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Siren, Timer } from "lucide-react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { Chip, Notice, Panel } from "@/components/kit";
import { Pill } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { OPERATOR_PROMISES, OPS, PROMISE_MINUTES, staffError } from "@/content/catalogue";
import { hhmm, type Desk, type Guard, type Job, type OpenDesk, type Run } from "./types";

// Console parts for content/ops.ts: fraud mode, mass incidents, promises, harassment flag and takeover.

const fail = (e: Error) => { toast.error(staffError(e.message)); };

// During a mass incident the queue puts whoever has waited longest since they last heard from us first.
export function incidentOrder(open: OpenDesk[]): OpenDesk[] {
  if (!open.some((c) => c.mass_incident)) return open;
  const since = (c: OpenDesk) => Date.parse(c.reply[0]?.sent_at ?? c.created_at);
  return [...open].sort((a, b) => since(a) - since(b));
}

export const opsTags = (d: Desk) =>
  [d.fraud_at && OPS.fraud.chip, d.mass_incident && OPS.mass.chip, d.abusive_at && OPS.abusive.chip].filter(Boolean).join("・");

// The station's security company, for the operator → control centre → guard chain.
export function useCompany(station: string) {
  const [company, setCompany] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    sb().from("station").select("security_company").eq("id", station).maybeSingle()
      .then(({ data }) => { if (live) setCompany(data?.security_company ?? null); });
    return () => { live = false; };
  }, [station]);
  return company;
}

export function DispatchChain({ company }: { company: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-1 text-[13px] text-foreground">
        {OPS.dispatch.chain(company).map((x, i) => <span key={x} className="inline-flex items-center gap-1">{i > 0 && <ChevronRight className="size-3 stroke-[1.5] text-muted-foreground" />}{x}</span>)}
      </span>
      <span className="text-[12px] leading-5 text-muted-foreground">{OPS.dispatch.note}</span>
    </div>
  );
}

type Mass = { id: string; started_at: string; broadcast_at: string | null; broadcast_by: string | null; recipients: number | null };

// One banner for a mass incident, with the single approved broadcast.
export function MassBanner({ open }: { open: OpenDesk[] | null }) {
  const ids = [...new Set((open ?? []).map((c) => c.mass_incident).filter((x): x is string => Boolean(x)))];
  const key = ids.join(",");
  const [rows, setRows] = useState<Mass[]>([]);
  const [win, setWin] = useState<number | null>(null);
  const [arming, setArming] = useState<string | null>(null);   // the broadcast is irreversible: a second click sends
  const load = useCallback(async () => {
    if (!key) return setRows([]);
    const [m, s] = await Promise.all([
      sb().from("mass_incident").select("*").in("id", key.split(",")),
      sb().schema("ichido").from("ops_setting").select("value").eq("key", "mass_window_s").maybeSingle(),
    ]);
    setRows((m.data ?? []) as Mass[]);
    setWin(s.data?.value ?? null);
  }, [key]);
  useLive(["mass_incident"], load);
  return rows.map((m) => {
    const n = new Set((open ?? []).filter((c) => c.mass_incident === m.id).map((c) => c.station)).size;
    const send = () => cmd<{ sent: number }>("broadcast", { mass: m.id }).then((r) => toast.success(OPS.mass.toast(r.sent))).catch(fail).finally(() => setArming(null));
    return (
      <section key={m.id} className="m-4 flex flex-col gap-2 rounded-xl border border-alert/40 bg-[oklch(0.98_0.015_25)] p-4 lg:mx-8">
        <span className="flex items-center gap-2 text-[15px] font-medium text-foreground"><Siren className="size-4 stroke-[1.5] text-alert" />{OPS.mass.title(n)}</span>
        <p className="text-[13px] leading-5">{OPS.mass.body(Math.round((win ?? 600) / 60))}</p>
        {m.broadcast_at
          ? <span className="text-[13px] text-foreground">{OPS.mass.sent(hhmm(m.broadcast_at), m.broadcast_by ?? "", m.recipients ?? 0)}</span>
          : <div className="flex flex-wrap items-center gap-3">{arming === m.id
            ? <><Button variant="destructive" onClick={send}>{OPS.mass.confirm}</Button><Button variant="ghost" onClick={() => setArming(null)}>{OPS.mass.cancel}</Button></>
            : <Button onClick={() => setArming(m.id)}>{OPS.mass.send}</Button>}<span className="text-[12px] leading-5 text-muted-foreground">{OPS.mass.note}</span></div>}
      </section>
    );
  });
}

// 特殊詐欺の疑い in one action: warning on the caller's phone, red light, guard, police hand-off record.
export function FraudCard({ d, job, guards }: { d: Desk; job: Job | null; guards: Guard[] }) {
  const guard = guards.find((g) => g.uid === job?.assignee) ?? guards[0];
  if (d.fraud_at) return <Notice tone="warn">{OPS.fraud.active(hhmm(d.fraud_at))}</Notice>;
  const go = () => cmd<{ police: { path: string } }>("fraud", { incident: d.id, assignee: guard!.uid })
    .then(async (r) => {
      const url = `${location.origin}${r.police.path}`;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast.success(OPS.fraud.toast, { description: url });
    }).catch(fail);
  return (
    <Panel title={<span className="inline-flex items-center gap-1.5"><Siren className="size-3.5 stroke-[1.5]" />{OPS.fraud.title}</span>}>
      <p className="text-[13px] leading-5">{OPS.fraud.body}</p>
      <ul className="flex flex-col gap-1 text-[13px] leading-5 text-foreground">{OPS.fraud.effects.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-alert" />{x}</li>)}</ul>
      {guard ? <Button variant="destructive" onClick={go}>{OPS.fraud.action(guard.display_name)}</Button> : <Notice>{OPS.fraud.noGuard}</Notice>}
    </Panel>
  );
}

type PromiseRow = { id: string; kind: string; due_at: string; settled_at: string | null; outcome: string | null };

// Call-back and re-check promises with a deadline; the guard's estimate and "arrived" are watched the same way.
export function PromiseCard({ d, run }: { d: Desk; run: Run }) {
  const [rows, setRows] = useState<PromiseRow[]>([]);
  const load = useCallback(async () => {
    const { data } = await sb().from("promise").select("id, kind, due_at, settled_at, outcome").eq("incident", d.id).order("created_at", { ascending: false }).limit(6);
    setRows((data ?? []) as PromiseRow[]);
  }, [d.id]);
  useLive(["promise"], load);
  const open = rows.filter((p) => !p.settled_at);
  const expired = rows.filter((p) => p.outcome === "expired");
  return (
    <Panel title={<span className="inline-flex items-center gap-1.5"><Timer className="size-3.5 stroke-[1.5]" />{OPS.promise.title}</span>}>
      {open.length + expired.length === 0 && <p className="text-[13px] text-muted-foreground">{OPS.promise.none}</p>}
      {[...open, ...expired].map((p) => (
        <div key={p.id} className="flex items-center gap-2 text-[13px]">
          <span className="flex-1 text-foreground">{OPS.promise.kind[p.kind]}</span>
          {p.settled_at ? <Pill tone="alert">{OPS.promise.expired}</Pill> : <Chip>{OPS.promise.due(hhmm(p.due_at))}</Chip>}
          {!p.settled_at && (p.kind === "callback" || p.kind === "recheck") && <Button variant="ghost" size="sm" onClick={() => run("promise_done", { id: p.id })}>{OPS.promise.done}</Button>}
        </div>
      ))}
      {OPERATOR_PROMISES.map((kind) => (
        <div key={kind} className="flex flex-wrap items-center gap-1.5">
          <span className="w-full text-[13px]">{OPS.promise.make(kind)}</span>
          {PROMISE_MINUTES.map((m) => <Button key={m} variant="secondary" size="sm" onClick={() => run("promise", { incident: d.id, kind, minutes: m })}>{OPS.promise.minutes(m)}</Button>)}
        </div>
      ))}
      <p className="text-[12px] leading-5 text-muted-foreground">{OPS.promise.note}</p>
    </Panel>
  );
}

// Another operator holds the case: a supervisor (any operator) can take it over.
export function TakeoverPanel({ d, run, title, body }: { d: Desk; run: Run; title: string; body: string }) {
  const take = () => run("takeover", { incident: d.id }).then((ok) => { if (ok) toast.success(OPS.takeover.toast); });
  return (
    <Panel title={title}>
      <p className="text-[14px]">{body}</p>
      {d.abusive_at && <Notice tone="warn">{OPS.takeover.abusive}</Notice>}
      <Button variant="secondary" onClick={take}>{OPS.takeover.button}</Button>
    </Panel>
  );
}

// H marks the selected case abusive (the operator's own judgement), like J / K / C in the queue.
export function useAbuseKey(d: Desk, mine: boolean, run: Run) {
  useEffect(() => {
    if (!mine || d.finished_at || d.abusive_at) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== "h" || el.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      abusive(d.id, run);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [d.id, d.finished_at, d.abusive_at, mine, run]);
}
export const abusive = (incident: string, run: Run) => run("abusive", { incident }).then((ok) => { if (ok) toast.success(OPS.abusive.toast); });

// A toast when a promise on one of my cases runs out (the Ichido Bot expired it).
export function PromiseAlerts({ open, labels, me }: { open: Desk[] | null; labels: Record<string, string>; me: string }) {
  const latest = useRef({ open, labels });
  useEffect(() => { latest.current = { open, labels }; });
  useEffect(() => {
    const ch = sb().channel(`promise-due-${Math.random().toString(36).slice(2)}`);
    ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "case_event", filter: "kind=eq.promise_due" }, (p) => {
      const e = p.new as { id: number; incident: string; data: { kind?: string } };
      const d = latest.current.open?.find((x) => x.id === e.incident);
      if (!d || d.operator_id !== me) return;
      toast.warning(OPS.promise.toast(latest.current.labels[d.station] ?? d.station, e.data.kind ?? ""), { id: `promise-${e.id}` });
    });
    ch.subscribe();
    return () => { sb().removeChannel(ch); };
  }, [me]);
  return null;
}
