"use client";
import { Human } from "./human";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { Phone } from "@/components/phone";
import { Notice, StatusLabel } from "@/components/kit";
import { LangSelect, preferredLang } from "@/components/lang-select";
import { ACCESS, JOURNEY, CONSULTATION, allergyFacts, receipt, CALLER_FLAGS, FAULTS, STATION, UI, callerPack, pick, type Lang } from "@/content/catalogue";
import { Conversation } from "./conversation";
import { Intake, Waiting } from "./intake";
import { Guidance } from "./guidance";
import { DisasterNotice } from "./disaster";
import { BankStatus, CallerFlags, FollowUp, SyncStatus, type Sync } from "./faults";
import { PrefsBar, speechRate, usePrefs } from "./prefs";
import { CallerNotice, FraudScreen } from "./ops";
import type { CallerCase, CallerView } from "@/content/caller-session";
import { Button } from "@/components/ui/button";

const noop = () => () => {};

export default function CallerPage() {
  const [view, setView] = useState<CallerView>();
  const [updated, setUpdated] = useState<Date>();
  const [offline, setOffline] = useState(false);
  const sequence = useRef(0);
  const [prefs, setPrefs] = usePrefs();
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    try {
      const next = await cmd<CallerView>("caller_screen");
      if (seq !== sequence.current) return;
      setView(next); setUpdated(new Date()); setOffline(false);
    } catch {
      if (seq === sequence.current) setOffline(true);
    }
  }, []);
  useLive(["caller_card","draft","reply","frontline_turn"], load, true, { incident: view?.screen?.card.id });
  const detected = useSyncExternalStore(noop, preferredLang, () => "bn" as Lang);
  if (!view) return <Phone lang={detected}><Human lang={detected} open={false} /><p role="status">{(offline ? JOURNEY.offline : JOURNEY.connecting)[detected]}</p>
    {offline && <Button onClick={load}>{JOURNEY.retry[detected]}</Button>}</Phone>;
  const sync = {offline, updated, retry:load};
  if (!view.screen) return view.follow ? <FollowUp f={view.follow} prefs={prefs} onPrefs={setPrefs} sync={sync} /> : <NotConnected view={view} sync={sync} />;
  const { card, draft, reply: latest, station, turns, generation } = view.screen;
  const lang: Lang = card.lang ?? "bn";
  const open = card.status !== "guided";
  const frontline = card.handler !== "legacy" && open;
  const confirmed = card.confirmed_rev != null;
  // A non-ATM pack's caller answers with taps inside the intake; the ATM's taps sit below the read-back.
  const P = callerPack(card.fault);

  return (
    <Phone lang={lang} large={prefs.large} right={<LangSelect value={lang} onChange={(l) => cmd("set_lang", { lang: l }).then(load).catch(() => setOffline(true))} />}>
      <Human key={generation + String(open)} lang={lang} state={open ? card.handler : undefined} requested={open && card.needs_human} />
      <SyncStatus sync={sync} lang={lang} />
      <FieldProgress card={card} lang={lang} />
      {card.fraud ? <FraudScreen lang={lang} /> : <>
      <PrefsBar prefs={prefs} onChange={setPrefs} lang={lang} />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">{pick(station?.label, lang)}{confirmed && <> · {pick(FAULTS[card.fault], lang)}</>}</span>
        <StatusLabel status={card.status} lang={lang} text={P.status(card.status, lang)} />
      </div>
      {card.text_only && <Notice tone="info">{ACCESS.textOnly[lang]}</Notice>}
      {card.notice && <CallerNotice code={card.notice} lang={lang} />}
      <DisasterNotice station={card.station} lang={lang} />
      {frontline && draft && <Conversation key={generation} turns={turns} card={card} draft={draft} lang={lang} refresh={load} />}
      {!frontline && !confirmed && draft && <Intake key={generation} lang={lang} draft={draft} card={card} />}
      {!frontline && confirmed && !latest && <Waiting lang={lang} textOnly={card.text_only} fault={card.fault} />}
      {latest && <Guidance key={latest.id} lang={lang} card={card} reply={latest} rate={speechRate(prefs)} />}
      {!frontline && open && (P.atm || confirmed) && <CallerFlags card={card} lang={lang} />}
      {P.atm && (card.bank_status || !open) && <BankStatus status={(card.bank_status === "contact_by" || card.bank_status === "contacted") && !card.callback_channel ? null : card.bank_status} due={card.bank_due} lang={lang} />}
      <AllergyCard flags={card.flags} lang={lang} />
      {(card.choice === "leave" || !open) && <section className="grid gap-2 text-foreground"><p>{JOURNEY.checkHere[lang]}</p>
        <p>{pick(station.branch,lang)} · {pick(station.hours,lang)}</p>
        <details><summary>{JOURNEY.receipt[lang]}</summary><p>{receipt(card.station,card.id)}</p></details></section>}
      {confirmed && !card.flags.includes("need_other") && <ShowStaff card={card} lang={lang} />}
      <p className="text-[12px] leading-5">{UI.helpDesk[lang]} <a href={`tel:${CONSULTATION.phone}`}>{CONSULTATION.phone}</a> · <a href={`mailto:${CONSULTATION.email}`}>{CONSULTATION.email}</a></p></>}
    </Phone>
  );
}

function AllergyCard({ flags, lang }: { flags:string[]; lang:Lang }) {
  const facts = allergyFacts(flags);
  if (!facts.length) return null;
  return <details className="surface p-4"><summary>{JOURNEY.allergyCard[lang]}</summary>
    {(["bn","ja"] as const).map(l => <p key={l} lang={l} className="mt-3 text-lg">{facts.map(f => CALLER_FLAGS[f].label[l]).join(" · ")}</p>)}
  </details>;
}

function FieldProgress({ card, lang }: { card: CallerCase; lang: Lang }) {
  const pack = callerPack(card.fault);
  return <div role="status">{card.field_state !== "none" && <section className="surface p-4 text-foreground">
    <p>{pack.field(card.field_state, lang)}</p>
    {card.field_state === "on_way" && <p>{pack.eta(card.eta,lang)} {card.eta_at && new Date(card.eta_at).toLocaleString(lang)}</p>}
  </section>}</div>;
}

// A panel the caller can hold up to Japanese-speaking staff.
function ShowStaff({ card, lang }: { card: CallerCase; lang: Lang }) {
  return (
    <div className="mt-auto flex flex-col gap-1.5 rounded-xl bg-primary p-4 text-primary-foreground">
      <span className="text-[12px] opacity-60">{UI.showStaff[lang]}</span>
      <span lang="ja" className="text-[17px]">{FAULTS[card.fault]?.ja}。</span>
      <span lang="ja" className="text-[13px] opacity-80">{UI.caseNo.ja}：<span className="font-mono">{card.id.slice(0, 8)}</span></span>
    </div>
  );
}

// This phone has no case yet, so no chosen language: one message, in the phone's language, with the picker.
function NotConnected({ view, sync }: { view: CallerView; sync:Sync }) {
  const detected = useSyncExternalStore(noop, preferredLang, () => "bn" as Lang);
  const [chosen, setLang] = useState<Lang | null>(null);
  const lang = chosen ?? view.lang ?? detected;
  return (
    <Phone lang={lang} center right={<LangSelect value={lang} onChange={setLang} />}>
      <Human lang={lang} open={false} />
      <SyncStatus sync={sync} lang={lang} />
      <h1 className="text-[24px] leading-snug">{(view.staff ? STATION.staffSession : view.reason ? JOURNEY[view.reason] : UI.notConnected)[lang]}</h1>
    </Phone>
  );
}
