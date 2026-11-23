// Nearest working Help Points for a caller whose station is inside a disaster area. Pure, so tests import it.

export type Place = {
  id: string; lat: number | null; lng: number | null; kind: string; disaster: string | null;
  last_seen: string | null;   // latest device heartbeat; mobile branches have no device
};

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

// Great-circle distance in metres.
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// Working = outside every disaster area, with a location, and (for an ATM) a heartbeat within onlineWithinS.
export function nearestWorking(from: { lat: number; lng: number }, places: Place[], now: number, onlineWithinS: number, limit = 3) {
  return places
    .filter((p) => p.lat != null && p.lng != null && !p.disaster)
    .filter((p) => p.kind === "mobile_branch" || (p.last_seen != null && now - Date.parse(p.last_seen) <= onlineWithinS * 1000))
    .map((p) => ({ id: p.id, distance_m: metres(from, { lat: p.lat!, lng: p.lng! }) }))
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, limit);
}

// GSI designated evacuation sites (public.shelter_site) that support a hazard, nearest first. Designated, not
// necessarily open: whether a site is open is announced by the city and shelter staff.
export type ShelterSite = { id: string; name: string; lat: number; lng: number; hazards: string[] };
export function nearestShelters<T extends ShelterSite>(lat: number, lng: number, hazard: string, sites: T[], limit = 3) {
  return sites
    .filter((s) => s.hazards.includes(hazard))
    .map((s) => ({ ...s, distance_m: metres({ lat, lng }, s) }))
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, limit);
}
