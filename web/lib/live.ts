"use client";
import { useEffect, useRef } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { sb } from "./supabase";

// While every Realtime channel is joined, changes arrive as they happen and the safety refresh is slow;
// if one drops, fall back to frequent polling until it rejoins.
const SAFETY_MS = 30_000;
const FALLBACK_MS = 5_000;
// Changes often arrive in bursts (one command writes several rows): wait a moment and fetch once.
const COALESCE_MS = 80;
// A channel nobody listens to any more is left after this, so remounts and moving between screens keep it joined.
const LINGER_MS = 5_000;

// The database broadcasts on private topics (supabase/migrations/20261124010000_live_broadcast.sql): live:<table>
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
  // A private join sent before the token has arrived is refused, so fetch it first (staffToken caches it). If that
  // fails the join goes ahead anyway: Realtime retries a refused join, with the token once there is one.
  void client.realtime.setAuth().then(subscribe, subscribe);
}

// Listen on a private topic. Realtime keeps one channel per topic and client, so listeners share it.
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

// Refetch when any listed table changes (RLS decides what each user then reads). A caller passes `scope` with
// their case and station; tables of theirs without an id yet are not listened to.
// Hidden tabs do no work; coming back, regaining focus or going online refreshes at once.
export function useLive(tables: string[], refetch: (signal: AbortSignal) => void | Promise<void>, enabled = true, scope?: LiveScope) {
  const refresh = useRef<() => void>(null);
  const key = topics(tables, scope).join(",");
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let running = false;
    let pending = false;
    async function run() {
      pending = true;
      if (running) return;
      running = true;
      try {
        while (pending && !controller.signal.aborted) {
          pending = false;
          await refetch(controller.signal);
        }
      } finally {
        running = false;
      }
    }
    refresh.current = run;
    void run();
    return () => { controller.abort(); refresh.current = null; };
  }, [enabled, refetch, key]);
  useEffect(() => {
    if (!enabled) return;
    let burst: ReturnType<typeof setTimeout> | null = null;
    const visible = () => document.visibilityState === "visible";
    const now = () => { if (visible()) refresh.current?.(); };
    const soon = () => {
      if (burst || !visible()) return;
      burst = setTimeout(() => { burst = null; refresh.current?.(); }, COALESCE_MS);
    };
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = (ms: number) => { if (timer) clearInterval(timer); timer = setInterval(now, ms); };
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
        else if (!was) { poll(SAFETY_MS); if (started) now(); }  // catch anything missed while joining
      },
    }));
    started = true;
    const onVisible = () => { if (visible()) now(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", now);
    return () => {
      if (timer) clearInterval(timer);
      if (burst) clearTimeout(burst);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", now);
      for (const stop of stops) stop();
    };
  }, [key, enabled]);
}
