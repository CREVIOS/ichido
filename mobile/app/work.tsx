import { useCallback, useState } from "react";
import { router } from "expo-router";
import { StaffGate } from "@/components/StaffGate";
import { Card, Notice, Row, Screen, T } from "@/components/ui";
import { useLive } from "@/lib/live";
import { sb } from "@/lib/supabase";
import { CASES, HANDOFF, PARTNER } from "@content/catalogue";

type Task = { incident: string; station: string; task: string; due_at: string | null };

export default function WorkScreen() {
  return <StaffGate title={PARTNER.mine} need="case:act">{(me) => <Tasks name={me.name} />}</StaffGate>;
}

function Tasks({ name }: { name: string }) {
  const [tasks,setTasks] = useState<Task[] | null>(null);
  const [now,setNow] = useState(0);
  const [failed,setFailed] = useState(false);
  const load = useCallback(async () => {
    const r = await sb().rpc("my_external_work");
    setFailed(Boolean(r.error));
    if (r.data) { setTasks(r.data); setNow(Date.now()); }
  },[]);
  useLive(["desk","partner_work","field_job","promise"],load);
  return <Screen back eyebrow={<T v="label">{name}</T>} title={PARTNER.mine} onRefresh={load}>
    {failed && <Notice tone="alert">{CASES.loadError}</Notice>}
    {tasks && <Card>{!tasks.length && !failed && <T>{PARTNER.none}</T>}
      {tasks.map((r) => <Row key={r.incident+r.task} label={r.station} sub={r.task === "field" ? PARTNER.field : HANDOFF.recipient[r.task]}
        meta={r.due_at ? new Date(r.due_at).toLocaleString() + (Date.parse(r.due_at)<now ? " · "+PARTNER.late : "") : undefined}
        onPress={() => router.push({ pathname:"/operator/[id]",params:{ id:r.incident } })} chevron />)}
    </Card>}
  </Screen>;
}
