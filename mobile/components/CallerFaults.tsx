import type { FollowUpCase } from "@content/caller-session";
import { Settings2, Frown, Meh, Smile } from "lucide-react-native";
import { color, radius, shadow } from "@/theme";
import { Human } from "./Human";
import { useEffect, useState } from "react";
import { Pressable, Share, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cmd } from "@/lib/supabase";
import { CHAT } from "@content/chat";
import { Menu, Mark, Button, Card, LangPicker, LiveText, Notice, Screen, T, TextScale, Toggle } from "@/components/ui";
import { MOBILE, FRONTLINE, RATING, RATINGS, CALLER_FLAGS, FAULTS, FAULT_UI, GROUP_TITLE, JOURNEY, CONSULTATION, receipt, UI, bankStatusText, errorText, exclusiveOff, flagsFor, packOfFault, pick, sentText, urgentText, type Lang } from "@content/catalogue";

// Caller additions for the real-world fault paths (web/app/caller/faults.tsx and prefs.tsx on the web).

// Elderly-friendly settings, kept on this phone. If storage fails, the toggles still work for this session.
export type Prefs = { large: boolean; slow: boolean };
const KEY = "ichido.caller.prefs";

export function usePrefs(): [Prefs, (p: Prefs) => void] {
  const [prefs, setPrefs] = useState<Prefs>({ large: false, slow: false });
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => { const p = JSON.parse(v ?? "null") as Partial<Prefs> | null; if (p) setPrefs({ large: p.large === true, slow: p.slow === true }); })
      .catch((error: unknown) => console.warn(error instanceof SyntaxError ? "caller_prefs_invalid" : "caller_prefs_read_failed"));
  }, []);
  const set = (p: Prefs) => {
    setPrefs(p);
    AsyncStorage.setItem(KEY, JSON.stringify(p)).catch((error: unknown) =>
      console.warn("caller_prefs_write_failed", error instanceof TypeError ? "type" : "storage"));
  };
  return [prefs, set];
}
export const speechRate = (p: Prefs) => (p.slow ? 0.7 : 1);
export const textScale = (p: Prefs) => (p.large ? 1.3 : 1);

export function PrefsBar({ prefs, onChange, lang }: { prefs: Prefs; onChange: (p: Prefs) => void; lang: Lang }) {
  return <Menu icon={Settings2} label={CHAT.settings[lang]} closeLabel={MOBILE.back[lang]} items={[
    {label:FAULT_UI.largeText[lang],selected:prefs.large,onPress:() => onChange({...prefs,large:!prefs.large})},
    {label:FAULT_UI.slowVoice[lang],selected:prefs.slow,onPress:() => onChange({...prefs,slow:!prefs.slow})},
  ]}/>;
}

// The caller's own taps about what happened and who is with them. A scenario pack groups them under headings, a
// one-answer group turns the others off, and a red-flag tap shows the pack's urgent approved text at once.
export function CallerFlags({ fault, flags, lang, submit }: { fault: string; flags: string[]; lang: Lang; submit?: (flag: string,on: boolean) => Promise<void> }) {
  const [note, setNote] = useState("");
  const tap = async (flag: string, on: boolean) => {
    try {
      if (submit) return await submit(flag,on);
      for (const f of on ? exclusiveOff(flag, flags) : []) await cmd("flag", { flag: f, on: false });
      await cmd("flag", { flag, on });
      setNote("");
    } catch (e) { setNote(errorText((e as Error).message, lang)); }
  };
  const taps = flagsFor(fault, flags);
  const urgent = urgentText(fault, flags, lang);
  return (
    <View style={{ gap: 8 }}>
      {urgent ? <Notice tone="alert">{urgent}</Notice> : null}
      {taps.map((f, i) => {
        const on = flags.includes(f);
        const g = CALLER_FLAGS[f].group;
        const heading = i === 0 || g !== CALLER_FLAGS[taps[i - 1]].group ? (g && GROUP_TITLE[g]) ?? FAULT_UI.flagsTitle : null;
        return (
          <View key={f} style={{ gap: 8 }}>
            {heading ? <T v="label" tone="muted">{heading[lang]}</T> : null}
            <Toggle on={on} accessibilityLabel={`${((g && GROUP_TITLE[g]) || FAULT_UI.flagsTitle)[lang]} — ${CALLER_FLAGS[f].label[lang]}`} label={CALLER_FLAGS[f].label[lang]} block onPress={() => { void tap(f, !on); }} />
          </View>
        );
      })}
      {note ? <Notice tone="alert">{note}</Notice> : null}
    </View>
  );
}

export function BankStatus({ status, due, lang }: { status: string | null; due: string | null; lang: Lang }) {
  return (
    <Card title={FAULT_UI.bankTitle[lang]}>
      <T v="h2">{status ? bankStatusText(status, due, lang) : FAULT_UI.bankNone[lang]}</T>
    </Card>
  );
}

