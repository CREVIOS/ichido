"use client";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Chip, Dot } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DESK, ETA_OPTIONS, FAULTS, FIELD, FIELD_STATE, isFault, type FieldState, type L10n } from "@/content/catalogue";

type Job = { incident: string; station: string; fault: string; generation: number; state: FieldState; eta: string | null; updated_at: string };
const UNKNOWN_ETA = "";

export default function FieldPage() {
  return <StaffGate allow={["field"]} title={FIELD.title}>{(me) => <Jobs me={me} />}</StaffGate>;
}

// Only this guard's open assignments (row-level security). No identity checks or card handback here.
function Jobs({ me }: { me: Me }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const db = sb();
    const [j, s] = await Promise.all([
      db.from("field_job").select("*").neq("state", "done").order("updated_at", { ascending: false }),
      db.from("station").select("id, label"),
    ]);
    setJobs((j.data ?? []) as Job[]);
    setLabels(Object.fromEntries(((s.data ?? []) as { id: string; label: L10n }[]).map((x) => [x.id, x.label.ja])));
  }, []);
  useLive(["field_job"], load);

  return (
    <AppShell nav={navFor(me.role, { "/field": jobs.length })} footer={<MeFooter me={me} />} title={FIELD.title}>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 lg:p-8">
        {jobs.length === 0 && <p className="py-16 text-center text-[14px] text-muted-foreground">{FIELD.none}</p>}
        {jobs.map((j) => <JobCard key={`${j.incident}-${j.generation}`} j={j} label={labels[j.station] ?? j.station} />)}
      </div>
    </AppShell>
  );
}

function JobCard({ j, label }: { j: Job; label: string }) {
  // The estimate starts unknown; only the guard's own pick is ever sent.
  const [eta, setEta] = useState(UNKNOWN_ETA);
  const act = (state: string) =>
    cmd("field", { incident: j.incident, generation: j.generation, state, eta: state === "on_way" ? eta : undefined })
      .catch((e: Error) => toast.error(e.message === "forbidden" ? FIELD.changed : FIELD.failed));
  return (
    <section className="surface flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <span className="mono text-muted-foreground">{j.station}</span>
        <span className="inline-flex items-center gap-1.5 text-[13px]"><Dot s="field" />{FIELD_STATE[j.state].ja}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[22px] leading-tight tracking-[-0.03em] text-foreground">{label}</span>
        <span className="text-[14px]">{isFault(j.fault) ? FAULTS[j.fault].ja : DESK.unknownFault}</span>
      </div>
      {j.eta && <Chip className="self-start">{FIELD.etaTag} {FIELD.etaOption(j.eta)}</Chip>}
      <div className="flex flex-col gap-1.5 border-t pt-4">
        <Label>{FIELD.etaLabel}</Label>
        <Select value={eta} onValueChange={(v) => setEta(String(v ?? UNKNOWN_ETA))}>
          <SelectTrigger className="h-10 w-full bg-card"><SelectValue>{(v: string) => (v ? FIELD.etaOption(v) : FIELD.etaUnknown)}</SelectValue></SelectTrigger>
          <SelectContent>{ETA_OPTIONS.map((v) => <SelectItem key={v || "unknown"} value={v}>{v ? FIELD.etaOption(v) : FIELD.etaUnknown}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Button size="lg" className="h-11" onClick={() => act("on_way")}>{FIELD.onWay}</Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="h-10" onClick={() => act("arrived")}>{FIELD.arrived}</Button>
        <Button variant="secondary" className="h-10" onClick={() => act("done")}>{FIELD.done}</Button>
      </div>
      <p className="text-[12px] leading-5 text-muted-foreground">{FIELD.note}</p>
    </section>
  );
}
