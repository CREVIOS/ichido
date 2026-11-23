"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ASSIST, ANSWER, CALLER_FLAGS, FACTS, FACT_KEYS, LANGS, LANG_NAME, UI, contentPack, exclusiveOff, flagsFor, sentText, type Fact, type Lang } from "@/content/catalogue";
import type { Desk, Reply, Run } from "./types";

export function AssistedIntake({ desk, reply, run }: { desk: Desk; reply?: Reply; run: Run }) {
  const [source,setSource] = useState(desk.assisted_source ?? "in_person");
  const [lang,setLang] = useState<Lang>(desk.lang ?? "ja");
  const [consent,setConsent] = useState(false);
  const [teach,setTeach] = useState("");
  const [flags,setFlags] = useState<string[]>([]);
  const [facts,setFacts] = useState({ card_back:"unknown" as Fact,cash_received:"unknown" as Fact });
  const pack = contentPack(desk.fault);
  const text = reply && sentText(reply,desk.lang ?? lang);
  const ready = pack ? flags.length > 0 : FACT_KEYS.some(k => facts[k] !== "unknown");
  return <details className="surface p-4"><summary>{ASSIST.title}</summary>
    <div className="mt-3 grid gap-3">
      <select aria-label={ASSIST.source} value={source} onChange={e => setSource(e.target.value as typeof source)}>
        <option value="in_person">{ASSIST.in_person}</option>{!desk.text_only && <option value="handset">{ASSIST.handset}</option>}
      </select>
      {desk.confirmed_rev === null ? <>
        <select aria-label={UI.language.ja} value={lang} onChange={e => setLang(e.target.value as Lang)}>{LANGS.map(l => <option key={l} value={l}>{LANG_NAME[l]}</option>)}</select>
        {pack ? <fieldset className="grid gap-2"><legend>{UI.whatHappened[lang]}</legend>
          {flagsFor(desk.fault,flags).map(f => <label key={f}><input type="checkbox" checked={flags.includes(f)} onChange={e => {
            const next = e.target.checked ? [...flags.filter(k => !exclusiveOff(f,flags).includes(k)),f] : flags.filter(k => k !== f);
            setFlags(next.filter(k => !k.startsWith("allergy_") || next.includes("diet_allergy")));
          }} /> {CALLER_FLAGS[f].label[lang]}</label>)}</fieldset> :
          FACT_KEYS.map(k => <label key={k}>{FACTS[k].question[lang]} <select value={facts[k]} onChange={e => setFacts({...facts,[k]:e.target.value})}>
            {(["unknown","yes","no"] as const).map(v => <option key={v} value={v}>{ANSWER[v][lang]}</option>)}</select></label>)}
        <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> {ASSIST.consent}</label>
        <Button disabled={!consent || !ready} onClick={() => run("assisted_intake",{incident:desk.id,fault:desk.fault,lang,source,consent,card:facts.card_back,cash:facts.cash_received,flags})}>{ASSIST.save}</Button>
      </> : desk.assisted_source && reply && text && <>
        <p lang={desk.lang ?? lang}>{text}</p>
        <label>{ASSIST.teach}<Textarea value={teach} maxLength={500} onChange={e => setTeach(e.target.value)} /></label>
        <Button disabled={!teach.trim()} onClick={() => run("assisted_delivery",{incident:desk.id,reply:reply.id,source,teach})}>{ASSIST.finish}</Button>
      </>}
    </div>
  </details>;
}
