import { Conversation } from "@/components/Conversation";
import { ChatBubble } from "@/components/ChatBubble";
import { CHAT } from "@content/chat";
import { canConfirm } from "@content/caller-session";
import { useCallback, useRef, useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Speech from "expo-speech";
import { Check, CircleCheck, OctagonAlert, Volume2 } from "lucide-react-native";
import { cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { VoiceIntake, type SignedSpeech } from "@/components/VoiceIntake";
import { Human } from "@/components/Human";
import { hasVoice } from "@/lib/voice";
import { Brand, Mark, Button, Card, Icon, Input, LangPicker, LiveText, Notice, Screen, T, TextScale, Toggle } from "@/components/ui";
import { BankStatus, CallerFlags, Rate, FollowUp, Receipt, SyncStatus, type Sync, PrefsBar, speechRate, textScale, usePrefs } from "@/components/CallerFaults";
import { color, radius, space, tint } from "@/theme";
import {
  JOURNEY, CONSULTATION, allergyFacts, ACCESS, FRONTLINE, CALLER_FLAGS, FACTS, FACT_KEYS, ANSWER, STATUS, UI, STATION, LANG_LOCALE, FAULTS, MOBILE, OPS_CALLER, VOICE, VOICE_LANGS, sentText, callerPack, pick, replyOf, errorText,
  type Lang, type Fact,
} from "@content/catalogue";

import type { CallerCase as CallerCard, CallerView, Reply, Draft } from "@content/caller-session";
const MAX_TEXT = 500;

export default function CallerScreen() {
  const [detailsOpen,setDetailsOpen] = useState(false);
  const [allergyOpen,setAllergyOpen] = useState(false);
  const [view, setView] = useState<CallerView>();
  const [updated, setUpdated] = useState<Date>();
  const [offline, setOffline] = useState(false);
  const sequence = useRef(0);
  const [prefs, setPrefs] = usePrefs();
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    try {
      const next = await cmd<CallerView>("caller_screen");
      if (seq !== sequence.current) return;
      setView(next); setUpdated(new Date()); setOffline(false);
    } catch {
      if (seq === sequence.current) setOffline(true);
    }
  }, []);
  useLive(["caller_card","draft","reply","frontline_turn"], load, true, { incident: view?.screen?.card.id });
  if (!view) return <Screen onRefresh={load}><Human lang="bn" connected={false} /><T>{(offline ? JOURNEY.offline : JOURNEY.connecting).bn}</T>
    {offline && <Button label={JOURNEY.retry.bn} onPress={load} />}</Screen>;
  const sync = {offline,updated,retry:load};
  if (!view.screen) return view.follow ? <FollowUp f={view.follow} prefs={prefs} onPrefs={setPrefs} sync={sync} /> : <NotConnected view={view} sync={sync} />;
  const { card, draft, reply: latest, station, turns, generation } = view.screen;
  const lang: Lang = card.lang ?? "bn";
  const open = card.status !== "guided";

  const confirmed = card.confirmed_rev != null;
  const frontline = card.handler !== "legacy" && open;
  const chat = frontline && !card.fraud;
  const stationName = pick(station?.label,lang) || card.station;
  const changeLang = (l:Lang) => {cmd("set_lang",{lang:l}).then(load).catch(() => setOffline(true));};
  const alerts = <>
        {card.field_state !== "none" && <Card><LiveText>{callerPack(card.fault).field(card.field_state,lang)}</LiveText>
          {card.field_state === "on_way" && <T>{callerPack(card.fault).eta(card.eta,lang)} {card.eta_at && new Date(card.eta_at).toLocaleString(lang)}</T>}</Card>}
        {card.notice && OPS_CALLER.notice[card.notice] && (
          <Card title={OPS_CALLER.noticeLabel[lang]}><T v="h2">{OPS_CALLER.notice[card.notice][lang]}</T></Card>
        )}
        {card.text_only && <Notice>{ACCESS.textOnly[lang]}</Notice>}
  </>;
  const details = <>
        {callerPack(card.fault).atm && (card.bank_status || !open) && <BankStatus status={(card.bank_status === "contact_by" || card.bank_status === "contacted") && !card.callback_channel ? null : card.bank_status} due={card.bank_due} lang={lang} />}
        {allergyFacts(card.flags).length>0 && <Card><Button kind="secondary" label={JOURNEY.allergyCard[lang]} onPress={() => setAllergyOpen(!allergyOpen)} />
          {allergyOpen && (["bn","ja"] as const).map(l => <T key={l} accessibilityLanguage={l}>{allergyFacts(card.flags).map(f => CALLER_FLAGS[f].label[l]).join(" · ")}</T>)}</Card>}
        {(card.choice === "leave" || !open) && <Card><T>{JOURNEY.checkHere[lang]}</T><T>{pick(station.branch,lang)} · {pick(station.hours,lang)}</T>
          {station?.contact && <T selectable>{station.contact}</T>}
        <Receipt station={card.station} id={card.id} lang={lang} /></Card>}
        {confirmed && !card.flags.includes("need_other") && <View style={{ backgroundColor: color.primary, borderRadius: radius.card, padding: space.lg, gap: 6 }}>
          <T v="small" tone="onPrimary" style={{ opacity: 0.6 }}>{UI.showStaff[lang]}</T>
          <T v="h2" tone="onPrimary" weight={500}>{FAULTS[card.fault]?.ja}。</T>
          <T v="label" tone="onPrimary">{UI.caseNo.ja}：<T v="label" mono tone="onPrimary">{card.id.slice(0, 8)}</T></T>
        </View>}
        <T selectable v="small">{UI.helpDesk[lang]} {CONSULTATION.phone} · {CONSULTATION.email}</T>
    {chat && <T v="small">{FRONTLINE.disclosure[lang]} {!card.text_only && VOICE_LANGS.includes(lang) && VOICE.notice[lang]}</T>}
  </>;
  const guidance = latest && <Guidance key={latest.id+lang} refresh={load} lang={lang} card={card} reply={latest} rate={speechRate(prefs)} chat={chat} inThread={chat && !!sentText(latest,lang) && turns.some(t=>t.speaker===latest.author && t.wording===latest.intent)}/>;
  return <TextScale.Provider value={textScale(prefs)}>
    <Screen fixed={chat} onRefresh={load} eyebrow={<><Mark/><T style={{flex:1}} numberOfLines={1} weight={500}>{stationName}</T></>}
      right={<View style={{flexDirection:"row"}}><LangPicker compact lang={lang} onChange={changeLang}/><PrefsBar prefs={prefs} onChange={setPrefs} lang={lang}/></View>}
      pinned={<View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:6}}><T style={{flex:1}} v="small">{callerPack(card.fault).status(card.status,lang)}</T><Human key={generation+String(open)} lang={lang} state={open ? card.handler : undefined} requested={open && card.needs_human} refresh={load}/></View>}>
      {card.fraud ? <FraudScreen lang={lang}/> : chat ?
        <Conversation key={generation} generation={generation} lang={lang} card={card} draft={draft} turns={turns} refresh={load} sync={sync} alerts={alerts} reply={latest} answerChips={latest && <AnswerChips key={latest.id+lang} card={card} reply={latest} lang={lang} refresh={load}/>}>
          {guidance}<Button kind="ghost" label={CHAT.details[lang]} onPress={()=>setDetailsOpen(!detailsOpen)}/>{detailsOpen && details}
        </Conversation> : <>
          <SyncStatus sync={sync} lang={lang}/>{alerts}
          {!confirmed && draft && <Intake key={generation} lang={lang} draft={draft} card={card}/>}
          {confirmed && !latest && <Waiting lang={lang} fault={card.fault}/>}
          {guidance}
          {open && (callerPack(card.fault).atm || confirmed) && <CallerFlags fault={card.fault} flags={card.flags} lang={lang}/>}
          {details}
        </>}
    </Screen>
  </TextScale.Provider>;
}
// An ATM caller confirms the read-back of two facts; any other pack's caller confirms their own taps (content/packs).
function Intake({ lang, draft, card }: { lang: Lang; draft: Draft; card: CallerCard }) {
  const P = callerPack(card.fault);

  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState<SignedSpeech | null>(null);

  async function send(body: Record<string, unknown>) {
    setBusy(true); setNote("");
    try {
      const r = await cmd<{ withheld?: boolean; say?: SignedSpeech | null }>("draft", { base_rev: draft.rev, ...body });
      if (r.withheld) setNote(UI.numbersWithheld[lang]);
      else { if (typeof body.text === "string") setText(value => value === body.text ? "" : value); setSay(r.say ?? null); }
    } catch (e) {
      setNote(errorText((e as Error).message, lang));
    } finally { setBusy(false); }
  }
  const fail = (e: Error) => setNote(errorText(e.message, lang));
  const ready = canConfirm(P.atm,draft,card.flags);

  return (
    <>
      <T v="h1">{UI.aiNotice[lang]}</T>
      <Notice>{P.neverAsk[lang]}</Notice>
      {P.scope ? <Notice>{P.scope[lang]}</Notice> : null}
      {!P.atm && <CallerFlags fault={card.fault} flags={card.flags} lang={lang} />}
      {!card.text_only && hasVoice && VOICE_LANGS.includes(lang) ? <VoiceIntake lang={lang} onFinal={(t) => send({ text: t })} say={say} /> : <T v="small">{VOICE.unavailable[lang]}</T>}
      <Card>
        <T v="small">{JOURNEY.privacy[lang]}</T>
        <Input label={UI.whatHappened[lang]} value={text} onChangeText={setText} multiline maxLength={MAX_TEXT} />
        <View style={{ alignItems: "flex-end" }}>
          <Button label={JOURNEY.review[lang]} onPress={() => send({ text })} busy={busy} disabled={!text.trim()} />
        </View>
      </Card>
      <LiveText>{note}</LiveText>

      {P.atm && !card.flags.includes("need_other") ? <NativeFacts lang={lang} draft={draft} busy={busy} onAnswer={(k,v) => send({ [k]:v })} /> : draft.words && <T accessibilityLanguage={draft.words_lang ?? undefined}>{draft.words}</T>}
      {!ready && <T>{(draft.needs_clarification ? UI.unsure : JOURNEY.choose)[lang]}</T>}
      <Button label={UI.confirm[lang]} block disabled={busy || !ready} onPress={() => cmd("confirm", { rev: draft.rev }).catch(fail)} />

    </>
  );
}

