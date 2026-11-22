"use client";
import { useCallback, useState, useSyncExternalStore } from "react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { Phone } from "@/components/phone";
import { StatusLabel } from "@/components/kit";
import { LangSelect, preferredLang } from "@/components/lang-select";
import { FAULTS, STATION, UI, pick, type Lang } from "@/content/catalogue";
import { Intake, Waiting } from "./intake";
import { Guidance } from "./guidance";
import { BankStatus, CallerFlags, FollowUp, type FollowUpCase } from "./faults";
import { PrefsBar, speechRate, usePrefs } from "./prefs";
import type { CallerCase, Draft, Reply, Station } from "./types";

const noop = () => () => {};

export default function CallerPage() {
  const [card, setCard] = useState<CallerCase | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [station, setStation] = useState<Station | null>(null);
  const [staffSession, setStaffSession] = useState(false);
  const [follow, setFollow] = useState<FollowUpCase | null>(null);
  const [prefs, setPrefs] = usePrefs();

  // Only the case this phone is bound to; never "the first card visible" (staff can see many).
  // Once the pairing has expired, a phone whose case closed with guidance can still follow it.
  const load = useCallback(async () => {
    const db = sb();
    const mine = await cmd<{ incident: string | null; staff: boolean }>("mine").catch(() => ({ incident: null, staff: false }));
    setStaffSession(mine.staff);
    if (!mine.incident) {
      const f = mine.staff ? null : await cmd<{ case: FollowUpCase | null }>("followup").catch(() => null);
      setFollow(f?.case ?? null);
      return setCard(null);
    }
    const { data: c } = await db.from("caller_card").select("*").eq("id", mine.incident).maybeSingle();
    setCard((c as CallerCase) ?? null);
    if (!c) return;
    const [d, r, s] = await Promise.all([
      db.from("draft").select("*").eq("incident", c.id).maybeSingle(),
      db.from("reply").select("id, intent, slots, sent_at").eq("incident", c.id).order("sent_at"),
      db.from("station").select("label").eq("id", c.station).maybeSingle(),
    ]);
    setDraft(d.data as Draft); setReplies((r.data ?? []) as Reply[]); setStation(s.data as Station);
  }, []);
  useLive(["caller_card", "draft", "reply"], load);

  if (card === undefined) return null;
  if (card === null) return follow ? <FollowUp f={follow} prefs={prefs} onPrefs={setPrefs} /> : <NotConnected staff={staffSession} />;

  const lang: Lang = card.lang ?? "bn";
  // The current guidance only: a reply withdrawn after a fault-type change no longer shows.
  const latest = replies.find((r) => r.id === card.reply_id);
  const confirmed = card.confirmed_rev != null || replies.length > 0;
  const open = card.status !== "guided";

  return (
    <Phone lang={lang} large={prefs.large} right={<LangSelect value={lang} onChange={(l) => cmd("set_lang", { lang: l }).then(load).catch(() => undefined)} />}>
      <PrefsBar prefs={prefs} onChange={setPrefs} lang={lang} />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">{pick(station?.label, lang)} · {pick(FAULTS[card.fault], lang)}</span>
        <StatusLabel status={card.status} lang={lang} />
      </div>
      {!confirmed && draft && <Intake lang={lang} draft={draft} needsHuman={card.needs_human} />}
      {confirmed && !latest && <Waiting lang={lang} />}
      {latest && <Guidance lang={lang} card={card} reply={latest} rate={speechRate(prefs)} />}
      {open && <CallerFlags card={card} lang={lang} />}
      {(card.bank_status || !open) && <BankStatus status={card.bank_status} due={card.bank_due} lang={lang} />}
      <ShowStaff card={card} lang={lang} />
      <p className="text-[12px] leading-5 text-muted-foreground">{UI.helpDesk[lang]}</p>
    </Phone>
  );
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
function NotConnected({ staff }: { staff: boolean }) {
  const detected = useSyncExternalStore(noop, preferredLang, () => "bn" as Lang);
  const [chosen, setLang] = useState<Lang | null>(null);
  const lang = chosen ?? detected;
  return (
    <Phone lang={lang} center right={<LangSelect value={lang} onChange={setLang} />}>
      <h1 className="text-[24px] leading-snug">{(staff ? STATION.staffSession : UI.notConnected)[lang]}</h1>
    </Phone>
  );
}
