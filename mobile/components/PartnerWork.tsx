import { useCallback, useState } from "react";
import { Share } from "react-native";
import { cmd, API_URL, sb } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { Button, Card, Input, Notice, Row, Segments, T } from "@/components/ui";
import { HANDOFF, PACKS, PARTNER, packOfFault, staffError } from "@content/catalogue";

type Work = { recipient: string; owner_id: string; due_at: string; requested_at: string | null; accepted_at: string | null };
type Preview = { recipient: string; due: string; rows: [string,string][] };

export function PartnerWork({ incident, fault, uid }: { incident: string; fault: string; uid: string }) {
  const [work,setWork] = useState<Work[]>([]);
  const [hours,setHours] = useState(24);
  const [preview,setPreview] = useState<Preview | null>(null);
  const [reference,setReference] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await sb().from("partner_work").select("recipient,owner_id,due_at,requested_at,accepted_at").eq("incident",incident);
    if (r.error) setError(staffError(r.error.message));
    else setWork(r.data ?? []);
  },[incident]);
  useLive(["partner_work"],load);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(staffError((e as Error).message)); } finally { setBusy(false); }
  };
  const inspect = (recipient: string) => run(async () => {
    setPreview(null);
    const due = new Date(Date.now()+hours*3600000).toISOString();
    const { rows } = await cmd<Pick<Preview,"rows">>("handoff_preview",{ incident,recipient,due });
    setPreview({ recipient,due,rows });
  });
  const issue = (p: Preview) => run(async () => {
    const { path } = await cmd<{ path: string }>("handoff_create",{ incident,recipient:p.recipient,due:p.due });
    setPreview(null);
    await load();
    await Share.share({ message:new URL(path,API_URL).href });
  });
  const progress = (w: Work) => run(async () => {
    await cmd("partner_progress",{ incident,recipient:w.recipient,action:w.requested_at ? "accept" : "request",reference });
    setReference(""); await load();
  });
  return <Card title={HANDOFF.title}>
    <T v="label">{PARTNER.due}</T>
    <Segments value={hours} options={[1,4,24].map((h) => ({ key:h,label:PARTNER.hours(h) }))} onChange={(h) => { setHours(h); setPreview(null); }} />
    {Object.keys(PACKS[packOfFault(fault)].recipients).map((r) => <Button key={r} kind="secondary" disabled={busy} label={HANDOFF.recipient[r] + " · " + PARTNER.preview} onPress={() => inspect(r)} />)}
    {preview && <>
      {preview.rows.map(([label,value],i) => <Row key={i} label={label} sub={value} />)}
      <Button label={PARTNER.issue} disabled={busy} onPress={() => issue(preview)} />
    </>}
    {work.map((w) => <Card key={w.recipient} title={HANDOFF.recipient[w.recipient]}>
      <T v="small">{new Date(w.due_at).toLocaleString()} · {w.accepted_at ? PARTNER.accepted : w.requested_at ? PARTNER.sent : PARTNER.pending}</T>
      {w.owner_id === uid && !w.accepted_at && <>
        {w.recipient === "railway" && w.requested_at && <Input label={PARTNER.ref} value={reference} onChangeText={setReference} autoCapitalize="characters" maxLength={32} />}
        <Button kind="secondary" disabled={busy} label={w.requested_at ? PARTNER.accept : PARTNER.request} onPress={() => progress(w)} />
      </>}
    </Card>)}
    {error && <Notice tone="alert">{error}</Notice>}
  </Card>;
}
