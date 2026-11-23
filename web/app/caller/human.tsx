"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cmd } from "@/lib/supabase";
import { FRONTLINE, UI, errorText, type Lang } from "@/content/catalogue";

export function Human({ lang, open = true, state, requested }: { lang: Lang; open?: boolean; state?: string; requested?: boolean }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  async function request() {
    if (!open) return setNote(FRONTLINE.inPerson[lang]);
    setBusy(true);
    try { await cmd("human"); setSent(true); setNote(""); }
    catch (error) { setNote(`${errorText((error as Error).message, lang)} ${FRONTLINE.inPerson[lang]}`); }
    finally { setBusy(false); }
  }
  const pending = requested || sent || state === "queued";
  return <div className="sticky top-1 z-10 grid gap-1 bg-background py-1">
    {state !== "human" && !pending && <Button variant="secondary" size="lg" onClick={request} disabled={busy}>{UI.human[lang]}</Button>}
    <p role="status" className={state === "human" || pending ? "rounded-lg bg-secondary px-3 py-2" : undefined}>
      {state === "human" ? FRONTLINE.connected[lang] : pending ? FRONTLINE.requested[lang] : note}
    </p>
  </div>;
}
