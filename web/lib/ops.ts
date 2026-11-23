import "server-only";
import { OPERATOR_PROMISES, PROMISE_MINUTES } from "@/content/catalogue";
import { createHandoff } from "@/lib/handoff";
import { fail, priv, rpc, type Actor } from "@/lib/server";

// Operator commands for the real-world paths in content/ops.ts: fraud mode, the mass-incident broadcast, promises,
// the harassment flag and takeover. Each is one SQL function (supabase/migrations/20261123130000_ops.sql) that checks
// its own preconditions; these handlers check the role and the input first. Only a person reaches them.

type Body = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (b: Body, k: string) => (typeof b[k] === "string" && UUID.test(b[k] as string) ? (b[k] as string) : fail(400, "bad_request"));

function operator(a: Actor) {
  if (a.kind !== "staff" || a.role !== "operator") fail(403, "forbidden");
  return a as Extract<Actor, { kind: "staff" }>;
}

// One promise "minute" in milliseconds. Tests run the server with PROMISE_MINUTE_S=1 so timers fire in seconds.
const minuteMs = () => {
  const s = Number(process.env.PROMISE_MINUTE_S ?? 60);
  return (s > 0 ? s : 60) * 1000;
};
const dueIn = (minutes: number) => new Date(Date.now() + minutes * minuteMs()).toISOString();

export const OPS_COMMANDS: Record<string, (a: Actor, b: Body) => Promise<object>> = {
  // 特殊詐欺の疑い: warning on the caller's phone, red light, guard through the control centre, police hand-off record.
  async fraud(a, b) {
    const op = operator(a);
    const incident = id(b, "incident");
    await rpc("cmd_fraud", { p_uid: op.uid, p_name: op.name, p_incident: incident, p_assignee: id(b, "assignee") });
    return { police: await createHandoff(incident, "police", op) };
  },

  async broadcast(a, b) {
    const op = operator(a);
    return { sent: await rpc<number>("cmd_broadcast", { p_uid: op.uid, p_name: op.name, p_mass: id(b, "mass") }) };
  },

  async promise(a, b) {
    const op = operator(a);
    const kind = b.kind as (typeof OPERATOR_PROMISES)[number];
    const minutes = Number(b.minutes);
    if (!OPERATOR_PROMISES.includes(kind) || !PROMISE_MINUTES.includes(minutes)) fail(400, "bad_request");
    return {
      id: await rpc<string>("cmd_promise", {
        p_uid: op.uid, p_name: op.name, p_incident: id(b, "incident"), p_kind: kind, p_minutes: minutes, p_due: dueIn(minutes),
      }),
    };
  },

  async promise_done(a, b) {
    const op = operator(a);
    await rpc("cmd_promise_done", { p_uid: op.uid, p_name: op.name, p_promise: id(b, "id") });
    return {};
  },

  async abusive(a, b) {
    const op = operator(a);
    await rpc("cmd_abusive", { p_uid: op.uid, p_name: op.name, p_incident: id(b, "incident") });
    return {};
  },

  async takeover(a, b) {
    const op = operator(a);
    await rpc("frontline_takeover", { p_epoch: Number.isInteger(b.epoch) ? b.epoch : null, p_uid: op.uid, p_name: op.name, p_incident: id(b, "incident") });
    return {};
  },
};

// After a guard's update: their own estimate (upper bound) becomes a timed promise, and "arrived" opens one for
// "done" (ichido.ops_setting arrived_open_s). Called after cmd_field succeeded.
export async function fieldPromise(incident: string, generation: number, state: string, eta: string | null) {
  let minutes: number | null = null;
  if (state === "on_way" && eta) minutes = Number(eta.split("-")[1]) || null;
  if (state === "arrived") {
    const { data, error } = await priv().from("ops_setting").select("value").eq("key", "arrived_open_s").single();
    if (error) throw error;
    minutes = data.value / 60;
  }
  await rpc("ops_field_promise", { p_incident: incident, p_generation: generation, p_state: state, p_due: minutes ? dueIn(minutes) : null });
}
