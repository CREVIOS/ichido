"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { cmd } from "@/lib/supabase";
import { Chip, Notice, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DESK, FIELD_STATE, LANG_NAME, MANUAL_VERSION, REPLIES, pick, replyOf, staffError, type Lang, STAFF_JA } from "@/content/catalogue";
import type { CallerCard, Desk, Guard, Job, Reply, Run } from "./types";

// Seconds left on a single-use code, ticking once a second.
function useCountdown(until: number | null) {
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

const INTENTS = Object.keys(REPLIES);

// practice: the training console, where the held-card rule is scored in the debrief instead of hinted here.
export function ReplyCard({ d, lang, replies, run, bundleTo, practice }: {
  d: Pick<Desk, "id" | "confirmed_rev" | "card_back" | "remote_release">; lang: Lang; replies: Reply[]; run: Run; bundleTo?: Guard; practice?: boolean;
}) {
  const [intent, setIntent] = useState(INTENTS[0]);
  const r = replyOf(intent) ?? REPLIES[INTENTS[0]];
  const preview = r.text(replies.at(-1)?.slots ?? {});
  // Mirrors the server rule: "card is still inside" only when the caller confirmed it and no release succeeded.
  const blocked = d.confirmed_rev == null ? DESK.reply.awaiting
    : !practice && r.needsHeld && (d.card_back !== "no" || d.remote_release === "released") ? DESK.reply.mismatch : "";
  const send = () => run("send", { incident: d.id, intent }).then((ok) => { if (ok) toast.success(DESK.reply.toast); });
  // One step for the common case: the approved reply, then a site check by the first available guard.
  const sendAndDispatch = async (g: Guard) => {
    if (!(await run("send", { incident: d.id, intent }))) return;
    if (await run("assign", { incident: d.id, assignee: g.uid })) toast.success(DESK.reply.bundleToast(g.display_name));
  };
  return (
    <Panel title={DESK.reply.title} action={<span className="mono text-faint">{MANUAL_VERSION}</span>}>
      <div className="flex flex-col gap-1" role="radiogroup" aria-label={DESK.reply.title}>
        {INTENTS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={k === intent} onClick={() => setIntent(k)}
            className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent", k === intent ? "border-foreground/30 bg-card" : "border-transparent")}>
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

export function DispatchCard({ d, job, guards, card, lang, run }: { d: Pick<Desk, "id">; job: Job | null; guards: Guard[]; card: Pick<CallerCard, "field_state"> | null; lang: Lang; run: Run }) {
  const others = guards.filter((g) => g.uid !== job?.assignee);
  return (
    <Panel title={DESK.dispatch.title}>
      {job ? (
        <div className="surface flex flex-col gap-1 p-3.5">
          <span className="flex items-center justify-between text-[14px] text-foreground">
            {guards.find((g) => g.uid === job.assignee)?.display_name ?? DESK.dispatch.guard}
            <Chip>{STAFF_JA.field[job.state]}</Chip>
          </span>
          <span className="text-[13px]">{job.eta ? DESK.dispatch.eta(job.eta) : DESK.dispatch.etaUnknown}</span>
        </div>
      ) : (
        <p className="text-[14px] leading-6">{DESK.dispatch.body}</p>
      )}
      {others.length ? (
        <div className="flex flex-wrap gap-2">
          {others.map((g) => <Button key={g.uid} variant="secondary" onClick={() => run("assign", { incident: d.id, assignee: g.uid })}>{DESK.dispatch.assign(g.display_name, Boolean(job))}</Button>)}
        </div>
      ) : !job && <Notice>{DESK.dispatch.noGuards}</Notice>}
      {card && card.field_state !== "none" && <span className="text-[12px] text-muted-foreground">{DESK.dispatch.callerSees(pick(FIELD_STATE[card.field_state], lang))}</span>}
    </Panel>
  );
}
