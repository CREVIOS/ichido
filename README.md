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
| `/operator` | monitoring-centre operator | Queue with response-time targets and new-case alerts, machine state, caller's original words beside the facts they confirmed, timeline, approved replies, pairing code, dispatch; who else is online and viewing the same case; ⌘K palette, J/K/C keys |
| `/cases` | monitoring-centre operator | Searchable case history, time to first reply, and filtered CSV export of case metadata |
| `/stations` | operator | Live map of stations (MapLibre + OpenFreeMap/OSM) with device-health pins, each Help Point's last heartbeat, signal, firmware and open cases, and a printable QR sticker per station |
| `/h/[token]` | bank, police, security company | Read-only hand-off record (引継票) of one case: facts, decisions, timeline, after-call summary. Expires in 24 h, revocable, every view audited, never the caller's free text |
| `/s/[station]` | caller | Neutral page behind the Help Point sticker: language choice and the operator's single-use code |
| `/caller` | caller | AI notice, voice or typed intake, read-back and correction, the operator's reply, wait/leave, teach-back, one-tap rating after close |
| `/field` | security guard | Only their own assignments; on the way (with their own estimate), arrived, done |
| `/insights` | operator, manager | Metric cards with definitions and Recharts charts: daily cases vs guided, funnel with conversion, time to first reply against the target, languages, busiest hours, wait/leave, ratings — counts only |

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
- **LiveKit Agents** (`agent/`): speech in, text out. The agent transcribes and speaks only the read-back the caller's own client asks for. It never decides anything and never asks for numbers. Background voice cancellation (LiveKit Cloud) cleans the caller's audio; a multilingual turn detector ends Japanese and English turns, and Bengali uses VAD endpointing.
- **ESP32 firmware** (`firmware/help_point/`): debounced button, idempotent event ids, polled status light, offline indication, a heartbeat every 60 s (`public.device_health`), a Wi-Fi setup portal (hold the button 8 s at power-on), and signed over-the-air updates that roll back automatically if the new image never reaches the server.
- **Observability**: structured JSON logs from the web routes and the agent (codes, ids and timings only, never caller words), shipped to Better Stack when its token is set; `/api/health` for uptime monitoring. See [docs/DEPLOY.md](docs/DEPLOY.md).
- **Design**: Tailwind v4 and shadcn/ui (Base UI) on a quiet monochrome system — off-white canvas, white sheets with hairlines, near-black actions, colour only for state. The mark is a speech bubble holding one brush stroke, 一: say it once.
- **Content** (`web/content/catalogue.ts`, `staff.ts`, `home.ts`): every user-visible string, fault type, reply and timeline sentence, in Japanese, Bengali and English. The database holds codes and data only.

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

```sh
cd agent && uv run python -m unittest   # only server-signed speech, per-language STT/TTS, turn detector and noise-cancellation fallbacks
```

## What is real and what is simulated

| Real (working) | Simulated | Planned |
|---|---|---|
| Case flow across caller, operator and guard screens with live updates | The ATM (ESP32 prop or on-screen action) | Real telephony and the ATM's own handset |
| Row-level security and single-use pairing | The bank, branch, security company and manual | Connection to a monitoring system |
| Voice agent code (LiveKit, Soniox STT, ElevenLabs TTS) | Synthetic history in the insights page (local only, optional) | Native review of all Bengali and Japanese wording |
| ESP32 firmware | | |

## How AI tools were used

- Research, planning and review of the plan: Claude (Anthropic) and Codex (OpenAI).
- Code: written with Claude Code; reviewed and tested by the team.
- In the product: speech recognition (Soniox), speech synthesis (ElevenLabs), noise cancellation and end-of-turn detection (LiveKit) and optional structured extraction of two facts from free text (OpenAI). The product never lets a model write a reply to the caller.

## Licence

MIT
