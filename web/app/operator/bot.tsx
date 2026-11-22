"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Bot } from "lucide-react";
import { sb } from "@/lib/supabase";
import { Chip, Dot, Panel } from "@/components/kit";
import { Pill } from "@/components/charts";
import { BOT, DESK } from "@/content/catalogue";
import { hhmm, type BotStep, type Desk } from "./types";

const DOT: Record<string, string> = { done: "guided", waiting: "review", skipped: "" };
const TONE: Record<string, string> = { done: "guided", waiting: "review", skipped: "neutral" };
// The existing escalation for the target a step watches (ichido.escalate_due); the bot never escalates itself.
const ESCALATION: Record<string, string> = { claim: "unclaimed", remind_reply: "no_reply", remind_guard: "guard_late" };

function detail(s: BotStep) {
  if (s.step === "route" && s.status === "done") return BOT.routed(String(s.data.operator ?? "—"));
  if (s.code) return BOT.code[s.code] ?? null;
  return s.status === "waiting" && s.due_at ? BOT.due(hhmm(s.due_at)) : null;
}

// What the Ichido Bot has done for this case, step by step (bot_step, live).
export function BotPanel({ steps, escalations }: { steps: BotStep[]; escalations: string[] }) {
  if (!steps.length) return null;
  const by = new Map(steps.map((s) => [s.step, s]));
  const settled = steps.filter((s) => s.status !== "waiting").length;
  return (
    <Panel title={<span className="inline-flex items-center gap-1.5"><Bot className="size-3.5 stroke-[1.5]" />{BOT.name}</span>}
      action={<Chip className="num">{settled}/{BOT.order.length}</Chip>}>
      <ol className="surface flex flex-col divide-y">
        {BOT.order.map((k) => {
          const s = by.get(k);
          if (!s) return null;
          const reason = ESCALATION[k];
          const text = detail(s);
          return (
            <li key={k} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 py-2">
              <Dot s={DOT[s.status]} />
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] text-foreground">{BOT.steps[k]}</span>
                {text && <span className="truncate text-[12px] text-muted-foreground">{text}</span>}
              </span>
              <span className="flex items-center gap-1.5">
                {reason && escalations.includes(reason) && <Pill tone="alert">{BOT.escalated}・{DESK.escalationReason[reason]}</Pill>}
                <Pill tone={TONE[s.status]}>{BOT.status[s.status]}</Pill>
                <span className="mono w-10 text-right text-[12px] text-muted-foreground">{s.status === "waiting" ? "" : hhmm(s.at)}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-[12px] leading-5 text-muted-foreground">{BOT.note}</p>
    </Panel>
  );
}

// A toast when the bot reminds about one of my cases (first-reply target near, guard not yet on the way).
export function BotReminders({ open, labels, me }: { open: Desk[] | null; labels: Record<string, string>; me: string }) {
  const latest = useRef({ open, labels });
  useEffect(() => { latest.current = { open, labels }; });
  useEffect(() => {
    const ch = sb().channel(`bot-remind-${Math.random().toString(36).slice(2)}`);
    ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "case_event", filter: "kind=eq.bot_remind" }, (p) => {
      const e = p.new as { id: number; incident: string; data: { reason?: string } };
      const d = latest.current.open?.find((x) => x.id === e.incident);
      const say = BOT.toast[e.data.reason ?? ""];
      if (!d || d.operator_id !== me || !say) return;
      toast.warning(say(latest.current.labels[d.station] ?? d.station), { id: `bot-${e.id}` });
    });
    ch.subscribe();
    return () => { sb().removeChannel(ch); };
  }, [me]);
  return null;
}
