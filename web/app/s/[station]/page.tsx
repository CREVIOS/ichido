"use client";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { sb, cmd } from "@/lib/supabase";
import { Phone } from "@/components/phone";
import { Chip, Notice } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LANGS, LANG_NAME, STATION, errorText, type Lang } from "@/content/catalogue";

const CODE_LENGTH = 6;

// Neutral landing behind the Help Point sticker: scanning alone reveals nothing.
export default function StationPage() {
  return <Suspense fallback={null}><StationForm /></Suspense>;
}

function StationForm() {
  const { station } = useParams<{ station: string }>();
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("bn");
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
  }, [router]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const { data } = await sb().auth.getSession();
      if (!data.session) {
        const { error } = await sb().auth.signInAnonymously();
        if (error) throw new Error("server");
      }
      await cmd("pair", { station, code, lang });
      router.push("/caller");
    } catch (err) {
      setError(errorText((err as Error).message, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Phone lang={lang} center right={<Chip>Help Point · <span className="mono">{station}</span></Chip>}>
      <ToggleGroup value={[lang]} onValueChange={(v: string[]) => v[0] && setLang(v[0] as Lang)} className="w-full rounded-lg bg-secondary p-0.5">
        {LANGS.map((l) => <ToggleGroupItem key={l} value={l} lang={l} className="h-9 flex-1 rounded-md text-[14px] data-[pressed]:bg-card data-[pressed]:text-foreground data-[pressed]:shadow-xs">{LANG_NAME[l]}</ToggleGroupItem>)}
      </ToggleGroup>
      <h1 className="text-[28px] leading-tight">{STATION.title[lang]}</h1>
      {staffSession ? (
        <div className="flex flex-col gap-3">
          <Notice tone="warn">{STATION.staffSession[lang]}</Notice>
          <Button size="lg" onClick={async () => { await sb().auth.signOut(); setStaffSession(false); }}>{STATION.signOutStaff[lang]}</Button>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={connect}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">{STATION.code[lang]}</Label>
            <input id="code" type="text" inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={CODE_LENGTH} required
              className="h-16 w-full rounded-xl border bg-card text-center font-mono text-[32px] tracking-[0.3em] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/40" />
          </div>
          {error && <Notice tone="warn">{error}</Notice>}
          <Button type="submit" size="lg" className="h-11" disabled={busy || code.length < CODE_LENGTH}>{STATION.go[lang]}</Button>
        </form>
      )}
      <p className="flex gap-2 text-[13px] leading-5"><ShieldCheck className="mt-0.5 size-4 shrink-0 stroke-[1.5]" />{STATION.why[lang]}</p>
    </Phone>
  );
}
