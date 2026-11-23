import { useState } from "react";
import { Button, LiveText } from "./ui";
import { cmd } from "@/lib/supabase";
import { FRONTLINE, UI, errorText, type Lang } from "@content/catalogue";

export function Human({ lang, connected = true, state, requested, receipt, refresh }: { receipt?:string; refresh?:()=>void; lang: Lang; connected?: boolean; state?: string; requested?: boolean }) {
  const [note,setNote] = useState("");
  const [sent,setSent] = useState(false);
  const [busy,setBusy] = useState(false);
  const request = async () => {
    if (!connected) return setNote(FRONTLINE.inPerson[lang]);
    setBusy(true);
    try { await (receipt ? cmd("recontact",{receipt}) : cmd("human")); refresh?.(); setSent(true); setNote(""); }
    catch (error) { setNote(`${errorText((error as Error).message, lang)} ${FRONTLINE.inPerson[lang]}`); }
    finally { setBusy(false); }
  };
  if (state === "human" || state === "queued" || requested || sent) return <LiveText>{(state === "human" ? FRONTLINE.connected : FRONTLINE.requested)[lang]}</LiveText>;
  return <><Button kind="secondary" busy={busy} label={UI.human[lang]} onPress={request} />{note && <LiveText>{note}</LiveText>}</>;
}
