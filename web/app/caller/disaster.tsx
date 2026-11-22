"use client";
import { useCallback, useRef, useState } from "react";
import { MapPin, Truck, TriangleAlert } from "lucide-react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { DISASTER, DISASTER_NOTICES, km, pick, type L10n, type Lang } from "@/content/catalogue";

type Nearby = { id: string; label: L10n; kind: string; hours: L10n | null; distance_m: number };
type Info = { notice: string | null; nearby: Nearby[] };

// The bank's approved emergency notice while this caller's station is in a disaster area, and where to go instead.
// The station row (readable by its paired caller) says whether; the server works out the nearest working Help Points,
// asked again when the notice changes and at most once a minute (device health moves slowly).
export function DisasterNotice({ station, lang }: { station: string; lang: Lang }) {
  const [info, setInfo] = useState<Info | null>(null);
  const asked = useRef<string | null>(null);
  const load = useCallback(async () => {
    const { data } = await sb().from("station").select("disaster").eq("id", station).maybeSingle();
    const key = (data?.disaster as string | null) ?? null;
    const stamp = key && `${key}:${Math.floor(Date.now() / 60_000)}`;
    if (stamp === asked.current) return;
    asked.current = stamp;
    setInfo(key ? await cmd<Info>("disaster_info").catch(() => null) : null);
  }, [station]);
  useLive(["station"], load);
  const notice = info?.notice ? DISASTER_NOTICES[info.notice] : undefined;
  if (!info || !notice) return null;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[oklch(0.85_0.08_25)] bg-[oklch(0.98_0.02_25)] p-4" role="alert">
      <span className="flex items-center gap-2 text-[17px] text-foreground"><TriangleAlert className="size-5 shrink-0 stroke-[1.5] text-alert" />{DISASTER.title[lang]}</span>
      <p className="text-[15px] leading-6 text-foreground">{notice.text[lang]}</p>
      <span className="pt-1 text-[13px] text-muted-foreground">{DISASTER.nearby[lang]}</span>
      {info.nearby.length ? (
        <ul className="flex flex-col gap-1.5">
          {info.nearby.map((n) => {
            const Icon = n.kind === "mobile_branch" ? Truck : MapPin;
            return (
              <li key={n.id} className="surface flex items-start gap-2.5 p-3">
                <Icon className="mt-0.5 size-4 shrink-0 stroke-[1.5]" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] text-foreground">{pick(n.label, lang)}</span>
                  {n.kind === "mobile_branch" && <span className="text-[13px]">{DISASTER.mobileBranch[lang]}{n.hours ? ` · ${pick(n.hours, lang)}` : ""}</span>}
                </span>
                <span className="num shrink-0 text-[13px] text-muted-foreground">{km(n.distance_m)}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-[14px]">{DISASTER.none[lang]}</p>}
    </section>
  );
}
