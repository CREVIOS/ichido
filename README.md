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
| `/operator` | monitoring-centre operator | Queue with response-time targets and new-case alerts, machine state, caller's original words beside the facts they confirmed, timeline, approved replies, pairing code, dispatch through the security company's control centre; fraud mode (特殊詐欺の疑い), mass-incident banner and broadcast, timed promises, harassment flag (H) and takeover; who else is online and viewing the same case; ⌘K palette, J/K/C/H keys |
| `/review` | monitoring-centre operator | 要確認: what the AI and the bot drafted for the operator's own cases, grouped (AI suggestion, after-call record, machine translation, unopened hand-off link), with a live count in the menu. Accept sends the stored suggestion through the operator's own send/dispatch commands; dismiss, approve (with a staff-only note), confirm/flag a translation, reissue/revoke a link — each once, recorded in `review_state` and on the timeline. J/K or ↑/↓, Enter, E |
| `/automation` | monitoring-centre operator | The Ichido Bot workflow as a sequence: performance over 30 days, what it may and may not do, its four steps and when each runs; running runs, history with durations, and test runs from manually registered faults |
| `/cases` | monitoring-centre operator | Searchable case history, time to first reply, and filtered CSV export of case metadata |
| `/stations` | operator, manager | Live map of stations (MapLibre + OpenFreeMap/OSM) with device-health pins (offline and never-connected Help Points greyed, mobile branches marked), each Help Point's last heartbeat, signal, firmware and open cases, a printable QR sticker per station, and **disaster / outage mode**: pick stations on the map or in the list, pick one of the bank's approved emergency notices (非常取扱い), set or clear, with a station timeline of every change |
| `/h/[token]` | bank, police, security company | Read-only hand-off record (引継票) of one case: facts, decisions, timeline, after-call summary. Expires in 24 h, revocable, every view audited, never the caller's free text |
| `/s/[station]` | caller | Neutral page behind the Help Point sticker: language choice and the operator's single-use code, and **聞こえない・話せない** ("I can't hear / I can't speak"): a silent, rate-limited alert with no personal data that opens the station's case flagged 文字対応, so the operator shows the code on the Help Point display instead of saying it |
| `/caller` | caller | AI notice, voice or typed intake (typed only for a 文字対応 case: no voice, no handset hints), read-back and correction, the operator's reply, wait/leave, teach-back, one-tap rating after close; while the station is in a disaster area, the bank's approved notice and the nearest working Help Points and mobile branches |
| `/field` | security guard | Only their own assignments, with the control centre they came through; on the way (with their own estimate), arrived, done; a re-estimate ask when their estimate has passed |
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
- **Staff sign-in: Better Auth** (`web/lib/auth.ts`, tables in schema `auth_ba`): invite-only email + password (12+ characters, breached passwords refused, verified by the invite link), mandatory second factor (authenticator app with backup codes, email code as fallback, or a passkey), short rolling sessions in httpOnly cookies, rate limits and lockout in the database, new-device sign-in alerts, account email through Brevo. After sign-in, `/api/auth/supabase-token` mints a five-minute Supabase token for that session, so RLS and Realtime see the staff member; revoking the session cuts the database at once. One permission matrix (`web/lib/rbac.ts`: operator, field, manager, admin, auditor) drives Better Auth's access control, every `/api/cmd` command, `/api/admin`, the MCP server and the navigation. `/admin` invites people, changes roles, disables accounts, resets second factors and signs people out, all written to the append-only `ichido.staff_audit`.
- **Supabase**: Postgres with row-level security on every table, Auth (anonymous callers), Realtime Broadcast from the database (statement triggers on inserts and updates send a "this table changed" message, with no row data, on private topics; screens refetch through RLS). Every state change is a SQL function (`supabase/migrations/*_commands.sql`) that checks its preconditions in the same transaction, so two operators cannot both claim a case and a replaced guard cannot update a job. `insights()` returns counts only.
- **Ichido Bot** (`web/workflows/case-bot.ts`, Workflow DevKit): one durable workflow per case, from the fault until it closes. It **routes** (recommends the operator with the fewest open cases, online ones first, as 推奨担当 on the timeline: the operator still claims), **prepares** (Gemini's suggestion is computed when the caller confirms, so the AI card opens instantly; もう一度提案 still refreshes it), **reminds** (a timeline event and console toast before the first-reply target; a banner on the guard's screen and a toast for the operator while a dispatched guard has not set off) and **records** (the after-call summary and the time to claim, first reply, guard arrival and close, counts only, also in insights). It also **times promises** (below). Commands wake the run; each wake re-reads the case. The bot never claims, replies, dispatches, closes, switches on fraud mode or broadcasts; its one caller-facing write is the approved "still working on it" status when a promise a person made runs out. Its steps (status, time) show in the case's Ichido Bot panel, live. See [docs/DEPLOY.md](docs/DEPLOY.md#ichido-bot-vercel-workflow).
- **LiveKit Agents** (`agent/`): speech in, text out. The agent transcribes and speaks only the read-back the caller's own client asks for. It never decides anything and never asks for numbers. Background voice cancellation (LiveKit Cloud) cleans the caller's audio; a multilingual turn detector ends Japanese, English and Indonesian turns, and Bengali and Vietnamese use VAD endpointing.
- **ESP32 firmware** (`firmware/help_point/`): debounced button, idempotent event ids, polled status light, offline indication, an optional SSD1306 OLED (`HAS_DISPLAY`) that shows the state in words and the pairing code only while the operator has pressed 端末に表示, a heartbeat every 60 s (`public.device_health`), a Wi-Fi setup portal (hold the button 8 s at power-on), and signed over-the-air updates that roll back automatically if the new image never reaches the server.
- **Observability**: structured JSON logs from the web routes and the agent (codes, ids and timings only, never caller words), shipped to Better Stack when its token is set; `/api/health` for uptime monitoring. See [docs/DEPLOY.md](docs/DEPLOY.md).
- **Design**: Tailwind v4 and shadcn/ui (Base UI) on a quiet monochrome system — off-white canvas, white sheets with hairlines, near-black actions, colour only for state. The mark is a speech bubble holding one brush stroke, 一: say it once.
- **Content** (`web/content/catalogue.ts`, `staff.ts`, `home.ts`, `enterprise.ts`): every user-visible string, fault type, reply and timeline sentence, in Bengali, Vietnamese, Indonesian, Nepali, English and Japanese (staff screens Japanese only). `L10n` makes TypeScript refuse a caller string missing any language. The database holds codes and data only.

