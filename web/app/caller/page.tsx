"use client";
import { useCallback, useEffect, useState } from "react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { VoiceIntake, type SignedSpeech } from "@/components/VoiceIntake";
import { StatusChip, Tag } from "@/components/ui";
import {
  FACTS, FACT_KEYS, ANSWER, STATUS, UI, STATION, FIELD_STATE, LANG_NAME, LANG_LOCALE, FAULTS, etaText, pick, replyOf, errorText,
  type Lang, type Fact, type Status, type FieldState, type L10n,
} from "@/content/catalogue";

type Card = {
  id: string; station: string; fault: string; lang: Lang | null; confirmed_rev: number | null; status: Status;
  field_state: FieldState; eta: string | null; choice: string | null; teachback: string | null; teachback_result: string | null; needs_human: boolean;
};
type Draft = { rev: number; card_back: Fact; cash_received: Fact; words: string | null; needs_clarification: boolean };
type Reply = { id: string; intent: string; slots: { branch?: L10n; hours?: L10n }; sent_at: string };
type Station = { label: L10n };
const gap = (g: number) => ({ "--gap": `${g}px` }) as React.CSSProperties;

export default function CallerPage() {
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [station, setStation] = useState<Station | null>(null);

  const [staffSession, setStaffSession] = useState(false);

  // Only the case this phone is bound to; never "the first card visible" (staff can see many).
  const load = useCallback(async () => {
    const db = sb();
    const mine = await cmd<{ incident: string | null; staff: boolean }>("mine").catch(() => ({ incident: null, staff: false }));
    setStaffSession(mine.staff);
    if (!mine.incident) return setCard(null);
    const { data: c } = await db.from("caller_card").select("*").eq("id", mine.incident).maybeSingle();
    setCard((c as Card) ?? null);
    if (!c) return;
    const [d, r, s] = await Promise.all([
      db.from("draft").select("*").eq("incident", c.id).maybeSingle(),
      db.from("reply").select("id, intent, slots, sent_at").eq("incident", c.id).order("sent_at"),
      db.from("station").select("label").eq("id", c.station).maybeSingle(),
    ]);
    setDraft(d.data as Draft); setReplies((r.data ?? []) as Reply[]); setStation(s.data as Station);
  }, []);
  useLive(["caller_card", "draft", "reply"], load);

  if (card === undefined) return null;
  if (card === null) return (
    <main className="phone" style={{ justifyContent: "center" }}>
      <h1 lang="bn">{staffSession ? STATION.staffSession.bn : UI.notConnected.bn}</h1>
      <p className="soft">{staffSession ? STATION.staffSession.en : UI.notConnected.en}</p>
    </main>
  );

  const lang: Lang = card.lang ?? "bn";
  const latest = replies.at(-1);
  const confirmed = card.confirmed_rev != null || replies.length > 0;

  return (
    <main className="phone" lang={lang}>
      <header className="row between">
        <span className="row" style={gap(8)}><span className="brand-mark" aria-hidden>一</span><span style={{ fontWeight: 500 }}>ichido</span></span>
        <span className="tag">{LANG_NAME[lang]}</span>
      </header>
      <div className="stack" style={gap(6)}>
        <span className="tiny muted">{pick(station?.label, lang)} · {pick(FAULTS[card.fault], lang)}</span>
        <div className="row"><StatusChip status={card.status} lang={lang} /></div>
      </div>
      {!confirmed && draft && <Intake lang={lang} draft={draft} needsHuman={card.needs_human} />}
      {confirmed && !latest && <Waiting lang={lang} />}
      {latest && <Guidance lang={lang} card={card} reply={latest} />}
      <div className="showstaff stack" style={{ ...gap(6), marginTop: "auto" }}>
        <span className="tiny" style={{ opacity: 0.6 }}>{UI.showStaff[lang]}</span>
        <span lang="ja" style={{ fontSize: 17, fontWeight: 500 }}>{FAULTS[card.fault]?.ja}。</span>
        <span lang="ja" className="small" style={{ opacity: 0.85 }}>{UI.caseNo.ja}：<span className="mono">{card.id.slice(0, 8)}</span></span>
      </div>
      <p className="tiny muted">{UI.helpDesk[lang]}</p>
    </main>
  );
}

