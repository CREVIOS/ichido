# Ichido mobile

The Expo (React Native) app for every Ichido role: caller, operator, security guard and manager. It talks to the same backend as the web app: Supabase for reads (row-level security) and Realtime, and the web origin's `/api/cmd` and `/api/livekit/token` for every write. Nothing is faked on the phone.

| Screen | Route | Who |
|---|---|---|
| Role entry | `/` | everyone: caller path (Help Point name or link, language) and staff sign-in |
| Help Point | `/s/[station]` | caller: language, the operator's single-use code |
| Caller | `/caller` | AI notice, voice or typed intake, read-back and correction, number withholding, operator reply, wait/leave, guard status and ETA, teach-back, ask a person, rating faces after a guided close |
| Operator | `/operator`, `/operator/[id]` | queue with status dots and response-time countdowns (`SLA`), simulated fault, case view, Gemini suggestion (reasons, risks, timed trace; adopt = send + assign) (machine state, original words, confirmed facts, timeline, teach-back with translation label), claim, remote release, pairing code, approved replies, dispatch / reassign, outcome, reset caller, abandon |
| Guard | `/field` | own assignments, on the way with own estimate, arrived, done |
| Insights | `/insights`, `/insights/[metric]` | operator, manager: the web's metric cards (daily cases, funnel, first reply, languages, hours, wait/leave, ratings); each opens its definition, a 7/14/30-day period and a chart |

Every screen refetches on Realtime inserts/updates of the same tables as `web/lib/live.ts`, plus a 5-second poll and pull-to-refresh.

## Design and charts

`theme.ts` holds the same tokens as `web/app/globals.css` (canvas `#F5F5F5`, white surfaces with `rgba(0,0,0,0.08)` hairlines, `#0A0A0A` actions, Inter 400 headings at −3% tracking, DM Mono numbers), converted from oklch to sRGB. `components/ui.tsx` has the shared pieces: tinted status `Pill`, status `Dot`, `SegBar`, `Segments`, hairline `Row` lists and the Ichido `Mark` (paths in `components/mark.ts`, copied from `web/components/mark.tsx`).

Charts use [react-native-gifted-charts](https://github.com/Abhinandan-Kushwaha/react-native-gifted-charts) (MIT, on `react-native-svg` and `expo-linear-gradient`), wrapped in `components/charts.tsx` (`Lines`, `Bars`, `Donut`, with touch tooltips). `components/metrics.tsx` mirrors `web/app/insights/metrics.tsx` and reads the same RPCs, `insights` and `insights_ratings`.

App icon, adaptive icon layers, favicon and splash are rendered from the mark with sharp (installed by the web app):

```sh
NODE_PATH=../web/node_modules node scripts/icons.mjs
```

## Content

All wording comes from `web/content/catalogue.ts`, imported directly (`@content/catalogue`, see `tsconfig.json` and `metro.config.js`). Mobile-only strings are in its `MOBILE` export. Do not copy strings into the app.

## Setup

Prerequisites: Node 24, Xcode (iOS) or Android Studio (Android), CocoaPods, and the local stack from the root README (`supabase start`, `cd web && npm run dev`).

```sh
cd mobile
cp .env.example .env    # fill in from `supabase status` and the web dev server
npm install
```

| Variable | What |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase API URL, e.g. `http://127.0.0.1:54321` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `EXPO_PUBLIC_API_URL` | Web app origin, e.g. `http://localhost:3000`. If it is `https://…`, the build also claims `https://<host>/s/*` links (Android intent filter, iOS associated domain) |

On the iOS simulator `127.0.0.1` and `localhost` reach the Mac. On the Android emulator use `10.0.2.2`. On a physical phone use the Mac's LAN address.

## Development build (required)

Voice intake uses LiveKit's native WebRTC module, so the app does not run in Expo Go. Build a development client once, then iterate with Metro:

```sh
npx expo run:ios                 # or: npx expo run:android
npx expo start --dev-client      # later sessions
```

`app.config.ts` applies `@livekit/react-native-expo-plugin` and `@config-plugins/react-native-webrtc` during prebuild, and sets the microphone usage text. `ios/` and `android/` are generated; do not edit them.

Expo SDK 58 needs **Xcode 26** (Swift 6.2) for `expo run:ios`; Xcode 16 fails at "Could not resolve package dependencies … Swift tools version 6.2.0".

**Without a development build** (`npx expo start --go`), everything except voice runs in Expo Go: `lib/voice.ts` loads LiveKit only when its native module is present, and the caller sees "Voice is not available now — please type". In Expo Go, deep links take the form `exp://<host>:8081/--/s/TABLE-A`.

Voice is optional. If the web server has no LiveKit keys, `/api/livekit/token` answers 503 and the caller sees "Voice is not available now — please type"; the typed path works unchanged.

## Deep links

- `ichido://s/TABLE-A` opens the Help Point screen for that station.
- `https://<EXPO_PUBLIC_API_URL host>/s/TABLE-A` does the same once the app is installed. Android verifies the link with `/.well-known/assetlinks.json` on that host; iOS needs `/.well-known/apple-app-site-association` with your Apple team id. Until those files are served, the link opens the web page, and the role entry screen also accepts a pasted Help Point link.

```sh
xcrun simctl openurl booted "ichido://s/TABLE-A"
```

## Checks

```sh
npx tsc --noEmit
npx expo-doctor
npx expo export --platform ios
```

## Rules the app keeps

The same as the web app: it never asks for a PIN, card, account or ID number (the server withholds text that looks like one and the caller is told); callers see only catalogue replies and only their own case; staff never read drafts, only what the caller confirmed; the AI drafts and a person decides.
