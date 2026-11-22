"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo, useState } from "react";
import Map, { Marker, NavigationControl, Popup } from "react-map-gl/maplibre";
import { Truck } from "lucide-react";
import { Pill } from "@/components/charts";
import { DISASTER_STAFF, STATIONS, type PackId } from "@/content/catalogue";
import { PACK_ICON } from "@/components/pack-icon";
import { cn } from "@/lib/utils";

// disaster: inside a disaster area. mobile: a mobile branch (no Help Point device). selected: picked for a disaster area.
export type MapStation = {
  id: string; label: string; lat: number; lng: number; state: "online" | "stale" | "never"; open: number;
  disaster?: boolean; mobile?: boolean; selected?: boolean; pack?: PackId;   // pack: the station type, drawn as its icon
};

// Free vector tiles from OpenFreeMap (OpenStreetMap data), rendered by MapLibre GL — both open source, no API key.
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE ?? "https://tiles.openfreemap.org/styles/positron";
const TONE = { online: "guided", stale: "alert", never: "neutral" } as const;
// Offline and never-connected (retired) Help Points are greyed; colour is kept for working and disaster states.
const DOT = { online: "bg-[oklch(0.62_0.13_155)]", stale: "bg-[oklch(0.78_0_0)] opacity-70", never: "bg-[oklch(0.78_0_0)] opacity-70" } as const;
const DISASTER_DOT = "bg-[oklch(0.55_0.2_27)] ring-4 ring-[oklch(0.6_0.2_27/0.25)]";
const MOBILE_DOT = "bg-[oklch(0.5_0.12_255)]";

// onToggle: clicking a marker adds or removes the station from the selection (disaster area); otherwise it opens a popup.
export function StationMap({ stations, onToggle }: { stations: MapStation[]; onToggle?: (id: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const view = useMemo(() => {
    if (!stations.length) return { latitude: 32.75, longitude: 129.87, zoom: 11 };
    const lat = stations.reduce((a, s) => a + s.lat, 0) / stations.length;
    const lng = stations.reduce((a, s) => a + s.lng, 0) / stations.length;
    return { latitude: lat, longitude: lng, zoom: stations.length > 1 ? 11 : 14 };
  }, [stations]);
  const picked = stations.find((s) => s.id === sel);
  return (
    <div className="relative h-[340px] w-full overflow-hidden border-b">
      <Map initialViewState={view} mapStyle={STYLE} attributionControl={{ compact: true }} style={{ width: "100%", height: "100%" }}>
        <NavigationControl position="top-right" showCompass={false} />
        {stations.map((s) => (
          <Marker key={s.id} latitude={s.lat} longitude={s.lng} anchor="center" onClick={(e) => { e.originalEvent.stopPropagation(); setSel(s.id); onToggle?.(s.id); }}>
            <button type="button" aria-label={s.label} aria-pressed={onToggle ? Boolean(s.selected) : undefined} className="relative grid place-items-center">
              {s.open > 0 && <span className="absolute size-9 animate-ping rounded-full bg-[oklch(0.78_0.13_80/0.35)]" />}
              {s.selected && <span className="absolute size-10 rounded-full border-2 border-dashed border-foreground" />}
              <span className={cn("relative grid size-6 place-items-center rounded-full border-2 border-white shadow-md", s.disaster ? DISASTER_DOT : s.mobile ? MOBILE_DOT : DOT[s.state])}>
                {s.mobile ? <Truck className="size-3.5 stroke-[2] text-white" /> : s.open > 0 ? <span className="text-[10px] font-medium text-white">{s.open}</span> : s.pack && s.pack !== "atm" && <PackGlyph pack={s.pack} />}
              </span>
            </button>
          </Marker>
        ))}
        {picked && (
          <Popup latitude={picked.lat} longitude={picked.lng} anchor="bottom" offset={18} onClose={() => setSel(null)} closeButton={false} className="[&_.maplibregl-popup-content]:rounded-lg [&_.maplibregl-popup-content]:p-3 [&_.maplibregl-popup-content]:shadow-md">
            <div className="flex flex-col gap-1.5 text-[13px]">
              <span className="text-foreground">{picked.label}</span>
              <span className="flex items-center gap-2"><span className="mono text-muted-foreground">{picked.id}</span>
                {picked.mobile ? <Pill tone="review">{DISASTER_STAFF.mobileBranch}</Pill> : <Pill tone={TONE[picked.state]}>{STATIONS[picked.state]}</Pill>}
                {picked.disaster && <Pill tone="alert">{DISASTER_STAFF.badge}</Pill>}</span>
              {picked.open > 0 && <span className="text-[12px]">{STATIONS.openCases(picked.open)}</span>}
            </div>
          </Popup>
        )}
      </Map>
      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-3 rounded-md bg-background/90 px-2.5 py-1.5 text-[12px] text-muted-foreground shadow-sm">
        {([["online", DOT.online], ["offline", DOT.stale], ["disaster", DISASTER_DOT], ["mobile", MOBILE_DOT]] as const).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", c)} />{DISASTER_STAFF.legend[k]}</span>
        ))}
      </div>
    </div>
  );
}

function PackGlyph({ pack }: { pack: PackId }) {
  const Icon = PACK_ICON[pack];
  return <Icon className="size-3.5 stroke-[2] text-white" />;
}