function NativeFacts({ lang, draft, busy, onAnswer }: { lang: Lang; draft: Draft; busy: boolean; onAnswer: (key:string,value:Fact) => void }) {
  return (<Card title={UI.understood[lang]}>
        {draft.words ? <T v="label" accessibilityLanguage={draft.words_lang ?? undefined}>“{draft.words}”</T> : null}
        {FACT_KEYS.map((k) => (
          <View key={k} style={{ gap: 8 }}>
            <T v="body" tone="ink">{FACTS[k].question[lang]}</T>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {(["yes", "no", "unknown"] as Fact[]).map((v) => (
                <Toggle key={v} on={draft[k] === v} label={ANSWER[v][lang]} disabled={busy} accessibilityLabel={`${FACTS[k].question[lang]} — ${ANSWER[v][lang]}`} onPress={() => onAnswer(k,v)} style={{ flex: 1 }} />
              ))}
            </View>
            {draft[k] !== "unknown" && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon icon={Check} size={14} /><T v="label" tone="ink">{FACTS[k][draft[k]][lang]}</T>
              </View>
            )}
          </View>
        ))}
      </Card>);
}

// No timers in the caller flow: the handset hint is there from the start.
function Waiting({ lang, fault }: { lang: Lang; fault: string }) {
  return <Card><T v="h2">{STATUS.review[lang]}…</T><T v="label">{callerPack(fault).waiting(lang)}</T></Card>;
}

