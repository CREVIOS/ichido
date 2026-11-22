"use client";
import { useCallback, useEffect, useState } from "react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, signOut } from "@/components/StaffLogin";
import { FACTS, REPLIES, STATUS, LANG_NAME, FIELD_STATE, type Lang, type Status, type Fact } from "@/content/catalogue";

type Desk = {
  id: string; station: string; source: string; status: Status; operator_id: string | null; lang: Lang | null;
  card_back: Fact; cash_received: Fact; confirmed_rev: number | null; caller_words: string | null;
  remote_release: string | null; summary_draft: string | null; created_at: string; finished_at: string | null;
};
type CallerCard = { field_state: string; eta_text: string | null; choice: string | null; teachback: string | null; teachback_result: string | null };
type Draft = { rev: number; needs_clarification: boolean };
type Event = { id: number; actor: string; actor_name: string | null; detail_ja: string; at: string };
type Reply = { id: string; intent: string; sent_at: string };
type Job = { assignee: string; state: string; eta_text: string | null };

const ACTOR_JA: Record<string, string> = { device: "機械", caller: "お客様", agent: "AI", operator: "担当者", field: "警備員", system: "システム" };
const hhmm = (t: string) => new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
const ago = (t: string) => `${Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60000))}分`;

export default function OperatorPage() {
  return (
    <StaffGate title="監視センター　サインイン" hint="operator@ichido.demo">
      {(uid) => <Console uid={uid} />}
    </StaffGate>
  );
}

