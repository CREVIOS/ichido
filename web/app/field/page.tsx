"use client";
import { useCallback, useState } from "react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, signOut } from "@/components/StaffGate";
import { Tag } from "@/components/ui";
import { FAULTS, FIELD_STATE, ETA_OPTIONS, isFault, type FieldState, type L10n } from "@/content/catalogue";

type Job = { incident: string; station: string; fault: string; generation: number; state: FieldState; eta: string | null; updated_at: string };
const gap = (g: number) => ({ "--gap": `${g}px` }) as React.CSSProperties;
const UNKNOWN_ETA = "";

export default function FieldPage() {
  return <StaffGate allow={["field"]} hint="guard1@ichido.demo" title="警備員">{(me) => <Jobs name={me.name} />}</StaffGate>;
}

// Only this guard's open assignments (row-level security). No identity checks or card handback here.
function Jobs({ name }: { name: string }) {
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
  const act = (j: Job, state: string) =>
    cmd("field", { incident: j.incident, generation: j.generation, state, eta: state === "on_way" ? eta[j.incident] ?? UNKNOWN_ETA : undefined })
      .then(() => setError("")).catch((e: Error) => setError(e.message === "forbidden" ? "この割当は変更されました。" : "更新できませんでした。"));

  return (
    <main className="phone" lang="ja">
      <header className="row between">
        <span className="row" style={gap(8)}><span className="brand-mark" aria-hidden>一</span><span style={{ fontWeight: 500 }}>警備員 · {name}</span></span>
        <button className="btn ghost" onClick={signOut}>サインアウト</button>
      </header>
      <h1>割当</h1>
      {error && <p className="notice">{error}</p>}
      {jobs.length === 0 && <section className="card"><p className="soft">現在、割当はありません。</p></section>}
      {jobs.map((j) => (
        <section key={j.incident} className="card">
          <div className="row between"><span className="mono tiny muted">{j.station}</span><span className="chip field">{FIELD_STATE[j.state].ja}</span></div>
          <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{labels[j.station] ?? j.station}</span>
          <span style={{ color: "var(--red)" }}>{isFault(j.fault) ? FAULTS[j.fault].ja : "不明な障害"}</span>
          {j.eta && <Tag label="到着目安" value={`${j.eta.replace("-", "〜")}分`} />}
          <hr className="hairline" />
          <label className="stack" style={gap(6)}>
            <span className="field-label">到着目安（あなたの見込み）</span>
            <select value={eta[j.incident] ?? UNKNOWN_ETA} onChange={(e) => setEta({ ...eta, [j.incident]: e.target.value })}>
              {ETA_OPTIONS.map((v) => <option key={v} value={v}>{v ? `${v.replace("-", "〜")}分` : "未定"}</option>)}
            </select>
          </label>
          <button className="btn dark block" onClick={() => act(j, "on_way")}>向かっています</button>
          <div className="row" style={gap(8)}>
            <button className="btn grow" onClick={() => act(j, "arrived")}>到着</button>
            <button className="btn grow" onClick={() => act(j, "done")}>対応完了</button>
          </div>
          <p className="tiny muted">本人確認・カードの返却はこの画面では扱いません。カードの扱いは銀行所定の手続きによります。</p>
        </section>
      ))}
    </main>
  );
}
