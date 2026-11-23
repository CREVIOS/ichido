"use client";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Radio } from "lucide-react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { Button } from "@/components/ui/button";
import { DISASTER_NOTICES, DISASTER_PROPOSAL as T, staffError } from "@/content/catalogue";

type Proposal = { id: number; notice: string; stations: string[]; kind: string; severity: string; expires_at: string };
const hhmm = (t: string) => new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

// Pending disaster proposals from the official feeds (lib/disaster-feeds.ts). The feed only proposes: a person
// confirms (the same cmd_disaster as setting disaster mode by hand) or dismisses. Expired ones drop off by themselves.
export function DisasterProposals({ label }: { label: Record<string, string> }) {
  const [rows, setRows] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const load = useCallback(async (signal: AbortSignal) => {
    const { data } = await sb().from("disaster_proposal").select("id, notice, stations, kind, severity, expires_at")
      .eq("status", "pending").gt("expires_at", new Date().toISOString()).order("id").abortSignal(signal);
    if (!signal.aborted) setRows((data ?? []) as Proposal[]);
  }, []);
  useLive(["disaster_proposal"], load);

  const decide = async (p: Proposal, confirm: boolean) => {
    setBusy(p.id);
    try {
      const r = await cmd<{ changed: string[] }>(confirm ? "disaster_proposal_confirm" : "disaster_proposal_dismiss", { proposal: p.id });
      toast.success(confirm ? T.toastConfirm(r.changed.length) : T.toastDismiss);
      setRows((all) => all.filter((x) => x.id !== p.id));
    } catch (e) {
      toast.error(staffError((e as Error).message));
    } finally { setBusy(null); }
  };

  return rows.map((p) => (
    <section key={p.id} role="alert" aria-label={T.title} className="m-4 flex flex-col gap-3 rounded-xl border border-alert/40 bg-[oklch(0.98_0.015_25)] p-4 lg:mx-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="flex items-center gap-2 text-[15px] font-medium text-foreground"><Radio className="size-4 stroke-[1.5] text-alert" />{T.title}</span>
        <span className="num text-[12px] text-muted-foreground">{T.until(hhmm(p.expires_at))}</span>
      </div>
      <p className="text-[13px] leading-5">{T.lead}</p>
      <dl className="grid gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">{T.what(p.kind, p.severity)}</dt>
        <dd className="text-foreground">{T.stations(p.stations.length)}：{p.stations.map((s) => label[s] ?? s).join("・")}</dd>
        <dt className="text-muted-foreground">{T.notice}</dt>
        <dd className="text-foreground">{DISASTER_NOTICES[p.notice]?.title ?? p.notice}</dd>
      </dl>
      <p lang="ja" className="inset p-3 text-[13px] leading-6 text-foreground">{DISASTER_NOTICES[p.notice]?.text.ja}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy === p.id} onClick={() => decide(p, true)}>{T.confirm}</Button>
        <Button variant="ghost" disabled={busy === p.id} onClick={() => decide(p, false)}>{T.dismiss}</Button>
        <span className="text-[12px] text-muted-foreground">{T.source}</span>
      </div>
    </section>
  ));
}
