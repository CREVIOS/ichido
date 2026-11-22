# Ichido 一度 — say it once

When an ATM keeps your card, the monitoring centre already knows the machine failed. What it does not get is **your** story in words it can use, and what you do not get is any idea of what happens next. For an elderly caller, or a foreign worker still learning Japanese, that gap is wider at every hand-off.

Ichido joins three things into one case, in the caller's language:

1. **The machine's alert** — an ESP32 "Help Point" prop (or an on-screen action) reports the fault.
2. **The caller's own words** — in Bengali, Vietnamese, Indonesian, Nepali, English or easy Japanese, typed or spoken to a LiveKit voice agent (Nepali is typed only: Soniox has no Nepali model). Vietnam, Indonesia and Nepal are the three largest foreign-worker nationalities in Nagasaki Prefecture (3,018, 2,342 and 1,753 at end-October 2025). The assistant reads back what it understood; the caller corrects it and confirms.
3. **The operator's decision** — chosen from the bank's approved replies, dispatched to a security guard, and returned to the caller as their real options (wait, with the guard's own estimate, or leave and be contacted). The caller then says the next step in their own words before the case closes.

Built for the TSUNAGU hackathon (theme: *update the way we connect*). The bank, ATM, security company and all data are **fictional**.

## Screens

| Route | Who | What |
|---|---|---|
| `/` | everyone | Overview and links |
| `/enterprise` | monitoring centres, banks | What Ichido offers a centre: customization, controls, the full feature list, MCP, a 30-day rollout and buyer FAQ |
| `/pricing` | monitoring centres, banks | **Proposed** 2027 pilot price list in JPY (Pilot, Centre, Network, Enterprise), subject to agreement |
| `/operator` | monitoring-centre operator | Queue with response-time targets and new-case alerts, machine state, caller's original words beside the facts they confirmed, timeline, approved replies, pairing code, dispatch; who else is online and viewing the same case; ⌘K palette, J/K/C keys |
| `/automation` | monitoring-centre operator | Every open case's Ichido Bot workflow and the step it is on |
| `/cases` | monitoring-centre operator | Searchable case history, time to first reply, and filtered CSV export of case metadata |
| `/stations` | operator | Live map of stations (MapLibre + OpenFreeMap/OSM) with device-health pins, each Help Point's last heartbeat, signal, firmware and open cases, and a printable QR sticker per station |
| `/h/[token]` | bank, police, security company | Read-only hand-off record (引継票) of one case: facts, decisions, timeline, after-call summary. Expires in 24 h, revocable, every view audited, never the caller's free text |
| `/s/[station]` | caller | Neutral page behind the Help Point sticker: language choice and the operator's single-use code |
| `/caller` | caller | AI notice, voice or typed intake, read-back and correction, the operator's reply, wait/leave, teach-back, one-tap rating after close |
| `/field` | security guard | Only their own assignments; on the way (with their own estimate), arrived, done |
| `/insights` | operator, manager | Metric cards with definitions and Recharts charts: daily cases vs guided, funnel with conversion, time to first reply against the target, languages, busiest hours, wait/leave, ratings — counts only |
| `/training` | operator | AI応対トレーニング: practise against a simulated caller (OpenAI, or a scripted fallback offline) in Bengali, English or Japanese with the console's own reply and dispatch cards, then a scorecard (first-reply time, reply choice, held-card rule, guard decision, numbers withheld, request for a person) with a veteran's tip and a score trend. Isolated tables: never touches the desk, guards, pairing, Gemini or insights |

The same screens also ship as a React Native app in `mobile/` (see below).

## How it works

```
ESP32 Help Point ──HTTPS──▶ /api/device ─┐
Operator (browser) ───────▶ /api/cmd ────┼──▶ Supabase Postgres (RLS) ──Realtime──▶ every screen
Caller phone ─────────────▶ /api/cmd ────┘            ▲
     │ WebRTC                                        │ draft (structured facts)
     ▼                                               │
LiveKit room ◀── agent/app.py (Soniox STT, ElevenLabs TTS; no conversational LLM)
```

- **Next.js 16** app (`web/`), one route per role. All writes go through `/api/cmd`, which derives the actor from the bearer token and never trusts role or case ids in the body.
- **Supabase**: Postgres with row-level security on every table, Auth (staff accounts, anonymous callers), Realtime (inserts and updates only). Every state change is a SQL function (`supabase/migrations/*_commands.sql`) that checks its preconditions in the same transaction, so two operators cannot both claim a case and a replaced guard cannot update a job. `insights()` returns counts only.
- **Ichido Bot** (`web/workflows/case-bot.ts`, Workflow DevKit): one durable workflow per case, from the fault until it closes. It **routes** (recommends the operator with the fewest open cases, online ones first, as 推奨担当 on the timeline: the operator still claims), **prepares** (Gemini's suggestion is computed when the caller confirms, so the AI card opens instantly; もう一度提案 still refreshes it), **reminds** (a timeline event and console toast before the first-reply target; a banner on the guard's screen and a toast for the operator while a dispatched guard has not set off) and **records** (the after-call summary and the time to claim, first reply, guard arrival and close, counts only, also in insights). Commands wake the run; each wake re-reads the case. The bot never claims, replies, dispatches, closes or writes to a caller, and its steps (status, time) show in the case's Ichido Bot panel, live. See [docs/DEPLOY.md](docs/DEPLOY.md#ichido-bot-vercel-workflow).
- **LiveKit Agents** (`agent/`): speech in, text out. The agent transcribes and speaks only the read-back the caller's own client asks for. It never decides anything and never asks for numbers. Background voice cancellation (LiveKit Cloud) cleans the caller's audio; a multilingual turn detector ends Japanese, English and Indonesian turns, and Bengali and Vietnamese use VAD endpointing.
- **ESP32 firmware** (`firmware/help_point/`): debounced button, idempotent event ids, polled status light, offline indication, a heartbeat every 60 s (`public.device_health`), a Wi-Fi setup portal (hold the button 8 s at power-on), and signed over-the-air updates that roll back automatically if the new image never reaches the server.
- **Observability**: structured JSON logs from the web routes and the agent (codes, ids and timings only, never caller words), shipped to Better Stack when its token is set; `/api/health` for uptime monitoring. See [docs/DEPLOY.md](docs/DEPLOY.md).
- **Design**: Tailwind v4 and shadcn/ui (Base UI) on a quiet monochrome system — off-white canvas, white sheets with hairlines, near-black actions, colour only for state. The mark is a speech bubble holding one brush stroke, 一: say it once.
- **Content** (`web/content/catalogue.ts`, `staff.ts`, `home.ts`, `enterprise.ts`): every user-visible string, fault type, reply and timeline sentence, in Bengali, Vietnamese, Indonesian, Nepali, English and Japanese (staff screens Japanese only). `L10n` makes TypeScript refuse a caller string missing any language. The database holds codes and data only.

The marketing pages' sales links ("Start the pilot", "Talk to us", "Contact") go to the placeholder `CONTACT` address `pilot@ichido.example` in `web/content/enterprise.ts`; replace it with a real inbox before launch. "Sign in to the console" goes to `/operator`.

## MCP server

`/api/mcp` serves Ichido over the Model Context Protocol (Streamable HTTP) so an operator's or manager's own AI client can read the desk. Tools: `list_open_cases`, `get_case`, `station_health`, `insights`, `suggest_next_step` (Gemini decision support). Every tool is **read-only** — replies and dispatch stay a person's decision in the console — and every query runs as the signed-in staff member, so row-level security still applies. Guards and callers are refused.

```sh
export ICHIDO_MCP_TOKEN=$(node --env-file=web/.env.local scripts/mcp-token.mjs operator@ichido.demo)
claude   # .mcp.json in this repo points Claude Code at http://localhost:3123/api/mcp with that token
```

## AI in the product

| Where | Provider | What it may do |
|---|---|---|
| Voice in | Soniox (`stt-rt-v6`) via LiveKit | Transcribe the caller's speech |
| Voice out | ElevenLabs (`eleven_v4_turbo`) via LiveKit | Read aloud server-signed text only |
| Free text → facts, teach-back → Japanese | OpenAI `gpt-6.1-terra` (Responses API, strict JSON) | Fill two facts; labelled machine translation for staff |
| Operator decision support | Google Gemini (`gemini-4-hydrogen`) with function calling | Read the case through four tools and recommend one approved reply and a guard, with reasons, risks and a timed trace. Validated against the catalogue; recorded on the timeline; the operator decides |
| Case orchestration | Ichido Bot (Vercel Workflow DevKit, no model of its own) | Recommend an operator, precompute the Gemini suggestion, remind before targets, write the after-call record. Never claims, replies, dispatches or closes |

No model writes a message to the caller, and Gemini never sees the caller's words — only the facts they confirmed.

## Rules the product keeps

- **The bank's words, not the model's.** Callers receive approved replies only; branch names and hours come from the station record.
- **The check happens on the caller's side.** A Japanese operator cannot check Bengali, so the caller confirms or corrects the read-back; the operator always sees the original words.
- **Never asks for a PIN, card, account or ID number.** Text that looks like a number is withheld before it leaves the server.
- **No card handback, ID check or "collect your card" signal** anywhere. What happens to a held card is the bank's procedure.
- **A caller reaches a case only with the operator's single-use, five-minute code.** Scanning the sticker alone reveals nothing; guesses are rate-limited. If a caller loses their phone, the operator resets the connection and issues a new code, or closes the case.
- **The operator never sees the caller's draft**, only what the caller confirmed. A teach-back in another language is shown with a labelled machine translation, or flagged for a bilingual colleague.
- **Each role sees only what it needs**, enforced by RLS: callers their own case, guards their own assignments, managers counts.
- **The timeline is an audit trail.** `case_event` is append-only: no role, not even the service role, can edit or delete an event.

## Run it locally

Prerequisites: Node 24, Docker, Supabase CLI, Python 3.11 with `uv` (voice only), Arduino CLI (device only).

```sh
supabase start                     # applies supabase/migrations and seed.sql (local demo station and accounts)
cd web
cp .env.example .env.local         # fill from `supabase status`; DEVICE_SECRETS_JSON={"TABLE-A":"…"}
npm ci
npm run dev                        # http://localhost:3000
```

Demo accounts (local only): `operator@ichido.demo`, `operator2@ichido.demo`, `guard1@ichido.demo`, `guard2@ichido.demo`, `manager@ichido.demo`, password `ichido-demo`. For a populated insights page, also load `supabase/seed-local-history.sql` (20 days of synthetic cases; command in the file).

**Production:** follow [docs/DEPLOY.md](docs/DEPLOY.md). Hosted projects get migrations only, staff from `scripts/create-staff.mjs`, and no demo data.

**Voice (optional):** create a LiveKit Cloud project, then

```sh
cd agent
cp .env.example .env               # LiveKit, Soniox and ElevenLabs keys
uv sync
uv run python app.py download-files   # Silero VAD and the turn detector; without them the agent uses VAD endpointing
uv run python app.py dev
```

and set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in `web/.env.local`, plus the same random `AGENT_BRIDGE_SECRET` in both `web/.env.local` and `agent/.env` (the agent speaks only text the server signed with it). Without voice keys, the caller uses the typed path.

**Extraction from free text (optional):** set `OPENAI_API_KEY`. Without it, callers set the facts with the on-screen choices.

**Mobile app (optional):** `mobile/` is an Expo app with every role (caller, operator, guard, insights) against the same backend and the same `web/content/catalogue.ts`. It needs a development build because of LiveKit's native WebRTC module:

```sh
cd mobile
cp .env.example .env               # Supabase URL + publishable key, and the web origin (EXPO_PUBLIC_API_URL)
npm install
npx expo run:ios                   # Xcode 26; or run:android. Opens ichido://s/TABLE-A deep links
```

Without a development build, `npx expo start --go` runs every screen except voice in Expo Go.

See `mobile/README.md` for env vars, deep links and checks.

**Device:** copy `firmware/help_point/secrets.example.h` to `secrets.h`, fill it in, then

```sh
arduino-cli lib install WiFiManager     # setup portal (tzapu, MIT)
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/help_point
arduino-cli upload  --fqbn esp32:esp32:esp32 -p <port> firmware/help_point
```

The `secrets.h` values are first-boot defaults. To change Wi-Fi, app URL, station or secret later without
reflashing, hold the button for 8 s while powering on and use the setup portal. For signed OTA updates, see
[docs/DEPLOY.md](docs/DEPLOY.md#firmware-updates).

## Tests

```sh
cd web
npm run test:fresh     # resets the local DB, then runs the journey, race, number-withholding, health, device-heartbeat and firmware-manifest tests
```

The journey test signs in as an operator, two guards and two anonymous callers and drives the whole case: duplicate device events open one case, pairing codes are single-use, callers and guards see only their own rows, staff never read drafts, numbers (digits or words) are withheld, stale revisions cannot be confirmed, callers cannot act out of order, only catalogue replies can be sent, a replaced guard is locked out, and insights are refused to callers and guards. The race tests cover simultaneous claims, simultaneous edits, the held-card rule, caller reset and pairing rate limits.

The Ichido Bot test (`tests/bot.test.mjs`) checks the routing suggestion, the prepared suggestion (or a recorded skip without `GEMINI_API_KEY`), both reminders, the record at close, and that the bot never claims, replies or dispatches. Its reminder checks need a short schedule on the server under test, e.g. `BOT_REMIND_AT=0.02 npm run dev` (reminders after 2% of each target); with the default they are skipped with a note.

```sh
cd agent && uv run python -m unittest   # only server-signed speech, per-language STT/TTS, turn detector and noise-cancellation fallbacks
```

## What is real and what is simulated

| Real (working) | Simulated | Planned |
|---|---|---|
| Case flow across caller, operator and guard screens with live updates | The ATM (ESP32 prop or on-screen action) | Real telephony and the ATM's own handset |
| Row-level security and single-use pairing | The bank, branch, security company and manual | Connection to a monitoring system |
| Voice agent code (LiveKit, Soniox STT, ElevenLabs TTS) | Synthetic history in the insights page (local only, optional) | Native review of all Bengali, Vietnamese, Indonesian, Nepali and Japanese wording |
| ESP32 firmware | | |

## How AI tools were used

- Research, planning and review of the plan: Claude (Anthropic) and Codex (OpenAI).
- Code: written with Claude Code; reviewed and tested by the team.
- In the product: speech recognition (Soniox), speech synthesis (ElevenLabs), noise cancellation and end-of-turn detection (LiveKit) and optional structured extraction of two facts from free text (OpenAI). The product never lets a model write a reply to the caller.

## Licence

MIT
