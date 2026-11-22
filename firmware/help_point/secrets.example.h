// Copy to secrets.h (git-ignored) and fill in.
#pragma once

#define WIFI_SSID "your-hotspot"
#define WIFI_PASS "your-password"

// Deployed app, e.g. "https://ichido.vercel.app", or a LAN dev server "http://192.168.1.20:3123".
#define APP_URL "https://your-app.vercel.app"

// Must match a key in DEVICE_SECRETS_JSON on the server.
#define STATION_ID "TABLE-A"
#define DEVICE_SECRET "long-random-secret"

// Root certificate of APP_URL's issuer (PEM). Used only for https:// URLs.
static const char ROOT_CA[] = R"PEM(
-----BEGIN CERTIFICATE-----
paste the issuer's root certificate here
-----END CERTIFICATE-----
)PEM";
