"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, navFor, signOut, type Me } from "@/components/StaffGate";
import { Shell, Card, More, Tag, StatusChip } from "@/components/ui";
import {
  FACTS, FAULTS, REPLIES, LANG_NAME, FIELD_STATE, REMOTE_RELEASE, ACTOR, DEVICE_FAULT, MANUAL_VERSION,
  eventText, summaryDraft, pick, replyOf, isFault,
  type Lang, type Status, type Fact, type FieldState, type L10n,
} from "@/content/catalogue";

type Station = { id: string; label: L10n };
type Desk = {
  id: string; station: string; source: string; fault: string; status: Status; operator_id: string | null; lang: Lang | null;
  card_back: Fact; cash_received: Fact; confirmed_rev: number | null; caller_words: string | null; clarifying: boolean;
  remote_release: string | null; abandoned: boolean; created_at: string; finished_at: string | null;
};
type CallerCard = {
  field_state: FieldState; eta: string | null; choice: string | null; reply_id: string | null;
  teachback: string | null; teachback_ja: string | null; teachback_reply: string | null; needs_human: boolean;
};
type Event = { id: number; actor: string; actor_name: string | null; kind: string; data: Record<string, string>; at: string };
type Reply = { id: string; intent: string; slots: { branch?: L10n; hours?: L10n }; sent_at: string };
type Job = { assignee: string; state: FieldState; eta: string | null };
type Guard = { uid: string; display_name: string };
type Run = (name: string, body?: Record<string, unknown>) => Promise<unknown>;

const HISTORY = 8;
const hhmm = (t: string) => new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
const when = (t: string) => (new Date(t).toDateString() === new Date().toDateString() ? hhmm(t) : new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }));
const minutesAgo = (t: string) => Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60000));
const gap = (g: number) => ({ "--gap": `${g}px` }) as React.CSSProperties;
const faultJa = (f: string) => (isFault(f) ? FAULTS[f].ja : "不明な障害");
const ERROR_JA: Record<string, string> = {
  conflict: "状態が変わったか、条件を満たしていません。画面を更新しました。", forbidden: "この操作はできません。",
  not_found: "案件が見つかりません。", bad_request: "入力が正しくありません。", server: "サーバーエラーが発生しました。",
};

export default function OperatorPage() {
  return <StaffGate allow={["operator"]} hint="operator@ichido.demo" title="監視センター">{(me) => <Console me={me} />}</StaffGate>;
}

