"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, navFor, signOut, type Me } from "@/components/StaffGate";
import { Shell, Card, More, Tag, StatusChip } from "@/components/ui";
import {
  FACTS, FAULTS, REPLIES, LANG_NAME, FIELD_STATE, REMOTE_RELEASE, ACTOR, DEVICE_FAULT, eventText, summaryDraft, pick,
  type Lang, type Status, type Fact, type FieldState, type L10n,
} from "@/content/catalogue";

type Station = { id: string; label: L10n };
type Desk = {
  id: string; station: string; source: string; fault: string; status: Status; operator_id: string | null; lang: Lang | null;
  card_back: Fact; cash_received: Fact; confirmed_rev: number | null; caller_words: string | null;
  remote_release: string | null; created_at: string; finished_at: string | null;
};
type CallerCard = { field_state: FieldState; eta: string | null; choice: string | null; teachback: string | null; needs_human: boolean };
type Event = { id: number; actor: string; actor_name: string | null; kind: string; data: Record<string, string>; at: string };
type Reply = { id: string; intent: string; slots: { branch?: L10n; hours?: L10n }; sent_at: string };
type Job = { assignee: string; state: FieldState; eta: string | null };
type Run = (name: string, body?: Record<string, unknown>) => Promise<unknown>;

const hhmm = (t: string) => new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
const when = (t: string) => (new Date(t).toDateString() === new Date().toDateString() ? hhmm(t) : new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }));
const minutesAgo = (t: string) => Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60000));
const gap = (g: number) => ({ "--gap": `${g}px` }) as React.CSSProperties;

export default function OperatorPage() {
  return <StaffGate allow={["operator"]} hint="operator@ichido.demo" title="監視センター">{(me) => <Console me={me} />}</StaffGate>;
}

function Console({ me }: { me: Me }) {
  const [cases, setCases] = useState<Desk[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const db = sb();
    const [d, s] = await Promise.all([
      db.from("desk").select("*").order("created_at", { ascending: false }).limit(30),
      db.from("station").select("id, label").order("id"),
    ]);
    setCases((d.data ?? []) as Desk[]);
    setStations((s.data ?? []) as Station[]);
  }, []);
  useLive(["desk"], load);

  const label = useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s.label.ja])), [stations]);
  const open = cases.filter((c) => !c.finished_at);
  const done = cases.filter((c) => c.finished_at);
  const current = cases.find((c) => c.id === sel) ?? open[0] ?? cases[0] ?? null;
  const run: Run = (name, body = {}) => cmd(name, body).then((r) => { setError(""); return r; }).catch((e: Error) => { setError(e.message); });

  return (
    <Shell
      nav={navFor(me.role)}
      title="監視センター"
      right={<div className="row"><span className="small soft">{me.name}</span><button className="btn ghost" onClick={signOut}>サインアウト</button></div>}
      aside={<div className="row"><Tag label="対応中" value={`${open.length}件`} /><Tag label="環境" value="デモ・架空の銀行" /></div>}
    >
      {error && <p className="notice" style={{ marginBottom: 16 }}>{error}</p>}
      <div className="grid console">
        <Card
          title="対応キュー"
          action={<More label="障害を模擬" items={stations.map((s) => ({ label: `ATM障害を模擬：${s.label.ja}`, onClick: () => run("simulate", { station: s.id, fault: DEVICE_FAULT }) }))} />}
        >
          {open.length === 0 && <p className="small muted">対応中の案件はありません。Help Point のボタン、または「···」から模擬障害を起こせます。</p>}
          {open.map((c) => (
            <button key={c.id} className="option" aria-pressed={c.id === current?.id} onClick={() => setSel(c.id)}>
              <span className="row between tiny muted"><span className="mono">{c.station}</span><span className="num">{minutesAgo(c.created_at)}分前</span></span>
              <strong style={{ fontWeight: 500 }}>{label[c.station] ?? c.station}</strong>
              <span className="small soft">{FAULTS[c.fault]?.ja ?? c.fault}</span>
              <span className="row"><StatusChip status={c.status} />{c.lang && <span className="chip received">{LANG_NAME[c.lang]}</span>}</span>
            </button>
          ))}
          {done.length > 0 && <hr className="hairline" />}
          {done.slice(0, 6).map((c) => (
            <button key={c.id} className="option" aria-pressed={c.id === current?.id} onClick={() => setSel(c.id)}>
              <span className="row between"><span className="small">{label[c.station] ?? c.station}</span><span className="tiny muted num">{when(c.created_at)}</span></span>
              <StatusChip status={c.status} />
            </button>
          ))}
        </Card>
        {current ? <CaseView key={current.id} d={current} me={me} run={run} stationLabel={label[current.station] ?? current.station} /> : null}
      </div>
    </Shell>
  );
}

