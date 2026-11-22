import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { callerAuth, cmd, signOut } from "@/lib/supabase";
import { Brand, Button, Card, Input, LangPicker, Notice, Screen, T, Tag } from "@/components/ui";
import { LANGS, MOBILE, STATION, errorText, type Lang } from "@content/catalogue";

const CODE_LENGTH = 6;

// Neutral landing behind the Help Point sticker (ichido://s/TABLE-A or https://<web>/s/TABLE-A): scanning alone reveals nothing.
export default function StationScreen() {
  const params = useLocalSearchParams<{ station: string; lang?: string }>();
  const station = params.station;
  const [lang, setLang] = useState<Lang>((LANGS as readonly string[]).includes(params.lang ?? "") ? (params.lang as Lang) : "bn");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [staffSession, setStaffSession] = useState(false);

  // A phone already paired goes straight to its case; a staff session must not be reused for a caller.
  useEffect(() => {
    cmd<{ incident: string | null; staff: boolean }>("mine").then((m) => {
      if (m.incident) router.replace("/caller");
      setStaffSession(m.staff);
    }).catch(() => setStaffSession(false));
  }, []);

  async function connect() {
    setBusy(true); setError("");
    try {
      const { data } = await callerAuth().getSession();
      if (!data.session) {
        const { error } = await callerAuth().signInAnonymously();
        if (error) throw new Error("server");
      }
      await cmd("pair", { station, code, lang });
      router.replace("/caller");
    } catch (err) {
      setError(errorText((err as Error).message, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen back backLabel={MOBILE.back[lang]} eyebrow={<Brand />} title={STATION.title[lang]}>
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
          {error ? <Notice tone="alert">{error}</Notice> : null}
          <Button label={STATION.go[lang]} onPress={connect} busy={busy} disabled={code.length < CODE_LENGTH} block />
        </Card>
      )}
      <T v="label">{STATION.why[lang]}</T>
    </Screen>
  );
}
