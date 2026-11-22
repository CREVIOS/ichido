"use client";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { sb, cmd } from "@/lib/supabase";
import { LANG_NAME, type Lang } from "@/content/catalogue";

const COPY = {
  title: { bn: "সহায়তা কেন্দ্রের সাথে যুক্ত হন", en: "Connect to the help desk", ja: "まどぐちに つなぐ" },
  code: { bn: "অপারেটর যে কোডটি বলেছেন", en: "The code the operator gave you", ja: "係の 人が いった コード" },
  go: { bn: "যুক্ত হন", en: "Connect", ja: "つなぐ" },
  bad: { bn: "কোডটি কাজ করছে না। অপারেটরের কাছে নতুন কোড চান।", en: "That code did not work. Ask the operator for a new one.", ja: "コードが つかえません。係の 人に あたらしい コードを きいてください。" },
  why: {
    bn: "এই স্টিকারে কোনো ব্যক্তিগত তথ্য নেই। অপারেটরের দেওয়া কোড ছাড়া কেউ আপনার কেস দেখতে পারবে না।",
    en: "This sticker holds no personal information. Nobody can open your case without the code the operator gives you.",
    ja: "このページには 個人の 情報は ありません。コードが ないと 案件は ひらけません。",
  },
} satisfies Record<string, Record<Lang, string>>;

// Neutral landing behind the Help Point sticker: scanning alone reveals nothing.
export default function StationPage() {
  return <Suspense fallback={null}><StationForm /></Suspense>;
}

function StationForm() {
  const { station } = useParams<{ station: string }>();
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("bn");
  const [code, setCode] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setBad(false);
    try {
      const { data } = await sb().auth.getSession();
      if (!data.session) {
        const { error } = await sb().auth.signInAnonymously();
        if (error) throw error;
      }
      await cmd("pair", { station, code, lang });
      router.push("/caller");
    } catch {
      setBad(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="phone" lang={lang} style={{ justifyContent: "center" }}>
      <div className="row">
        <span className="row" style={{ "--gap": "8px" } as React.CSSProperties}><span className="brand-mark" aria-hidden>一</span><span style={{ fontWeight: 500 }}>ichido</span></span><span className="grow" />
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} style={{ width: "auto" }} aria-label="Language">
          {(Object.keys(LANG_NAME) as Lang[]).map((l) => <option key={l} value={l}>{LANG_NAME[l]}</option>)}
        </select>
      </div>
      <span className="tag">Help Point · <b className="mono">{station}</b></span>
      <h1>{COPY.title[lang]}</h1>
      <form className="card" onSubmit={connect}>
        <label className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>
          <span className="field-label">{COPY.code[lang]}</span>
          <input type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())} className="mono" style={{ fontSize: 30, letterSpacing: "0.2em", textAlign: "center" }} maxLength={6} required />
        </label>
        {bad && <p className="notice">{COPY.bad[lang]}</p>}
        <button className="btn dark block" disabled={busy || code.length < 6}>{COPY.go[lang]}</button>
      </form>
      <p className="small soft">{COPY.why[lang]}</p>
    </main>
  );
}
