"use client";
import { useCallback, useEffect, useState } from "react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { FACTS, REPLIES, STATUS, UI, FIELD_STATE, LANG_NAME, etaText, type Lang, type Fact, type FactKey, type Status } from "@/content/catalogue";
import { VoiceIntake } from "@/components/VoiceIntake";

type Card = { id: string; lang: Lang | null; confirmed_rev: number | null; status: Status; field_state: string; eta_text: string | null; choice: string | null; teachback: string | null; teachback_result: string | null };
type Draft = { rev: number; card_back: Fact; cash_received: Fact; words: string | null; needs_clarification: boolean };
type Reply = { id: string; intent: string; slots: Record<string, string>; sent_at: string };

const BCP47: Record<Lang, string> = { bn: "bn-BD", en: "en-US", ja: "ja-JP" };
const FACT_ORDER: FactKey[] = ["card_back", "cash_received"];
const SEP: Record<Lang, string> = { bn: "। ", en: ". ", ja: "。" };
const ANSWER: Record<Lang, Record<Fact, string>> = {
  bn: { yes: "হ্যাঁ", no: "না", unknown: "জানি না" },
  en: { yes: "Yes", no: "No", unknown: "Not sure" },
  ja: { yes: "はい", no: "いいえ", unknown: "わからない" },
};
const QUESTION: Record<FactKey, Record<Lang, string>> = {
  card_back: { bn: "কার্ড কি ফেরত এসেছে?", en: "Did the card come back out?", ja: "カードは でてきましたか？" },
  cash_received: { bn: "টাকা কি পেয়েছেন?", en: "Did you get the cash?", ja: "お金は うけとりましたか？" },
};

export default function CallerPage() {
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [confirmed, setConfirmed] = useState<number | null>(null);

  const load = useCallback(async () => {
    const db = sb();
    const { data: c } = await db.from("caller_card").select("*").limit(1).maybeSingle();
    setCard((c as Card) ?? null);
    if (!c) return;
    const [d, r] = await Promise.all([
      db.from("draft").select("*").eq("incident", c.id).maybeSingle(),
      db.from("reply").select("id, intent, slots, sent_at").eq("incident", c.id).order("sent_at"),
    ]);
    setDraft(d.data as Draft); setReplies((r.data ?? []) as Reply[]);
  }, []);
  useLive(["caller_card", "draft", "reply"], load);

  if (card === undefined) return null;
  if (card === null) return (
    <main className="phone"><h1 className="bn">এই ফোনটি কোনো কেসের সাথে যুক্ত নয়</h1><p>This phone is not connected to a case. Ask the operator for a code and scan the Help Point again.</p></main>
  );

  const lang: Lang = card.lang ?? "bn";
  const latest = replies.at(-1);
  const sent = confirmed !== null || card.confirmed_rev != null || replies.length > 0;

  return (
    <main className="phone" lang={lang}>
      <div className="row">
        <strong>一度 Ichido</strong><span className="grow" />
        <span className="chip received">{LANG_NAME[lang]}</span>
      </div>
      <div className="row"><span className={`chip ${card.status}`}>{STATUS[card.status][lang]}</span></div>

      {!sent && draft && <Intake lang={lang} draft={draft} onConfirmed={setConfirmed} />}
      {sent && !latest && <Waiting lang={lang} />}
      {latest && <Guidance lang={lang} card={card} reply={latest} />}
      <ShowStaff card={card} />
    </main>
  );
}

function Intake({ lang, draft, onConfirmed }: { lang: Lang; draft: Draft; onConfirmed: (rev: number) => void }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(body: Record<string, unknown>) {
    setBusy(true); setNote("");
    try {
      const r = await cmd<{ withheld?: boolean }>("draft", { base_rev: draft.rev, ...body });
      if (r.withheld) setNote(UI.numbersWithheld[lang]); else setText("");
    } catch (e) { setNote((e as Error).message === "stale" ? "↻" : (e as Error).message); }
    finally { setBusy(false); }
  }

  const ready = draft.card_back !== "unknown" || draft.cash_received !== "unknown";
  // Spoken read-back of the current revision, so the caller can hear and correct it.
  const readBack = ready ? `${UI.understood[lang]}: ${FACT_ORDER.filter((k) => draft[k] !== "unknown").map((k) => FACTS[k][draft[k]][lang]).join(SEP[lang])}` : undefined;
  return (
    <>
      <h1>{UI.aiNotice[lang]}</h1>
      <div className="card stack"><p style={{ color: "var(--alert)", fontWeight: 600 }}>{UI.neverAsk[lang]}</p></div>

      <VoiceIntake lang={lang} onFinal={(t) => send({ text: t })} say={readBack} />
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send({ text }); }}>
        <label className="label" htmlFor="what">{UI.whatHappened[lang]}</label>
        <textarea id="what" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
        <button className="btn secondary" disabled={busy || !text.trim()}>↵</button>
      </form>
      {note && <p className="chip alert">{note}</p>}

      <div className="card stack">
        <p className="label">{UI.understood[lang]}</p>
        {draft.words && <p className="small secondary">“{draft.words}”</p>}
        {FACT_ORDER.map((k) => (
          <div key={k} className="stack" style={{ "--gap": "6px" } as React.CSSProperties}>
            <span>{QUESTION[k][lang]}</span>
            <div className="row">
              {(["yes", "no", "unknown"] as Fact[]).map((v) => (
                <button key={v} className={`btn ${draft[k] === v ? "primary" : ""}`} disabled={busy} onClick={() => send({ [k]: v })}>{ANSWER[lang][v]}</button>
              ))}
            </div>
            {draft[k] !== "unknown" && <span className="small" style={{ color: "var(--guided)" }}>→ {FACTS[k][draft[k]][lang]}</span>}
          </div>
        ))}
      </div>
      <button className="btn primary big" disabled={busy || !ready}
        onClick={() => cmd("confirm", { rev: draft.rev }).then(() => onConfirmed(draft.rev)).catch((e: Error) => setNote(e.message))}>
        {UI.confirm[lang]}
      </button>
      <button className="btn" onClick={() => cmd("human")}>{UI.human[lang]}</button>
    </>
  );
}

