import { FRONT_DESK } from "@content/frontline";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ClipboardList, ChartColumn, LogOut } from "lucide-react-native";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, type Me } from "@/components/StaffGate";
import { Brand, IconButton, Menu, Notice, Row, Screen, Section, T } from "@/components/ui";
import { type Desk, type OpenDesk, type Targets, errorJa, faultJa, minutesAgo, slaOf, slaText, useClock, when } from "@/lib/staff";
import { PARTNER, LANG_NAME, MOBILE, NAV, STAFF, type L10n, STAFF_JA } from "@content/catalogue";

const O = MOBILE.operator;
const HISTORY = 8;
type Station = { id: string; label: L10n };

export default function OperatorScreen() {
  return <StaffGate need="case:act" title={O.title}>{(me) => <Queue me={me} />}</StaffGate>;
}

function Queue({ me }: { me: Me }) {
  const [open, setOpen] = useState<OpenDesk[]>([]);
  const [done, setDone] = useState<Desk[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [targets, setTargets] = useState<Targets>({});
  const [error, setError] = useState("");
  const now = useClock();

  // Open cases are fetched on their own so no amount of history can push one out of the queue.
  const load = useCallback(async () => {
    const db = sb();
    // Each open case carries its claim time and whether a reply exists, for the response-time targets.
    const [o, h, s, t] = await Promise.all([
      db.from("desk").select("*, reply(id), case_event(at)").is("finished_at", null)
        .eq("reply.author", "human").eq("case_event.kind", "claimed").order("at", { referencedTable: "case_event" })
        .limit(1, { referencedTable: "case_event" }).limit(1, { referencedTable: "reply" }).order("created_at"),
      db.from("desk").select("*").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(HISTORY),
      db.from("station").select("id, label").order("id"),
      db.schema("ichido").from("sla_target").select("reason, seconds"),
    ]);
    setOpen((o.data ?? []) as OpenDesk[]); setDone((h.data ?? []) as Desk[]); setStations((s.data ?? []) as Station[]);
    setTargets(Object.fromEntries(((t.data ?? []) as { reason: string; seconds: number }[]).map((r) => [r.reason, r.seconds])));
  }, []);
  useLive(["desk", "reply"], load);

  const label = useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s.label.ja])), [stations]);
  const simulate = (station: string) => cmd("simulate", { station }).then(() => setError("")).catch((e: Error) => setError(errorJa(e.message)));
  const openCase = (id: string) => router.push({ pathname: "/operator/[id]", params: { id } });

  return (
    <Screen
      eyebrow={<Brand />}
      title={O.title}
      onRefresh={load}
      right={
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Menu label={O.simulate} closeLabel={MOBILE.staff.close} items={stations.map((s) => ({ label: O.simulateAt(s.label.ja), onPress: () => simulate(s.id) }))} />
          <IconButton icon={ClipboardList} label={PARTNER.mine} onPress={() => router.push("/work")} />
          <IconButton icon={ChartColumn} label={NAV.insights} onPress={() => router.push("/insights")} />
          <IconButton icon={LogOut} label={STAFF.signOut} onPress={me.signOut} />
        </View>
      }
    >
      {me.push && <T v="small">{me.push}</T>}
      {error ? <Notice tone="alert">{error}</Notice> : null}

      {[
        {label:FRONT_DESK.queued,rows:open.filter(c=>c.handler === "queued"),empty:FRONT_DESK.emptyQueued},
        {label:FRONT_DESK.ai,rows:open.filter(c=>c.handler === "ai"),empty:FRONT_DESK.emptyAI},
        {label:O.queue,rows:open.filter(c=>c.handler === "human" || c.handler === "legacy"),empty:O.empty},
      ].map(lane => <Section key={lane.label} label={lane.label} right={<T v="label">{lane.rows.length}</T>}>
        {lane.rows.length === 0 ? <T v="label">{lane.empty}</T> : <View>
            {lane.rows.map((c) => {
              const sla = slaOf(c, targets, now);
              const late = sla && sla.tone !== "ok";
              return (
                <Row key={c.id} status={c.status} label={label[c.station] ?? c.station} chevron onPress={() => openCase(c.id)}
                  meta={late ? slaText(sla) : O.minutesAgo(minutesAgo(c.created_at, now))}
                  metaTone={sla?.tone === "late" ? "alert" : sla?.tone === "warn" ? "warn" : undefined}
                  sub={`${faultJa(c.fault)}${c.lang ? ` · ${LANG_NAME[c.lang]}` : ""}${c.operator_id ? "" : ` · ${O.unclaimed}`}`} />
              );
            })}
          </View>}
      </Section>)}

      {done.length > 0 && (
        <Section label={O.history}>
          <View>
            {done.map((c) => (
              <Row key={c.id} status={c.abandoned ? "alert" : "guided"} label={label[c.station] ?? c.station} meta={when(c.created_at)} chevron onPress={() => openCase(c.id)}
                sub={c.abandoned ? O.abandonedChip : STAFF_JA.status[c.status]} />
            ))}
          </View>
        </Section>
      )}
    </Screen>
  );
}