// Whether the device has a speech voice for this language (Bengali often has none).
function useHasVoice(lang: Lang) {
  const [has, setHas] = useState(false);
  useEffect(() => {
    Speech.getAvailableVoicesAsync()
      .then((v) => setHas(v.some((x) => x.language.toLowerCase().startsWith(lang))))
      .catch(() => setHas(false));
  }, [lang]);
  return has;
}

function Guidance({ lang, card, reply, rate, chat, inThread }: { chat?:boolean; inThread?:boolean; refresh:()=>Promise<void>; lang: Lang; card: CallerCard; reply: Reply; rate: number }) {
  const r = replyOf(reply.intent);
  const text = sentText(reply,lang) ?? errorText("server", lang);
  const done = card.teachback_result === "understood";
  const [teach, setTeach] = useState("");
  const [note, setNote] = useState("");
  const hasVoice = useHasVoice(lang);
  const act = (name: string, body: Record<string, unknown> = {}) => cmd(name, body).then(() => setNote("")).catch((e: Error) => setNote(errorText(e.message, lang)));
  const sendTeach = () => cmd<{ withheld?: boolean }>("teachback", { text: teach })
    .then((x) => setNote(x.withheld ? UI.numbersWithheld[lang] : ""))
    .catch((e: Error) => setNote(errorText(e.message, lang)));

  return (
    <>
      {inThread ? null : chat ? <ChatBubble text={text} from={reply.author === "human" ? "operator" : "ai"} label={reply.author === "human" ? CHAT.operator[lang] : undefined}/> : <><T v="small">{UI.approved[lang]}</T><T v="h1">{text}</T></>}
      {hasVoice && lang !== "ne" && reply.author !== "ai" && !card.text_only && <Button kind="secondary" icon={Volume2} label={UI.listen[lang]} onPress={() => Speech.speak(text, { language: LANG_LOCALE[lang], rate })} style={{ alignSelf: "flex-start" }} />}
      <LiveText>{note}</LiveText>

      {r?.offersChoice && (
        <View style={{ gap: 8 }}>
          <T v="label">{UI.waitOrLeave[lang]}</T>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Toggle on={card.choice === "wait"} disabled={done} label={UI.wait[lang]} onPress={() => act("choose", { choice: "wait" })} style={{ flex: 1 }} />
            <Toggle on={card.choice === "leave"} disabled={done} label={UI.leave[lang]} onPress={() => act("choose", { choice: "leave" })} style={{ flex: 1 }} />
          </View>
        </View>
      )}

      {(card.handler === "legacy" || (card.handler === "human" && reply.author === "human")) && (done ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.card, padding: space.lg, backgroundColor: tint.guided.bg }}>
            <CircleCheck size={20} strokeWidth={1.5} color={tint.guided.fg} /><T v="h2" style={{ color: tint.guided.fg }}>{STATUS.guided[lang]}</T>
          </View>
          <Rate lang={lang} rating={card.rating} onNote={setNote} />
        </>
      ) : card.teachback ? (
        <T v="label">{UI.teachBackSent[lang]}</T>
      ) : (
        <Card>
          <T v="small">{JOURNEY.privacy[lang]}</T>
          <Input label={UI.teachBack[lang]} value={teach} onChangeText={setTeach} multiline maxLength={MAX_TEXT} />
          {card.teachback_result === "clarify" && <T v="label">{UI.clarify[lang]}</T>}
          <View style={{ alignItems: "flex-end" }}><Button label={UI.send[lang]} onPress={sendTeach} disabled={!teach.trim()} /></View>
        </Card>
      ))}
    </>
  );
}