// After the two-hour pairing has expired: the closed case, what the caller was told, and the bank's status.
export function Receipt({station,id,lang}: {station:string;id:string;lang:Lang}) {
  const [show,setShow] = useState(false);
  const [error,setError] = useState(false);
  const text = receipt(station,id);
  return <><Button label={JOURNEY.receipt[lang]} onPress={() => setShow(!show)} />
    {show && <><T selectable>{text}</T><Button kind="secondary" label={JOURNEY.saveReceipt[lang]} onPress={async () => {
      setError(false);
      try { await Share.share({message:text}); } catch { setError(true); }
    }} /></>}
    {error && <LiveText>{errorText("server",lang)}</LiveText>}</>;
}

export type Sync = { offline:boolean; updated?:Date; retry:() => void };
export function SyncStatus({sync,lang}: {sync:Sync;lang:Lang}) {
  return <>{sync.offline && <><LiveText>{JOURNEY.offline[lang]}</LiveText><Button label={JOURNEY.retry[lang]} onPress={sync.retry} /></>}
    {sync.updated && <T v="small">{JOURNEY.updated[lang]} · {sync.updated.toLocaleTimeString(lang)}</T>}</>;
}
export function FollowUp({ f, prefs, onPrefs, sync }: { sync:Sync; f: FollowUpCase; prefs: Prefs; onPrefs: (p: Prefs) => void; }) {
  const [chosen, setLang] = useState<Lang | null>(null);
  const lang = chosen ?? f.lang ?? "bn";
  const [note,setNote] = useState("");
  const resolved = f.resolved_by === "ai";
  const told = f.reply && (sentText(f.reply, lang) ?? errorText("server",lang));
  return (
    <TextScale.Provider value={textScale(prefs)}>
      <Screen eyebrow={<><Mark/><T numberOfLines={1} style={{flex:1}}>{pick(f.station?.label,lang) || f.station_id}</T></>} right={<View style={{flexDirection:"row"}}><LangPicker compact lang={lang} onChange={setLang}/><PrefsBar lang={lang} prefs={prefs} onChange={onPrefs}/></View>} pinned={<Human lang={lang} requested={f.recontacted} receipt={resolved ? f.id : undefined} refresh={sync.retry} />} onRefresh={sync.retry}>
        <SyncStatus sync={sync} lang={lang} />
        <T v="label" tone="muted">{pick(f.station?.label, lang)} · {pick(FAULTS[f.fault], lang)}</T>
        <T v="h1">{FAULT_UI.followTitle[lang]}</T>
        <T v="body">{FAULT_UI.followLead[lang]}</T>
        {packOfFault(f.fault) === "atm" ? <BankStatus status={(f.bank_status === "contact_by" || f.bank_status === "contacted") && !f.callback_channel ? null : f.bank_status} due={f.bank_due} lang={lang} /> : null}
        {told ? <View style={{ gap: 6 }}><T v="label" tone="muted">{FAULT_UI.lastReply[lang]}</T><T v="body" tone="ink">{told}</T></View> : null}
        {f.station?.contact && <T selectable>{f.station.contact}</T>}
        {resolved && <>
          <Rate lang={lang} rating={f.rating ?? null} receipt={f.id} refresh={sync.retry} onNote={setNote} />
          <Button style={{borderRadius:24,alignSelf:"flex-start"}} kind="secondary" label={FRONTLINE.stillHelp[lang]} disabled={f.recontacted} onPress={() => cmd("recontact",{receipt:f.id}).then(sync.retry).catch((e:Error) => setNote(errorText(e.message,lang)))} />
          <LiveText>{note}</LiveText></>}
        <Receipt station={f.station_id} id={f.id} lang={lang} />
        <T>{pick(f.station?.branch,lang)} · {pick(f.station?.hours,lang)}</T>
        <T selectable v="small">{UI.helpDesk[lang]} {CONSULTATION.phone} · {CONSULTATION.email}</T>
      </Screen>
    </TextScale.Provider>
  );
}

const FACE = { 3: Smile, 2: Meh, 1: Frown } as const;

// Three faces after a guided close (web/app/caller/guidance.tsx): one tap, no text, counted in insights.
export function Rate({ lang, rating, onNote, receipt, refresh }: { receipt?:string; refresh?:()=>void; lang: Lang; rating: number | null; onNote: (n: string) => void }) {
  if (rating) return <T v="row">{UI.rateThanks[lang]}</T>;
  return (
    <View style={{ gap: 10 }}>
      <T v="label" tone="muted">{UI.rateTitle[lang]}</T>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {RATINGS.map((r) => {
          const Face = FACE[r];
          return (
            <Pressable key={r} accessibilityRole="button" accessibilityLabel={RATING[r][lang]}
              onPress={() => cmd("rate", { rating: r, receipt }).then(refresh).catch((e: Error) => onNote(errorText(e.message, lang)))}
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
