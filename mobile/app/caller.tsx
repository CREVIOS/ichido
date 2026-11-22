import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Speech from "expo-speech";
import { Check, CircleCheck, Frown, Meh, OctagonAlert, Smile, Volume2 } from "lucide-react-native";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { VoiceIntake, type SignedSpeech } from "@/components/VoiceIntake";
import { hasVoice } from "@/lib/voice";
import { Brand, Button, Card, Icon, Input, LangPicker, Notice, Pill, Screen, T, Tag, TextScale, Toggle } from "@/components/ui";
import { BankStatus, CallerFlags, FollowUp, PrefsBar, speechRate, textScale, usePrefs, type FollowUpCase } from "@/components/CallerFaults";
import { color, radius, shadow, space, tint } from "@/theme";
import {
  FACTS, FACT_KEYS, ANSWER, RATING, RATINGS, STATUS, UI, STATION, FIELD_STATE, LANGS, LANG_NAME, LANG_LOCALE, FAULTS, MOBILE, OPS_CALLER, VOICE, VOICE_LANGS, etaText, pick, replyOf, errorText,
  type Lang, type Fact, type Status, type FieldState, type L10n,
} from "@content/catalogue";

type CallerCard = {
  id: string; station: string; fault: string; lang: Lang | null; confirmed_rev: number | null; status: Status;
  field_state: FieldState; eta: string | null; choice: string | null; teachback: string | null; teachback_result: string | null; needs_human: boolean; rating: number | null;
  reply_id: string | null; flags: string[]; bank_status: string | null; bank_due: string | null;
  fraud?: boolean; notice?: string | null;
};
type Draft = { rev: number; card_back: Fact; cash_received: Fact; words: string | null; needs_clarification: boolean };
type Reply = { id: string; intent: string; slots: { branch?: L10n; hours?: L10n }; sent_at: string };
type Station = { label: L10n };
const MAX_TEXT = 500;

