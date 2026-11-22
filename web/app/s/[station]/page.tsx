"use client";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { EarOff, ShieldCheck } from "lucide-react";
import { sb, cmd } from "@/lib/supabase";
import { authClient } from "@/lib/auth-client";
import { Phone } from "@/components/phone";
import { Chip, Notice } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LangSelect, preferredLang } from "@/components/lang-select";
import { ACCESS, STATION, errorText, type Lang } from "@/content/catalogue";

const CODE_LENGTH = 6;
const noop = () => () => {};

// Neutral landing behind the Help Point sticker: scanning alone reveals nothing.
export default function StationPage() {
  return <Suspense fallback={null}><StationForm /></Suspense>;
}

function StationForm() {
  const { station } = useParams<{ station: string }>();
  // The phone's own language when it is one we offer; the caller can change it any time.
  const detected = useSyncExternalStore(noop, preferredLang, () => "bn" as Lang);
  const [chosen, setLang] = useState<Lang | null>(null);
  const lang = chosen ?? detected;
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [staffSession, setStaffSession] = useState(false);
  // Pressed "I can't hear / I can't speak": the code will appear on the Help Point screen, not be spoken.
  const [silent, setSilent] = useState(false);

  // A phone already paired goes straight to its case; a staff session must not be reused for a caller.
  useEffect(() => {
    cmd<{ incident: string | null; staff: boolean }>("mine").then((m) => {
      if (m.incident) location.replace("/caller");
      setStaffSession(m.staff);
    }).catch(() => setStaffSession(false));
  }, []);

  async function withSession(run: () => Promise<void>) {
    setBusy(true); setError("");
    try {
      const { data } = await sb().auth.getSession();
      if (!data.session) {
        const { error } = await sb().auth.signInAnonymously();
        if (error) throw new Error("server");
      }
      await run();
    } catch (err) {
      setError(errorText((err as Error).message, lang));
    } finally {
      setBusy(false);
    }
  }
  const connect = (e: React.FormEvent) => {
    e.preventDefault();
    return withSession(async () => {
      await cmd("pair", { station, code, lang });
      // Load a new document so the caller microphone Permissions-Policy takes effect.
      location.replace("/caller");
    });
  };
  const alertSilently = () => withSession(async () => { await cmd("silent_alert", { station }); setSilent(true); });

  return (
    <Phone lang={lang} center right={<LangSelect value={lang} onChange={setLang} />}>
      <Chip className="self-start">Help Point · <span className="mono">{station}</span></Chip>
      <h1 className="text-[28px] leading-tight">{STATION.title[lang]}</h1>
      {staffSession ? (
        <div className="flex flex-col gap-3">
          <Notice tone="warn">{STATION.staffSession[lang]}</Notice>
          <Button size="lg" onClick={async () => { await authClient.signOut(); setStaffSession(false); }}>{STATION.signOutStaff[lang]}</Button>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={connect}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">{(silent ? ACCESS.screenCode : STATION.code)[lang]}</Label>
            <input id="code" type="text" inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={CODE_LENGTH} required
              className="h-16 w-full rounded-xl border bg-card text-center font-mono text-[32px] tracking-[0.3em] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/40" />
          </div>
          {error && <Notice tone="warn">{error}</Notice>}
          <Button type="submit" size="lg" className="h-11" disabled={busy || code.length < CODE_LENGTH}>{STATION.go[lang]}</Button>
          {silent ? <Notice tone="info">{ACCESS.alertSent[lang]}</Notice> : (
            <div className="flex flex-col gap-2">
              <Button type="button" variant="secondary" size="lg" className="h-11" disabled={busy} onClick={alertSilently}><EarOff className="stroke-[1.5]" />{ACCESS.cantHear[lang]}</Button>
              <p className="text-[13px] leading-5">{ACCESS.cantHearHint[lang]}</p>
            </div>
          )}
        </form>
      )}
      <p className="flex gap-2 text-[13px] leading-5"><ShieldCheck className="mt-0.5 size-4 shrink-0 stroke-[1.5]" />{STATION.why[lang]}</p>
    </Phone>
  );
}
