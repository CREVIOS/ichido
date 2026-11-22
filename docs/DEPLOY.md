# Deploying Ichido

Production runs on Vercel (web), hosted Supabase (database, auth, realtime), LiveKit Cloud (voice agent) and
Better Stack (logs, uptime, heartbeats). Every integration reads its settings from the environment and is
switched off when they are missing. No token is in the repository.

Production starts empty: no demo accounts, no synthetic cases. `supabase/seed.sql` and
`supabase/seed-local-history.sql` are for the local stack only.

## 1. Supabase (hosted)

1. Create a project (choose the region closest to the users, e.g. Tokyo). Keep the database password safe.
2. Link and push the schema from the repo root:

   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push            # migrations only. Never add --include-seed: seed.sql holds the local demo accounts
   ```

3. In the dashboard, set the following:
   - **Data API → Exposed schemas**: add `ichido` (next to `public`). The server and `create-staff.mjs` use it.
   - **Authentication → Sign In / Providers**: enable **Anonymous sign-ins** (callers). Under Email, turn off
     **Allow new users to sign up**, so staff accounts come only from the script below.
   - **Authentication → URL Configuration**: Site URL = your Vercel URL.
4. Note **Project URL**, the **publishable key** and a **secret key** (Settings → API Keys).

### Staff accounts

Write a JSON file outside git (format: `scripts/staff.example.json`; `scripts/*.json` is git-ignored), then:

```sh
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=sb_secret_… node scripts/create-staff.mjs scripts/staff.json
```

New accounts get a generated 24-character password. The CLI prints the path to a private, mode-0600 JSONL
file in a mode-0700 temporary directory. Deliver credentials to their owners and remove the handoff file.
If the command fails midway, verify provisioning status before distributing its passwords. Re-running updates role and name, and keeps
existing passwords. `--reset` rotates the password of every account in the file. To remove someone, delete the
user under Authentication → Users (their staff row goes with it).

### Stations

Each Help Point needs a station row. Run this once per station in the SQL editor. The labels are shown to
callers in their language, one key per caller language (`bn`, `vi`, `id`, `ne`, `en`, `ja`); a missing key shows the `en` text:

```sql
insert into public.station (id, label, branch, counter_hours, security_company, lat, lng) values (
  'TABLE-A',
  '{"ja": "…", "bn": "…", "en": "…", "vi": "…", "id": "…", "ne": "…"}',  -- machine location
  '{"ja": "…", "bn": "…", "en": "…", "vi": "…", "id": "…", "ne": "…"}',  -- branch name
  '{"ja": "…", "bn": "…", "en": "…", "vi": "…", "id": "…", "ne": "…"}',  -- counter hours
  '…',                                        -- security company
  32.75, 129.87                               -- location for the operator's map (optional)
);
insert into public.light (station) values ('TABLE-A');
```

A **mobile branch** (移動店舗) sent out after a disaster is a station row with `kind = 'mobile_branch'`, a location,
and its opening hours in `counter_hours`. It has no Help Point device, so it needs no secret and no `light` row.
Callers in a disaster area see it among the nearest working places while it is outside the area. Delete the row
when it leaves.

Then generate the station's device secret (`openssl rand -hex 32`) and add it to `DEVICE_SECRETS_JSON` (below)
and to the device's `secrets.h`.

## 2. Vercel (web)

Import the repository and set **Root Directory** to `web`. Set these environment variables for Production:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key |
| `SUPABASE_SECRET_KEY` | secret key (server only) |
| `DEVICE_SECRETS_JSON` | `{"TABLE-A":"<64 hex>"}`, one entry per station |
| `AGENT_BRIDGE_SECRET` | `openssl rand -hex 32`, the same value as the agent's |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit Cloud project (Settings → Keys) |
| `AGENT_NAME` | `ichido-intake` (must match the agent) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | optional: fact extraction and teach-back translation |
| `BETTERSTACK_SOURCE_TOKEN`, `BETTERSTACK_INGEST_HOST` | optional: Better Stack logs (section 5) |
| `BETTERSTACK_DEVICE_HEARTBEATS_JSON` | optional: `{"TABLE-A":"<heartbeat URL>"}` (section 5) |
| `FIRMWARE_MANIFEST_JSON` | optional: signed Help Point firmware manifest from `scripts/sign-firmware.mjs` (section 4) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | optional: Gemini decision support, also precomputed by the Ichido Bot when the caller confirms |
| `BOT_REMIND_AT` | optional: when the Ichido Bot reminds, as a share of each `ichido.sla_target` (default `0.75`, when the console's countdown turns amber) |
| `PROMISE_MINUTE_S` | tests only: seconds in one promised minute for the promise timers (default `60`); leave unset in production |

`VERCEL_GIT_COMMIT_SHA` is set by Vercel. It appears in `/api/health` and in every log line. After the first
deploy, check `https://<app>/api/health` → `{"ok":true,"db":"ok","version":"<sha>"}`.

### Ichido Bot (Vercel Workflow)

Each case runs a durable workflow, `web/workflows/case-bot.ts`, built with the Workflow DevKit (`workflow`
package, `withWorkflow` in `next.config.ts`). A fault from a Help Point or a manual registration starts it;
claim, caller confirmation, reply, dispatch, guard update, reset, guidance and abandon wake it through the
run's start hook (`ichido-bot:<case id>`, server-side only: there is no public webhook). Each wake re-reads the
case from the database, so a lost wake only delays the bot until the next event or timer.

The bot **recommends** the operator with the fewest open cases (online operators first, from console presence),
**prepares** the Gemini suggestion so the AI card opens instantly, **reminds** the operator before the
first-reply target and the guard and operator while a dispatched guard has not set off, and **records** the
after-call summary and durations (counts only) when the case closes. It never claims, replies, dispatches or
closes. The pg_cron escalation (`ichido.escalate_due`) is unchanged; the bot's panel shows it beside its steps.

On Vercel the workflow needs no extra service: the Vercel World provides storage, queueing and the run
dashboard (Project → Observability → Workflows). Two settings matter:

- **Settings → Environment Variables → Enable access to System Environment Variables** must be on. The SDK
  recognises a Vercel deployment by `VERCEL_DEPLOYMENT_ID`; without it, it falls back to the Local World and
  every run fails on the read-only filesystem.
- **Fluid compute** (the default for new projects) keeps step functions cheap while they wait on Supabase.

The Next.js proxy rejects the unused public webhook. The SDK authenticates queue deliveries to its flow route.
Keep queue authentication enabled. Locally the Local World
keeps runs in `web/.workflow-data/` (git-ignored); inspect them with `npx workflow web` or
`npx workflow inspect runs`. Cases opened before the bot existed have no run and simply show no bot panel.

## 3. LiveKit Cloud (voice agent)

```sh
cd agent
cp .env.example .env        # fill in: LiveKit keys, SONIOX_API_KEY, ELEVEN_API_KEY, AGENT_BRIDGE_SECRET, BETTERSTACK_*
lk cloud auth
lk agent create --secrets-file .env     # builds agent/Dockerfile and deploys; first time only
lk agent deploy                         # later releases
lk agent logs                           # follow the running agent
```

Deploy the web signer and agent verifier together. The read-back envelope binds the per-binding voice room, LiveKit caller
identity, text, issuance time and a random nonce. The agent accepts it for 30 seconds and consumes the nonce
once per room session. Keep host clocks synchronized. Mixed protocol versions suppress audio read-back while
typed intake continues. The voice worker forwards only application events to stdout and Better Stack. SDK
recording is disabled for audio, transcripts, logs and traces, with PII redaction enabled.

The secrets are stored by LiveKit Cloud and injected at runtime. They are not baked into the image
(`.dockerignore` excludes `.env`). To build the image locally: `docker build -t ichido-agent agent`.

Speech providers, both with your own keys:

- **Soniox** speech-to-text (`SONIOX_API_KEY`, model `SONIOX_MODEL`, default `stt-rt-v6`; v5 is deprecated
  and is removed on 15 December 2026). The agent sends the caller's language as a strict hint (`bn`, `vi`,
  `id`, `en`, `ja`). Soniox has no Nepali model, so Nepali callers type: the web and mobile apps hide the
  Speak button for `ne` and the token route refuses it (`voice_unavailable`).
- **ElevenLabs** text-to-speech (`ELEVEN_API_KEY`, model `ELEVEN_MODEL`, default `eleven_v4_turbo`). Use a
  model that supports Bengali: `eleven_flash_v2_5` does not. Voices per language are `ELEVEN_VOICE_BN`,
  `ELEVEN_VOICE_VI`, `ELEVEN_VOICE_ID`, `ELEVEN_VOICE_EN` and `ELEVEN_VOICE_JA`. All default to ElevenLabs'
  stock voice `hpp4J3VqNfWAUOO0d1Us`, which v4 speaks in every supported language. v4 Turbo also speaks
  Nepali; once Soniox transcribes it, add `ne-NP` to `LANGS`/`VOICES` in `agent/app.py` with an
  `ELEVEN_VOICE_NE` and to `VOICE_LANGS` in the catalogue. A native-speaker voice from the Voice Library
  sounds better. The agent passes the language code so Bengali is pronounced as Bengali.

Audio extras, both optional (the agent starts without them and logs `audio_setup` with what it used):

- **Background voice cancellation (BVC)** from `livekit-plugins-noise-cancellation` cleans the caller's
  microphone. It is licensed through **LiveKit Cloud** only. On a self-hosted LiveKit server, set
  `NOISE_CANCELLATION=off`.
- **Turn detection**: the multilingual end-of-turn model decides when a Japanese or English caller has
  finished, and an Indonesian one. Bengali and Vietnamese use Silero VAD endpointing (the model does not cover them). The model files come from `download-files`, which the
  Dockerfile runs at build time. If they are missing, every language falls back to VAD endpointing
  (`turn_detector_unavailable` in the logs).

Neither extra produces text. The session has no LLM: the agent only transcribes and speaks server-signed text.

## 4. ESP32 Help Point

```sh
cp firmware/help_point/secrets.example.h firmware/help_point/secrets.h   # git-ignored
```

Set `APP_URL` to the HTTPS app origin and `STATION_ID` to the station identifier. Pin the issuing root
certificate in `ROOT_CA` using a PEM obtained from the CA through a trusted channel. Use the setup portal
to enter the station's Wi-Fi credentials and its unique `DEVICE_SECRET` from `DEVICE_SECRETS_JSON`.

```sh
arduino-cli lib install WiFiManager      # tzapu/WiFiManager (MIT): the setup portal
arduino-cli lib install U8g2             # olikraus/U8g2 (BSD-2-Clause): the optional OLED display
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/help_point
arduino-cli upload  --fqbn esp32:esp32:esp32 -p <port> firmware/help_point
```

Use the default partition scheme (two OTA app slots). The device posts a heartbeat every 60 s (uptime, free heap, RSSI, firmware version, last fault-ack and poll
round trips) to `/api/device/heartbeat`. Operators and managers can read the latest heartbeat in
`public.device_health` (with live updates).

The stock Arduino ESP32 core stores Preferences and Wi-Fi credentials in plaintext NVS. For a field unit,
build the Arduino core with ESP-IDF NVS encryption, protected NVS keys and a matching partition table.
On classic ESP32 the key partition requires flash encryption. Pass `-DICHIDO_REQUIRE_ENCRYPTED_NVS` in the
sketch build flags to fail the build if the SDK lacks NVS encryption. The core initializes encrypted NVS
before the sketch starts. Verify encryption, eFuse state and recovery on a test unit before provisioning
production credentials. The stock core verifies the CA and hostname. For certificate expiry checks, enable
`CONFIG_MBEDTLS_HAVE_TIME_DATE` in the core and allow outbound NTP for the device clock.

### Display (optional)

A 0.96" SSD1306 128×64 I²C OLED lets a caller who cannot hear the handset pair: the operator presses
端末に表示 on a 文字対応 case and the 6-character code appears on the screen for its 5 minutes (gone as soon
as the caller pairs). Otherwise the screen shows the station state in words (ready, alert sent, operator
checking, staff requested / on the way / arrived, guidance confirmed, offline).

```
 ESP32 dev board            SSD1306 OLED (I²C, 0x3C)
 ┌──────────────┐           ┌──────────────┐
 │         3V3  ├───────────┤ VCC          │
 │         GND  ├───────────┤ GND          │
 │ GPIO21 (SDA) ├───────────┤ SDA          │
 │ GPIO22 (SCL) ├───────────┤ SCL          │
 └──────────────┘           └──────────────┘
```

`#define HAS_DISPLAY` in `config.h` turns it on (default); delete the line to build without the library.
Change `PIN_SDA` / `PIN_SCL` in `help_point.ino` for C3/S3 boards. A device with a display polls
`/api/device` with `X-Display: 1` and receives extra `code=`, `ttl=` and `guard=` lines after the state; older
firmware without the header gets the one-word state as before. The plain code is held server-side only while it
is offered (`ichido.device_code`, service role only) and is never logged.

### Setup without reflashing

The `secrets.h` values are only first-boot defaults. To move a Help Point to another network, app or station:

1. Hold the button and power the device on. Keep holding for 8 s (the LED blinks white quickly).
2. The LED blinks magenta and `Ichido-<station>` opens for five minutes. The OLED shows a fresh
   16-character password. A USB build with a unique `PORTAL_PASSWORD` (12–63 characters) uses that
   password instead. A headless device with a provisioned station secret and no explicit portal password
   uses the first 16 hex digits of SHA-256 over `ichido-portal`, a newline, and the secret.
3. Join the network. Enter the Wi-Fi settings, HTTPS app origin and station. Leaving the device secret
   empty retains it for the current destination. A changed origin or station requires a different secret.
4. Save. The device validates the settings and restarts. Invalid settings leave the previous station
   configuration in effect. The Wi-Fi library may have saved the submitted network to its own NVS partition.

For a headless first boot, provision a unique secret or installer password in a private USB build. Leave
`WIFI_SSID`, `WIFI_PASS`, `DEVICE_SECRET` and `PORTAL_PASSWORD` empty in every shared OTA image.
The portal writes case-sensitive station IDs up to 32 characters and device secrets of 16–128 printable
non-space ASCII characters. Generate station secrets with `openssl rand -hex 32`.

### Firmware updates

Help Points install updates over the air, only when they are signed with your key and newer than the running
version. The new image is on probation until it delivers a heartbeat. If it crashes, restarts, or cannot reach
the server for 10 minutes, the bootloader goes back to the previous image.

One-time setup: create a signing key, keep the private half offline, and compile the public half into the
firmware.

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out ota-private.pem   # never commit
openssl pkey -in ota-private.pem -pubout          # paste into firmware/help_point/config.h (OTA_PUBLIC_KEY)
```

Flash the public key over USB for first provisioning. Devices running 1.3 with a real signing key can
upgrade remotely. On devices still using compiled-in credentials, first use the 1.3 setup portal to save
the Wi-Fi details, HTTPS app origin, station ID and current device secret explicitly into NVS. The shared
1.4 image reads those settings and has empty credential defaults. Publish **1.4.0** first, signed by the
same private key. This single bootstrap release
includes both signature formats. Check station heartbeats for 1.4.0 before publishing 1.4.1 or later.
From 1.4 onward devices accept only the signature binding the URL. A device with a placeholder key needs
USB provisioning. Use an OTA partition scheme and a bootloader with rollback enabled.

For each release:

1. Raise `FW_VERSION` in `help_point.ino` (three decimal components in 0–999, e.g. `1.4.1`).
2. Build the image: `arduino-cli compile --fqbn esp32:esp32:esp32 --output-dir build firmware/help_point`.
3. Upload `build/help_point.ino.bin` to a direct HTTPS URL that sends a `Content-Length` without redirects. If that host's root certificate differs from `APP_URL`'s, set
   `OTA_ROOT_CA` in `secrets.h` (see `secrets.example.h`) in the build the devices are running.
4. Sign it and publish the manifest:

   ```sh
   node scripts/sign-firmware.mjs ota-private.pem build/help_point.ino.bin 1.4.1 https://<host>/help_point-1.4.1.bin
   ```

   Put the printed JSON in `FIRMWARE_MANIFEST_JSON` on Vercel and redeploy. Devices pick it up within 6 hours,
   or at their next boot.

The RSA signature covers the version, exact HTTPS URL and SHA-256 digest. Devices install only newer versions. Remove `FIRMWARE_MANIFEST_JSON` to stop offering updates
(`/api/device/firmware` then answers 204). The route logs `device_firmware` with `fw` (the device's version),
`fw_target` and `code` = `offered` / `current` / `none` / `bad_manifest`.

## 5. Better Stack

**Logs.** Telemetry → Sources → Connect source → HTTP. Copy the source token and the ingesting host into
`BETTERSTACK_SOURCE_TOKEN` / `BETTERSTACK_INGEST_HOST` on Vercel. For the agent, create a second source
(Python) and put its token and host in `agent/.env`. Each web log line is JSON with `level`, `message`
(the event), `route`, `request_id`, `version`, and, where relevant, `cmd`, `role`, `station`, `incident`,
`status`, `code` and `duration_ms`. Logs never contain caller words, drafts, pairing codes, tokens or secrets.
Useful events:

| Event | Meaning |
|---|---|
| `cmd` | every `/api/cmd` call: `cmd`, `role`, `status`, `code` (error or `withheld`), `duration_ms` |
| `device_fault` | Help Point alert: `station`, `incident`, `repeat` (a retry of an event already recorded) |
| `device_auth_failed` | Invalid device credentials produce the single code `bad_credentials` before the source reaches its failure quota. |
| `device_heartbeat` | device telemetry |
| `device_firmware` | firmware check: `fw`, `fw_target`, `code` (`offered`, `current`, `none`, `bad_manifest`) |
| `disaster_entered`, `disaster_left` | a station entered or left disaster mode: `station`, `role`, `code` (the notice key) |
| `voice_token` | LiveKit token issued or refused (`code`) |
| `unhandled_error` | anything uncaught on the server (`instrumentation.ts`) |
| `bot_start` | Ichido Bot run started for a case: `incident`, `run_id`, `code` (`started` / `start_failed`) |
| `bot_signal` | a command woke the case's run: `cmd`, `code` = `no_run` (case closed or older than the bot) / `signal_failed` |
| `bot_step` | one bot step: `step`, `incident`, `code` (outcome, e.g. `routed_online`, `no_key`, `reminded`, `replied`, `recorded`), `duration_ms` |
| `job_start`, `job_end`, `stt_latency`, `tts`, `say`, `say_rejected`, `session_error`, `audio_setup`, `turn_detector_unavailable`, `noise_cancellation_unavailable` | agent |

Suggested alerts: `level = "error"` over 0 in 5 min; `message = "device_auth_failed"` over 10 in 5 min;
`message = "bot_step" and code = "failed"` (Gemini could not prepare a suggestion) over 5 in 15 min.

**Uptime.** Uptime → Monitors → Create: URL `https://<app>/api/health`, alert when the status is not 2xx.
It returns 503 when the database does not answer.

**Device heartbeats.** Uptime → Heartbeats → Create one per station, period 1 minute, grace 3 minutes. Put the
URLs in `BETTERSTACK_DEVICE_HEARTBEATS_JSON` as `{"TABLE-A":"https://uptime.betterstack.com/api/v1/heartbeat/…"}`.
The server pings the URL each time that station's heartbeat arrives, so a device that goes silent opens an
incident.

## Local stack and demo data

`supabase start` / `supabase db reset` apply the migrations and `seed.sql`: station `TABLE-A` and the local
demo accounts (`*@ichido.demo`, password `ichido-demo`), which the tests use. For a populated insights page,
load the synthetic history as well. It will not run without the local demo accounts:

```sh
docker exec -i supabase_db_ichido psql -U postgres < supabase/seed-local-history.sql
```
