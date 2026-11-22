"use client";
import { useCallback, useState } from "react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { Phone } from "@/components/phone";
import { Chip, StatusLabel } from "@/components/kit";
import { FAULTS, LANGS, LANG_NAME, STATION, UI, pick, type Lang } from "@/content/catalogue";
import { Intake, Waiting } from "./intake";
import { Guidance } from "./guidance";
import type { CallerCase, Draft, Reply, Station } from "./types";

export default function CallerPage() {
  const [card, setCard] = useState<CallerCase | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [station, setStation] = useState<Station | null>(null);
  const [staffSession, setStaffSession] = useState(false);

  // Only the case this phone is bound to; never "the first card visible" (staff can see many).
  const load = useCallback(async () => {
    const db = sb();
    const mine = await cmd<{ incident: string | null; staff: boolean }>("mine").catch(() => ({ incident: null, staff: false }));
    setStaffSession(mine.staff);
    if (!mine.incident) return setCard(null);
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
  if (card === null) return (
    <Phone center>
      {/* The phone has no case yet, so no language: say it in every caller language. */}
      {LANGS.map((l, i) => {
        const text = (staffSession ? STATION.staffSession : UI.notConnected)[l];
        return i === 0 ? <h1 key={l} lang={l} className="text-[24px] leading-snug">{text}</h1> : <p key={l} lang={l} className="text-[15px]">{text}</p>;
      })}
    </Phone>
  );

  const lang: Lang = card.lang ?? "bn";
  const latest = replies.at(-1);
  const confirmed = card.confirmed_rev != null || replies.length > 0;

  return (
    <Phone lang={lang} right={<Chip>{LANG_NAME[lang]}</Chip>}>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">{pick(station?.label, lang)} · {pick(FAULTS[card.fault], lang)}</span>
        <StatusLabel status={card.status} lang={lang} />
      </div>
      {!confirmed && draft && <Intake lang={lang} draft={draft} needsHuman={card.needs_human} />}
      {confirmed && !latest && <Waiting lang={lang} />}
      {latest && <Guidance lang={lang} card={card} reply={latest} />}
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
