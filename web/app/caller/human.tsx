"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/kit";
import { cmd } from "@/lib/supabase";
import { FRONTLINE, UI, errorText, type Lang } from "@/content/catalogue";

export function Human({ lang, open = true }: { lang: Lang; open?: boolean }) {
  const [note, setNote] = useState("");
  async function request() {
    if (!open) return setNote(FRONTLINE.inPerson[lang]);
    try { await cmd("human"); setNote(FRONTLINE.requested[lang]); }
    catch (error) { setNote(`${errorText((error as Error).message, lang)} ${FRONTLINE.inPerson[lang]}`); }
  }
  return <div className="sticky top-1 z-10 grid gap-1 bg-background py-1">
    <Button variant="secondary" size="lg" onClick={request}>{UI.human[lang]}</Button>
    {note && <Notice>{note}</Notice>}
  </div>;
}
