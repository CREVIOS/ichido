import { canConfirm } from "@content/caller-session";
import { useCallback, useRef, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { uuid } from "expo";
import { router } from "expo-router";
import * as Speech from "expo-speech";
import { Check, CircleCheck, Frown, Meh, OctagonAlert, Smile, Volume2 } from "lucide-react-native";
import { cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { VoiceIntake, type SignedSpeech } from "@/components/VoiceIntake";
import { Human } from "@/components/Human";
import { hasVoice } from "@/lib/voice";
import { Brand, Button, Card, Icon, Input, LangPicker, LiveText, Notice, Pill, Screen, T, TextScale, Toggle } from "@/components/ui";
import { BankStatus, CallerFlags, FollowUp, SyncStatus, type Sync, PrefsBar, speechRate, textScale, usePrefs } from "@/components/CallerFaults";
import { color, radius, shadow, space, tint } from "@/theme";
import {
  JOURNEY, CONSULTATION, allergyFacts, receipt, ACCESS, FRONTLINE, CALLER_FLAGS, urgentText, FACTS, FACT_KEYS, ANSWER, RATING, RATINGS, STATUS, UI, STATION, LANG_LOCALE, FAULTS, MOBILE, OPS_CALLER, VOICE, VOICE_LANGS, sentText, callerPack, pick, replyOf, errorText,
  type Lang, type Fact,
} from "@content/catalogue";

import type { CallerCase as CallerCard, CallerView, Reply, Draft, Turn } from "@content/caller-session";
const MAX_TEXT = 500;

export default function CallerScreen() {
  const [receiptOpen,setReceiptOpen] = useState(false);
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
  return (
    <TextScale.Provider value={textScale(prefs)}>
      <Screen eyebrow={<Brand />} pinned={<Human key={generation + String(open)} lang={lang} state={open ? card.handler : undefined} requested={open && card.needs_human} />} onRefresh={load}>
        <SyncStatus sync={sync} lang={lang} />
        {card.field_state !== "none" && <Card><LiveText>{callerPack(card.fault).field(card.field_state,lang)}</LiveText>
          {card.field_state === "on_way" && <T>{callerPack(card.fault).eta(card.eta,lang)} {card.eta_at && new Date(card.eta_at).toLocaleString(lang)}</T>}</Card>}
        {card.fraud ? <FraudScreen lang={lang} /> : <>
        <LangPicker lang={lang} onChange={(l) => { cmd("set_lang", { lang: l }).then(load).catch(() => setOffline(true)); }} />
        <PrefsBar prefs={prefs} onChange={setPrefs} lang={lang} />
        <View style={{ gap: 6 }}>
          <T v="label" tone="muted">{pick(station?.label, lang)}{confirmed && ` · ${pick(FAULTS[card.fault], lang)}`}</T>
          <Pill tone={card.status}>{callerPack(card.fault).status(card.status, lang)}</Pill>
        </View>
        {card.notice && OPS_CALLER.notice[card.notice] && (
          <Card title={OPS_CALLER.noticeLabel[lang]}><T v="h2">{OPS_CALLER.notice[card.notice][lang]}</T></Card>
        )}
        {card.text_only && <Notice>{ACCESS.textOnly[lang]}</Notice>}
        {frontline && <NativeConversation key={generation} card={card} draft={draft} turns={turns} lang={lang} refresh={load} />}
        {!frontline && !confirmed && draft && <Intake key={generation} lang={lang} draft={draft} card={card} />}
        {!frontline && confirmed && !latest && <Waiting lang={lang} fault={card.fault} />}
        {latest && <Guidance key={latest.id} lang={lang} card={card} reply={latest} rate={speechRate(prefs)} />}
        {!frontline && open && (callerPack(card.fault).atm || confirmed) && <CallerFlags fault={card.fault} flags={card.flags} lang={lang} />}
        {callerPack(card.fault).atm && (card.bank_status || !open) && <BankStatus status={(card.bank_status === "contact_by" || card.bank_status === "contacted") && !card.callback_channel ? null : card.bank_status} due={card.bank_due} lang={lang} />}
        {allergyFacts(card.flags).length>0 && <Card><Button kind="secondary" label={JOURNEY.allergyCard[lang]} onPress={() => setAllergyOpen(!allergyOpen)} />
          {allergyOpen && (["bn","ja"] as const).map(l => <T key={l} accessibilityLanguage={l}>{allergyFacts(card.flags).map(f => CALLER_FLAGS[f].label[l]).join(" · ")}</T>)}</Card>}
        {(card.choice === "leave" || !open) && <Card><T>{JOURNEY.checkHere[lang]}</T><T>{pick(station.branch,lang)} · {pick(station.hours,lang)}</T>
          <Button label={JOURNEY.receipt[lang]} onPress={() => setReceiptOpen(!receiptOpen)} />{receiptOpen && <T selectable>{receipt(card.station,card.id)}</T>}</Card>}
        {confirmed && !card.flags.includes("need_other") && <View style={{ backgroundColor: color.primary, borderRadius: radius.card, padding: space.lg, gap: 6 }}>
          <T v="small" tone="onPrimary" style={{ opacity: 0.6 }}>{UI.showStaff[lang]}</T>
          <T v="h2" tone="onPrimary" weight={500}>{FAULTS[card.fault]?.ja}。</T>
          <T v="label" tone="onPrimary">{UI.caseNo.ja}：<T v="label" mono tone="onPrimary">{card.id.slice(0, 8)}</T></T>
        </View>}
        <T selectable v="small">{UI.helpDesk[lang]} {CONSULTATION.phone} · {CONSULTATION.email}</T></>}
      </Screen>
    </TextScale.Provider>
  );
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

function NativeConversation({ card, draft, turns, lang, refresh }: { card: CallerCard; draft: Draft; turns: Turn[]; lang: Lang; refresh: () => Promise<void> }) {
  const [text,setText] = useState("");
  const [note,setNote] = useState("");
  const [busy,setBusy] = useState(false);
  const pending = useRef<{ text:string; id:string } | null>(null);
  const pack = callerPack(card.fault);
  const ready = canConfirm(pack.atm,draft,card.flags);
  const started = turns.some(t => t.wording === "start" && t.speaker === "caller");
  const ai = card.handler === "ai";
  async function submit(act:string,fields:Record<string,unknown> = {}) {
    setBusy(true); setNote("");
    try {
      const id = act === "text" && pending.current?.text === text ? pending.current.id : uuid.v4();
      if (act === "text") pending.current = { text,id };
      const r = await cmd<{withheld?:boolean}>("frontline_turn",{act,request_id:id,base_rev:draft.rev,...fields});
      if (r.withheld) setNote(UI.numbersWithheld[lang]);
      else if (act === "text") { setText(value => value === fields.text ? "" : value); setNote(JOURNEY.sent[lang]); }
      if (pending.current?.id === id) pending.current = null;
      await refresh();
    } catch (error) { setNote(errorText((error as Error).message,lang)); }
    finally { setBusy(false); }
  }
  const warning = urgentText(card.fault,card.flags,lang);
  return <>
    {ai && <T v="h1">{FRONTLINE.greeting[lang]}</T>}
    {card.transfer_reason === "suspected_risk" && <Notice tone="alert">{FRONTLINE.risk[lang]}</Notice>}
    {card.handler === "queued" && <Notice>{FRONTLINE.queued[lang]}</Notice>}
    {card.confirmed_rev !== null && warning && <Notice tone="alert">{warning}</Notice>}
    <T>{FRONTLINE.disclosure[lang]}</T>
    {!started ? <Button busy={busy} label={(ai ? FRONTLINE.start : FRONTLINE.write)[lang]} onPress={() => submit("start")} /> : <>
      <Notice>{pack.neverAsk[lang]}</Notice>
      {pack.scope && <Notice>{pack.scope[lang]}</Notice>}
      {turns.filter(t => t.words).map(t => <T key={t.seq} accessibilityLanguage={t.locale}>{t.words}</T>)}
      <Card><T v="small">{JOURNEY.privacy[lang]}</T><Input label={UI.whatHappened[lang]} value={text} onChangeText={setText} multiline maxLength={MAX_TEXT} />
        <Button busy={busy} label={UI.send[lang]} disabled={!text.trim()} onPress={() => submit("text",{text})} /></Card>
      {card.confirmed_rev === null && <>
        {ai && turns.some(t => t.wording === "readback" && t.rev === draft.rev) && <T>{FRONTLINE.readback[lang]}</T>}
        {draft.triage?.taps.filter(f => CALLER_FLAGS[f] && !card.flags.includes(f)).map(f =>
          <Button key={f} kind="secondary" disabled={busy} label={CALLER_FLAGS[f].label[lang]} onPress={() => submit("tap",{flag:f,on:true})} />)}
        {pack.atm && !card.flags.includes("need_other") && <NativeFacts lang={lang} draft={{...draft,words:null}} busy={busy} onAnswer={(key,value) => submit("facts",{key,value})} />}
        <CallerFlags lang={lang} fault={card.fault} flags={card.flags} submit={(flag,on) => submit("tap",{flag,on})} />
        {!ready && <T>{(draft.needs_clarification ? UI.unsure : JOURNEY.choose)[lang]}</T>}
        <Button label={UI.confirm[lang]} disabled={busy || !ready} onPress={() => submit("confirm")} />
      </>}
      {ai && draft.rev>0 && <><Button kind="secondary" label={FRONTLINE.change[lang]} disabled={busy} onPress={() => submit("change")} />
        <Button kind="ghost" label={ANSWER.unknown[lang]} disabled={busy} onPress={() => submit("unsure")} /></>}
    </>}
    <LiveText>{note}</LiveText>
  </>;
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

function Guidance({ lang, card, reply, rate }: { lang: Lang; card: CallerCard; reply: Reply; rate: number }) {
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
      <T v="small">{UI.approved[lang]}</T>
      <T v="h1">{text}</T>
      {hasVoice && !card.text_only && <Button kind="secondary" icon={Volume2} label={UI.listen[lang]} onPress={() => Speech.speak(text, { language: LANG_LOCALE[lang], rate })} style={{ alignSelf: "flex-start" }} />}
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

const FACE = { 3: Smile, 2: Meh, 1: Frown } as const;

// Three faces after a guided close (web/app/caller/guidance.tsx): one tap, no text, counted in insights.
function Rate({ lang, rating, onNote }: { lang: Lang; rating: number | null; onNote: (n: string) => void }) {
  if (rating) return <T v="row">{UI.rateThanks[lang]}</T>;
  return (
    <View style={{ gap: 10 }}>
      <T v="label" tone="muted">{UI.rateTitle[lang]}</T>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {RATINGS.map((r) => {
          const Face = FACE[r];
          return (
            <Pressable key={r} accessibilityRole="button" accessibilityLabel={RATING[r][lang]}
              onPress={() => cmd("rate", { rating: r }).catch((e: Error) => onNote(errorText(e.message, lang)))}
              style={({ pressed }) => [{ flex: 1, height: 84, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, backgroundColor: pressed ? color.press : color.surface }, shadow]}>
              <Face size={24} strokeWidth={1.5} color={color.ink} />
              <T v="row">{RATING[r][lang]}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
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