function AnswerChips({card,reply,lang,refresh}: {card:CallerCard; reply:Reply; lang:Lang; refresh:()=>Promise<void>}) {
  const [ready,setReady] = useState(false);
  const [note,setNote] = useState("");
  const rev = card.confirmed_rev;
  const eligible = card.handler === "ai" && reply.author === "ai" && rev !== null && !!sentText(reply,lang);
  const delivery = useCallback(async () => {
    try { const r = await cmd<{ready:boolean}>("info_delivery",{reply:reply.id,rev,lang}); setReady(r.ready); }
    catch (e) { setReady(false); setNote(errorText((e as Error).message,lang)); }
  },[reply.id,rev,lang]);
  useLive(["caller_card"],delivery,eligible,{incident:card.id});
  async function answer(resolved:boolean) {
    setReady(false);
    try {
      if (resolved) await cmd("resolve_info",{reply:reply.id,rev,lang,ack:true});
      else await cmd("human");
      setNote(""); await refresh();
    } catch (e) { setNote(errorText((e as Error).message,lang)); }
  }
  return <>{eligible && ready && <><Button label={FRONTLINE.answered[lang]} onPress={()=>answer(true)} style={{borderRadius:24}}/>
    <Button kind="secondary" label={FRONTLINE.stillHelp[lang]} onPress={()=>answer(false)} style={{borderRadius:24}}/></>}{!!note && <LiveText>{note}</LiveText>}</>;
}

// Fraud-in-progress mode (the operator's decision; web/app/caller/ops.tsx): the approved warning, full screen.
function FraudScreen({ lang }: { lang: Lang }) {
  return (
    <SafeAreaView accessibilityRole="alert" style={{ flex: 1, justifyContent: "center", gap: space.xl, padding: space.xxl, backgroundColor: color.alert }}>
      <OctagonAlert size={56} strokeWidth={1.5} color={color.onPrimary} />
      <T v="h1" tone="onPrimary" weight={500} style={{ fontSize: 44, lineHeight: 48 }}>{OPS_CALLER.fraud.title[lang]}</T>
      <T v="h1" tone="onPrimary">{OPS_CALLER.fraud.body[lang]}</T>
    </SafeAreaView>
  );
}

// No case yet: one message in one language, with the picker to change it.
function NotConnected({ view, sync }: { view: CallerView; sync:Sync }) {
  const [lang, setLang] = useState<Lang>(view.lang ?? "bn");
  return (
    <Screen back eyebrow={<Brand />} pinned={<Human lang={lang} connected={false} />}>
      <SyncStatus sync={sync} lang={lang} />
      <LangPicker lang={lang} onChange={setLang} />
      <T v="h1">{(view.staff ? STATION.staffSession : view.reason ? JOURNEY[view.reason] : UI.notConnected)[lang]}</T>
      <Button kind="secondary" label={MOBILE.back[lang]} onPress={() => router.replace("/")} />
    </Screen>
  );
}
