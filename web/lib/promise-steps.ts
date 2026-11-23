// Ichido Bot steps for timers on promises (web/workflows/case-bot.ts). A person, or a guard's own estimate, makes
// every promise; the bot only sleeps until it is due and expires it (public.ops_promise_expire). Same sandbox rule as
// lib/bot-steps.ts: server modules load inside the steps.
const lib = async () => {
  const [server, log] = await Promise.all([import("@/lib/server"), import("@/lib/log")]);
  return { ...server, ...log };
};

export type OpenPromise = { id: string; due: number };

export async function openPromises(incident: string): Promise<OpenPromise[]> {
  "use step";
  const { admin } = await lib();
  const { data, error } = await admin.from("promise").select("id, due_at").eq("incident", incident).is("settled_at", null);
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id as string, due: Date.parse(p.due_at) }));
}

export async function expirePromise(incident: string, id: string) {
  "use step";
  const t0 = performance.now();
  const { rpc, ship, entry } = await lib();
  const code = await rpc<string>("ops_promise_expire", { p_id: id });
  await (await import("@/lib/alerts")).flushAlerts();   // "promise due" to the owning operator (lib/alerts.ts)
  await ship([entry("info", "bot_step", { route: "workflow", step: "promise", incident, code, duration_ms: Math.round(performance.now() - t0) })]);
}