function Console({ uid }: { uid: string }) {
  const [cases, setCases] = useState<Desk[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadQueue = useCallback(async () => {
    const { data } = await sb().from("desk").select("*").order("created_at", { ascending: false }).limit(20);
    setCases((data ?? []) as Desk[]);
  }, []);
  useLive(["desk"], loadQueue);

  const open = cases.filter((c) => !c.finished_at);
  const current = cases.find((c) => c.id === sel) ?? open[0] ?? cases[0] ?? null;
  const run = (name: string, body: Record<string, unknown> = {}) =>
    cmd(name, body).then(() => setError("")).catch((e: Error) => setError(e.message));

  return (
    <div className="console">
      <header className="topbar">
        <strong style={{ fontSize: 18 }}>一度</strong>
        <span className="muted">Ichido　相談引き継ぎサポート｜監視センター</span>
        <span className="grow" />
        <span className="small" style={{ color: "var(--field-soft)" }}>デモ環境・架空の銀行／データ</span>
        <button className="btn secondary" onClick={() => run("simulate", { station: "TABLE-A" })}>ATM障害を模擬</button>
        <button className="btn" onClick={signOut}>サインアウト</button>
      </header>
      <div className="panes">
        <aside className="queue stack" style={{ "--gap": "8px" } as React.CSSProperties}>
          <p className="label">対応キュー　{open.length}件</p>
          {open.length === 0 && <p className="small muted">対応中の案件はありません。「ATM障害を模擬」またはHelp Pointのボタンで開始します。</p>}
          {open.map((c) => (
            <button key={c.id} className={`qitem stack ${c.id === current?.id ? "sel" : ""}`} style={{ "--gap": "4px" } as React.CSSProperties} onClick={() => setSel(c.id)}>
              <span className="row small"><span className="mono secondary">{c.station}</span><span className="grow" /><span className="mono muted">{ago(c.created_at)}</span></span>
              <strong>長崎駅前 店舗外ATM（架空）</strong>
              <span className="small secondary">取引後にカードが排出されない</span>
              <span className="row"><span className={`chip ${c.status}`}>{STATUS[c.status].ja}</span>{c.lang && <span className="chip received">{LANG_NAME[c.lang]}</span>}</span>
            </button>
          ))}
          {cases.some((c) => c.finished_at) && <p className="label" style={{ marginTop: 12 }}>完了</p>}
          {cases.filter((c) => c.finished_at).slice(0, 5).map((c) => (
            <button key={c.id} className={`qitem small ${c.id === current?.id ? "sel" : ""}`} onClick={() => setSel(c.id)}>
              <span className="mono">{c.station}</span>　<span className={`chip ${c.status}`}>{STATUS[c.status].ja}</span>
            </button>
          ))}
        </aside>
        {current ? <CaseView key={current.id} d={current} uid={uid} run={run} error={error} /> : <section />}
      </div>
    </div>
  );
}

function CaseView({ d, uid, run, error }: { d: Desk; uid: string; run: (n: string, b?: Record<string, unknown>) => Promise<void>; error: string }) {
  const [card, setCard] = useState<CallerCard | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [field, setField] = useState<{ uid: string; display_name: string }[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [intent, setIntent] = useState("HELD_WAIT_OR_LEAVE");

  const load = useCallback(async () => {
    const db = sb();
    const [c, dr, e, r, j] = await Promise.all([
      db.from("caller_card").select("*").eq("id", d.id).maybeSingle(),
      db.from("draft").select("rev, needs_clarification").eq("incident", d.id).maybeSingle(),
      db.from("case_event").select("*").eq("incident", d.id).order("id"),
      db.from("reply").select("id, intent, sent_at").eq("incident", d.id).order("sent_at"),
      db.from("field_job").select("*").eq("incident", d.id).maybeSingle(),
    ]);
    setCard(c.data as CallerCard); setDraft(dr.data as Draft); setEvents((e.data ?? []) as Event[]);
    setReplies((r.data ?? []) as Reply[]); setJob(j.data as Job);
  }, [d.id]);
  useLive(["caller_card", "draft", "case_event", "reply", "field_job"], load);
  useEffect(() => { cmd<{ field: { uid: string; display_name: string }[] }>("staff_list").then((r) => setField(r.field)).catch(() => {}); }, []);

  const mine = d.operator_id === uid;
  const closed = !!d.finished_at;
  const lang = (d.lang ?? "bn") as Lang;
  const preview = REPLIES[intent].text({});
  const paired = events.some((e) => e.detail_ja.startsWith("お客様が多言語窓口に接続"));

  return (
    <>
      <section className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        <div className="row" style={{ "--gap": "12px" } as React.CSSProperties}>
          <h2 style={{ fontSize: 20 }}>案件 <span className="mono">{d.id.slice(0, 8)}</span></h2>
          <span className={`chip ${d.status}`}>{STATUS[d.status].ja}</span>
          <span className="grow" />
          <span className="small secondary">受付 {hhmm(d.created_at)}　経路：{d.source === "device" ? "ATM障害通知（Help Point）" : "模擬障害"}</span>
        </div>
        {error && <p className="chip alert">{error}</p>}

        <div className="card stack">
          <p className="label">① 機械の状態（監視システム・模擬）</p>
          <div className="kv">
            <div><div>ATM</div><div className="mono">{d.station}</div></div>
            <div><div>場所</div><div>長崎駅前 店舗外ATM（架空）</div></div>
            <div><div>障害</div><div style={{ color: "var(--alert)" }}>取引後にカードが排出されない</div></div>
            <div><div>遠隔解除</div><div>{d.remote_release ?? "未実施"}</div></div>
          </div>
          {!closed && mine && !d.remote_release && (
            <div className="row"><button className="btn" onClick={() => run("remote_release", { incident: d.id, result: "failed" })}>遠隔解除を試行（模擬：失敗）</button></div>
          )}
        </div>

        <div className="card stack">
          <p className="label">② お客様のことば（原文を常に表示）</p>
          {d.confirmed_rev == null ? (
            <p className="small muted">{paired ? "お客様が内容を確認中です（確認後に表示）" : "お客様はまだ多言語窓口に接続していません"}{draft?.needs_clarification ? "　・AIが確認の質問中" : ""}</p>
          ) : (
            <>
              <div className="row" style={{ alignItems: "stretch" }}>
                <div className="well grow stack" style={{ "--gap": "4px", minWidth: 240 } as React.CSSProperties}>
                  <span className="small muted">原文・{LANG_NAME[lang]}</span>
                  <span lang={lang} style={{ fontSize: 16 }}>{d.caller_words ?? "（選択肢で回答）"}</span>
                </div>
                <div className="well grow stack" style={{ "--gap": "4px", minWidth: 240 } as React.CSSProperties}>
                  <span className="row small muted">お客様が確認した内容 <span className="chip guided">お客様が確認した申告</span></span>
                  <span>{FACTS.card_back[d.card_back].ja}</span>
                  <span>{FACTS.cash_received[d.cash_received].ja}</span>
                </div>
              </div>
              <p className="small muted">版 {d.confirmed_rev}。原文は機械翻訳せず、お客様が選んだ内容のみを日本語で表示しています。</p>
            </>
          )}
          {card?.choice && <p><span className="chip review">お客様の選択</span>　{card.choice === "wait" ? "現地で待つ" : "帰宅し、銀行からの連絡を待つ"}</p>}
          {card?.teachback && (
            <div className="well stack" style={{ "--gap": "6px" } as React.CSSProperties}>
              <span className="small muted">お客様が説明した「次の手順」（原文）</span>
              <span lang={lang} style={{ fontSize: 16 }}>{card.teachback}</span>
              {!closed && mine && (
                <div className="row">
                  <button className="btn primary" onClick={() => run("outcome", { incident: d.id, result: "understood" })}>理解を確認できた</button>
                  <button className="btn" onClick={() => run("outcome", { incident: d.id, result: "clarify" })}>再案内が必要</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card stack">
          <p className="label">③ 経過（この案件のみ）</p>
          <div className="timeline">
            {events.map((e) => (
              <span key={e.id} style={{ display: "contents" }}>
                <span className="mono muted">{hhmm(e.at)}</span>
                <strong className="secondary">{e.actor_name ?? ACTOR_JA[e.actor]}</strong>
                <span>{e.detail_ja}</span>
              </span>
            ))}
          </div>
        </div>
        {d.summary_draft && (
          <div className="card stack" style={{ background: "var(--draft-soft)" }}>
            <p className="row label">対応記録 <span className="chip draft">下書き・要確認</span></p>
            <p className="small">{d.summary_draft}</p>
          </div>
        )}
      </section>

      <aside className="actions stack" style={{ "--gap": "14px" } as React.CSSProperties}>
        {closed ? <p className="secondary">この案件は完了しています。</p> : !mine ? (
          <button className="btn primary big" onClick={() => run("claim", { incident: d.id })}>この案件を担当する</button>
        ) : (
          <>
            {!paired && (
              <div className="card stack">
                <p className="label">多言語窓口への接続コード</p>
                {code ? <p className="mono" style={{ fontSize: 28, letterSpacing: 4 }}>{code}</p> : <p className="small muted">お客様の言葉が日本語で届かないとき、コードを口頭またはHelp Pointの画面で伝えます（5分・1回限り）。</p>}
                <button className="btn secondary" onClick={() => cmd<{ code: string }>("issue_code", { incident: d.id }).then((r) => setCode(r.code)).catch(() => {})}>コードを発行</button>
                <p className="small muted">お客様の画面：/s/{d.station}</p>
              </div>
            )}
            <p className="label">承認済み返答（架空銀行マニュアル retained-card/v1）</p>
            {Object.entries(REPLIES).map(([k, r]) => (
              <button key={k} className={`reply ${k === intent ? "sel" : ""}`} onClick={() => setIntent(k)}><strong>{r.title}</strong></button>
            ))}
            <div className="well stack" style={{ "--gap": "6px" } as React.CSSProperties}>
              <span className="small">{preview.ja}</span>
              <span className="small muted" lang={lang}>{preview[lang]}</span>
            </div>
            <div className="row">
              <button className="btn primary" disabled={d.confirmed_rev == null} onClick={() => run("send", { incident: d.id, intent })}>お客様へ送信</button>
              {replies.length > 0 && <span className="small muted">送信済み {replies.length}件</span>}
            </div>
            <div className="card stack">
              <p className="label">取次・出動依頼（警備会社）</p>
              {job ? (
                <p className="small">{field.find((f) => f.uid === job.assignee)?.display_name ?? "警備員"}：<span className="chip field">{FIELD_STATE[job.state].ja || job.state}</span> {job.eta_text ? `目安 ${job.eta_text}分` : ""}</p>
              ) : (
                <div className="row">
                  {field.map((f) => <button key={f.uid} className="btn secondary" onClick={() => run("assign", { incident: d.id, assignee: f.uid })}>{f.display_name}へ依頼</button>)}
                </div>
              )}
            </div>
            {card && card.field_state !== "none" && <p className="small muted">お客様の画面：{FIELD_STATE[card.field_state][lang]}</p>}
          </>
        )}
      </aside>
    </>
  );
}
