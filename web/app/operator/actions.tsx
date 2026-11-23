"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { cmd } from "@/lib/supabase";
import { Chip, Notice, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SHIFT, DESK, DEVICE_FAULT, FAULT_DESK, LANG_NAME, MANUAL_VERSION, PACKS, PACK_DESK, REPLIES, callerPack, intentsOf, packOfFault, packStaffField, replyBlock, replyOf, staffError, type Lang, STAFF_JA } from "@/content/catalogue";
import type { CallerCard, Desk, Guard, Job, Reply, Run } from "./types";
import { DispatchChain } from "./ops";

// Seconds left on a single-use code, ticking once a second.
export function useCountdown(until: number | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) return;
    const tick = () => setLeft(Math.max(0, Math.round((until - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [until]);
  return until ? left : 0;
}

export function PairCard({ incident }: { incident: string }) {
  const [code, setCode] = useState<{ value: string; until: number } | null>(null);
  const left = useCountdown(code?.until ?? null);
  const live = code && left > 0;
  const issue = () => cmd<{ code: string; expires_in: number }>("issue_code", { incident })
    .then((r) => setCode({ value: r.code, until: Date.now() + r.expires_in * 1000 }))
    .catch((e: Error) => toast.error(staffError(e.message)));
  return (
    <Panel title={DESK.pair.title} action={<Chip>{DESK.pair.validity}</Chip>}>
      <p className="text-[14px] leading-6">{DESK.pair.body}</p>
      {live && (
        <div className="surface flex items-end justify-between p-4">
          <span className="font-mono text-[34px] leading-none tracking-[0.18em] text-foreground">{code.value}</span>
          <span className="num text-[12px] text-muted-foreground">{DESK.pair.expires(left)}</span>
        </div>
      )}
      <Button variant={live ? "secondary" : "default"} onClick={issue}>{live ? DESK.pair.reissue : DESK.pair.issue}</Button>
    </Panel>
  );
}

// practice: the training console, where the held-card rule is scored in the debrief instead of hinted here.
// flags: the caller's own taps, which some replies need (content/faults.ts REPLY_RULES). Only the case's pack's
// replies are listed (content/packs).
export function ReplyCard({ d, lang, replies, run, bundleTo, practice, flags = [], work = [] }: {
  d: Pick<Desk, "id" | "confirmed_rev" | "card_back" | "remote_release"> & { fault?: string }; lang: Lang; replies: Reply[]; run: Run; bundleTo?: Guard; practice?: boolean; work?: string[]; flags?: string[];
}) {
  const INTENTS = intentsOf(packOfFault(d.fault ?? DEVICE_FAULT));
  const [intent, setIntent] = useState(INTENTS[0]);
  const r = replyOf(intent) ?? REPLIES[INTENTS[0]];
  const preview = r.text(replies.at(-1)?.slots ?? {});
  // Mirrors the server rules: "card is still inside" only when the caller confirmed it and no release succeeded,
  // and each reply only for its own fault types and caller statements.
  const ctx = { fault: d.fault ?? DEVICE_FAULT, flags, confirmed: d.confirmed_rev != null, card_back: d.card_back, remote_release: d.remote_release };
  const blockOf = (k: string) => work.includes(k) ? "work" : replyBlock(k, REPLIES[k].needsHeld, ctx);
  const block = blockOf(intent);
  const blocked = block === "awaiting" ? DESK.reply.awaiting
    : practice || !block ? "" : block === "held" ? DESK.reply.mismatch : FAULT_DESK.blocked[block];
  const dim = (k: string) => !practice && ![null, "awaiting"].includes(blockOf(k));
  const send = () => run("send", { incident: d.id, intent }).then((ok) => { if (ok) toast.success(DESK.reply.toast); });
  const sendAndDispatch = async (g: Guard) => {
    if (!(await run("send", { incident: d.id, intent }))) return;
    if (await run("assign", { incident: d.id, assignee: g.uid })) toast.success(DESK.reply.bundleToast(g.display_name));
  };
  return (
    <Panel title={DESK.reply.title} action={<span className="mono text-faint">{MANUAL_VERSION}</span>}>
      <div className="flex flex-col gap-1" role="radiogroup" aria-label={DESK.reply.title}>
        {INTENTS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={k === intent} onClick={() => setIntent(k)}
            className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent", k === intent ? "border-foreground/30 bg-card" : "border-transparent", dim(k) && "opacity-45")}>
            <span className="mono mt-0.5 w-7 shrink-0 text-muted-foreground">{REPLIES[k].code}</span>
            <span className="flex-1 text-[14px] leading-5 text-foreground">{REPLIES[k].title}</span>
            {k === intent && <Check className="mt-0.5 size-4 shrink-0 stroke-[1.5] text-foreground" />}
          </button>
        ))}
      </div>
      <div className="inset flex flex-col gap-2 p-3.5">
        {replies.length || !r.offersChoice ? (
          <><span className="text-[14px] leading-6 text-foreground">{preview.ja}</span><span className="text-[14px] leading-6" lang={lang}>{preview[lang]}</span></>
        ) : (
          <span className="text-[13px] leading-5">{DESK.reply.slotsNote(LANG_NAME[lang])}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12px] text-muted-foreground">{blocked || (replies.length ? DESK.reply.sent(replies.length) : "")}</span>
        <div className="flex flex-wrap justify-end gap-2">
          {bundleTo && <Button variant="secondary" disabled={Boolean(blocked)} onClick={() => sendAndDispatch(bundleTo)}>{DESK.reply.bundle(bundleTo.display_name)}</Button>}
          <Button disabled={Boolean(blocked)} onClick={send}>{DESK.reply.send}</Button>
        </div>
      </div>
    </Panel>
  );
}

// company: the station's security company, whose control centre (管制) the dispatch goes through.
// A non-ATM case (d.fault in another pack) dispatches the same field staff as that pack's responder, with its wording.
export function DispatchCard({ d, job, guards, card, lang, run, company }: { d: Pick<Desk, "id"> & { fault?: string }; job: Job | null; guards: Guard[]; card: Pick<CallerCard, "field_state"> | null; lang: Lang; run: Run; company?: string | null }) {
  const others = guards.filter((g) => g.uid !== job?.assignee);
  const pack = packOfFault(d.fault);
  const staffField = packStaffField(pack) ?? STAFF_JA.field;
  const caller = callerPack(d.fault ?? DEVICE_FAULT);
  return (
    <Panel title={DESK.dispatch.title}>
      {company && pack === "atm" && <DispatchChain company={company} />}
      {job ? (
        <div className="surface flex flex-col gap-1 p-3.5">
          <span className="flex items-center justify-between text-[14px] text-foreground">
            {guards.find((g) => g.uid === job.assignee)?.display_name ?? DESK.dispatch.guard}
            <Chip>{staffField[job.state]}</Chip>
          </span>
          <span>{job.declined_at ? SHIFT.declined : job.acknowledged_at ? SHIFT.accepted : SHIFT.unack}</span>
          {job.provider_at && <span>{SHIFT.provider}</span>}
          {job.help_at && <Notice tone="warn">{SHIFT.helpNeeded}</Notice>}
          <span className="text-[13px]">{job.eta ? DESK.dispatch.eta(job.eta) : DESK.dispatch.etaUnknown}</span>
        </div>
      ) : (
        <p className="text-[14px] leading-6">{pack === "atm" ? DESK.dispatch.body : PACK_DESK.dispatchBody(PACKS[pack].responder.staff)}</p>
      )}
      {others.length ? (
        <div className="flex flex-wrap gap-2">
          {others.map((g) => <Button key={g.uid} variant="secondary" onClick={() => run("assign", { incident: d.id, assignee: g.uid })}>{DESK.dispatch.assign(g.display_name, Boolean(job))}</Button>)}
        </div>
      ) : (!job || job.declined_at) && <Notice>{SHIFT.noWorker}</Notice>}
      {card && card.field_state !== "none" && <span className="text-[12px] text-muted-foreground">{DESK.dispatch.callerSees(caller.field(card.field_state, lang))}</span>}
    </Panel>
  );
}
