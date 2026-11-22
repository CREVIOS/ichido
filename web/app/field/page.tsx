"use client";
import { useCallback, useState } from "react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, signOut } from "@/components/StaffLogin";
import { FIELD_STATE } from "@/content/catalogue";

type Job = { incident: string; station: string; state: string; eta_text: string | null; updated_at: string };

export default function FieldPage() {
  return (
    <StaffGate title="警備員　サインイン" hint="guard1@ichido.demo">
      {() => <Jobs />}
    </StaffGate>
  );
}

// Only this guard's assignments (enforced by row-level security). No identity checks or card handback here.
function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [eta, setEta] = useState("30-45");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data } = await sb().from("field_job").select("*").neq("state", "done").order("updated_at", { ascending: false });
    setJobs((data ?? []) as Job[]);
  }, []);
  useLive(["field_job"], load);
  const act = (incident: string, state: string, withEta?: string) =>
    cmd("field", { incident, state, eta: withEta }).then(() => setError("")).catch((e: Error) => setError(e.message));

  return (
    <main className="phone ink">
      <div className="row"><strong>一度　警備員</strong><span className="grow" /><span className="small muted">自分の割当のみ</span><button className="btn" onClick={signOut}>⎋</button></div>
      {error && <p className="chip alert">{error}</p>}
      {jobs.length === 0 && <p className="muted">割当はありません。</p>}
      {jobs.map((j) => (
        <div key={j.incident} className="stack">
          <div className="card stack" style={{ "--gap": "6px" } as React.CSSProperties}>
            <span className="mono small secondary">{j.station}</span>
            <strong style={{ fontSize: 20 }}>長崎駅前 店舗外ATM（架空）</strong>
            <span style={{ color: "var(--alert)" }}>障害：取引後にカードが排出されない</span>
            <span className="chip field">{FIELD_STATE[j.state].ja}{j.eta_text ? `　目安 ${j.eta_text}分` : ""}</span>
          </div>
          <div className="row">
            <label className="small muted" htmlFor={`eta-${j.incident}`}>到着目安（分）</label>
            <select id={`eta-${j.incident}`} value={eta} onChange={(e) => setEta(e.target.value)} style={{ width: "auto" }}>
              {["10-20", "20-30", "30-45", "45-60", ""].map((v) => <option key={v} value={v}>{v || "未定"}</option>)}
            </select>
          </div>
          <button className="btn big" style={{ background: "var(--field-soft)", color: "var(--field)" }} onClick={() => act(j.incident, "on_way", eta || undefined)}>向かっています</button>
          <button className="btn big" onClick={() => act(j.incident, "arrived")}>到着</button>
          <button className="btn big" onClick={() => act(j.incident, "done")}>対応完了（カードの扱いは銀行所定の手続きへ）</button>
          <p className="small muted">この画面では本人確認・カード返却は扱いません。</p>
        </div>
      ))}
    </main>
  );
}
