"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Clock, Cpu, Landmark, QrCode, RadioTower, Signal, TriangleAlert } from "lucide-react";
import { sb } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell } from "@/components/kit";
import { Pill, SegBar } from "@/components/charts";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DISASTER_STAFF, STATIONS, type L10n } from "@/content/catalogue";
import type { MapStation } from "@/components/station-map";
import { DisasterPanel } from "./disaster";

// MapLibre needs the browser; load it only there.
const StationMap = dynamic(() => import("@/components/station-map").then((m) => m.StationMap), { ssr: false, loading: () => <div className="h-[340px] border-b bg-secondary" /> });

type Station = { id: string; label: L10n; lat: number | null; lng: number | null; kind: string; disaster: string | null; disaster_since: string | null };
type Health = { station: string; last_seen: string; rssi: number; firmware: string; uptime_s: number };

// Signal strength as 0–6 bars: −50 dBm or better is full, −95 dBm or worse is empty.
const bars = (rssi: number) => Math.max(0, Math.min(6, Math.round(((rssi + 95) / 45) * 6)));

export default function StationsPage() {
  return <StaffGate allow={["operator", "manager"]} title={STATIONS.title}>{(me) => <Board me={me} />}</StaffGate>;
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function Board({ me }: { me: Me }) {
  const [stations, setStations] = useState<Station[]>([]);
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [open, setOpen] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const now = useNow(10_000);
  const load = useCallback(async () => {
    const db = sb();
    const [s, h, d] = await Promise.all([
      db.from("station").select("id, label, lat, lng, kind, disaster, disaster_since").order("id"),
      db.from("device_health").select("station, last_seen, rssi, firmware, uptime_s"),
      db.from("desk").select("station").is("finished_at", null),
    ]);
    setStations((s.data ?? []) as Station[]);
    setHealth(Object.fromEntries(((h.data ?? []) as Health[]).map((x) => [x.station, x])));
    setOpen(((d.data ?? []) as { station: string }[]).reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.station]: (acc[x.station] ?? 0) + 1 }), {}));
  }, []);
  useLive(["device_health", "desk", "station"], load);

  const H = STATIONS.head;
  const cols = [{ i: Landmark, l: H.station, w: "min-w-[360px] flex-[2]" }, { i: RadioTower, l: H.device, w: "w-[130px]" }, { i: Clock, l: H.seen, w: "w-[120px]" },
    { i: Signal, l: H.signal, w: "w-[190px] whitespace-nowrap" }, { i: Cpu, l: H.firmware, w: "w-[140px]" }, { i: TriangleAlert, l: H.open, w: "w-[100px]" }, { i: QrCode, l: H.sticker, w: "w-[140px]" }];

  return (
    <AppShell nav={navFor(me.role)} footer={<MeFooter me={me} />} title={STATIONS.title}>
      <p className="border-b px-5 py-3 text-[13px] text-muted-foreground lg:px-6">{STATIONS.lead}</p>
      <StationMap onToggle={toggle} stations={stations.filter((s) => s.lat != null && s.lng != null).map((s): MapStation => {
        const h = health[s.id];
        const age = h ? Math.round((now - Date.parse(h.last_seen)) / 1000) : null;
        return {
          id: s.id, label: s.label.ja, lat: s.lat!, lng: s.lng!, open: open[s.id] ?? 0, state: age == null ? "never" : age <= STATIONS.onlineWithinS ? "online" : "stale",
          disaster: Boolean(s.disaster), mobile: s.kind === "mobile_branch", selected: picked.includes(s.id),
        };
      })} />
      <DisasterPanel selected={picked} all={stations.map((s) => s.id)} onSelect={setPicked} label={Object.fromEntries(stations.map((s) => [s.id, s.label.ja]))} />
      <div className="overflow-x-auto">
        <div className="min-w-[1130px]">
          <div className="flex h-10 items-center border-b text-[13px] text-muted-foreground">
            {cols.map((c) => <span key={c.l} className={cn("flex h-full items-center gap-2 border-r px-4 whitespace-nowrap last:border-r-0", c.w)}><c.i className="size-3.5 stroke-[1.5]" />{c.l}</span>)}
          </div>
          {stations.length === 0 && <p className="p-8 text-center text-[14px] text-muted-foreground">{STATIONS.empty}</p>}
          {stations.map((s) => {
            const h = health[s.id];
            const age = h ? Math.max(0, Math.round((now - Date.parse(h.last_seen)) / 1000)) : null;
            const online = age != null && age <= STATIONS.onlineWithinS;
            return (
              <div key={s.id} className="flex h-12 items-center border-b text-[14px] hover:bg-accent/50">
                <span className={cn("flex h-full items-center gap-2.5 border-r px-4", cols[0].w)}>
                  <input type="checkbox" aria-label={`${DISASTER_STAFF.select}：${s.label.ja}`} checked={picked.includes(s.id)} onChange={() => toggle(s.id)} className="size-4 accent-foreground" />
                  <span className="mono grid size-5 place-items-center rounded-[5px] bg-secondary text-[9px] text-foreground">{s.id.slice(0, 2)}</span>
                  <span className="truncate text-foreground">{s.label.ja}</span><span className="mono text-muted-foreground">{s.id}</span>
                  {s.disaster && <Pill tone="alert" className="ml-auto">{DISASTER_STAFF.badge}{s.disaster_since && <span className="num ml-1 opacity-70">{DISASTER_STAFF.since(new Date(s.disaster_since).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }))}</span>}</Pill>}
                </span>
                <span className={cn("flex h-full items-center border-r px-4", cols[1].w)}>{s.kind === "mobile_branch"
                  ? <Pill tone="review">{DISASTER_STAFF.mobileBranch}</Pill>
                  : <Pill tone={!h ? "neutral" : online ? "guided" : "alert"}>{!h ? STATIONS.never : online ? STATIONS.online : STATIONS.stale}</Pill>}</span>
                <span className={cn("num flex h-full items-center border-r px-4 text-muted-foreground", cols[2].w)}>{age == null ? "—" : STATIONS.ago(age)}</span>
                <span className={cn("flex h-full items-center border-r px-4", cols[3].w)}>{h ? <SegBar value={bars(h.rssi)} label={STATIONS.dbm(h.rssi)} /> : "—"}</span>
                <span className={cn("mono flex h-full items-center border-r px-4", cols[4].w)}>{h?.firmware ?? "—"}</span>
                <span className={cn("num flex h-full items-center border-r px-4", cols[5].w)}>{open[s.id] ? <Pill tone="received">{open[s.id]}</Pill> : <span className="text-muted-foreground">0</span>}</span>
                <span className={cn("flex h-full items-center px-4", cols[6].w)}>
                  <Link href={`/stations/${encodeURIComponent(s.id)}/sticker`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}><QrCode className="stroke-[1.5]" />{STATIONS.openSticker}</Link>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
