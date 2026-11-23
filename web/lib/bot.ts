import "server-only";
import { resumeHook, start } from "workflow/api";
import { HookConflictError, HookNotFoundError } from "workflow/errors";
import { caseBot } from "@/workflows/case-bot";
import { botToken } from "@/lib/bot-steps";
import { entry, errorFields, ship } from "@/lib/log";

// Start a case's Ichido Bot run (once: the start hook's token is the case id) and wake it on case events.
// Neither ever fails the request that called it: the case works without the bot, which only advises.

export async function startBot(incident: string) {
  try {
    const run = await start(caseBot, [incident], { experimental_hook: { token: botToken(incident) } });
    await ship([entry("info", "bot_start", { incident, run_id: run.runId, code: "started" })]);
  } catch (e) {
    if (HookConflictError.is(e)) return;   // this case already has its run
    await ship([entry("error", "bot_start", { incident, code: "start_failed", ...errorFields(e) })]);
  }
}

// Commands after which the bot re-reads the case.
export const BOT_SIGNALS = new Set(["resolve_info", "human", "takeover", "frontline_turn", "claim", "confirm", "send", "assign", "field", "outcome", "abandon", "reset_caller", "fraud", "promise"]);

export async function signalBot(incident: string, cmd: string) {
  try {
    await resumeHook(botToken(incident), { cmd });
  } catch (e) {
    // No run: the case predates the bot, or its run has already finished.
    if (HookNotFoundError.is(e)) return void (await ship([entry("info", "bot_signal", { incident, cmd, code: "no_run" })]));
    await ship([entry("error", "bot_signal", { incident, cmd, code: "signal_failed", ...errorFields(e) })]);
  }
}
