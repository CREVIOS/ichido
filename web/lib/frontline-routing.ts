import { packOfFault } from "../content/catalogue.ts";

const PRESENCE_WAIT_MS = 2000;

export function serviceMatch(staff: { service_packs: string[]; service_languages: string[] }, fault: string, lang: string | null) {
  return Number(staff.service_packs.includes(packOfFault(fault))) * 2 + Number(lang !== null && staff.service_languages.includes(lang));
}

export function preferredDesk(staff: { uid: string; score: number }[], online: Set<string> | null) {
  const ready = staff.filter((s) => s.score > 0 && online?.has(s.uid));
  const best = Math.max(0, ...ready.map((s) => s.score));
  return new Set(ready.filter((s) => s.score === best).map((s) => s.uid));
}

// Operators shown online in the console (Supabase Realtime presence, keyed by uid); null when presence is unavailable.
let pending: Promise<Set<string> | null> | null = null;
export function onlineOperators(): Promise<Set<string> | null> {
  pending ??= readPresence().finally(() => { pending = null; });
  return pending;
}
async function readPresence(): Promise<Set<string> | null> {
  const { admin } = await import("./server");
  const ch = admin.channel("ichido:operator-presence", { config: { private: true } });
  try {
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), PRESENCE_WAIT_MS);
      ch.on("presence", { event: "sync" }, () => { clearTimeout(timer); resolve(new Set(Object.keys(ch.presenceState()))); });
      ch.subscribe((status) => { if (status !== "SUBSCRIBED") { clearTimeout(timer); resolve(null); } });
    });
  } finally {
    await admin.removeChannel(ch);
  }
}
