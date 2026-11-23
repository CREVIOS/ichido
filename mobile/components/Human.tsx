import { useState } from "react";
import { Button, Notice } from "./ui";
import { cmd } from "@/lib/supabase";
import { FRONTLINE, UI, errorText, type Lang } from "@content/catalogue";

export function Human({ lang, connected = true }: { lang: Lang; connected?: boolean }) {
  const [note,setNote] = useState("");
  const request = async () => {
    if (!connected) return setNote(FRONTLINE.inPerson[lang]);
    try { await cmd("human"); setNote(FRONTLINE.requested[lang]); }
    catch (error) { setNote(`${errorText((error as Error).message, lang)} ${FRONTLINE.inPerson[lang]}`); }
  };
  return <><Button kind="secondary" label={UI.human[lang]} onPress={request} />{note && <Notice>{note}</Notice>}</>;
}
