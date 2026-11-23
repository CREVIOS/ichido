"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, LockKeyhole } from "lucide-react";
import { ChatBubble } from "@/components/chat-bubble";
import { VoiceIntake } from "@/components/VoiceIntake";
import { Button } from "@/components/ui/button";
import { CHAT, callerLines, chatChoices, type Choice } from "@/content/chat";
import { FACTS, FRONTLINE, JOURNEY, UI, VOICE_LANGS, callerPack, contentPack, errorText, urgentText, type FactKey, type Lang } from "@/content/catalogue";
import { frontlineNumber } from "@/content/numbers";
import type { CallerCase, Draft, Reply, Turn } from "@/content/caller-session";
import { cmd } from "@/lib/supabase";
import type { Sync } from "./faults";
import { AnswerChips, Guidance } from "./guidance";

type Attempt = { text:string; id:string; after:number };
type Props = { card:CallerCase; draft:Draft; lang:Lang; turns:Turn[]; generation:string; refresh:()=>Promise<void>; sync:Sync; alerts:ReactNode; children:ReactNode; reply:Reply|null; rate:number };

export function Conversation({card,draft,lang,turns,generation,refresh,sync,alerts,children,reply,rate}: Props) {
  const [text,setText] = useState("");
  const [note,setNote] = useState("");
  const [busy,setBusy] = useState("");
  const [attempt,setAttempt] = useState<Attempt | null>(null);
  const [caption,setCaption] = useState("");
  const [question,setQuestion] = useState<FactKey | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const lock = useRef(false);
  const pack = callerPack(card.fault);
  const ai = card.handler === "ai";
  const voice = !card.text_only && VOICE_LANGS.includes(lang);
  const started = turns.some(t => t.speaker === "caller" && t.wording === "start");
  const lines = callerLines(turns,lang,reply);
  const lastOwn = lines.findLast(l => l.from === "caller");
  const saved = attempt && turns.some(t => t.seq > attempt.after && t.speaker === "caller" && t.words === attempt.text.trim());
  const pending = attempt && !saved && !frontlineNumber(attempt.text) ? attempt : null;
  const warning = urgentText(card.fault,card.flags,lang);
  useEffect(() => {
    const el = viewport.current;
    if (follow.current && el) el.scrollTop = el.scrollHeight;
  },[turns.length,caption,attempt,question,reply?.id,busy]);
  useEffect(() => {
    const vv = window.visualViewport;
    const el = viewport.current?.closest<HTMLElement>(".phone-chat");
    if (!vv || !el) return;
    const resize = () => { if (vv.scale === 1) el.style.height = vv.height + "px"; };
    resize(); vv.addEventListener("resize",resize);
    return () => { vv.removeEventListener("resize",resize); el.style.removeProperty("height"); };
  },[]);
  async function submit(act:string, fields:Record<string,unknown> = {}) {
    if (lock.current) return;
    lock.current = true;
    follow.current = true;
    setBusy(act); setNote("");
    const words = typeof fields.text === "string" ? fields.text : "";
    const send = act === "text" && attempt?.text === words ? attempt : {id:crypto.randomUUID(),text:words,after:turns.at(-1)?.seq ?? 0};
    if (act === "text") setAttempt(send);
    try {
      const result = await cmd<{withheld?:boolean}>("frontline_turn",{act,request_id:send.id,base_rev:draft.rev,...fields});
      if (act === "text") {
        if (result.withheld) setNote(UI.numbersWithheld[lang]);
        else setText(current => current === words ? "" : current);
        setAttempt(null);
      }
      setQuestion(null);
      await refresh();
    } catch (e) { setNote(errorText((e as Error).message,lang)); }
    finally { lock.current = false; setBusy(""); }
  }
  function choose(c:Choice) {
    if (c.question || c.act === "options") { follow.current = true; setQuestion(c.question ?? null); }
    else void submit(c.act,c.fields);
  }
  const send = () => { if (text.trim() && !busy) void submit("text",{text}); };
  return <>
    <div className="chat-scroll" ref={viewport} onScroll={e => {
      const el = e.currentTarget; follow.current = el.scrollHeight - el.clientHeight - el.scrollTop < 72;
    }}>
      <p className="chat-system mt-0">{FRONTLINE.disclosure[lang]}</p>
      {alerts}
      <div role="log" aria-live="polite">
        {lines.map((l,i) => <Fragment key={l.id}>{l.from === "system"
          ? <p className="chat-system" role={l.text === FRONTLINE.risk[lang] ? "alert" : undefined}>{l.text}</p>
          : <ChatBubble from={l.from} lang={l.lang} label={l.from === "operator" ? CHAT.operator[lang] : undefined} first={lines[i-1]?.from !== l.from} last={lines[i+1]?.from !== l.from}>
              {l.text}
            </ChatBubble>}
          {l === lastOwn && !pending && <span className="chat-delivery">{CHAT.delivered[lang]}</span>}
        </Fragment>)}
        {card.transfer_reason === "suspected_risk" && !lines.some(l => l.text === FRONTLINE.risk[lang]) && <p className="chat-system" role="alert">{FRONTLINE.risk[lang]}</p>}
        {card.handler === "queued" && <p className="chat-system">{!lines.some(l => l.text === FRONTLINE.queued[lang]) && FRONTLINE.queued[lang]} {contentPack(card.fault)?.hint[lang] ?? FRONTLINE.inPerson[lang]}</p>}
        {card.handler === "human" && !lines.some(l => l.text === FRONTLINE.connected[lang]) && <p className="chat-system">{FRONTLINE.connected[lang]}</p>}
        {warning && <p className="chat-system" role="alert">{warning}</p>}
        {pending && <><ChatBubble from="caller">{pending.text}</ChatBubble>{busy === "text"
          ? <span className="chat-delivery">{CHAT.sending[lang]}</span>
          : <button type="button" className="chat-delivery underline" onClick={() => submit("text",{text:pending.text})}>{CHAT.retry[lang]}</button>}</>}
        {caption && <ChatBubble from="caller">{caption}</ChatBubble>}
        {ai && busy && busy !== "start" && <ChatBubble from="ai"><span role="status" aria-label={CHAT.typing[lang]} className="chat-dots"><i/><i/><i/></span></ChatBubble>}
      </div>
      {!started && <div className="chat-system"><p>{JOURNEY.privacy[lang]}</p>{voice && <p className="mt-2">{FRONTLINE.voicePrivacy[lang]}</p>}</div>}
      {started && pack.scope && <p className="chat-system">{pack.scope[lang]}</p>}
      {question && <ChatBubble from="ai">{FACTS[question].question[lang]}</ChatBubble>}
      {draft.needs_clarification && <p className="chat-system">{UI.unsure[lang]}</p>}
      {reply && <Guidance key={reply.id+lang} inThread={turns.some(t => t.speaker === reply.author && t.wording === reply.intent)} chat refresh={refresh} lang={lang} card={card} reply={reply} rate={rate} />}
      {children}
      {note && !lines.some(l => l.text === note) && <p className="chat-system" role="status">{note}</p>}
    </div>
    <footer className="chat-dock">
      {sync.offline && <p role="status" className="chat-system"><span>{JOURNEY.offline[lang]}</span> <button className="underline" onClick={sync.retry}>{JOURNEY.retry[lang]}</button></p>}
      <p className="chat-pin"><LockKeyhole size={13} className="shrink-0" />{pack.neverAsk[lang]}</p>
      {!started ? <Button className="mt-2 w-full rounded-full" disabled={!!busy} onClick={() => submit("start")}>{(ai ? FRONTLINE.start : FRONTLINE.write)[lang]}</Button> : <>
        <div className="chat-chips">{reply && <AnswerChips key={reply.id+lang} card={card} reply={reply} lang={lang} refresh={refresh}/>}
          {chatChoices(card,draft,lang,question).map(c => <button key={c.act+c.label} type="button" aria-label={c.name} aria-pressed={c.selected} disabled={!!busy} onClick={() => choose(c)}>{c.label}</button>)}</div>
        <form className="chat-compose" onSubmit={e => { e.preventDefault(); send(); }}>
          {voice && <VoiceIntake key={generation+lang} generation={generation} handler={card.handler} lang={lang} onCaption={setCaption} />}
          <div className="chat-entry"><textarea rows={1} aria-label={UI.whatHappened[lang]} placeholder={CHAT.message[lang]} maxLength={500} value={text}
            onChange={e => setText(e.target.value)} onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer:fine)").matches) {
                e.preventDefault(); send();
              }
            }} />
            <button type="submit" className="chat-send" disabled={!!busy || !text.trim()} aria-label={UI.send[lang]}><ArrowUp size={21} /></button>
          </div>
        </form>
      </>}
    </footer>
  </>;
}