function Console({ me }: { me: Me }) {
  const [open, setOpen] = useState<Desk[]>([]);
  const [done, setDone] = useState<Desk[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [sel, setSel] = useState<string | null>(null);
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
  const current = [...open, ...done].find((c) => c.id === sel) ?? open[0] ?? done[0] ?? null;
  const run: Run = (name, body = {}) => cmd(name, body).then((r) => { setError(""); return r; }).catch((e: Error) => { setError(ERROR_JA[e.message] ?? ERROR_JA.server); });

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
              <span className="small soft">{faultJa(c.fault)}</span>
              <span className="row"><StatusChip status={c.status} />{c.lang && <span className="chip received">{LANG_NAME[c.lang]}</span>}</span>
            </button>
          ))}
          {done.length > 0 && <hr className="hairline" />}
          {done.map((c) => (
            <button key={c.id} className="option" aria-pressed={c.id === current?.id} onClick={() => setSel(c.id)}>
              <span className="row between"><span className="small">{label[c.station] ?? c.station}</span><span className="tiny muted num">{when(c.created_at)}</span></span>
              {c.abandoned ? <span className="chip alert">終了（連絡なし）</span> : <StatusChip status={c.status} />}
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
  const [events, setEvents] = useState<Event[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [guards, setGuards] = useState<Guard[]>([]);

  // Staff never read the caller's draft; only what the caller confirmed reaches the desk.
  const load = useCallback(async () => {
    const db = sb();
    const [c, e, r, j] = await Promise.all([
      db.from("caller_card").select("field_state, eta, choice, reply_id, teachback, teachback_ja, teachback_reply, needs_human").eq("id", d.id).maybeSingle(),
      db.from("case_event").select("*").eq("incident", d.id).order("id"),
      db.from("reply").select("id, intent, slots, sent_at").eq("incident", d.id).order("sent_at"),
      db.from("field_job").select("assignee, state, eta").eq("incident", d.id).maybeSingle(),
    ]);
    setCard(c.data as CallerCard); setEvents((e.data ?? []) as Event[]); setReplies((r.data ?? []) as Reply[]); setJob(j.data as Job);
  }, [d.id]);
  useLive(["caller_card", "case_event", "reply", "field_job"], load);
  useEffect(() => { cmd<{ field: Guard[] }>("staff_list").then((r) => setGuards(r.field)).catch(() => setGuards([])); }, []);

  const mine = d.operator_id === me.uid;
  const closed = Boolean(d.finished_at);
  const lang: Lang = d.lang ?? "bn";
  const paired = events.some((e) => e.kind === "paired") && !events.some((e, i) => e.kind === "caller_reset" && i > events.findLastIndex((x) => x.kind === "paired"));

  return (
    <>
      <div className="stack" style={gap(22)}>
        <Card
          title={<span className="row" style={gap(12)}>{stationLabel}<StatusChip status={d.status} /></span>}
          action={!closed && mine ? (
            <More label="案件の操作" items={[
              ...(!d.remote_release ? [
                { label: "遠隔解除を試行（模擬：失敗）", onClick: () => run("remote_release", { incident: d.id, result: "failed" }) },
                { label: "遠隔解除を試行（模擬：成功）", onClick: () => run("remote_release", { incident: d.id, result: "released" }) },
              ] : []),
              { label: "お客様の接続をリセット", onClick: () => run("reset_caller", { incident: d.id }) },
              { label: "案件を終了（お客様と連絡が取れない）", onClick: () => run("abandon", { incident: d.id }) },
            ]} />
          ) : undefined}
        >
          <div className="row" style={{ ...gap(28), alignItems: "flex-start" }}>
            <Fact label="ATM" value={<span className="mono">{d.station}</span>} />
            <Fact label="障害" value={<span style={{ color: "var(--red)" }}>{faultJa(d.fault)}</span>} />
            <Fact label="遠隔解除" value={d.remote_release ? REMOTE_RELEASE[d.remote_release] : "未実施"} />
            <Fact label="経路" value={d.source === "device" ? "Help Point" : "模擬障害"} />
            <Fact label="受付" value={<span className="num">{hhmm(d.created_at)}</span>} />
          </div>
        </Card>

        <CallerWords d={d} card={card} lang={lang} paired={paired} canJudge={!closed && mine} run={run} />
        <Timeline events={events} />
        {closed && d.status === "guided" && (
          <Card title="対応記録" action={<span className="chip draft">自動作成・要確認</span>}>
            <p>{summaryDraft({ card_back: d.card_back, cash_received: d.cash_received, remote_release: d.remote_release, dispatched: Boolean(job), choice: card?.choice ?? null })}</p>
          </Card>
        )}
      </div>

      <div className="stack" style={gap(22)}>
        {closed ? (
          <Card title="完了"><p className="soft">{d.abandoned ? "お客様と連絡が取れないため終了しました。" : "この案件は完了しています。"}</p></Card>
        ) : !d.operator_id ? (
          <Card title="未担当"><button className="btn dark block" onClick={() => run("claim", { incident: d.id })}>この案件を担当する</button></Card>
        ) : !mine ? (
          <Card title="他の担当者が対応中"><p className="soft">この案件は別のオペレーターが担当しています。</p></Card>
        ) : (
          <>
            {!paired && <PairCard incident={d.id} />}
            <ReplyCard d={d} lang={lang} replies={replies} run={run} />
            <DispatchCard d={d} job={job} guards={guards} card={card} lang={lang} run={run} />
          </>
        )}
      </div>
    </>
  );
}

function CallerWords({ d, card, lang, paired, canJudge, run }: { d: Desk; card: CallerCard | null; lang: Lang; paired: boolean; canJudge: boolean; run: Run }) {
  return (
    <Card title="お客様のことば" action={card?.needs_human ? <span className="chip alert">担当者との会話を希望</span> : undefined}>
      {d.confirmed_rev == null ? (
        <p className="small muted">
          {paired ? "お客様が内容を確認しています。確認後にここに表示されます。" : "お客様はまだ多言語窓口に接続していません。"}
          {d.clarifying ? "　AI が確認の質問をしています。" : ""}
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
      {card?.teachback && <TeachBack card={card} lang={lang} canJudge={canJudge} onJudge={(result) => run("outcome", { incident: d.id, reply: card.teachback_reply, result })} />}
    </Card>
  );
}

function Timeline({ events }: { events: Event[] }) {
  return (
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
  );
}

// The operator cannot read Bengali, so the judgement rests on a labelled machine translation, or on a bilingual colleague.
function TeachBack({ card, lang, canJudge, onJudge }: { card: CallerCard; lang: Lang; canJudge: boolean; onJudge: (r: "understood" | "clarify") => void }) {
  const current = card.teachback_reply === card.reply_id;
  return (
    <div className="inner stack">
      <span className="eyebrow">お客様が説明した「次の手順」</span>
      <span lang={lang} style={{ fontSize: 17 }}>{card.teachback}</span>
      {lang !== "ja" && (card.teachback_ja
        ? <span className="row" style={gap(8)}><span className="chip draft">機械翻訳</span><span>{card.teachback_ja}</span></span>
        : <span className="small" style={{ color: "var(--amber)" }}>翻訳なし：{LANG_NAME[lang]}が分かる担当者に確認してください。</span>)}
      {!current && <span className="small muted">この説明は以前の返答に対するものです。</span>}
      {canJudge && current && (
        <div className="row">
          <button className="btn dark" onClick={() => onJudge("understood")}>理解を確認できた</button>
          <button className="btn" onClick={() => onJudge("clarify")}>再案内が必要</button>
        </div>
      )}
    </div>
  );
}

function PairCard({ incident }: { incident: string }) {
  const [code, setCode] = useState<{ value: string; until: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!code) return;
    const t = setTimeout(() => setCode(null), code.until - Date.now());
    return () => clearTimeout(t);
  }, [code]);
  const issue = () => cmd<{ code: string; expires_in: number }>("issue_code", { incident })
    .then((r) => { setError(""); setCode({ value: r.code, until: Date.now() + r.expires_in * 1000 }); })
    .catch((e: Error) => setError(ERROR_JA[e.message] ?? ERROR_JA.server));
  return (
    <Card title="多言語窓口" action={<Tag label="有効" value="5分・1回" />}>
      <p className="small soft">日本語で説明が難しいお客様に、このコードを伝えます。お客様は Help Point の QR から入力します。</p>
      {code && <p className="mono big" style={{ letterSpacing: "0.12em" }}>{code.value}</p>}
      {error && <p className="notice">{error}</p>}
      <button className="btn" onClick={issue}>{code ? "コードを再発行" : "接続コードを発行"}</button>
    </Card>
  );
}

function ReplyCard({ d, lang, replies, run }: { d: Desk; lang: Lang; replies: Reply[]; run: Run }) {
  const [intent, setIntent] = useState(Object.keys(REPLIES)[0]);
  const r = replyOf(intent) ?? REPLIES[Object.keys(REPLIES)[0]];
  const preview = r.text(replies.at(-1)?.slots ?? {});
  // Mirrors the server rule: "card is still inside" only when the caller confirmed it and no release succeeded.
  const blocked = d.confirmed_rev == null ? "お客様の確認待ち"
    : r.needsHeld && (d.card_back !== "no" || d.remote_release === "released") ? "お客様の申告または遠隔解除の結果と合いません" : "";
  return (
    <Card title="承認済み返答" action={<span className="tiny muted mono">{MANUAL_VERSION}</span>}>
      <div className="stack" style={gap(8)}>
        {Object.entries(REPLIES).map(([k, x]) => (
          <button key={k} className="option" aria-pressed={k === intent} onClick={() => setIntent(k)}>
            <span className="tiny muted mono">{x.code}</span><span style={{ fontWeight: 500 }}>{x.title}</span>
          </button>
        ))}
      </div>
      <div className="inner stack" style={gap(8)}>
        {replies.length || !r.offersChoice ? (
          <><span className="small">{preview.ja}</span><span className="small muted" lang={lang}>{preview[lang]}</span></>
        ) : (
          <span className="small soft">支店名と窓口時間は、送信時にこのATMの登録情報から差し込まれます。お客様には {LANG_NAME[lang]} で届きます。</span>
        )}
      </div>
      <div className="row between">
        <button className="btn blue" disabled={Boolean(blocked)} onClick={() => run("send", { incident: d.id, intent })}>お客様へ送信</button>
        <span className="tiny muted">{blocked || (replies.length ? `送信済み ${replies.length}件` : "")}</span>
      </div>
    </Card>
  );
}

function DispatchCard({ d, job, guards, card, lang, run }: { d: Desk; job: Job | null; guards: Guard[]; card: CallerCard | null; lang: Lang; run: Run }) {
  const others = guards.filter((g) => g.uid !== job?.assignee);
  return (
    <Card title="取次・出動依頼">
      {job ? (
        <div className="stack" style={gap(8)}>
          <span className="row between"><span>{guards.find((g) => g.uid === job.assignee)?.display_name ?? "警備員"}</span><span className="chip field">{FIELD_STATE[job.state].ja}</span></span>
          <span className="small soft">{job.eta ? `到着目安 ${job.eta.replace("-", "〜")}分（警備員の見込み）` : "到着目安：未定"}</span>
        </div>
      ) : (
        <p className="small soft">警備会社へ現地確認を依頼します。カードの扱いは銀行所定の手続きによります。</p>
      )}
      <div className="row">
        {others.map((g) => <button key={g.uid} className="btn" onClick={() => run("assign", { incident: d.id, assignee: g.uid })}>{g.display_name} へ{job ? "再依頼" : "依頼"}</button>)}
      </div>
      {card && card.field_state !== "none" && <p className="tiny muted">お客様の画面：{pick(FIELD_STATE[card.field_state], lang)}</p>}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="stack" style={gap(2)}><span className="eyebrow">{label}</span><span style={{ fontSize: 16 }}>{value}</span></div>;
}
