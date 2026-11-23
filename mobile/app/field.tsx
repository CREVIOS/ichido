import { useCallback, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { LogOut } from "lucide-react-native";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, type Me } from "@/components/StaffGate";
import { Brand, Button, Card, IconButton, Notice, Pill, Screen, T, Tag, Toggle } from "@/components/ui";
import { faultJa } from "@/lib/staff";
import { ASSIST, CALLER_FLAGS, nextFieldStep, SHIFT, ETA_OPTIONS, MOBILE, STAFF, packOfFault, packStaffField, type FieldState, type L10n, STAFF_JA } from "@content/catalogue";

const F = MOBILE.field;
type Job = { allergy_flags:string[]; allergy_ack_at:string|null; accepted_at: string | null; acknowledged_at: string | null; declined_at: string | null; incident: string; station: string; fault: string; generation: number; state: FieldState; eta: string | null; updated_at: string };
const UNKNOWN_ETA = "";
// Pill tint per assignment state, on the same scale as case status.
const TONE: Record<FieldState, string> = { none: "neutral", requested: "received", on_way: "review", arrived: "field", done: "guided" };

export default function FieldScreen() {
  return <StaffGate need="field:act" title={MOBILE.operator.guard}>{(me) => <Jobs me={me} />}</StaffGate>;
}

// Only this guard's open assignments (row-level security). No identity checks or card handback here.
function Jobs({ me }: { me: Me }) {
  const { job } = useLocalSearchParams<{ job?: string }>();
  const [all, setAll] = useState(false);
  const [correct, setCorrect] = useState("");
  const [showPrevious,setShowPrevious] = useState(false);
  const [previous,setPrevious] = useState<{ incident: string; station: string; generation: number }[]>([]);
  const [loaded,setLoaded] = useState(false);
  const [failed,setFailed] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  // Each job's estimate starts unknown; only the guard's own pick is ever sent.
  const [eta, setEta] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const db = sb();
    const [j, s, old] = await Promise.all([
      db.from("field_job").select("*").neq("state", "done").order("updated_at", { ascending: false }),
      db.from("station").select("id, label"),
      db.from("field_standdown").select("incident,station,generation").gt("at",new Date(Date.now()-86400000).toISOString()).order("at",{ascending:false}),
    ]);
    const failed = Boolean(j.error || s.error || old.error);
    setFailed(failed);
    if (failed) return;
    setLoaded(true);
    setPrevious(old.data ?? []);
    setJobs((j.data ?? []) as Job[]);
    setLabels(Object.fromEntries(((s.data ?? []) as { id: string; label: L10n }[]).map((x) => [x.id, x.label.ja])));
  }, []);
  useLive(["field_job","field_standdown"], load);
  // The generation pins the update to this assignment; a replaced guard gets "forbidden".
  const act = (j: Job, state: string) =>
    cmd("field", { incident: j.incident, generation: j.generation, state, eta: state === "on_way" ? eta[j.incident] ?? UNKNOWN_ETA : undefined })
      .then(() => { setError(""); load(); })
      .catch((e: Error) => setError(e.message === "forbidden" ? F.changed : F.failed));

  return (
    <Screen eyebrow={<Brand />} title={F.title} onRefresh={load}
      right={<IconButton icon={LogOut} label={STAFF.signOut} onPress={me.signOut} />}>
      <Tag value={F.header(me.name)} />
      {me.push && <T v="small">{me.push}</T>}
      {error ? <Notice tone="alert">{error}</Notice> : null}

      {failed && <Notice tone="alert">{SHIFT.readFailed}</Notice>}
        {loaded && !failed && jobs.length === 0 && <T v="body">{F.empty}</T>}
      {job && !all && <Button kind="ghost" label={F.title} onPress={() => setAll(true)} />}
      {job && !all && !jobs.some((j) => j.incident === job) && <Notice>{F.changed}</Notice>}
      {jobs.filter((j) => !job || all || j.incident === job).map((j) => {
        const next = nextFieldStep(j.state, j.accepted_at);
        const actions = { accept: SHIFT.accept, on_way: F.onWay, arrived: F.arrived, done: F.done };
        return (
        <Card key={j.incident}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T v="small" mono>{j.station}</T>
            <Pill tone={TONE[j.state]}>{(packStaffField(packOfFault(j.fault)) ?? STAFF_JA.field)[j.state]}</Pill>
          </View>
          <View style={{ gap: 2 }}>
            <T v="h1" style={{ fontSize: 22, lineHeight: 28, letterSpacing: -0.66 }}>{labels[j.station] ?? j.station}</T>
            <T v="row" tone="alert">{faultJa(j.fault)}</T>
          </View>
          {j.allergy_flags.length > 0 && <><T>{j.allergy_flags.map(f => CALLER_FLAGS[f].staff).join(" · ")}</T>
            <Button kind="secondary" label={j.allergy_ack_at ? ASSIST.acknowledged : ASSIST.ack} disabled={Boolean(j.allergy_ack_at || j.declined_at)} onPress={() =>
              cmd("ack_allergy",{incident:j.incident,generation:j.generation,flags:j.allergy_flags}).then(load).catch(() => setError(F.changed))} /></>}
          {j.eta && <Tag label={F.eta} value={F.minutes(j.eta)} />}

          <T v="label">{F.etaMine}</T>
          <ScrollView horizontal contentContainerStyle={{gap:6}} showsHorizontalScrollIndicator={false}>
            {ETA_OPTIONS.map((v) => (
              <Toggle key={v} on={(eta[j.incident] ?? UNKNOWN_ETA) === v} label={v ? F.minutes(v) : F.etaUnknown}
                onPress={() => setEta({ ...eta, [j.incident]: v })} style={{ minWidth: 72,borderRadius:24 }} />
            ))}
          </ScrollView>
          {j.declined_at ? <Notice>{SHIFT.declined}</Notice> : <>
            {next && <Button label={actions[next]} onPress={() => act(j, next)} block />}
            {j.state === "requested" && <Button kind="secondary" label={SHIFT.decline} onPress={() => act(j, "decline")} />}
            {j.state === "on_way" && <Button kind="secondary" label={SHIFT.eta} onPress={() => act(j, "on_way")} />}
            <Button kind="secondary" label={SHIFT.help} onPress={() => act(j, "help")} />
            <Button kind="ghost" label={SHIFT.correct} onPress={() => setCorrect(correct === j.incident ? "" : j.incident)} />
            {correct === j.incident && (["on_way","arrived","done"] as const).map((s) => <Button key={s} kind="secondary" label={actions[s]} onPress={() => { setCorrect(""); void act(j, `correct_${s}`); }} />)}
          </>}
          <T v="small">{F.note}</T>
        </Card>
      ); })}
      {previous.length > 0 && <Button kind="ghost" label={SHIFT.reassigned + " · " + previous.length} onPress={() => setShowPrevious(!showPrevious)}/>}
      {showPrevious && previous.map((s) => <Notice key={`${s.incident}-${s.generation}`}>{s.station} · {SHIFT.reassigned}</Notice>)}
    </Screen>
  );
}
