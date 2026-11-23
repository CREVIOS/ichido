"use client";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, Sparkles } from "lucide-react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { Chip, Panel } from "@/components/kit";
import { Pill } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PARTNER, HANDOFF, PACKS, packOfFault, staffError } from "@/content/catalogue";
import { when, type Desk } from "./types";

type Link = { id: string; recipient: string; created_at: string; expires_at: string; revoked_at: string | null; views: number };
const defaultDeadline = () => new Date(Date.now()+86400000).toISOString();
const at = (t: string) => new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// Read-only links to this case's record for its pack's recipients (an ATM: the bank, the police, the security company).
export function HandoffPanel({ d, uid }: { d: Desk; uid: string }) {
  const { id: incident, fault } = d;
  const RECIPIENTS = Object.keys(PACKS[packOfFault(fault)].recipients);
  const [previewing, setPreviewing] = useState(false);
  const [due, setDue] = useState("");
  const [reference, setReference] = useState("");
  const [preview, setPreview] = useState<{recipient: string; due: string; rows: [string,string][]} | null>(null);
  const [work, setWork] = useState<{ recipient: string; owner_id: string; requested_at: string | null; accepted_at: string | null; due_at: string }[]>([]);
  const [state, setState] = useState<{ links: Link[]; now: number }>({ links: [], now: 0 });
  const load = useCallback(async () => {
    try {
      const [r,w] = await Promise.all([cmd<{ links: Link[] }>("handoff_list",{ incident }),
        sb().from("partner_work").select("*").eq("incident",incident).throwOnError()]);
      setState({ links:r.links, now:Date.now() }); setWork(w.data ?? []);
    } catch (e) { toast.error(staffError((e as Error).message)); }
  },[incident]);
  const { links, now } = state;
  useLive(["case_event","partner_work"], load);
  const fail = (e: Error) => toast.error(staffError(e.message));


  const inspect = (r: string) => {
    const value = due ? new Date(due).toISOString() : defaultDeadline();
    setPreviewing(true); setPreview(null);
    return cmd<{ rows: [string,string][] }>("handoff_preview", { incident, recipient:r, due:value }).then((res) => setPreview({ recipient:r, due:value, rows:res.rows })).catch(fail).finally(() => setPreviewing(false));
  };
  const progress = (r: string, action: string) => cmd("partner_progress",{ incident,recipient:r,action,reference }).then(load).catch(fail);
  const create = (recipient: string, due: string) => cmd<{ path: string }>("handoff_create", { incident, recipient, due })
    .then(async (r) => {
      setPreview(null);
      const url = `${location.origin}${r.path}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(HANDOFF.copied);
      } catch {
        window.prompt(HANDOFF.copy, url);
      }
      load();
    }).catch(fail);
  const revoke = (id: string) => cmd("handoff_revoke", { id }).then(load).catch(fail);

  return (
    <Panel title={HANDOFF.title}>
      <p className="max-w-2xl text-[13px] leading-5">{HANDOFF.lead}</p>
      <div className="flex flex-wrap gap-2">
        {RECIPIENTS.map((r) => <Button key={r} disabled={previewing} variant="secondary" onClick={() => inspect(r)}><Link2 className="stroke-[1.5]" />{HANDOFF.recipient[r]} · {PARTNER.preview}</Button>)}
      </div>
      <label>{PARTNER.due} <input disabled={previewing} type="datetime-local" onChange={(e) => { setDue(e.target.value); setPreview(null); }} /></label>
      {preview && <div className="inset p-3"><dl>{preview.rows.map(([k,v],i) => <div key={i}><dt className="label">{k}</dt><dd>{v}</dd></div>)}</dl>
        <Button onClick={() => create(preview.recipient,preview.due)}>{PARTNER.issue}</Button></div>}
      {work.map((w) => <div className="flex flex-wrap items-center gap-2" key={w.recipient}>
        <span>{HANDOFF.recipient[w.recipient]} · {at(w.due_at)} · {w.accepted_at ? PARTNER.accepted : w.requested_at ? PARTNER.sent : PARTNER.pending}</span>
        {!w.accepted_at && w.owner_id === uid && <>
          {w.recipient === "railway" && w.requested_at && <input aria-label={PARTNER.ref} placeholder={PARTNER.ref} value={reference} maxLength={32} onChange={(e) => setReference(e.target.value.toUpperCase())} />}
          <Button variant="secondary" onClick={() => progress(w.recipient,w.requested_at ? "accept" : "request")}>{w.requested_at ? PARTNER.accept : PARTNER.request}</Button>
        </>}
      </div>)}
      <Summary d={d} mine={d.operator_id === uid} />
      {links.length > 0 && (
        <ul className="flex flex-col">
          {links.map((l) => {
            const live = !l.revoked_at && Date.parse(l.expires_at) > now;
            return (
              <li key={l.id} className="flex items-center gap-3 border-t py-2 text-[13px]">
                <Copy className="size-3.5 stroke-[1.5] text-muted-foreground" />
                <span className="text-foreground">{HANDOFF.recipient[l.recipient]}</span>
                <span className="num text-muted-foreground">{at(l.created_at)}</span>
                {live ? <Chip>{HANDOFF.until(at(l.expires_at))}</Chip> : <Pill tone="neutral">{l.revoked_at ? HANDOFF.revoked : HANDOFF.expired}</Pill>}
                <span className="num ml-auto text-muted-foreground">{HANDOFF.views(l.views)}</span>
                {live && <Button variant="ghost" size="sm" onClick={() => revoke(l.id)}>{HANDOFF.revoke}</Button>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// The hand-off summary: an AI draft from the case record (never the caller's words), which the operator edits and saves.
// Only the saved text reaches the recipient, marked as an AI draft reviewed by the operator.
function Summary({ d, mine }: { d: Desk; mine: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const S = HANDOFF.summary;
  const fail = (e: Error) => toast.error(staffError(e.message));
  const draft = () => {
    setReviewed(false); setBusy(true); setNote("");
    cmd<{ summary: string | null }>("summary_draft", { incident: d.id })
      .then((r) => { if (r.summary) setText(r.summary); else { setNote(S.off); setText((t) => t ?? ""); } })
      .catch(fail).finally(() => setBusy(false));
  };
  const save = () => cmd<{ withheld?: boolean }>("summary_save", { incident: d.id, text, checked:reviewed })
    .then((r) => { if (r.withheld) return setNote(S.withheld); setText(null); toast.success(S.saved); }).catch(fail);
  if (!mine && !d.ai_summary) return null;
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <span className="flex items-center justify-between gap-2">
        <span className="label">{S.title}</span>
        {d.ai_summary && d.ai_summary_by && d.ai_summary_at && <Chip>{S.by(d.ai_summary_by, when(d.ai_summary_at))}</Chip>}
      </span>
      {text == null ? (
        <>
          {d.ai_summary && <p className="text-[14px] leading-6 text-foreground">{d.ai_summary}</p>}
          {mine && <span className="flex items-center gap-3"><Button variant="secondary" size="sm" disabled={busy} onClick={draft}><Sparkles className="stroke-[1.5]" />{S.draft}</Button><span className="text-[12px] leading-5 text-muted-foreground">{S.lead}</span></span>}
        </>
      ) : (
        <>
          <Textarea aria-label={S.title} value={text} onChange={(e) => { setText(e.target.value); setReviewed(false); }} maxLength={600} className="min-h-24 text-[14px]" />
          <label><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> {PARTNER.verify}</label>
          <span className="flex items-center gap-2"><Pill tone="neutral">{S.unsaved}</Pill><Button size="sm" className="ml-auto" disabled={!reviewed || !text.trim()} onClick={save}>{S.save}</Button></span>
        </>
      )}
      {note && <span className="text-[12px] text-muted-foreground">{note}</span>}
    </div>
  );
}
