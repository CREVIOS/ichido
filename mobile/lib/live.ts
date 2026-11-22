import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { sb } from "./supabase";

// Mirrors web/lib/live.ts: Realtime first, a slow safety refresh while joined, fast polling only if the
// channel drops, bursts fetched once, and no work while the app is in the background.
const SAFETY_MS = 30_000;
const FALLBACK_MS = 5_000;
const COALESCE_MS = 80;

export function useLive(tables: string[], refetch: () => void, enabled = true) {
  const ref = useRef(refetch);
  useEffect(() => { ref.current = refetch; });
  const key = tables.join(",");
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
    const ch = sb().channel(`live-${key}-${Math.random().toString(36).slice(2)}`);
    // Inserts and updates only: the publication carries no deletes (see migration).
    for (const table of key.split(",")) {
      ch.on("postgres_changes", { event: "INSERT", schema: "public", table }, soon);
      ch.on("postgres_changes", { event: "UPDATE", schema: "public", table }, soon);
    }
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") { poll(SAFETY_MS); now(); }
      else poll(FALLBACK_MS);
    });
    poll(FALLBACK_MS);
    // Coming back to the app refreshes at once.
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") now(); });
    return () => {
      if (timer) clearInterval(timer);
      if (burst) clearTimeout(burst);
      sub.remove();
      sb().removeChannel(ch);
    };
  }, [key, enabled]);
}
