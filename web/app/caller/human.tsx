"use client";
import { useState } from "react";
import { Headphones } from "lucide-react";
import { CHAT } from "@/content/chat";
import { Button } from "@/components/ui/button";
import { cmd } from "@/lib/supabase";
import { FRONTLINE, UI, errorText, type Lang } from "@/content/catalogue";

export function Human({ lang, open = true, state, requested, receipt, refresh }: { lang: Lang; open?: boolean; state?: string; requested?: boolean; receipt?:string; refresh?:()=>void }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  async function request() {
    if (!open) return setNote(FRONTLINE.inPerson[lang]);
    setBusy(true);
    try { await (receipt ? cmd("recontact",{receipt}) : cmd("human")); refresh?.(); setSent(true); setNote(""); }
    catch (error) { setNote(`${errorText((error as Error).message, lang)} ${FRONTLINE.inPerson[lang]}`); }
    finally { setBusy(false); }
  }
  const pending = requested || sent || state === "queued";
  const joined = state === "human";
  return <div className="min-w-0">
    <Button className="min-h-11 max-w-full rounded-full px-3.5 whitespace-normal text-left" variant="secondary" onClick={request} disabled={busy || joined || pending}>
      <Headphones aria-hidden />{(joined ? CHAT.joined : pending ? CHAT.asked : UI.human)[lang]}
    </Button>
    {note && <p role="status" className="text-sm">{note}</p>}
  </div>;
}
