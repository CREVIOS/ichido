import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { callerAuth, cmd, signOut } from "@/lib/supabase";
import { textScale, usePrefs } from "@/components/CallerFaults";
import { Human } from "@/components/Human";
import { Brand, Button, Card, Input, LangPicker, LiveText, Notice, Screen, T, Tag, Toggle, TextScale } from "@/components/ui";
import { ACCESS, JOURNEY, FAULT_UI, FRONTLINE, UI, LANGS, MOBILE, STATION, errorText, type Lang } from "@content/catalogue";

const CODE_LENGTH = 6;

// Neutral landing behind the Help Point sticker (ichido://s/TABLE-A or https://<web>/s/TABLE-A): scanning alone reveals nothing.
export default function StationScreen() {
  const params = useLocalSearchParams<{ station: string; lang?: string }>();
  const station = params.station;
  const [lang, setLang] = useState<Lang>((LANGS as readonly string[]).includes(params.lang ?? "") ? (params.lang as Lang) : "bn");
  const [resume,setResume] = useState("");
  const [prefs,setPrefs] = usePrefs();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [staffSession, setStaffSession] = useState(false);

  // Let the caller check the station before opening an existing case.
  useEffect(() => {
    let active = true;
    cmd<{ incident: string | null; station?: string; finished?: boolean; staff: boolean }>("mine").then((m) => {
      if (!active) return;
      setResume(m.incident && m.station ? m.station : "");
      setStaffSession(m.staff);
    }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [station]);

  const [alerted, setAlerted] = useState(false);
  async function connect(human = false) {
    setBusy(true); setError("");
    try {
      const { data } = await callerAuth().getSession();
      if (!data.session) {
        const { error } = await callerAuth().signInAnonymously();
        if (error) throw new Error("server");
      }
      if (human) { await cmd("silent_alert", { station }); setAlerted(true); return; }
      await cmd("pair", { station, code, lang, frontline:true });
      router.replace("/caller");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <TextScale.Provider value={textScale(prefs)}><Screen back backLabel={MOBILE.back[lang]} eyebrow={<Brand />} title={STATION.title[lang]}
      pinned={staffSession ? <Human lang={lang} connected={false} /> : <Button kind="secondary" disabled={alerted} label={(alerted ? FRONTLINE.requested : UI.human)[lang]} onPress={() => connect(true)} busy={busy} />}>
      <Toggle label={FAULT_UI.largeText[lang]} on={prefs.large} onPress={() => setPrefs({...prefs,large:!prefs.large})} />
      {resume && <Button kind="secondary" label={`${JOURNEY.resume[lang]} · ${resume}`} onPress={() => router.replace("/caller")} />}
      <Tag label="Help Point" value={station} />
      <LangPicker lang={lang} onChange={setLang} />
      {staffSession ? (
        <Card>
          <T v="body" tone="ink">{STATION.staffSession[lang]}</T>
          <Button label={STATION.signOutStaff[lang]} onPress={async () => { await signOut(); setStaffSession(false); }} block />
        </Card>
      ) : (
        <Card>
          <Input label={STATION.code[lang]} value={code} onChangeText={(t) => setCode(t.toUpperCase())} mono maxLength={CODE_LENGTH}
            autoCapitalize="characters" autoCorrect={false} autoComplete="off" textContentType="oneTimeCode"
            style={{ fontSize: 30, lineHeight: 38, letterSpacing: 6, textAlign: "center", minHeight: 64 }}
            onSubmitEditing={() => code.length === CODE_LENGTH && connect()} />
          {alerted && <Notice>{ACCESS.alertSent[lang]}</Notice>}
          {error ? <LiveText>{errorText(error,lang)}</LiveText> : null}
          <Button label={STATION.go[lang]} onPress={() => connect()} busy={busy} disabled={code.length < CODE_LENGTH} block />
        </Card>
      )}
      <T v="label">{STATION.why[lang]}</T>
    </Screen></TextScale.Provider>
  );
}
