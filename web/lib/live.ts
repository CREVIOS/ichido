"use client";
import { useEffect, useRef } from "react";
import { sb } from "./supabase";

// Refetch when any listed table changes (RLS decides what each user is told about),
// plus a 5-second refresh in case a change notification is missed.
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
    const run = () => refresh.current?.();
    const ch = sb().channel(`live-${key}-${Math.random().toString(36).slice(2)}`);
    // Inserts and updates only: the publication carries no deletes (see migration).
    for (const table of key.split(",")) {
      ch.on("postgres_changes", { event: "INSERT", schema: "public", table }, run);
      ch.on("postgres_changes", { event: "UPDATE", schema: "public", table }, run);
    }
    ch.subscribe();
    const timer = setInterval(run, 5000);
    return () => { clearInterval(timer); sb().removeChannel(ch); };
  }, [key, enabled]);
}
