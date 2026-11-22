import { useEffect, useRef } from "react";
import { sb } from "./supabase";

// Mirrors web/lib/live.ts: refetch when any listed table changes (RLS decides what each user is told about),
// plus a 5-second refresh in case a change notification is missed.
export function useLive(tables: string[], refetch: () => void, enabled = true) {
  const ref = useRef(refetch);
  useEffect(() => { ref.current = refetch; });
  const key = tables.join(",");
  useEffect(() => {
    if (!enabled) return;
    const run = () => ref.current();
    run();
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