function CaseView({ d, me, run, stationLabel }: { d: Desk; me: Me; run: Run; stationLabel: string }) {
  const [card, setCard] = useState<CallerCard | null>(null);
  const [clarifying, setClarifying] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [field, setField] = useState<{ uid: string; display_name: string }[]>([]);

  const load = useCallback(async () => {
    const db = sb();
    const [c, dr, e, r, j] = await Promise.all([
      db.from("caller_card").select("field_state, eta, choice, teachback, needs_human").eq("id", d.id).maybeSingle(),
      db.from("draft").select("needs_clarification").eq("incident", d.id).maybeSingle(),
      db.from("case_event").select("*").eq("incident", d.id).order("id"),
      db.from("reply").select("id, intent, slots, sent_at").eq("incident", d.id).order("sent_at"),
      db.from("field_job").select("assignee, state, eta").eq("incident", d.id).maybeSingle(),
    ]);
    setCard(c.data as CallerCard); setClarifying(Boolean(dr.data?.needs_clarification)); setEvents((e.data ?? []) as Event[]);
    setReplies((r.data ?? []) as Reply[]); setJob(j.data as Job);
  }, [d.id]);
  useLive(["caller_card", "draft", "case_event", "reply", "field_job"], load);
  useEffect(() => { cmd<{ field: { uid: string; display_name: string }[] }>("staff_list").then((r) => setField(r.field)).catch(() => setField([])); }, []);

  const mine = d.operator_id === me.uid;
  const closed = Boolean(d.finished_at);
  const lang: Lang = d.lang ?? "bn";
  const paired = events.some((e) => e.kind === "paired");

  return (
    <>
      <div className="stack" style={gap(22)}>
        <Card
          title={<span className="row" style={gap(12)}>{stationLabel}<StatusChip status={d.status} /></span>}
          action={!closed && mine && !d.remote_release ? (
            <More label="機械の操作" items={[
              { label: "遠隔解除を試行（模擬：失敗）", onClick: () => run("remote_release", { incident: d.id, result: "failed" }) },
              { label: "遠隔解除を試行（模擬：成功）", onClick: () => run("remote_release", { incident: d.id, result: "released" }) },
            ]} />
          ) : undefined}
        >
          <div className="row" style={{ ...gap(28), alignItems: "flex-start" }}>
            <Fact label="ATM" value={<span className="mono">{d.station}</span>} />
            <Fact label="障害" value={<span style={{ color: "var(--red)" }}>{FAULTS[d.fault]?.ja ?? d.fault}</span>} />
            <Fact label="遠隔解除" value={d.remote_release ? REMOTE_RELEASE[d.remote_release] : "未実施"} />
            <Fact label="経路" value={d.source === "device" ? "Help Point" : "模擬障害"} />
            <Fact label="受付" value={<span className="num">{hhmm(d.created_at)}</span>} />
          </div>
        </Card>

        <Card title="お客様のことば" action={card?.needs_human ? <span className="chip alert">担当者との会話を希望</span> : undefined}>
          {d.confirmed_rev == null ? (
            <p className="small muted">
              {paired ? "お客様が内容を確認しています。確認後にここに表示されます。" : "お客様はまだ多言語窓口に接続していません。"}
              {clarifying ? "　AI が確認の質問をしています。" : ""}
            </p>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              <div className="inner stack" style={gap(6)}>
                <span className="eyebrow">原文 · {LANG_NAME[lang]}</span>
                <span lang={lang} style={{ fontSize: 17 }}>{d.caller_words ?? "（選択肢で回答）"}</span>
              </div>
              <div className="inner stack" style={gap(6)}>
                <span className="row between"><span className="eyebrow">お客様が確認した内容</span><span className="tiny muted">版 {d.confirmed_rev}</span></span>
                <span>{FACTS.card_back[d.card_back].ja}</span>
                <span>{FACTS.cash_received[d.cash_received].ja}</span>
              </div>
            </div>
          )}
          {card?.choice && <div className="row"><Tag label="お客様の選択" value={card.choice === "wait" ? "現地で待つ" : "帰宅し連絡を待つ"} /></div>}
          {card?.teachback && (
            <div className="inner stack">
              <span className="eyebrow">お客様が説明した「次の手順」（原文）</span>
              <span lang={lang} style={{ fontSize: 17 }}>{card.teachback}</span>
              {!closed && mine && (
                <div className="row">
                  <button className="btn dark" onClick={() => run("outcome", { incident: d.id, result: "understood" })}>理解を確認できた</button>
                  <button className="btn" onClick={() => run("outcome", { incident: d.id, result: "clarify" })}>再案内が必要</button>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="経過">
          <ol className="stack" style={{ ...gap(10), listStyle: "none" }}>
            {events.map((e) => (
              <li key={e.id} className="row" style={{ ...gap(14), alignItems: "baseline", flexWrap: "nowrap" }}>
                <span className="mono tiny muted">{hhmm(e.at)}</span>
                <span className="small" style={{ minWidth: 64, color: "var(--ink-2)", fontWeight: 500 }}>{e.actor_name ?? ACTOR[e.actor]}</span>
                <span className="small">{eventText(e.kind, e.data)}</span>
              </li>
            ))}
          </ol>
        </Card>

        {closed && d.status === "guided" && (
          <Card title="対応記録" action={<span className="chip draft">自動作成・要確認</span>}>
            <p>{summaryDraft({ card_back: d.card_back, cash_received: d.cash_received, remote_release: d.remote_release, dispatched: Boolean(job), choice: card?.choice ?? null })}</p>
          </Card>
        )}
      </div>

      <Actions d={d} mine={mine} paired={paired} lang={lang} replies={replies} job={job} field={field} card={card} run={run} />
    </>
  );
}

type ActionsProps = {
  d: Desk; mine: boolean; paired: boolean; lang: Lang; replies: Reply[]; job: Job | null;
  field: { uid: string; display_name: string }[]; card: CallerCard | null; run: Run;
};

// Right-hand column: claim, pairing code, approved replies, dispatch.
function Actions({ d, mine, paired, lang, replies, job, field, card, run }: ActionsProps) {
  const [code, setCode] = useState<{ value: string; until: number } | null>(null);
  const [intent, setIntent] = useState(Object.keys(REPLIES)[0]);
  const closed = Boolean(d.finished_at);
  const preview = REPLIES[intent].text(replies.at(-1)?.slots ?? {});
  const codeLive = code !== null;
  // Hide the code when it expires.
  useEffect(() => {
    if (!code) return;
    const t = setTimeout(() => setCode(null), code.until - Date.now());
    return () => clearTimeout(t);
  }, [code]);
  return (
    <div className="stack" style={gap(22)}>
    {closed ? (
      <Card title="完了"><p className="soft">この案件は完了しています。</p></Card>
    ) : !d.operator_id ? (
      <Card title="未担当"><button className="btn dark block" onClick={() => run("claim", { incident: d.id })}>この案件を担当する</button></Card>
    ) : !mine ? (
      <Card title="他の担当者が対応中"><p className="soft">この案件は別のオペレーターが担当しています。</p></Card>
    ) : (
      <>
        {!paired && (
          <Card title="多言語窓口" action={<Tag label="有効" value="5分・1回" />}>
            <p className="small soft">日本語で説明が難しいお客様に、このコードを伝えます。お客様は Help Point の QR から入力します。</p>
            {codeLive && <p className="mono big" style={{ letterSpacing: "0.12em" }}>{code.value}</p>}
            <button className="btn" onClick={() => cmd<{ code: string; expires_in: number }>("issue_code", { incident: d.id }).then((r) => setCode({ value: r.code, until: Date.now() + r.expires_in * 1000 })).catch(() => setCode(null))}>
              {codeLive ? "コードを再発行" : "接続コードを発行"}
            </button>
          </Card>
        )}
        <Card title="承認済み返答" action={<span className="tiny muted mono">retained-card/v1</span>}>
          <div className="stack" style={gap(8)}>
            {Object.entries(REPLIES).map(([k, r]) => (
              <button key={k} className="option" aria-pressed={k === intent} onClick={() => setIntent(k)}>
                <span className="tiny muted mono">{r.code}</span><span style={{ fontWeight: 500 }}>{r.title}</span>
              </button>
            ))}
          </div>
          <div className="inner stack" style={gap(8)}>
            {replies.length || !REPLIES[intent].offersChoice ? (
              <>
                <span className="small">{preview.ja}</span>
                <span className="small muted" lang={lang}>{preview[lang]}</span>
              </>
            ) : (
              <span className="small soft">支店名と窓口時間は、送信時にこのATMの登録情報から差し込まれます。お客様には {LANG_NAME[lang]} で届きます。</span>
            )}
          </div>
          <div className="row between">
            <button className="btn blue" disabled={d.confirmed_rev == null} onClick={() => run("send", { incident: d.id, intent })}>お客様へ送信</button>
            <span className="tiny muted">{d.confirmed_rev == null ? "お客様の確認待ち" : replies.length ? `送信済み ${replies.length}件` : ""}</span>
          </div>
        </Card>
        <Card title="取次・出動依頼">
          {job ? (
            <div className="stack" style={gap(8)}>
              <span className="row between"><span>{field.find((f) => f.uid === job.assignee)?.display_name ?? "警備員"}</span><span className="chip field">{FIELD_STATE[job.state].ja}</span></span>
              <span className="small soft">{job.eta ? `到着目安 ${job.eta.replace("-", "〜")}分（警備員の見込み）` : "到着目安：未定"}</span>
            </div>
          ) : (
            <div className="stack" style={gap(8)}>
              <p className="small soft">警備会社へ現地確認を依頼します。カードの扱いは銀行所定の手続きによります。</p>
              <div className="row">{field.map((f) => <button key={f.uid} className="btn" onClick={() => run("assign", { incident: d.id, assignee: f.uid })}>{f.display_name} へ依頼</button>)}</div>
            </div>
          )}
          {card && card.field_state !== "none" && <p className="tiny muted">お客様の画面：{pick(FIELD_STATE[card.field_state], lang)}</p>}
        </Card>
      </>
    )}
  </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="stack" style={gap(2)}><span className="eyebrow">{label}</span><span style={{ fontSize: 16 }}>{value}</span></div>;
}
