"use client";
import { useEffect, useRef } from "react";
import { sb } from "./supabase";

// While the Realtime channel is joined, changes arrive as they happen and the safety refresh is slow;
// if the channel drops, fall back to frequent polling until it rejoins.
const SAFETY_MS = 30_000;
const FALLBACK_MS = 5_000;
// Changes often arrive in bursts (one command writes several rows): wait a moment and fetch once.
const COALESCE_MS = 80;

// Refetch when any listed table changes (RLS decides what each user is told about).
// Hidden tabs do no work; coming back, regaining focus or going online refreshes at once.
export function useLive(tables: string[], refetch: (signal: AbortSignal) => void | Promise<void>, enabled = true) {
  const refresh = useRef<() => void>(null);
  const key = tables.join(",");
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
    const ch = sb().channel(`live-${key}-${Math.random().toString(36).slice(2)}`);
    // Inserts and updates only: the publication carries no deletes (see migration).
    for (const table of key.split(",")) {
      ch.on("postgres_changes", { event: "INSERT", schema: "public", table }, soon);
      ch.on("postgres_changes", { event: "UPDATE", schema: "public", table }, soon);
    }
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") { poll(SAFETY_MS); now(); }  // catch anything missed while joining
      else poll(FALLBACK_MS);
    });
    poll(FALLBACK_MS);
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
      sb().removeChannel(ch);
    };
  }, [key, enabled]);
}
