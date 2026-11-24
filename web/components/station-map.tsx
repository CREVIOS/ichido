"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Popup, Source } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import { Truck } from "lucide-react";
import { Pill } from "@/components/charts";
import { DISASTER_STAFF, STATIONS, type PackId } from "@/content/catalogue";
import { PACK_ICON } from "@/components/pack-icon";
import { cn } from "@/lib/utils";
import { MAP_STYLE } from "@/lib/map-style";

// MapLibre 6 looks for its worker next to its own chunk, which the bundler renames; point it at the emitted asset.
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

// disaster: inside a disaster area. mobile: a mobile branch (no Help Point device). selected: picked for a disaster area.
export type MapStation = {
  id: string; label: string; lat: number; lng: number; state: "online" | "stale" | "never"; open: number;
  disaster?: boolean; mobile?: boolean; selected?: boolean; pack?: PackId;   // pack: the station type, drawn as its icon
};

// Free vector tiles from OpenFreeMap (OpenStreetMap data), rendered by MapLibre GL — both open source, no API key.
const TONE = { online: "guided", stale: "alert", never: "neutral" } as const;
// Offline and never-connected (retired) Help Points are greyed; colour is kept for working and disaster states.
const DOT = { online: "bg-[oklch(0.62_0.13_155)]", stale: "bg-[oklch(0.78_0_0)] opacity-70", never: "bg-[oklch(0.78_0_0)] opacity-70" } as const;
const DISASTER_DOT = "bg-[oklch(0.55_0.2_27)] ring-4 ring-[oklch(0.6_0.2_27/0.25)]";
const MOBILE_DOT = "bg-[oklch(0.5_0.12_255)]";

// GSI designated evacuation sites (public.shelter_site), drawn as one native circle layer (hundreds of points).
export type MapShelter = { id: string; name: string; lat: number; lng: number; hazards: string[]; designated_shelter: boolean };
const SHELTER_COLOUR = "oklch(0.55 0.13 165)";
const SHELTER_LAYER = "shelter-sites";

// onToggle: clicking a marker adds or removes the station from the selection (disaster area); otherwise it opens a popup.
export function StationMap({ stations, onToggle, shelters }: { stations: MapStation[]; onToggle?: (id: string) => void; shelters?: MapShelter[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const [site, setSite] = useState<MapShelter | null>(null);
  const sites = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: (shelters ?? []).map((s) => ({ type: "Feature" as const, properties: { id: s.id }, geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] } })),
  }), [shelters]);
  const view = useMemo(() => {
    if (!stations.length) return { latitude: 32.75, longitude: 129.87, zoom: 11 };
    const lat = stations.reduce((a, s) => a + s.lat, 0) / stations.length;
    const lng = stations.reduce((a, s) => a + s.lng, 0) / stations.length;
    return { latitude: lat, longitude: lng, zoom: stations.length > 1 ? 11 : 14 };
  }, [stations]);
  const picked = stations.find((s) => s.id === sel);
  return (
    <div className="relative h-[340px] w-full overflow-hidden border-b">
      <Map initialViewState={view} mapStyle={MAP_STYLE} attributionControl={{ compact: true }} style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={shelters?.length ? [SHELTER_LAYER] : undefined}
        onClick={(e) => { const id = e.features?.[0]?.properties?.id; setSite(shelters?.find((s) => s.id === id) ?? null); }}>
        <NavigationControl position="top-right" showCompass={false} />
        {shelters?.length ? (
          <Source id={SHELTER_LAYER} type="geojson" data={sites} attribution={DISASTER_STAFF.shelterSource}>
            <Layer id={SHELTER_LAYER} type="circle" paint={{ "circle-radius": 4.5, "circle-color": SHELTER_COLOUR, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 }} />
          </Source>
        ) : null}
        {site && (
          <Popup latitude={site.lat} longitude={site.lng} anchor="bottom" offset={8} onClose={() => setSite(null)} closeButton={false} className="[&_.maplibregl-popup-content]:rounded-lg [&_.maplibregl-popup-content]:p-3 [&_.maplibregl-popup-content]:shadow-md">
            <div className="flex max-w-60 flex-col gap-1.5 text-[13px]">
              <span className="text-foreground">{site.name}</span>
              <span className="text-[12px]">{DISASTER_STAFF.shelterPopup(site.hazards.map((h) => DISASTER_STAFF.hazard[h] ?? h).join("・"))}</span>
              {site.designated_shelter && <Pill tone="guided" className="self-start">{DISASTER_STAFF.shelterStay}</Pill>}
              <span className="text-[12px] text-muted-foreground">{DISASTER_STAFF.shelterNote}</span>
            </div>
          </Popup>
        )}
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
      <div className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-4rem)] flex-wrap gap-x-3 gap-y-1 rounded-md bg-background/90 px-2.5 py-1.5 text-[12px] text-muted-foreground shadow-sm">
        {([["online", DOT.online], ["offline", DOT.stale], ["disaster", DISASTER_DOT], ["mobile", MOBILE_DOT]] as const).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", c)} />{DISASTER_STAFF.legend[k]}</span>
        ))}
        {shelters?.length ? <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: SHELTER_COLOUR }} />{DISASTER_STAFF.legend.shelter}</span> : null}
      </div>
    </div>
  );
}

function PackGlyph({ pack }: { pack: PackId }) {
  const Icon = PACK_ICON[pack];
  return <Icon className="size-3.5 stroke-[2] text-white" />;
}
