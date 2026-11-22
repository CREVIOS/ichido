import "server-only";
import { after } from "next/server";
import { STATIONS, isDisasterNotice, packOfKind } from "@/content/catalogue";
import { admin, fail } from "@/lib/server";
import { entry, ship } from "@/lib/log";
import { nearestWorking, type Place } from "@/lib/nearest";
import { rpc, staffIn, type Body, type Command } from "@/lib/access";

// Disaster / outage mode. An operator or manager puts stations into a disaster area with one of the bank's
// approved notices; callers paired there see that notice and the nearest working Help Points (lib/nearest.ts).

const MAX_STATIONS = 500;

function stationList(b: Body): string[] {
  const s = b.stations;
  if (!Array.isArray(s) || !s.length || s.length > MAX_STATIONS || !s.every((x) => typeof x === "string" && x)) fail(400, "bad_request");
  return [...new Set(s as string[])];
}

async function setArea(who: ReturnType<typeof staffIn>, stations: string[], notice: string | null) {
  const changed = await rpc<string[]>("cmd_disaster", { p_uid: who.uid, p_name: who.name, p_stations: stations, p_notice: notice });
  const logged = changed.map((station) => entry("info", notice ? "disaster_entered" : "disaster_left", { route: "/api/cmd", role: who.role, station, code: notice ?? undefined }));
  after(() => ship(logged));
  return { changed };
}

export const disasterCommands: Record<string, Command> = {
  async disaster_set(a, b) {
    const who = staffIn(a, ["operator", "manager", "admin"]);
    if (!isDisasterNotice(b.notice)) fail(400, "bad_request");
    return setArea(who, stationList(b), b.notice as string);
  },

  async disaster_clear(a, b) {
    return setArea(staffIn(a, ["operator", "manager", "admin"]), stationList(b), null);
  },

  // Caller: the notice for their station, if it is in a disaster area, and where to go instead.
  async disaster_info(a) {
    if (a.kind !== "caller" || !a.incident) return fail(403, "forbidden");
    const { data: d } = await admin.from("desk").select("station").eq("id", a.incident).single();
    const { data: rows, error } = await admin.from("station").select("id, label, kind, lat, lng, disaster, counter_hours, device_health(last_seen)");
    if (error) throw error;
    const seen = (h: unknown) => ((Array.isArray(h) ? h[0] : h) as { last_seen?: string } | null)?.last_seen ?? null;
    const all = (rows ?? []).map((r) => ({ ...r, last_seen: seen(r.device_health) }));
    const here = all.find((r) => r.id === d?.station);
    if (!here?.disaster) return { notice: null, nearby: [] };
    const near = here.lat != null && here.lng != null ? nearestWorking({ lat: here.lat, lng: here.lng }, (all as Place[]).filter((r) => packOfKind(r.kind) === packOfKind(here.kind)), Date.now(), STATIONS.onlineWithinS) : [];
    const byId = new Map(all.map((r) => [r.id, r]));
    return {
      notice: here.disaster,
      nearby: near.map((n) => {
        const r = byId.get(n.id)!;
        return { id: r.id, label: r.label, kind: r.kind, hours: r.kind === "mobile_branch" ? r.counter_hours : null, distance_m: n.distance_m };
      }),
    };
  },
};
