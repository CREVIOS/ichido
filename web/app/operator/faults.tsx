"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Chip, Dot, Notice, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AMOUNT_MAX, BANK_STATUS, CALLER_FLAGS, FAULTS, FAULT_DESK, STAFF_JA, bankStatusStaff, suggestedFaults, takesAmount } from "@/content/catalogue";
import type { CallerCard, Desk, Run } from "./types";

const field = "h-9 rounded-lg border bg-card px-2.5 text-[14px] text-foreground";
const FAULT_KEYS = Object.keys(FAULTS);

// The fault type (correctable when the caller's story shows the machine alert was wrong) and, for cash faults,
// the amount the caller stated on the handset.
export function FaultCard({ d, flags, run }: { d: Desk; flags: string[]; run: Run }) {
  const suggested = suggestedFaults(d.fault, flags);
  return (
    <Panel title={FAULT_DESK.title}>
      <select aria-label={FAULT_DESK.change} className={field} value={d.fault} onChange={(e) => run("set_fault", { incident: d.id, fault: e.target.value })}>
        {FAULT_KEYS.map((k) => <option key={k} value={k}>{STAFF_JA.fault[k]}</option>)}
      </select>
      {suggested.map((f) => (
        <button key={f} type="button" onClick={() => run("set_fault", { incident: d.id, fault: f })}
          className="flex items-center gap-2 self-start rounded-md border border-warn/40 px-2 py-1 text-left text-[13px] text-foreground hover:bg-accent">
          <Dot s="received" />{FAULT_DESK.suggests(STAFF_JA.fault[f])}
        </button>
      ))}
      <p className="text-[12px] leading-5 text-muted-foreground">{FAULT_DESK.note}</p>
      {takesAmount(d.fault) && <StatedAmount d={d} run={run} />}
    </Panel>
  );
}

function StatedAmount({ d, run }: { d: Desk; run: Run }) {
  const [value, setValue] = useState("");
  const n = Number(value);
  const valid = /^\d+$/.test(value) && n >= 1 && n <= AMOUNT_MAX;
  const save = (amount: number | null) => run("stated_amount", { incident: d.id, amount }).then((ok) => { if (ok) setValue(""); });
  return (
    <div className="inset flex flex-col gap-2 p-3">
      <span className="flex items-center justify-between text-[13px]">
        <span className="label">{FAULT_DESK.amount}</span>
        {d.stated_amount != null && <span className="num text-foreground">{FAULT_DESK.yen(d.stated_amount)}</span>}
      </span>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (valid) save(n); }}>
        <Input inputMode="numeric" autoComplete="off" placeholder={FAULT_DESK.amountPlaceholder} value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, "").slice(0, 8))} />
        <Button type="submit" variant="secondary" disabled={!valid}>{FAULT_DESK.amountSave}</Button>
        {d.stated_amount != null && <Button type="button" variant="ghost" onClick={() => save(null)}>{FAULT_DESK.amountClear}</Button>}
      </form>
      <span className="text-[12px] leading-5 text-muted-foreground">{FAULT_DESK.amountNote}</span>
    </div>
  );
}

// What the caller tapped about themselves and what happened; a family helper is called out first.
export function CallerFlags({ flags }: { flags: string[] }) {
  const helper = flags.includes("helper");
  const rest = flags.filter((f) => f !== "helper");
  return (
    <Panel title={FAULT_DESK.flags} action={helper ? <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground"><Dot s="review" />{FAULT_DESK.helper}</span> : undefined}>
      {rest.length ? (
        <ul className="flex flex-col gap-1.5">
          {rest.map((f) => <li key={f} className="text-[14px] leading-6 text-foreground">{CALLER_FLAGS[f]?.staff ?? f}</li>)}
        </ul>
      ) : !helper && <p className="text-[14px]">{FAULT_DESK.flagsNone}</p>}
    </Panel>
  );
}

// The bank's follow-up, recorded by an operator on the bank's behalf. It reaches the caller's screen in their language,
// also after the case closes. Any operator may record it, so it works after the original operator's shift.
export function BankStatusCard({ incident, card, run }: { incident: string; card: Pick<CallerCard, "bank_status" | "bank_due"> | null; run: Run }) {
  const [status, setStatus] = useState(Object.keys(BANK_STATUS)[0]);
  const [due, setDue] = useState("");
  const needsDue = Boolean(BANK_STATUS[status]?.due);
  const save = () => run("bank_status", { incident, status, due: needsDue ? due : undefined }).then((ok) => { if (ok) toast.success(FAULT_DESK.bank); });
  return (
    <Panel title={FAULT_DESK.bank} action={<Chip>{card?.bank_status ? bankStatusStaff(card.bank_status, card.bank_due) : FAULT_DESK.bankNone}</Chip>}>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={FAULT_DESK.bank} className={field} value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.keys(BANK_STATUS).map((k) => <option key={k} value={k}>{BANK_STATUS[k].label}</option>)}
        </select>
        {needsDue && <input type="date" aria-label={FAULT_DESK.bankDue} className={field} value={due} onChange={(e) => setDue(e.target.value)} />}
        <Button variant="secondary" disabled={needsDue && !due} onClick={save}>{FAULT_DESK.bankSave}</Button>
      </div>
      <Notice>{FAULT_DESK.bankNote}</Notice>
    </Panel>
  );
}
