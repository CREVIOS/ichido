"use client";
import { useCallback, useState } from "react";
import { ANSWER, FACT_KEYS, FACTS, UI, FRONT_DESK, FRONTLINE, CALLER_FLAGS, LANG_NAME, REVIEW, sentText, staffError, type Fact, type Lang } from "@/content/catalogue";
import { AppShell, Notice } from "@/components/kit";
import { MeFooter, navFor, type Me } from "@/components/StaffGate";
import { Button } from "@/components/ui/button";
import { cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";

type Turn = {seq:number; speaker:string; wording:string; flag:string|null; on:boolean|null; card_back:Fact|null; cash_received:Fact|null; locale:Lang; manual:string|null; delivery:string|null};
type Item = {incident:string;reason:string;lang:Lang;flagged_at:string;turns:Turn[]};
function wording(t:Turn) {
  if (t.wording==="text" || t.wording==="withheld") return FRONT_DESK.redacted;
  if (t.flag && CALLER_FLAGS[t.flag]) return CALLER_FLAGS[t.flag].label[t.locale]+" · "+ANSWER[t.on ? "yes" : "no"][t.locale];
  if (t.wording==="confirm") return UI.confirm[t.locale];
  if (t.wording==="unsure") return UI.unsure[t.locale];
  if (t.wording==="facts" || t.wording==="readback") {
    const known = FACT_KEYS.flatMap(k => t[k] === "yes" || t[k] === "no" ? [FACTS[k][t[k]][t.locale]] : []);
    return [...known,FRONTLINE.readback[t.locale]].join(" ");
  }
  if (t.manual) return sentText({manual_version:t.manual,intent:t.wording,slots:{}},t.locale);
  if (Object.hasOwn(FRONTLINE,t.wording)) return FRONTLINE[t.wording as keyof typeof FRONTLINE][t.locale];
  return t.wording;
}
export function Closures({me}:{me:Me}) {
  const [rows,setRows] = useState<Item[]>([]);
  const [error,setError] = useState("");
  const load = useCallback(async (signal?:AbortSignal) => {
    try {
      const r = await cmd<{rows:Item[]}>("frontline_qa",{action:"list"});
      if (!signal?.aborted) { setRows(r.rows); setError(""); }
    } catch(e) { if (!signal?.aborted) setError(staffError((e as Error).message)); }
  },[]);
  useLive(["case_event","desk"],load);
  async function decide(item:Item,action:string) {
    try { await cmd("frontline_qa",{action,incident:item.incident,flagged_at:item.flagged_at}); await load(); }
    catch(e) { setError(staffError((e as Error).message)); }
  }
  return <AppShell nav={navFor(me.role)} footer={<MeFooter me={me}/>} title={FRONT_DESK.quality}>
    <main className="grid max-w-3xl gap-4 p-5">
      {error && <Notice tone="warn">{error}</Notice>}
      {!rows.length && !error && <p>{REVIEW.empty}</p>}
      {rows.map(item=><section className="surface grid gap-2 p-4" key={item.incident}>
        <h2>{FRONT_DESK.qaReason[item.reason]} · {LANG_NAME[item.lang]} · {item.incident.slice(0,8)}</h2>
        <ol>{item.turns.map(t=><li key={t.seq}>{t.speaker==="ai" ? FRONT_DESK.aiSpeaker : t.speaker==="caller" ? FRONT_DESK.submitted : FRONT_DESK.joined} · <span lang={t.locale}>{wording(t)}</span> {t.delivery && FRONT_DESK.delivery[t.delivery]}</li>)}</ol>
        <Button onClick={()=>decide(item,"reviewed")}>{FRONT_DESK.checked}</Button>
        {item.reason!=="safety_miss" && <Button variant="secondary" onClick={()=>decide(item,"safety_miss")}>{FRONT_DESK.safetyMiss}</Button>}
      </section>)}
    </main>
  </AppShell>;
}
