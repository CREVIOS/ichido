"use client";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { sb, cmd } from "@/lib/supabase";
import { LANGS, LANG_NAME, STATION, errorText, type Lang } from "@/content/catalogue";

const CODE_LENGTH = 6;
const gap = (g: number) => ({ "--gap": `${g}px` }) as React.CSSProperties;

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
    <main className="phone" lang={lang} style={{ justifyContent: "center" }}>
      <div className="row">
        <span className="row" style={gap(8)}><span className="brand-mark" aria-hidden>一</span><span style={{ fontWeight: 500 }}>ichido</span></span>
        <span className="grow" />
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} style={{ width: "auto" }} aria-label={LANG_NAME[lang]}>
          {LANGS.map((l) => <option key={l} value={l}>{LANG_NAME[l]}</option>)}
        </select>
      </div>
      <span className="tag">Help Point · <b className="mono">{station}</b></span>
      <h1>{STATION.title[lang]}</h1>
      {staffSession ? (
        <section className="card">
          <p>{STATION.staffSession[lang]}</p>
          <button className="btn dark block" onClick={async () => { await sb().auth.signOut(); setStaffSession(false); }}>{STATION.signOutStaff[lang]}</button>
        </section>
      ) : (
        <form className="card" onSubmit={connect}>
          <label className="stack" style={gap(6)}>
            <span className="field-label">{STATION.code[lang]}</span>
            <input type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())} className="mono"
              style={{ fontSize: 30, letterSpacing: "0.2em", textAlign: "center" }} maxLength={CODE_LENGTH} required />
          </label>
          {error && <p className="notice">{error}</p>}
          <button className="btn dark block" disabled={busy || code.length < CODE_LENGTH}>{STATION.go[lang]}</button>
        </form>
      )}
      <p className="small soft">{STATION.why[lang]}</p>
    </main>
  );
}
