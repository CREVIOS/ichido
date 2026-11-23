"use client";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { Pill } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { packOfKind, DISASTER_NOTICES, OPS, DISASTER_STAFF as T, staffError } from "@/content/catalogue";

type Event = { id: number; station: string; kind: "entered" | "left"; notice: string; actor_name: string; at: string };
const NOTICES = Object.keys(DISASTER_NOTICES);
const HISTORY = 6;
const time = (t: string) => new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// Disaster / outage mode: pick stations (map or list), pick one of the bank's approved notices, set or clear.
export function DisasterPanel({ selected, all, onSelect, label }: {
  selected: string[]; all: { id: string; kind: string }[]; onSelect: (ids: string[]) => void; label: Record<string, string>;
}) {
  const eligible = all.filter((s) => packOfKind(s.kind) === "atm" && selected.includes(s.id));
  const [callers,setCallers] = useState<number | null>(null);
  const [notice, setNotice] = useState(NOTICES[0]);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const load = useCallback(async () => {
    const result = await sb().rpc("disaster_preview",{ p_stations:selected });
    setCallers(result.error ? null : result.data);
    const { data } = await sb().from("disaster_event").select("*").order("id", { ascending: false }).limit(HISTORY);
    setEvents((data ?? []) as Event[]);
  }, [selected]);
  useLive(["disaster_event","case_event","desk"], load);

  const apply = async (name: "disaster_set" | "disaster_clear") => {
    setBusy(true);
    try {
      const r = await cmd<{ changed: string[] }>(name, { stations: name === "disaster_set" ? eligible.map((s) => s.id) : selected, notice });
      toast.success((name === "disaster_set" ? T.toastSet : T.toastClear)(r.changed.length));
      onSelect([]);
    } catch (e) {
      toast.error(staffError((e as Error).message));
    } finally { setBusy(false); }
  };

  return (
    <section className="flex flex-col gap-4 border-b px-5 py-4 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-1">
          <span className="flex items-center gap-2 text-[15px] text-foreground"><ShieldAlert className="size-4 stroke-[1.5]" />{T.title}</span>
          <p className="text-[13px] leading-5 text-muted-foreground">{T.lead}</p>
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          <span className="num text-foreground">{T.selected(eligible.length)} · {callers != null && OPS.mass.preview(callers,[...new Set(eligible.map((s) => s.kind))])}</span>
          <Button variant="ghost" size="sm" onClick={() => onSelect(all.filter((s) => packOfKind(s.kind) === "atm").map((s) => s.id))}>{T.selectAll}</Button>
          <Button variant="ghost" size="sm" disabled={!selected.length} onClick={() => onSelect([])}>{T.unselect}</Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <span className="label">{T.notice}</span>
          <Select value={notice} onValueChange={(v) => setNotice(String(v ?? NOTICES[0]))}>
            <SelectTrigger className="h-10 w-full bg-card"><SelectValue>{(v: string) => DISASTER_NOTICES[v]?.title}</SelectValue></SelectTrigger>
            <SelectContent>{NOTICES.map((k) => <SelectItem key={k} value={k}>{DISASTER_NOTICES[k].title}</SelectItem>)}</SelectContent>
          </Select>
          <span className="label pt-1">{T.preview}</span>
          <p lang="ja" className="inset p-3 text-[13px] leading-6 text-foreground">{DISASTER_NOTICES[notice].text.ja}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button disabled={busy || callers == null || !eligible.length} onClick={() => apply("disaster_set")}>{T.set}</Button>
            <Button variant="secondary" disabled={busy || !selected.length} onClick={() => apply("disaster_clear")}>{T.clear}</Button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="label">{T.history}</span>
          <ol className="flex flex-col gap-1.5">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="num w-24 shrink-0 text-muted-foreground">{time(e.at)}</span>
                <Pill tone={e.kind === "entered" ? "alert" : "neutral"}>{e.kind === "entered" ? T.entered : T.left}</Pill>
                <span className="text-foreground">{label[e.station] ?? e.station}</span>
                <span className="text-muted-foreground">{DISASTER_NOTICES[e.notice]?.title ?? e.notice} · {e.actor_name}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
