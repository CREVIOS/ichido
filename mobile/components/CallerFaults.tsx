import { useEffect, useState } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cmd } from "@/lib/supabase";
import { Brand, Card, LangPicker, Notice, Screen, T, TextScale, Toggle } from "@/components/ui";
import { color, radius, space } from "@/theme";
import { CALLER_FLAGS, FAULTS, FAULT_UI, UI, bankStatusText, errorText, flagsFor, pick, replyOf, type L10n, type Lang } from "@content/catalogue";

// Caller additions for the real-world fault paths (web/app/caller/faults.tsx and prefs.tsx on the web).

// Elderly-friendly settings, kept on this phone. If storage fails, the toggles still work for this session.
export type Prefs = { large: boolean; slow: boolean };
const KEY = "ichido.caller.prefs";

export function usePrefs(): [Prefs, (p: Prefs) => void] {
  const [prefs, setPrefs] = useState<Prefs>({ large: false, slow: false });
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => { const p = JSON.parse(v ?? "null") as Partial<Prefs> | null; if (p) setPrefs({ large: p.large === true, slow: p.slow === true }); })
      .catch((e: unknown) => console.warn("caller prefs unavailable", e));
  }, []);
  const set = (p: Prefs) => {
    setPrefs(p);
    AsyncStorage.setItem(KEY, JSON.stringify(p)).catch((e: unknown) => console.warn("caller prefs not saved", e));
  };
  return [prefs, set];
}
export const speechRate = (p: Prefs) => (p.slow ? 0.7 : 1);
export const textScale = (p: Prefs) => (p.large ? 1.3 : 1);

export function PrefsBar({ prefs, onChange, lang }: { prefs: Prefs; onChange: (p: Prefs) => void; lang: Lang }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Toggle on={prefs.large} label={FAULT_UI.largeText[lang]} onPress={() => onChange({ ...prefs, large: !prefs.large })} style={{ flex: 1 }} />
      <Toggle on={prefs.slow} label={FAULT_UI.slowVoice[lang]} onPress={() => onChange({ ...prefs, slow: !prefs.slow })} style={{ flex: 1 }} />
    </View>
  );
}

// The caller's own taps about what happened and who is with them.
export function CallerFlags({ fault, flags, lang }: { fault: string; flags: string[]; lang: Lang }) {
  const [note, setNote] = useState("");
  return (
    <View style={{ gap: 8 }}>
      <T v="label" tone="muted">{FAULT_UI.flagsTitle[lang]}</T>
      {flagsFor(fault).map((f) => {
        const on = flags.includes(f);
        return <Toggle key={f} on={on} label={CALLER_FLAGS[f].label[lang]} block
          onPress={() => { cmd("flag", { flag: f, on: !on }).then(() => setNote("")).catch((e: Error) => setNote(errorText(e.message, lang))); }} />;
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

export type FollowUpCase = {
  id: string; fault: string; lang: Lang | null; bank_status: string | null; bank_due: string | null;
  reply: { intent: string; slots: { branch?: L10n; hours?: L10n } } | null; station: { label: L10n } | null;
};

// After the two-hour pairing has expired: the closed case, what the caller was told, and the bank's status.
export function FollowUp({ f, prefs, onPrefs, onRefresh }: { f: FollowUpCase; prefs: Prefs; onPrefs: (p: Prefs) => void; onRefresh: () => void }) {
  const [chosen, setLang] = useState<Lang | null>(null);
  const lang = chosen ?? f.lang ?? "bn";
  const told = f.reply && replyOf(f.reply.intent)?.text(f.reply.slots)[lang];
  return (
    <TextScale.Provider value={textScale(prefs)}>
      <Screen eyebrow={<Brand />} onRefresh={onRefresh}>
        <LangPicker lang={lang} onChange={setLang} />
        <PrefsBar prefs={prefs} onChange={onPrefs} lang={lang} />
        <T v="label" tone="muted">{pick(f.station?.label, lang)} · {pick(FAULTS[f.fault], lang)}</T>
        <T v="h1">{FAULT_UI.followTitle[lang]}</T>
        <T v="body">{FAULT_UI.followLead[lang]}</T>
        <BankStatus status={f.bank_status} due={f.bank_due} lang={lang} />
        {told ? <View style={{ gap: 6 }}><T v="label" tone="muted">{FAULT_UI.lastReply[lang]}</T><T v="body" tone="ink">{told}</T></View> : null}
        <View style={{ backgroundColor: color.primary, borderRadius: radius.card, padding: space.lg, gap: 6 }}>
          <T v="small" tone="onPrimary" style={{ opacity: 0.6 }}>{UI.caseNo[lang]}</T>
          <T v="h2" mono tone="onPrimary">{f.id.slice(0, 8)}</T>
        </View>
        <T v="small">{UI.helpDesk[lang]}</T>
      </Screen>
    </TextScale.Provider>
  );
}
