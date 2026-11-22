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

New accounts get a generated 24-character password, printed once. Re-running updates role and name, and keeps
existing passwords. `--reset` rotates the password of every account in the file. To remove someone, delete the
user under Authentication → Users (their staff row goes with it).

### Stations

Each Help Point needs a station row. Run this once per station in the SQL editor. The labels are shown to
callers in their language:

```sql
insert into public.station (id, label, branch, counter_hours, security_company) values (
  'TABLE-A',
  '{"ja": "…", "bn": "…", "en": "…"}',      -- machine location
  '{"ja": "…", "bn": "…", "en": "…"}',      -- branch name
  '{"ja": "…", "bn": "…", "en": "…"}',      -- counter hours
  '…'                                         -- security company
);
insert into public.light (station) values ('TABLE-A');
```

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

`VERCEL_GIT_COMMIT_SHA` is set by Vercel. It appears in `/api/health` and in every log line. After the first
deploy, check `https://<app>/api/health` → `{"ok":true,"db":"ok","version":"<sha>"}`.

## 3. LiveKit Cloud (voice agent)

```sh
cd agent
cp .env.example .env        # fill in: LiveKit keys, GOOGLE_CREDENTIALS_JSON, AZURE_SPEECH_*, AGENT_BRIDGE_SECRET, BETTERSTACK_*
lk cloud auth
lk agent create --secrets-file .env     # builds agent/Dockerfile and deploys; first time only
lk agent deploy                         # later releases
lk agent logs                           # follow the running agent
```

The secrets are stored by LiveKit Cloud and injected at runtime. They are not baked into the image
(`.dockerignore` excludes `.env`). To build the image locally: `docker build -t ichido-agent agent`.

## 4. ESP32 Help Point

```sh
cp firmware/help_point/secrets.example.h firmware/help_point/secrets.h   # git-ignored
```

Set the Wi-Fi details, `APP_URL` (the Vercel URL), `STATION_ID`, `DEVICE_SECRET` (the value from
`DEVICE_SECRETS_JSON`) and `ROOT_CA`. For `*.vercel.app` the issuing root is currently ISRG Root X1 (Let's
Encrypt). Check with `openssl s_client -connect <app>.vercel.app:443 -showcerts`. Then:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/help_point
arduino-cli upload  --fqbn esp32:esp32:esp32 -p <port> firmware/help_point
```

The device posts a heartbeat every 60 s (uptime, free heap, RSSI, firmware version, last fault-ack and poll
round trips) to `/api/device/heartbeat`. Operators and managers can read the latest heartbeat in
`public.device_health` (with live updates).

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
| `device_auth_failed` | wrong or missing device secret: `code` = `bad_secret` / `no_secret` / `unknown_station` |
| `device_heartbeat` | device telemetry |
| `voice_token` | LiveKit token issued or refused (`code`) |
| `unhandled_error` | anything uncaught on the server (`instrumentation.ts`) |
| `job_start`, `job_end`, `stt_latency`, `tts`, `say`, `say_rejected`, `session_error` | agent |

Suggested alerts: `level = "error"` over 0 in 5 min; `message = "device_auth_failed"` over 10 in 5 min.

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