function Intake({ lang, draft, needsHuman }: { lang: Lang; draft: Draft; needsHuman: boolean }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState<SignedSpeech | null>(null);

  async function send(body: Record<string, unknown>) {
    setBusy(true); setNote("");
    try {
      const r = await cmd<{ withheld?: boolean; say?: SignedSpeech | null }>("draft", { base_rev: draft.rev, ...body });
      if (r.withheld) setNote(UI.numbersWithheld[lang]);
      else { setText(""); setSay(r.say ?? null); }
    } catch (e) {
      setNote(errorText((e as Error).message, lang));
    } finally { setBusy(false); }
  }

  const known = FACT_KEYS.filter((k) => draft[k] !== "unknown");

  return (
    <>
      <h1>{UI.aiNotice[lang]}</h1>
      <p className="notice">{UI.neverAsk[lang]}</p>
      <VoiceIntake lang={lang} onFinal={(t) => send({ text: t })} say={say} />
      <form className="askbar stack" style={gap(10)} onSubmit={(e) => { e.preventDefault(); if (text.trim()) send({ text }); }}>
        <label className="small soft" htmlFor="what">✦ {UI.whatHappened[lang]}</label>
        <textarea id="what" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn dark" disabled={busy || !text.trim()}>{UI.send[lang]}</button></div>
      </form>
      {note && <p className="notice">{note}</p>}
      {draft.needs_clarification && <p className="notice" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>{UI.unsure[lang]}</p>}

      <section className="card">
        <div className="row between"><span className="small soft">{UI.understood[lang]}</span>{draft.rev > 0 && <Tag label="v" value={draft.rev} />}</div>
        {draft.words && <p className="small soft">“{draft.words}”</p>}
        {FACT_KEYS.map((k) => (
          <div key={k} className="stack" style={gap(8)}>
            <span style={{ fontSize: 17 }}>{FACTS[k].question[lang]}</span>
            <div className="row" style={gap(6)}>
              {(["yes", "no", "unknown"] as Fact[]).map((v) => (
                <button key={v} className={`btn ${draft[k] === v ? "on" : ""}`} disabled={busy} aria-pressed={draft[k] === v} onClick={() => send({ [k]: v })}>{ANSWER[v][lang]}</button>
              ))}
            </div>
            {draft[k] !== "unknown" && <span className="small" style={{ color: "var(--green)" }}>→ {FACTS[k][draft[k]][lang]}</span>}
          </div>
        ))}
      </section>
      <button className="btn blue block" disabled={busy || !known.length}
        onClick={() => cmd("confirm", { rev: draft.rev }).catch((e: Error) => setNote(errorText(e.message, lang)))}>{UI.confirm[lang]}</button>
      {needsHuman ? <p className="notice" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>{UI.humanAsked[lang]}</p>
        : <button className="btn ghost" onClick={() => cmd("human").catch((e: Error) => setNote(errorText(e.message, lang)))}>{UI.human[lang]}</button>}
    </>
  );
}

const WAITING_HINT_MS = 30_000;
function Waiting({ lang }: { lang: Lang }) {
  const [late, setLate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLate(true), WAITING_HINT_MS); return () => clearTimeout(t); }, []);
  return <section className="card"><p style={{ fontSize: 18 }}>{STATUS.review[lang]}…</p>{late && <p className="small soft">{UI.waiting[lang]}</p>}</section>;
}

// Whether the device has a speech voice for this language (Bengali often has none).
function useHasVoice(lang: Lang) {
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const check = () => setHas(window.speechSynthesis.getVoices().some((v) => v.lang.startsWith(lang)));
    const t = setTimeout(check, 0);
    window.speechSynthesis.addEventListener("voiceschanged", check);
    return () => { clearTimeout(t); window.speechSynthesis.removeEventListener("voiceschanged", check); };
  }, [lang]);
  return has;
}

function Guidance({ lang, card, reply }: { lang: Lang; card: Card; reply: Reply }) {
  const r = replyOf(reply.intent);
  const text = r ? r.text(reply.slots)[lang] : errorText("server", lang);
  const done = card.teachback_result === "understood";
  const act = (name: string, body: Record<string, unknown> = {}) => cmd(name, body).then(() => setNote("")).catch((e: Error) => setNote(errorText(e.message, lang)));
  const [teach, setTeach] = useState("");
  const [note, setNote] = useState("");
  const hasVoice = useHasVoice(lang);

  return (
    <>
      <span className="tiny muted">{UI.approved[lang]}</span>
      <h1>{text}</h1>
      {hasVoice && <button className="btn" onClick={() => { const u = new SpeechSynthesisUtterance(text); u.lang = LANG_LOCALE[lang]; window.speechSynthesis.speak(u); }}>🔊 {UI.listen[lang]}</button>}
      {note && <p className="notice">{note}</p>}

      {card.field_state !== "none" && (
        <section className="card" style={{ gap: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 500 }}>{FIELD_STATE[card.field_state][lang]}</span>
          {card.field_state === "on_way" && <span className="small soft">{etaText(card.eta, lang)}</span>}
        </section>
      )}

      {r?.offersChoice && (
        <div className="stack" style={gap(8)}>
          <span className="small soft">{UI.waitOrLeave[lang]}</span>
          <div className="row" style={gap(8)}>
            <button className={`btn grow ${card.choice === "wait" ? "on" : ""}`} disabled={done} aria-pressed={card.choice === "wait"} onClick={() => act("choose", { choice: "wait" })}>{UI.wait[lang]}</button>
            <button className={`btn grow ${card.choice === "leave" ? "on" : ""}`} disabled={done} aria-pressed={card.choice === "leave"} onClick={() => act("choose", { choice: "leave" })}>{UI.leave[lang]}</button>
          </div>
        </div>
      )}

      {card.teachback_result === "understood" ? (
        <section className="card" style={{ background: "var(--green-soft)", color: "var(--green)" }}><strong style={{ fontWeight: 500, fontSize: 18 }}>✓ {STATUS.guided[lang]}</strong></section>
      ) : card.teachback ? (
        <p className="small soft">{UI.teachBackSent[lang]}</p>
      ) : (
        <form className="askbar stack" style={gap(10)} onSubmit={(e) => {
          e.preventDefault();
          cmd<{ withheld?: boolean }>("teachback", { text: teach }).then((x) => setNote(x.withheld ? UI.numbersWithheld[lang] : "")).catch((er: Error) => setNote(errorText(er.message, lang)));
        }}>
          <label className="small soft" htmlFor="teach">✦ {UI.teachBack[lang]}</label>
          {card.teachback_result === "clarify" && <p className="small soft">{UI.clarify[lang]}</p>}
          <textarea id="teach" value={teach} onChange={(e) => setTeach(e.target.value)} maxLength={500} />
          {note && <p className="notice">{note}</p>}
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn dark" disabled={!teach.trim()}>{UI.send[lang]}</button></div>
        </form>
      )}
    </>
  );
}
