"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { sb } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { Panel, Notice } from "@/components/kit";
import { CASES, HANDOFF, PARTNER } from "@/content/catalogue";

type Task = { incident: string; station: string; task: string; due_at: string };

export function ExternalWork({ name }: { name: string }) {
  const [rows,setRows] = useState<Task[]>([]);
  const [now,setNow] = useState(0);
  const [failed,setFailed] = useState(false);
  const load = useCallback(async () => {
    const r = await sb().rpc("my_external_work");
    setFailed(Boolean(r.error));
    if (r.data) { setRows(r.data); setNow(Date.now()); }
  },[]);
  useLive(["partner_work","field_job","desk"],load);
  if (!failed && !rows.length) return null;
  return <Panel title={`${name} · ${PARTNER.mine}`}>
    {failed && <Notice tone="warn">{CASES.loadError}</Notice>}
    {rows.map((r) => <Link key={`${r.incident}/${r.task}`} href={`/operator#${r.incident}`}>
      {r.station} · {r.task === "field" ? PARTNER.field : HANDOFF.recipient[r.task]} · {new Date(r.due_at).toLocaleString("ja-JP")}
      {Date.parse(r.due_at) < now && ` · ${PARTNER.late}`}
    </Link>)}
  </Panel>;
}
