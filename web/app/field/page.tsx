"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Chip, Dot, Notice } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BOT, DESK, nextFieldStep, SHIFT, ETA_OPTIONS, FIELD, OPS, PACKS, PACK_DESK, isFault, packOfFault, packStaffField, type FieldState, type L10n, STAFF_JA } from "@/content/catalogue";

type Job = { accepted_at: string | null; acknowledged_at: string | null; declined_at: string | null; incident: string; station: string; fault: string; generation: number; state: FieldState; eta: string | null; updated_at: string; reminded_gen: number | null; reestimate_gen: number | null };
type Site = { label: string; company: string };
const UNKNOWN_ETA = "";
const STEPS = ["on_way", "arrived", "done"] as const;

const LABEL: Record<string, string> = { accept: SHIFT.accept, on_way: FIELD.onWay, arrived: FIELD.arrived, done: FIELD.done };

export default function FieldPage() {
  return <StaffGate need="field:act" title={FIELD.title}>{(me) => <Jobs me={me} />}</StaffGate>;
}

// Only this guard's open assignments (row-level security). No identity checks or card handback here.
function Jobs({ me }: { me: Me }) {
  const [previous,setPrevious] = useState<{ incident: string; station: string; generation: number }[]>([]);
  const [loaded,setLoaded] = useState(false);
  const [failed,setFailed] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sites, setSites] = useState<Record<string, Site>>({});
  const load = useCallback(async () => {
    const db = sb();
    const [j, s, old] = await Promise.all([
      db.from("field_job").select("*").neq("state", "done").order("assigned_at"),
      db.from("station").select("id, label, security_company"),
      db.from("field_standdown").select("incident,station,generation").gt("at",new Date(Date.now()-86400000).toISOString()).order("at",{ascending:false}),
    ]);
    const failed = Boolean(j.error || s.error || old.error);
    setFailed(failed);
    if (failed) return;
    setLoaded(true);
    setPrevious(old.data ?? []);
    setJobs((j.data ?? []) as Job[]);
    setSites(Object.fromEntries(((s.data ?? []) as { id: string; label: L10n; security_company: string }[]).map((x) => [x.id, { label: x.label.ja, company: x.security_company }])));
  }, []);
  useLive(["field_job","field_standdown"], load);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("job");
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [jobs]);

  return (
    <AppShell nav={navFor(me.role, { "/field": jobs.length })} footer={<MeFooter me={me} />} title={FIELD.title}>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 lg:p-8">
        {previous.map((s) => <Notice key={`${s.incident}-${s.generation}`}>{s.station} · {SHIFT.reassigned}</Notice>)}
        {failed && <Notice tone="warn">{SHIFT.readFailed}</Notice>}
        {loaded && !failed && jobs.length === 0 && <p className="py-16 text-center text-[14px] text-muted-foreground">{FIELD.none}</p>}
        {jobs.map((j) => <JobCard key={`${j.incident}-${j.generation}`} j={j} label={sites[j.station]?.label ?? j.station} company={sites[j.station]?.company} />)}
      </div>
    </AppShell>
  );
}

function JobCard({ j, label, company }: { j: Job; label: string; company?: string }) {
  // The estimate starts unknown; only the guard's own pick is ever sent.
  const [eta, setEta] = useState(UNKNOWN_ETA);
  const next = nextFieldStep(j.state, j.accepted_at);
  const [correct, setCorrect] = useState(false);
  const act = (state: string) =>
    cmd("field", { incident: j.incident, generation: j.generation, state, eta: state === "on_way" ? eta : undefined })
      .catch((e: Error) => toast.error(e.message === "forbidden" ? FIELD.changed : FIELD.failed));
  return (
    <section id={j.incident} className="surface flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <span className="mono text-muted-foreground">{j.station} · {PACKS[packOfFault(j.fault)].name.staff}</span>
        <span className="inline-flex items-center gap-1.5 text-[13px]"><Dot s="field" />{(packStaffField(packOfFault(j.fault)) ?? STAFF_JA.field)[j.state]}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[22px] leading-tight tracking-[-0.03em] text-foreground">{label}</span>
        <span className="text-[14px]">{isFault(j.fault) ? STAFF_JA.fault[j.fault] : DESK.unknownFault}</span>
        {company && <span className="text-[12px] text-muted-foreground">{OPS.field.via(company)}</span>}
      </div>
      {j.state === "requested" && j.reminded_gen === j.generation && <Notice tone="warn">{BOT.fieldBanner}</Notice>}
      {j.reestimate_gen === j.generation && <Notice tone="warn">{j.state === "arrived" ? OPS.field.arrivedLong : OPS.field.reestimate}</Notice>}
      {j.eta && <Chip className="self-start">{FIELD.etaTag} {FIELD.etaOption(j.eta)}</Chip>}
      {(j.state === "requested" || j.state === "on_way") && (
        <div className="flex flex-col gap-1.5 border-t pt-4">
          <Label>{FIELD.etaLabel}</Label>
          <Select value={eta} onValueChange={(v) => setEta(String(v ?? UNKNOWN_ETA))}>
            <SelectTrigger className="h-10 w-full bg-card"><SelectValue>{(v: string) => (v ? FIELD.etaOption(v) : FIELD.etaUnknown)}</SelectValue></SelectTrigger>
            <SelectContent>{ETA_OPTIONS.map((v) => <SelectItem key={v || "unknown"} value={v}>{v ? FIELD.etaOption(v) : FIELD.etaUnknown}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {j.declined_at ? <Notice>{SHIFT.declined}</Notice> : <>
        {next && <Button size="lg" onClick={() => act(next)}>{LABEL[next]}</Button>}
        <div className="flex flex-wrap gap-2">
          {j.state === "requested" && <Button variant="secondary" onClick={() => act("decline")}>{SHIFT.decline}</Button>}
          {j.state === "on_way" && <Button variant="secondary" onClick={() => act("on_way")}>{SHIFT.eta}</Button>}
          <Button variant="secondary" onClick={() => act("help")}>{SHIFT.help}</Button>
          <Button variant="ghost" onClick={() => setCorrect(!correct)}>{SHIFT.correct}</Button>
        </div>
        {correct && <div className="flex gap-2">{STEPS.map((s) => <Button variant="secondary" key={s} onClick={() => { setCorrect(false); void act(`correct_${s}`); }}>{LABEL[s]}</Button>)}</div>}
      </>}
      <p className="text-[12px] leading-5 text-muted-foreground">{packOfFault(j.fault) === "atm" ? FIELD.note : PACK_DESK.fieldNote(PACKS[packOfFault(j.fault)].responder.staff)}</p>
    </section>
  );
}
