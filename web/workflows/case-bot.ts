import { createHook, sleep } from "workflow";
import { begin, botToken, mark, observe, prepare, record, remind, route, type Signal } from "@/lib/bot-steps";
import { expirePromise, openPromises } from "@/lib/promise-steps";

// Ichido Bot: one durable run per case, from the fault until the case closes. It routes, prepares, reminds and
// records; a person claims, replies, dispatches and closes. Commands resume the run through its start hook
// (lib/bot.ts); each wake re-reads the case, so a lost signal only delays the bot until the next one or a timer.
export async function caseBot(incident: string) {
  "use workflow";
  const hook = createHook<Signal>({ token: botToken(incident) });   // the start hook: owned since start()
  const signals = hook[Symbol.asyncIterator]();
  let signal = signals.next();   // kept until it resolves, so no signal is lost to a timer winning the race

  await begin(incident);
  let routed = false;
  let claimed = false;
  let prepared: number | null = null;
  let reply: "open" | "scheduled" | "settled" = "open";
  let guardScheduled = 0;
  let guardSettled = 0;

  for (;;) {
    const s = await observe(incident);
    if (s.gone) return;
    if (s.closed) break;
    if (!routed && s.handler !== "ai") { await route(incident); routed = true; }
    if (s.claimed && !claimed) {
      claimed = true;
      await mark(incident, "claim", "done", null);
    }
    if (s.confirmedRev != null && s.confirmedRev !== prepared) {
      prepared = s.confirmedRev;
      await prepare(incident, prepared);
    }

    // Recheck DB-triggered transfers even when no client command wakes the hook.
    const dues: number[] = s.handler === "ai" ? [s.now + 90_000] : [];
    if (reply !== "settled" && s.replyDue != null) {
      if (s.replied) {
        reply = "settled";
        await mark(incident, "remind_reply", "skipped", "replied");
      } else if (s.now >= s.replyDue) {
        reply = "settled";
        await remind(incident, "no_reply", null);
      } else {
        if (reply === "open") await mark(incident, "remind_reply", "waiting", null, s.replyDue);
        reply = "scheduled";
        dues.push(s.replyDue);
      }
    }
    const job = s.job;
    if (job && job.generation !== guardSettled && job.due != null) {
      if (job.state !== "requested") {
        guardSettled = job.generation;
        await mark(incident, "remind_guard", "skipped", "moved");
      } else if (s.now >= job.due) {
        guardSettled = job.generation;
        await remind(incident, "guard_late", job.generation);
      } else {
        if (guardScheduled !== job.generation) await mark(incident, "remind_guard", "waiting", null, job.due);
        guardScheduled = job.generation;
        dues.push(job.due);
      }
    }

    // Promises (a call-back, a re-check, the guard's estimate, arrived without done): expire once due.
    for (const p of await openPromises(incident)) {
      if (s.now >= p.due) await expirePromise(incident, p.id);
      else dues.push(p.due);
    }

    const next = signal.then(() => true);
    const wake = dues.length ? Math.min(...dues) : null;
    const woke = wake == null ? await next : await Promise.race([next, sleep(new Date(wake)).then(() => false)]);
    if (woke) signal = signals.next();
  }
  await record(incident);
}
