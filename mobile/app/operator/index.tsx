import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ChartColumn, LogOut } from "lucide-react-native";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, type Me } from "@/components/StaffGate";
import { Brand, Card, IconButton, Menu, Notice, Row, Screen, Section, T, Tag } from "@/components/ui";
import { type Desk, errorJa, faultJa, minutesAgo, when } from "@/lib/staff";
import { DEVICE_FAULT, LANG_NAME, MOBILE, STAFF, STATUS, type L10n } from "@content/catalogue";

const O = MOBILE.operator;
const HISTORY = 8;
type Station = { id: string; label: L10n };

export default function OperatorScreen() {
  return <StaffGate allow={["operator"]} title={O.title}>{(me) => <Queue me={me} />}</StaffGate>;
}

function Queue({ me }: { me: Me }) {
  const [open, setOpen] = useState<Desk[]>([]);
  const [done, setDone] = useState<Desk[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState("");

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
  const simulate = (station: string) => cmd("simulate", { station, fault: DEVICE_FAULT }).then(() => setError("")).catch((e: Error) => setError(errorJa(e.message)));
  const openCase = (id: string) => router.push({ pathname: "/operator/[id]", params: { id } });

  return (
    <Screen
      eyebrow={<Brand />}
      title={O.title}
      onRefresh={load}
      right={
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Menu label={O.simulate} closeLabel={MOBILE.staff.close} items={stations.map((s) => ({ label: O.simulateAt(s.label.ja), onPress: () => simulate(s.id) }))} />
          <IconButton icon={ChartColumn} label={MOBILE.insights.title} onPress={() => router.push("/insights")} />
          <IconButton icon={LogOut} label={STAFF.signOut} onPress={me.signOut} />
        </View>
      }
    >
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <Tag label={O.open} value={MOBILE.staff.count(open.length)} />
        <Tag value={O.env} />
        <Tag value={me.name} />
      </View>
      {error ? <Notice tone="alert">{error}</Notice> : null}

      <Section label={O.queue} right={<T v="small" mono>{open.length}</T>}>
        {open.length === 0 ? (
          <Card><T v="label">{O.empty}</T></Card>
        ) : (
          <Card style={{ padding: 4, gap: 0 }}>
            {open.map((c) => (
              <Row key={c.id} label={label[c.station] ?? c.station} meta={O.minutesAgo(minutesAgo(c.created_at))} chevron onPress={() => openCase(c.id)}
                sub={
                  <View style={{ gap: 6 }}>
                    <T v="small">{faultJa(c.fault)}</T>
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                      <Tag value={STATUS[c.status].ja} tone={c.operator_id ? undefined : "solid"} />
                      {c.lang && <Tag value={LANG_NAME[c.lang]} />}
                    </View>
                  </View>
                } />
            ))}
          </Card>
        )}
      </Section>

      {done.length > 0 && (
        <Section label={O.history}>
          <Card style={{ padding: 4, gap: 0 }}>
            {done.map((c) => (
              <Row key={c.id} label={label[c.station] ?? c.station} meta={when(c.created_at)} chevron onPress={() => openCase(c.id)}
                sub={c.abandoned ? O.abandonedChip : STATUS[c.status].ja} />
            ))}
          </Card>
        </Section>
      )}
    </Screen>
  );
}
