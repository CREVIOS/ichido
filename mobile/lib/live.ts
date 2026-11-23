import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { sb } from "./supabase";

// Mirrors web/lib/live.ts: Realtime Broadcast first, a slow safety refresh while joined, fast polling only if a
// channel drops, bursts fetched once, and no work while the app is in the background.
const SAFETY_MS = 30_000;
const FALLBACK_MS = 5_000;
const COALESCE_MS = 80;
const LINGER_MS = 5_000;

// Private topics broadcast by the database (supabase/migrations/20261124010000_live_broadcast.sql): live:<table>
// for staff; a caller hears only their own case (live:incident:<id>) and station (live:station:<id>).
export type LiveScope = { incident?: string | null; station?: string | null };
const SCOPED: Record<string, keyof LiveScope> = { frontline_turn: "incident", caller_card: "incident", draft: "incident", reply: "incident", station: "station" };

function topics(tables: string[], scope?: LiveScope) {
  return [...new Set(tables.flatMap((t) => {
    const by = scope && SCOPED[t];
    if (!by) return [`live:${t}`];
    const id = scope[by];
    return id ? [`live:${by}:${id}`] : [];
  }))];
}

type Listener = { message?: (event: string, payload: Record<string, unknown>) => void; status?: (joined: boolean) => void };
type Entry = { ch?: RealtimeChannel; joined: boolean; listeners: Set<Listener>; idle?: ReturnType<typeof setTimeout> };
const open = new WeakMap<SupabaseClient, Map<string, Entry>>();

function join(client: SupabaseClient, topic: string, e: Entry) {
  const ch = client.channel(topic, { config: { private: true } });
  ch.on("broadcast", { event: "*" }, ({ event, payload }) => { for (const l of e.listeners) l.message?.(event, payload ?? {}); });
  e.ch = ch;
  const subscribe = () => {
    if (e.ch !== ch) return;  // left before the token came
    ch.subscribe((status) => {
      e.joined = status === "SUBSCRIBED";
      for (const l of e.listeners) l.status?.(e.joined);
    });
  };
  // A private join sent before the token has arrived is refused, so fetch it first. If that fails the join goes
  // ahead anyway: Realtime retries a refused join, with the token once there is one.
  void client.realtime.setAuth().then(subscribe, subscribe);
}

// Realtime keeps one channel per topic and client, so listeners share it.
export function listen(topic: string, l: Listener): () => void {
  const client = sb();
  let byTopic = open.get(client);
  if (!byTopic) open.set(client, (byTopic = new Map()));
  let e = byTopic.get(topic);
  if (!e) {
    e = { joined: false, listeners: new Set() };
    byTopic.set(topic, e);
    join(client, topic, e);
  }
  const entry = e, topicsOfClient = byTopic;
  clearTimeout(entry.idle);
  entry.listeners.add(l);
  l.status?.(entry.joined);
  return () => {
    entry.listeners.delete(l);
    if (entry.listeners.size) return;
    entry.idle = setTimeout(() => {
      const ch = entry.ch;
      entry.ch = undefined;
      entry.joined = false;
      // Rejoin only once the old channel has closed: until then Realtime would hand back the closing one.
      void (ch ? client.removeChannel(ch) : Promise.resolve()).then(() => {
        if (entry.listeners.size) join(client, topic, entry);
        else if (topicsOfClient.get(topic) === entry) topicsOfClient.delete(topic);
      });
    }, LINGER_MS);
  };
}

export function useLive(tables: string[], refetch: () => void, enabled = true, scope?: LiveScope) {
  const ref = useRef(refetch);
  useEffect(() => { ref.current = refetch; });
  const key = topics(tables, scope).join(",");
  useEffect(() => {
    if (!enabled) return;
    const active = () => AppState.currentState === "active";
    const now = () => { if (active()) ref.current(); };
    let burst: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (burst || !active()) return;
      burst = setTimeout(() => { burst = null; ref.current(); }, COALESCE_MS);
    };
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = (ms: number) => { if (timer) clearInterval(timer); timer = setInterval(now, ms); };
    now();
    const list = key ? key.split(",") : [];
    const joined = new Set<string>();
    let started = false;
    poll(list.length ? FALLBACK_MS : SAFETY_MS);
    const stops = list.map((topic) => listen(topic, {
      message: (event) => { if (event === "change") soon(); },
      status: (ok) => {
        const was = joined.size === list.length;
        if (ok) joined.add(topic); else joined.delete(topic);
        if (joined.size < list.length) poll(FALLBACK_MS);
        else if (!was) { poll(SAFETY_MS); if (started) now(); }
      },
    }));
    started = true;
    // Coming back to the app refreshes at once.
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") now(); });
    return () => {
      if (timer) clearInterval(timer);
      if (burst) clearTimeout(burst);
      sub.remove();
      for (const stop of stops) stop();
    };
  }, [key, enabled]);
}
