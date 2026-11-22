"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo, useState } from "react";
import Map, { Marker, NavigationControl, Popup } from "react-map-gl/maplibre";
import { Pill } from "@/components/charts";
import { STATIONS } from "@/content/catalogue";
import { cn } from "@/lib/utils";

export type MapStation = { id: string; label: string; lat: number; lng: number; state: "online" | "stale" | "never"; open: number };

// Free vector tiles from OpenFreeMap (OpenStreetMap data), rendered by MapLibre GL — both open source, no API key.
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE ?? "https://tiles.openfreemap.org/styles/positron";
const TONE = { online: "guided", stale: "alert", never: "neutral" } as const;
const DOT = { online: "bg-[oklch(0.62_0.13_155)]", stale: "bg-[oklch(0.6_0.19_27)]", never: "bg-[oklch(0.7_0_0)]" } as const;

export function StationMap({ stations }: { stations: MapStation[] }) {
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
          <Marker key={s.id} latitude={s.lat} longitude={s.lng} anchor="center" onClick={(e) => { e.originalEvent.stopPropagation(); setSel(s.id); }}>
            <button type="button" aria-label={s.label} className="relative grid place-items-center">
              {s.open > 0 && <span className="absolute size-9 animate-ping rounded-full bg-[oklch(0.78_0.13_80/0.35)]" />}
              <span className={cn("relative grid size-6 place-items-center rounded-full border-2 border-white shadow-md", DOT[s.state])}>
                {s.open > 0 && <span className="text-[10px] font-medium text-white">{s.open}</span>}
              </span>
            </button>
          </Marker>
        ))}
        {picked && (
          <Popup latitude={picked.lat} longitude={picked.lng} anchor="bottom" offset={18} onClose={() => setSel(null)} closeButton={false} className="[&_.maplibregl-popup-content]:rounded-lg [&_.maplibregl-popup-content]:p-3 [&_.maplibregl-popup-content]:shadow-md">
            <div className="flex flex-col gap-1.5 text-[13px]">
              <span className="text-foreground">{picked.label}</span>
              <span className="flex items-center gap-2"><span className="mono text-muted-foreground">{picked.id}</span><Pill tone={TONE[picked.state]}>{STATIONS[picked.state]}</Pill></span>
              {picked.open > 0 && <span className="text-[12px]">{STATIONS.openCases(picked.open)}</span>}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