export default function CallerScreen() {
  const [card, setCard] = useState<CallerCard | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [station, setStation] = useState<Station | null>(null);
  const [staffSession, setStaffSession] = useState(false);
  const [follow, setFollow] = useState<FollowUpCase | null>(null);
  const [prefs, setPrefs] = usePrefs();

  // Only the case this phone is bound to; never "the first card visible" (staff can see many).
  // Once the pairing has expired, a phone whose case closed with guidance can still follow it.
  const load = useCallback(async () => {
    const db = sb();
    const mine = await cmd<{ incident: string | null; staff: boolean }>("mine").catch(() => ({ incident: null, staff: false }));
    setStaffSession(mine.staff);
    if (!mine.incident) {
      const f = mine.staff ? null : await cmd<{ case: FollowUpCase | null }>("followup").catch(() => null);
      setFollow(f?.case ?? null);
      return setCard(null);
    }
    const { data: c } = await db.from("caller_card").select("*").eq("id", mine.incident).maybeSingle();
    setCard((c as CallerCard) ?? null);
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
  if (card === null) return follow ? <FollowUp f={follow} prefs={prefs} onPrefs={setPrefs} onRefresh={load} /> : <NotConnected staff={staffSession} />;

  const lang: Lang = card.lang ?? "bn";
  if (card.fraud) return <FraudScreen lang={lang} />;
  // The current guidance only: a reply withdrawn after a fault-type change no longer shows.
  const latest = replies.find((r) => r.id === card.reply_id);
  const confirmed = card.confirmed_rev != null || replies.length > 0;
  const open = card.status !== "guided";

  return (
    <TextScale.Provider value={textScale(prefs)}>
      <Screen eyebrow={<Brand />} onRefresh={load}>
        <LangPicker lang={lang} onChange={(l) => { cmd("set_lang", { lang: l }).then(load).catch(() => undefined); }} />
        <PrefsBar prefs={prefs} onChange={setPrefs} lang={lang} />
        <View style={{ gap: 6 }}>
          <T v="label" tone="muted">{pick(station?.label, lang)} · {pick(FAULTS[card.fault], lang)}</T>
          <Pill tone={card.status}>{STATUS[card.status][lang]}</Pill>
        </View>
        {card.notice && OPS_CALLER.notice[card.notice] && (
          <Card title={OPS_CALLER.noticeLabel[lang]}><T v="h2">{OPS_CALLER.notice[card.notice][lang]}</T></Card>
        )}
        {!confirmed && draft && <Intake lang={lang} draft={draft} needsHuman={card.needs_human} />}
        {confirmed && !latest && <Waiting lang={lang} />}
        {latest && <Guidance lang={lang} card={card} reply={latest} rate={speechRate(prefs)} />}
        {open && <CallerFlags fault={card.fault} flags={card.flags} lang={lang} />}
        {(card.bank_status || !open) && <BankStatus status={card.bank_status} due={card.bank_due} lang={lang} />}
        <View style={{ backgroundColor: color.primary, borderRadius: radius.card, padding: space.lg, gap: 6 }}>
          <T v="small" tone="onPrimary" style={{ opacity: 0.6 }}>{UI.showStaff[lang]}</T>
          <T v="h2" tone="onPrimary" weight={500}>{FAULTS[card.fault]?.ja}。</T>
          <T v="label" tone="onPrimary">{UI.caseNo.ja}：<T v="label" mono tone="onPrimary">{card.id.slice(0, 8)}</T></T>
        </View>
        <T v="small">{UI.helpDesk[lang]}</T>
      </Screen>
    </TextScale.Provider>
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
  const fail = (e: Error) => setNote(errorText(e.message, lang));
  const known = FACT_KEYS.filter((k) => draft[k] !== "unknown");

  return (
    <>
      <T v="h1">{UI.aiNotice[lang]}</T>
      <Notice>{UI.neverAsk[lang]}</Notice>
      {hasVoice && VOICE_LANGS.includes(lang) ? <VoiceIntake lang={lang} onFinal={(t) => send({ text: t })} say={say} /> : <T v="small">{VOICE.unavailable[lang]}</T>}
      <Card>
        <Input label={UI.whatHappened[lang]} value={text} onChangeText={setText} multiline maxLength={MAX_TEXT} />
        <View style={{ alignItems: "flex-end" }}>
          <Button label={UI.send[lang]} onPress={() => send({ text })} busy={busy} disabled={!text.trim()} />
        </View>
      </Card>
      {note ? <Notice tone="alert">{note}</Notice> : null}
      {draft.needs_clarification && <Notice>{UI.unsure[lang]}</Notice>}

      <Card title={UI.understood[lang]} action={draft.rev > 0 ? <Tag label="v" value={draft.rev} /> : undefined}>
        {draft.words ? <T v="label">“{draft.words}”</T> : null}
        {FACT_KEYS.map((k) => (
          <View key={k} style={{ gap: 8 }}>
            <T v="body" tone="ink">{FACTS[k].question[lang]}</T>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {(["yes", "no", "unknown"] as Fact[]).map((v) => (
                <Toggle key={v} on={draft[k] === v} label={ANSWER[v][lang]} disabled={busy} onPress={() => send({ [k]: v })} style={{ flex: 1 }} />
              ))}
            </View>
            {draft[k] !== "unknown" && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon icon={Check} size={14} /><T v="label" tone="ink">{FACTS[k][draft[k]][lang]}</T>
              </View>
            )}
          </View>
        ))}
      </Card>
      <Button label={UI.confirm[lang]} block disabled={busy || !known.length} onPress={() => cmd("confirm", { rev: draft.rev }).catch(fail)} />
      {needsHuman ? <Notice>{UI.humanAsked[lang]}</Notice>
        : <Button kind="ghost" label={UI.human[lang]} onPress={() => cmd("human").catch(fail)} />}
    </>
  );
}

// No timers in the caller flow: the handset hint is there from the start.
function Waiting({ lang }: { lang: Lang }) {
  return <Card><T v="h2">{STATUS.review[lang]}…</T><T v="label">{UI.waiting[lang]}</T></Card>;
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
  const text = r ? r.text(reply.slots)[lang] : errorText("server", lang);
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
      {hasVoice && <Button kind="secondary" icon={Volume2} label={UI.listen[lang]} onPress={() => Speech.speak(text, { language: LANG_LOCALE[lang], rate })} style={{ alignSelf: "flex-start" }} />}
      {note ? <Notice tone="alert">{note}</Notice> : null}

      {card.field_state !== "none" && (
        <Card style={{ gap: 6 }}>
          <T v="h2">{FIELD_STATE[card.field_state][lang]}</T>
          {card.field_state === "on_way" && <T v="label">{etaText(card.eta, lang)}</T>}
        </Card>
      )}

      {r?.offersChoice && (
        <View style={{ gap: 8 }}>
          <T v="label">{UI.waitOrLeave[lang]}</T>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Toggle on={card.choice === "wait"} disabled={done} label={UI.wait[lang]} onPress={() => act("choose", { choice: "wait" })} style={{ flex: 1 }} />
            <Toggle on={card.choice === "leave"} disabled={done} label={UI.leave[lang]} onPress={() => act("choose", { choice: "leave" })} style={{ flex: 1 }} />
          </View>
        </View>
      )}

      {done ? (
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
          <Input label={UI.teachBack[lang]} value={teach} onChangeText={setTeach} multiline maxLength={MAX_TEXT} />
          {card.teachback_result === "clarify" && <T v="label">{UI.clarify[lang]}</T>}
          <View style={{ alignItems: "flex-end" }}><Button label={UI.send[lang]} onPress={sendTeach} disabled={!teach.trim()} /></View>
        </Card>
      )}
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
function NotConnected({ staff }: { staff: boolean }) {
  const [lang, setLang] = useState<Lang>("bn");
  return (
    <Screen back eyebrow={<Brand />}>
      <LangPicker lang={lang} onChange={setLang} />
      <T v="h1">{(staff ? STATION.staffSession : UI.notConnected)[lang]}</T>
      <Button kind="secondary" label={MOBILE.back[lang]} onPress={() => router.replace("/")} />
    </Screen>
  );
}
