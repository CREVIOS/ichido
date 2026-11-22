"use client";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Copy, Link2 } from "lucide-react";
import { cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { Chip, Panel } from "@/components/kit";
import { Pill } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { HANDOFF, PACKS, packOfFault, staffError } from "@/content/catalogue";

type Link = { id: string; recipient: string; created_at: string; expires_at: string; revoked_at: string | null; views: number };
const at = (t: string) => new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// Read-only links to this case's record for its pack's recipients (an ATM: the bank, the police, the security company).
export function HandoffPanel({ incident, fault }: { incident: string; fault: string }) {
  const RECIPIENTS = Object.keys(PACKS[packOfFault(fault)].recipients);
  const [state, setState] = useState<{ links: Link[]; now: number }>({ links: [], now: 0 });
  const load = useCallback(() => cmd<{ links: Link[] }>("handoff_list", { incident })
    .then((r) => setState({ links: r.links, now: Date.now() })).catch(() => setState({ links: [], now: Date.now() })), [incident]);
  const { links, now } = state;
  useLive(["case_event"], load);
  const fail = (e: Error) => toast.error(staffError(e.message));

  const create = (recipient: string) => cmd<{ path: string }>("handoff_create", { incident, recipient })
    .then(async (r) => {
      const url = `${location.origin}${r.path}`;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast.success(HANDOFF.copied, { description: url });
      load();
    }).catch(fail);
  const revoke = (id: string) => cmd("handoff_revoke", { id }).then(load).catch(fail);

  return (
    <Panel title={HANDOFF.title}>
      <p className="max-w-2xl text-[13px] leading-5">{HANDOFF.lead}</p>
      <div className="flex flex-wrap gap-2">
        {RECIPIENTS.map((r) => <Button key={r} variant="secondary" onClick={() => create(r)}><Link2 className="stroke-[1.5]" />{HANDOFF.create(HANDOFF.recipient[r])}</Button>)}
      </div>
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
