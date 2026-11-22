# Ichido 一度 — say it once

When an ATM keeps your card, the monitoring centre already knows the machine failed. What it does not get is **your** story in words it can use, and what you do not get is any idea of what happens next. For an elderly caller, or a foreign worker still learning Japanese, that gap is wider at every hand-off.

Ichido joins three things into one case, in the caller's language:

1. **The machine's alert** — an ESP32 "Help Point" prop (or an on-screen action) reports the fault.
2. **The caller's own words** — in Bengali, English or easy Japanese, typed or spoken to a LiveKit voice agent. The assistant reads back what it understood; the caller corrects it and confirms.
3. **The operator's decision** — chosen from the bank's approved replies, dispatched to a security guard, and returned to the caller as their real options (wait, with the guard's own estimate, or leave and be contacted). The caller then says the next step in their own words before the case closes.

Built for the TSUNAGU hackathon (theme: *update the way we connect*). The bank, ATM, security company and all data are **fictional**.

## Screens

| Route | Who | What |
|---|---|---|
| `/` | everyone | Overview and links |
| `/operator` | monitoring-centre operator | Queue, machine state, caller's original words beside the facts they confirmed, timeline, approved replies, pairing code, dispatch |
| `/s/[station]` | caller | Neutral page behind the Help Point sticker: language choice and the operator's single-use code |
| `/caller` | caller | AI notice, voice or typed intake, read-back and correction, the operator's reply, wait/leave, teach-back |
| `/field` | security guard | Only their own assignments; on the way (with their own estimate), arrived, done |
| `/insights` | operator, manager | Case funnel, cases per day, busiest hours, languages, median time to first reply — counts only |

## How it works

```
ESP32 Help Point ──HTTPS──▶ /api/device ─┐
Operator (browser) ───────▶ /api/cmd ────┼──▶ Supabase Postgres (RLS) ──Realtime──▶ every screen
Caller phone ─────────────▶ /api/cmd ────┘            ▲
     │ WebRTC                                        │ draft (structured facts)
     ▼                                               │
LiveKit room ◀── agent/app.py (Google STT, Azure TTS; no conversational LLM)
```

- **Next.js 16** app (`web/`), one route per role. All writes go through `/api/cmd`, which derives the actor from the bearer token and never trusts role or case ids in the body.
- **Supabase**: Postgres with row-level security on every table, Auth (staff accounts, anonymous callers), Realtime (inserts and updates only). Every state change is a SQL function (`supabase/migrations/*_commands.sql`) that checks its preconditions in the same transaction, so two operators cannot both claim a case and a replaced guard cannot update a job. `insights()` returns counts only.
- **LiveKit Agents** (`agent/`): speech in, text out. The agent transcribes and speaks only the read-back the caller's own client asks for. It never decides anything and never asks for numbers.
- **ESP32 firmware** (`firmware/help_point/`): debounced button, idempotent event ids, polled status light, offline indication.
- **Content** (`web/content/catalogue.ts`): every user-visible string, fault type, reply and timeline sentence, in Japanese, Bengali and English. The database holds codes and data only.

## Rules the product keeps

- **The bank's words, not the model's.** Callers receive approved replies only; branch names and hours come from the station record.
- **The check happens on the caller's side.** A Japanese operator cannot check Bengali, so the caller confirms or corrects the read-back; the operator always sees the original words.
- **Never asks for a PIN, card, account or ID number.** Text that looks like a number is withheld before it leaves the server.
- **No card handback, ID check or "collect your card" signal** anywhere. What happens to a held card is the bank's procedure.
- **A caller reaches a case only with the operator's single-use, five-minute code.** Scanning the sticker alone reveals nothing; guesses are rate-limited. If a caller loses their phone, the operator resets the connection and issues a new code, or closes the case.
- **The operator never sees the caller's draft**, only what the caller confirmed. A teach-back in another language is shown with a labelled machine translation, or flagged for a bilingual colleague.
- **Each role sees only what it needs**, enforced by RLS: callers their own case, guards their own assignments, managers counts.

## Run it locally

Prerequisites: Node 24, Docker, Supabase CLI, Python 3.11 with `uv` (voice only), Arduino CLI (device only).

```sh
supabase start                     # applies supabase/migrations and seed.sql (synthetic data)
cd web
cp .env.example .env.local         # fill from `supabase status`; DEVICE_SECRETS_JSON={"TABLE-A":"…"}
npm ci
npm run dev                        # http://localhost:3000
```

Demo accounts (local only): `operator@ichido.demo`, `operator2@ichido.demo`, `guard1@ichido.demo`, `guard2@ichido.demo`, `manager@ichido.demo`, password `ichido-demo`.

**Voice (optional):** create a LiveKit Cloud project, then

```sh
cd agent
cp .env.example .env               # LiveKit, Google STT, Azure Speech keys
uv sync
uv run python app.py download-files
uv run python app.py dev
```

and set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in `web/.env.local`, plus the same random `AGENT_BRIDGE_SECRET` in both `web/.env.local` and `agent/.env` (the agent speaks only text the server signed with it). Without voice keys, the caller uses the typed path.

**Extraction from free text (optional):** set `OPENAI_API_KEY`. Without it, callers set the facts with the on-screen choices.

**Device:** copy `firmware/help_point/secrets.example.h` to `secrets.h`, fill it in, then

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/help_point
arduino-cli upload  --fqbn esp32:esp32:esp32 -p <port> firmware/help_point
```

## Tests

```sh
cd web
npm run test:fresh     # resets the local DB, then runs the journey and number-withholding tests
```

The journey test signs in as an operator, two guards and two anonymous callers and drives the whole case: duplicate device events open one case, pairing codes are single-use, callers and guards see only their own rows, staff never read drafts, numbers (digits or words) are withheld, stale revisions cannot be confirmed, callers cannot act out of order, only catalogue replies can be sent, a replaced guard is locked out, and insights are refused to callers and guards. The race tests cover simultaneous claims, simultaneous edits, the held-card rule, caller reset and pairing rate limits.

```sh
cd agent && AGENT_BRIDGE_SECRET=test uv run python -m unittest test_signing.py   # agent accepts only server-signed speech
```

## What is real and what is simulated

| Real (working) | Simulated | Planned |
|---|---|---|
| Case flow across caller, operator and guard screens with live updates | The ATM (ESP32 prop or on-screen action) | Real telephony and the ATM's own handset |
| Row-level security and single-use pairing | The bank, branch, security company and manual | Connection to a monitoring system |
| Voice agent code (LiveKit, Google STT, Azure TTS) | Synthetic history in the insights page | Native review of all Bengali and Japanese wording |
| ESP32 firmware | | |

## How AI tools were used

- Research, planning and review of the plan: Claude (Anthropic) and Codex (OpenAI).
- Code: written with Claude Code; reviewed and tested by the team.
- In the product: speech recognition (Google), speech synthesis (Azure) and optional structured extraction of two facts from free text (OpenAI). The product never lets a model write a reply to the caller.

## Licence

MIT
