import { useCallback, useState } from "react";
import { View } from "react-native";
import { LogOut } from "lucide-react-native";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, type Me } from "@/components/StaffGate";
import { Brand, Button, Card, Hairline, IconButton, Notice, Pill, Screen, T, Tag, Toggle } from "@/components/ui";
import { faultJa } from "@/lib/staff";
import { ETA_OPTIONS, MOBILE, STAFF, packOfFault, packStaffField, type FieldState, type L10n, STAFF_JA } from "@content/catalogue";

const F = MOBILE.field;
type Job = { incident: string; station: string; fault: string; generation: number; state: FieldState; eta: string | null; updated_at: string };
const UNKNOWN_ETA = "";
// Pill tint per assignment state, on the same scale as case status.
const TONE: Record<FieldState, string> = { none: "neutral", requested: "received", on_way: "review", arrived: "field", done: "guided" };

export default function FieldScreen() {
  return <StaffGate need="field:act" title={MOBILE.operator.guard}>{(me) => <Jobs me={me} />}</StaffGate>;
}

// Only this guard's open assignments (row-level security). No identity checks or card handback here.
function Jobs({ me }: { me: Me }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  // Each job's estimate starts unknown; only the guard's own pick is ever sent.
  const [eta, setEta] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
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
  // The generation pins the update to this assignment; a replaced guard gets "forbidden".
  const act = (j: Job, state: string) =>
    cmd("field", { incident: j.incident, generation: j.generation, state, eta: state === "on_way" ? eta[j.incident] ?? UNKNOWN_ETA : undefined })
      .then(() => { setError(""); load(); })
      .catch((e: Error) => setError(e.message === "forbidden" ? F.changed : F.failed));

  return (
    <Screen eyebrow={<Brand />} title={F.title} onRefresh={load}
      right={<IconButton icon={LogOut} label={STAFF.signOut} onPress={me.signOut} />}>
      <Tag value={F.header(me.name)} />
      {error ? <Notice tone="alert">{error}</Notice> : null}
      {jobs.length === 0 && <Card><T v="body">{F.empty}</T></Card>}
      {jobs.map((j) => (
        <Card key={j.incident}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T v="small" mono>{j.station}</T>
            <Pill tone={TONE[j.state]}>{(packStaffField(packOfFault(j.fault)) ?? STAFF_JA.field)[j.state]}</Pill>
          </View>
          <View style={{ gap: 2 }}>
            <T v="h1" style={{ fontSize: 22, lineHeight: 28, letterSpacing: -0.66 }}>{labels[j.station] ?? j.station}</T>
            <T v="row" tone="alert">{faultJa(j.fault)}</T>
          </View>
          {j.eta && <Tag label={F.eta} value={F.minutes(j.eta)} />}
          <Hairline />
          <T v="label">{F.etaMine}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {ETA_OPTIONS.map((v) => (
              <Toggle key={v} on={(eta[j.incident] ?? UNKNOWN_ETA) === v} label={v ? F.minutes(v) : F.etaUnknown}
                onPress={() => setEta({ ...eta, [j.incident]: v })} style={{ minWidth: 72 }} />
            ))}
          </View>
          <Button label={F.onWay} onPress={() => act(j, "on_way")} block />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button kind="secondary" label={F.arrived} onPress={() => act(j, "arrived")} style={{ flex: 1 }} />
            <Button kind="secondary" label={F.done} onPress={() => act(j, "done")} style={{ flex: 1 }} />
          </View>
          <T v="small">{F.note}</T>
        </Card>
      ))}
    </Screen>
  );
}
