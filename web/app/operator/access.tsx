"use client";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { EarOff, MonitorSmartphone } from "lucide-react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { Chip, Notice, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { ACCESS_STAFF, DESK, STATIONS, staffError } from "@/content/catalogue";
import { useCountdown } from "./actions";

// 文字対応: the caller pressed "I can't hear / I can't speak". Shown in the queue and over the case.
export const TextOnlyBadge = () => (
  <span className="inline-flex h-5 items-center gap-1 rounded-[5px] bg-[oklch(0.95_0.05_295)] px-1.5 text-[12px] font-medium text-[oklch(0.42_0.15_295)]">
    <EarOff className="size-3 stroke-[1.75]" />{ACCESS_STAFF.badge}
  </span>
);

export function TextOnlyBanner() {
  return (
    <div role="status" className="flex gap-3 rounded-xl border border-[oklch(0.85_0.07_295)] bg-[oklch(0.97_0.025_295)] p-4 text-[oklch(0.35_0.12_295)]">
      <EarOff className="mt-0.5 size-5 shrink-0 stroke-[1.5]" />
      <span className="flex flex-col gap-1">
        <span className="text-[15px] font-medium">{ACCESS_STAFF.bannerTitle}</span>
        <span className="text-[14px] leading-6">{ACCESS_STAFF.banner}</span>
      </span>
    </div>
  );
}

// Pairing without a voice: the code goes to the Help Point display, never read aloud.
export function DeviceCodeCard({ incident, station }: { incident: string; station: string }) {
  const [until, setUntil] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const left = useCountdown(until);
  const load = useCallback(async () => {
    const { data } = await sb().from("device_health").select("last_seen").eq("station", station).maybeSingle();
    setOnline(Boolean(data && Date.now() - Date.parse(data.last_seen) <= STATIONS.onlineWithinS * 1000));
  }, [station]);
  useLive(["device_health"], load);
  const show = () => cmd<{ expires_in: number }>("show_code_on_device", { incident })
    .then((r) => { setUntil(Date.now() + r.expires_in * 1000); toast.success(ACCESS_STAFF.shown); })
    .catch((e: Error) => toast.error(staffError(e.message)));
  const live = until && left > 0;
  return (
    <Panel title={ACCESS_STAFF.title} action={<Chip>{DESK.pair.validity}</Chip>}>
      <p className="text-[14px] leading-6">{ACCESS_STAFF.body}</p>
      {online === false && <Notice tone="warn">{ACCESS_STAFF.offline}</Notice>}
      {live && <span className="num text-[13px] text-foreground">{ACCESS_STAFF.showing(left)}</span>}
      <Button variant={live ? "secondary" : "default"} onClick={show}><MonitorSmartphone className="stroke-[1.5]" />{live ? ACCESS_STAFF.reshow : ACCESS_STAFF.show}</Button>
    </Panel>
  );
}