The marketing pages' sales links ("Start the pilot", "Talk to us", "Contact") go to the placeholder `CONTACT` address `pilot@ichido.example` in `web/content/enterprise.ts`; replace it with a real inbox before launch. "Sign in to the console" goes to `/operator`.

## Real-world fault paths

From 40 sourced caller stories, every reason a card, passbook or cash stays in (or never leaves) the machine is its own fault type in `web/content/faults.ts`, with its own caller taps and approved replies:

| Fault type | Reply the caller can get |
|---|---|
| `card_retained` (device default) | A-3 card is inside, wait or leave — only if the caller confirmed it did not come back, no release succeeded, and they did **not** say they forgot it or it was reported lost/expired |
| `card_forgotten` (取り忘れ), `card_kept` (lost-card report, expired, bank flag) | B-1 / B-2: the bank handles the card by its own procedure; no need to wait. Never A-3 |
| `card_unreadable` | B-3: take the card to the branch counter |
| `passbook_stuck` | D-1: passbook is inside, wait or leave (needs the caller's "my passbook did not come back") |
| `cash_jam` | C-3: the bank counts the cash and corrects the balance, wait or leave (needs the caller's tap) |
| `cash_left`, `debited_no_cash` | C-2 / C-1: the bank checks the record and corrects the balance; keep the slip; no need to wait |
| `limit_refused` | C-4: a bank limit, not a fault |
| any card fault + "the ATM says my card can't be used" | B-4: may be the bank's residence-period rule; bring the new residence card to the branch (hours from the station row); the prefecture's 22-language desk |
| any card fault + "issued outside Japan" / "I can't come back" | B-5: ask your card issuer to block the card; the bank here follows its own procedure (no promise of return) |

- **The rule is in the database.** `ichido.reply_rule` (migration `20261123110000_faults.sql`) and a trigger on `public.reply` refuse any reply that does not fit the case's fault type and the caller's taps; `tests/faults.test.mjs` checks the table equals `REPLY_RULES` in the catalogue. The console, the mobile console and Gemini's `list_replies` use the same `replyBlock()`.
- **The operator corrects the fault type** when the caller's story shows the alert was wrong (timeline: 障害の種類を変更). The console suggests a type from the caller's taps. A sent reply that no longer fits is withdrawn from the caller's screen, with its wait/leave choice.
- **本人申告:** for cash faults the operator types the amount the caller stated on the handset. It lives on the operator-only `desk` row, never on the caller's phone, and appears on the hand-off record labelled 本人申告.
- **Elderly-friendly caller page:** large text and slower read-aloud toggles (kept in `localStorage`, or AsyncStorage on mobile; the page works without storage), no timers in the caller flow, and a "a family member is helping me" tap recorded as a flag only (no personal details) and shown to the operator.
- **Follow-up after leaving:** when a case closes with guidance confirmed, the caller's phone can follow it for 30 days (`ichido.follow_up`, `followup` command) after the two-hour pairing expires: case number, what they were told, and the bank's status in their language. The bank's status (受付済み, 取引記録を確認済み, 〜までにご連絡予定, ご本人に連絡済み, 銀行の手続き完了) comes from a fixed list and is recorded **by an operator on the bank's behalf**, from the console, on open or closed cases. We chose this over a write token on the hand-off link: the link stays strictly read-only, there is no unauthenticated write path to defend, and every update is attributed to a signed-in staff member on the timeline. No status tells anyone to collect a card.

## Operator-side real-world paths

From the sourced stories in `docs/research/10-real-stories.md` (§2 gaps 1, 4, 7, 12 and §3). Wording in `web/content/ops.ts`, server in `web/lib/ops.ts`, SQL in `supabase/migrations/20261123130000_ops.sql`, tests in `web/tests/ops.test.mjs`.

- **Fraud-in-progress mode (特殊詐欺の疑い).** A new alert source, "phone call at the ATM" (`phone_fraud`): the monitoring side raises it (`POST /api/device` with `X-Fault: phone_fraud`) or the operator registers it from the console menu. Gemini may suggest fraud mode (a `fraud` flag in its validated suggestion); only the operator who owns the case presses it. One action: the paired caller's phone shows the bank-approved full-screen warning in their language ("Stop. No city office, pension office or bank asks you to use an ATM to get money back. End the call. Staff are coming."), the Help Point light turns steady red (`fraud` light state, kept through redispatches), a guard is dispatched, and the police hand-off record is issued with the timeline. Insights count it.
- **Mass incident.** When `mass_stations` stations fault within `mass_window_s` (`ichido.ops_setting`, default 3 in 10 minutes), the cases are grouped into one incident, and later faults join it while any of its cases is open. The console shows one banner and sorts the queue by how long each caller has waited since they last heard from us. Any operator (the supervisor) sends **one** approved broadcast, after a confirm, to every paired caller of the incident ("You can leave now. The bank will contact you. The card is handled under the bank's own procedure."); fraud cases are skipped. Insights show cards captured against those resolved the same day.
- **Timers on promises.** The operator records a call-back or re-check (5/10/15/30 minutes); the guard's own estimate (its upper bound) and "arrived" without "done" (`arrived_open_s`, default 20 minutes) are promises too. The Ichido Bot sleeps until each is due; if nobody settled it, the console gets a toast and a timeline event, the caller gets the approved "still working on it" status, and the guard is asked to re-estimate.
- **Harassment flag and takeover (カスハラ).** One key (H) or menu item marks the call abusive: the operator's judgement on the timeline and in insights, with no emotion scoring. Any other operator can take over a claimed case (checked in SQL; the timeline records from whom).
- **Dispatch realism.** Every dispatch is recorded as a request to the station's security company control centre (警備会社 管制), shown as 監視センター → 管制 → 警備員 on the console, the guard's screen and the hand-off record. There is no fake integration with the control centre: the operator still contacts it by the usual procedure.

## Beyond ATMs: scenario packs

The same desk works at any staffed service point. A station's `kind` picks its **pack** (`web/content/packs/<id>.ts`); the ATM stays the flagship and its content stays in `faults.ts`. Each pack brings its own situations (the desk's fault codes), caller taps (grouped: who, where, since when, how much it hurts…), approved replies with rules, responder wording for the shared `field` role and `/field` screen, and hand-off recipients.

| Pack (`station.kind`) | Situations | Responder | Hand-off to | Seeded station (fictional) |
|---|---|---|---|---|
| `atm`, `mobile_branch` | card / passbook / cash held, phone fraud… | security guard | bank, police, security company | `TABLE-A` |
| `hospital` (reception) | first visit, which department, can't explain symptoms, payment / insurance | nurse or medical clerk | department, medical interpreter | `HOSP-A` 浦上みなと病院 |
| `city_office` (foreign-resident desk) | residence card, moving-in, My Number card, a letter they can't read | city interpreter | city section, prefecture consultation desk | `CITY-A` 出島市役所 |
| `transit` (ticket gate) | lost, missed the last train, lost item, accessibility help | station staff | railway, police | `RAIL-A` みなと線 浦上駅 |
| `shelter` (evacuation shelter) | check-in, needs (medicine, halal / allergy, infant, wheelchair), family search, updates | shelter staff | municipal disaster HQ, health team | `SHELTER-A` 稲佐小学校 |

- **The rules are in the database** (migration `20261123160000_packs.sql`). `ichido.situation` maps every situation to its pack and a trigger refuses a desk situation from another pack (device, simulator, silent alert or the operator's correction). `ichido.reply_rule` now names each reply's pack (null `faults` = any situation of it) and `reply_ok` refuses an intent with no rule, so no reply crosses packs. A non-ATM caller confirms their taps instead of the two ATM facts (`cmd_confirm`); insights are counted per pack (`insights_packs`).
- **No diagnosis, no legal or immigration advice.** A pack caller answers with taps; free text is kept as the caller's words, with no extraction. Hospital and shelter red-flag taps (chest pain, hard to breathe, heavy bleeding, fainting, stroke signs; someone badly hurt, a missing child) allow only the pack's "tell the staff now / call 119" reply — every other reply is blocked by rule and a calm reply already sent is withdrawn — and the caller sees that approved text the moment they tap.
- **Never a number.** Pack callers are told their residence card, insurance, My Number, passport and bank numbers are never asked for; number withholding now also catches card-style IDs split by letters and ID words (保険証, 在留カード, insurance no., …) with three or more digits.
- **Screens.** Console: situations and replies of the case's pack only, an urgent banner, the pack's place, responder and recipients. Caller (web and mobile): grouped taps, pack wording for the responder's state and estimate. Stations: pack filter and icons on the map and list. Insights: cases by pack. Shelter updates reuse disaster mode (two approved shelter notices), and "nearest working" lists stations of the same pack. The landing and enterprise pages have a **Beyond ATMs** section built from the packs.
- **Sources** (`docs/research`): at hospital 24.5% of foreign residents bring a Japanese-speaking relative and 43% cannot call 119 in Japanese (ISA 2025, NINJAL); 4.8% of foreign residents in Sasebo would take a problem to city hall; trouble at stations was 9 of 75 difficulties Bangladeshis described (GRIPS); Nagasaki's 1982 flood and the Nankai Trough estimate for shelters. All caller strings are in six languages (drafts awaiting native review; easy Japanese passes `npm run check:ja`).

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

## Two gaps from real cases

- **A path with no voice.** Pairing used to depend on hearing the code over the ATM handset, so a deaf or
  speech-impaired caller could never connect. They press 聞こえない・話せない on the sticker page; the case
  appears in the queue flagged 文字対応; the operator presses 端末に表示 and the code appears on the Help Point's
  display (served on the device's own authenticated status poll, gone when used, replaced, expired or closed).
  The case then continues by text only.
- **Disaster / outage mode** (earthquakes, typhoons, store ATM closures). A manager or operator marks the stations
  in a disaster area with one of the bank's approved notices. Callers paired there see that notice in their
  language and the nearest working Help Points, computed from station coordinates and device heartbeats
  (stations in the area and offline devices are left out; stations with `kind = 'mobile_branch'` are listed as
  mobile branches). Entering and leaving are recorded on a station timeline, on any open case's timeline and in
  the logs (`disaster_entered` / `disaster_left`).

## Rules the product keeps

- **The bank's words, not the model's.** Callers receive approved replies only; branch names and hours come from the station record.
- **The check happens on the caller's side.** A Japanese operator cannot check Bengali, so the caller confirms or corrects the read-back; the operator always sees the original words.
- **Never asks for a PIN, card, account or ID number.** Text that looks like a number is withheld before it leaves the server.
- **No card handback, ID check or "collect your card" signal** anywhere. What happens to a held card is the bank's procedure.
- **A caller reaches a case only with the operator's single-use, five-minute code.** Scanning the sticker alone reveals nothing; guesses are rate-limited. If a caller loses their phone, the operator resets the connection and issues a new code, or closes the case.
- **The operator never sees the caller's draft**, only what the caller confirmed. A teach-back in another language is shown with a labelled machine translation, or flagged for a bilingual colleague.
- **Each role sees only what it needs**, enforced by RLS: callers their own case, guards their own assignments, managers counts.
- **AI drafts, a person decides.** Fraud mode, the mass broadcast, dispatch and takeover are operator commands only; the bot and Gemini have no path to them (checked by `tests/ops.test.mjs`).
- **The timeline is an audit trail.** `case_event` is append-only: no role, not even the service role, can edit or delete an event.

## Run it locally

Prerequisites: Node 24, Docker, Supabase CLI, Python 3.11 with `uv` (voice only), Arduino CLI (device only).

```sh
supabase start                     # applies supabase/migrations and seed.sql (local demo stations)
docker run -d --name ichido-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit   # catches account email: http://localhost:8025
cd web
cp .env.example .env.local         # fill from `supabase status` (incl. SUPABASE_JWT_SECRET = JWT_SECRET); DEVICE_SECRETS_JSON={"TABLE-A":"…"}
                                   # DATABASE_URL, BETTER_AUTH_SECRET (openssl rand -base64 32), BETTER_AUTH_URL=http://localhost:3000,
                                   # PASSKEY_RP_ID=localhost, MAIL_FROM, MAILPIT_URL=http://127.0.0.1:8025
npm ci
npm run seed:staff                 # local demo staff accounts (scripts/seed-staff.mjs)
npm run dev                        # http://localhost:3000
```

Demo staff accounts (**local only**, created by `scripts/seed-staff.mjs`, which refuses a non-local database): `operator@ichido.demo`, `operator2@ichido.demo`, `guard1@ichido.demo`, `guard2@ichido.demo`, `manager@ichido.demo`, `admin@ichido.demo`, `auditor@ichido.demo`, password `ichido-demo-local`. Each already has an authenticator registered with the local-only secret `local-totp-<email>` (its UTF-8 bytes); print the current code from `web/` with `node -e 'import("./tests/helpers.mjs").then((h) => console.log(h.totp("local-totp-operator@ichido.demo")))'`. Account email (invites, resets, codes, new-device alerts) lands in Mailpit at http://localhost:8025. To try first sign-in with enrolment and a passkey, invite yourself from `/admin` as `admin@ichido.demo`. For a populated insights page, also load `supabase/seed-local-history.sql` (20 days of synthetic cases; command in the file).

**Production:** follow [docs/DEPLOY.md](docs/DEPLOY.md). Hosted projects get migrations only, the first admin from `scripts/create-staff.mjs`, everyone else by invitation from `/admin`, and no demo data.

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
arduino-cli lib install WiFiManager U8g2   # setup portal (tzapu, MIT); OLED display (olikraus, BSD-2-Clause)
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/help_point
arduino-cli upload  --fqbn esp32:esp32:esp32 -p <port> firmware/help_point
```

The `secrets.h` values are first-boot defaults. To change Wi-Fi, app URL, station or secret later without
reflashing, hold the button for 8 s while powering on and use the setup portal. For signed OTA updates, see
[docs/DEPLOY.md](docs/DEPLOY.md#firmware-updates).

## Tests

```sh
cd web
npm run test:fresh     # resets the local DB, seeds the demo staff, then runs the auth, journey, race, number-withholding, health, device-heartbeat, firmware-manifest, text-only (access) and disaster tests
```

`auth.test.mjs` covers staff sign-in end to end against the app, the database and Mailpit: public sign-up is closed; an admin's invite email sets the password (breached and short ones refused) and verifies the address; the first sign-in is aal1 and can only enrol; TOTP enrolment (codes computed in the test) gives aal2 and backup codes; the minted token works against PostgREST RLS and Realtime; a TOTP code works once; a burst of wrong passwords is rate limited and an address locks after five, with identical answers for unknown addresses; the password-reset email signs out every session; an auditor reads cases, insights and the audit log but every command is refused; a guard sees only their own jobs; an admin's role change is audited in the append-only log and takes effect at once; a revoked session stops working in the console, the token mint and RLS; and a passkey is registered and used to sign in through Chrome's virtual authenticator (CDP `WebAuthn`). Other tests sign staff in the same way (password, then TOTP; `tests/helpers.mjs`), keep the sessions in a temporary file between test files, and use the minted token for both `/api/cmd` and the database.

The journey test signs in as an operator, two guards and two anonymous callers and drives the whole case: duplicate device events open one case, pairing codes are single-use, callers and guards see only their own rows, staff never read drafts, numbers (digits or words) are withheld, stale revisions cannot be confirmed, callers cannot act out of order, only catalogue replies can be sent, a replaced guard is locked out, and insights are refused to callers and guards. The race tests cover simultaneous claims, simultaneous edits, the held-card rule, caller reset and pairing rate limits. `faults.test.mjs` covers the real-world fault paths: a forgotten or kept card never gets the held reply, the debited-no-cash reply, the staff-only stated amount, the residence-card and visitor replies, the helper flag, and the follow-up status a caller still sees after the pairing expires. `packs.test.mjs` checks the situation and reply-rule tables equal the catalogue, and for each pack: a case opens at its seeded station with the pack's situation, the caller pairs and sees the pack's taps, ATM facts and taps are refused, an ATM or other-pack reply and situation are refused by the database, hand-offs go only to the pack's recipients; the hospital red flag makes only the urgent reply eligible; typed ID, insurance and residence-card numbers are withheld; and insights count by pack for staff only.

The Ichido Bot test (`tests/bot.test.mjs`) checks the routing suggestion, the prepared suggestion (or a recorded skip without `GEMINI_API_KEY`), both reminders, the record at close, and that the bot never claims, replies or dispatches. Its reminder checks need a short schedule on the server under test, e.g. `BOT_REMIND_AT=0.02 npm run dev` (reminders after 2% of each target); with the default they are skipped with a note.

The live-update test (`tests/live.test.mjs`) checks who may join each private Broadcast topic: staff hear `live:<table>` after a command, a caller hears only their own case and station, a stranger, a signed-out staff token and a caller on someone else's case are refused, and the toast feed carries only the event id, case and reason or kind.

The operator-side tests (`tests/ops.test.mjs`) cover fraud mode end to end (alert source, permissions, the caller's screen, the red light, the control-centre dispatch and the police hand-off), mass-incident grouping and the single broadcast, harassment flag and takeover permissions, and that the bot and Gemini never trigger fraud mode or a broadcast. The promise timers need a short promise minute on the server, e.g. `PROMISE_MINUTE_S=1 npm run dev` (one promised minute = one second); otherwise they are skipped with a note.

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