function Waiting({ lang }: { lang: Lang }) {
  const [late, setLate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLate(true), 30_000); return () => clearTimeout(t); }, []);
  return <div className="card stack"><p>{STATUS.review[lang]}…</p>{late && <p className="small secondary">{UI.waiting[lang]}</p>}</div>;
}

function Guidance({ lang, card, reply }: { lang: Lang; card: Card; reply: Reply }) {
  const r = REPLIES[reply.intent];
  const text = r ? r.text(reply.slots)[lang] : "";
  const [teach, setTeach] = useState("");
  const [note, setNote] = useState("");
  const canSpeak = typeof window !== "undefined" && window.speechSynthesis?.getVoices().some((v) => v.lang.startsWith(BCP47[lang].slice(0, 2)));

  return (
    <>
      <p className="small secondary">{{ bn: "অপারেটর · ব্যাংকের অনুমোদিত বার্তা", en: "Operator · the bank's approved message", ja: "係の 人 ・ 銀行の きまった 文" }[lang]}</p>
      <h1>{text}</h1>
      {canSpeak && <button className="btn" onClick={() => { const u = new SpeechSynthesisUtterance(text); u.lang = BCP47[lang]; speechSynthesis.speak(u); }}>🔊 {{ bn: "শুনুন", en: "Listen", ja: "きく" }[lang]}</button>}

      {card.field_state !== "none" && (
        <div className="card stack" style={{ "--gap": "4px" } as React.CSSProperties}>
          <strong>{FIELD_STATE[card.field_state][lang]}</strong>
          {card.field_state === "on_way" && <span className="small secondary">{etaText(card.eta_text, lang)}</span>}
        </div>
      )}

      {reply.intent === "HELD_WAIT_OR_LEAVE" && (
        <div className="stack">
          <p className="label">{UI.waitOrLeave[lang]}</p>
          <div className="row">
            <button className={`btn grow ${card.choice === "wait" ? "primary" : ""}`} onClick={() => cmd("choose", { choice: "wait" })}>{UI.wait[lang]}</button>
            <button className={`btn grow ${card.choice === "leave" ? "primary" : ""}`} onClick={() => cmd("choose", { choice: "leave" })}>{UI.leave[lang]}</button>
          </div>
        </div>
      )}

      {card.teachback_result === "understood" ? (
        <div className="card" style={{ background: "var(--guided-soft)", color: "var(--guided)" }}><strong>✓ {STATUS.guided[lang]}</strong></div>
      ) : card.teachback ? (
        <p className="small secondary">{UI.teachBackSent[lang]}</p>
      ) : (
        <form className="stack" onSubmit={(e) => {
          e.preventDefault();
          cmd<{ withheld?: boolean }>("teachback", { text: teach }).then((x) => setNote(x.withheld ? UI.numbersWithheld[lang] : "")).catch((er: Error) => setNote(er.message));
        }}>
          <label className="label" htmlFor="teach">{UI.teachBack[lang]}</label>
          {card.teachback_result === "clarify" && <p className="small secondary">{UI.clarify[lang]}</p>}
          <textarea id="teach" value={teach} onChange={(e) => setTeach(e.target.value)} maxLength={500} />
          {note && <p className="chip alert">{note}</p>}
          <button className="btn primary big" disabled={!teach.trim()}>↵</button>
        </form>
      )}
    </>
  );
}

function ShowStaff({ card }: { card: Card }) {
  return (
    <div className="card stack" style={{ background: "var(--bg-ink)", color: "var(--text-inverse)", marginTop: "auto" }}>
      <span className="small muted">{UI.showStaff.bn} · Show to staff</span>
      <span lang="ja" style={{ fontSize: 16, fontWeight: 500 }}>ATMでカードが出てきませんでした。<br />案件番号：<span className="mono">{card.id.slice(0, 8)}</span></span>
    </div>
  );
}
