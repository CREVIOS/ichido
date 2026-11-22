// Copy to secrets.h (git-ignored) and fill in.
// WIFI_*, APP_URL, STATION_ID and DEVICE_SECRET are first-boot defaults only: the setup portal (hold the
// button for 8 s while powering on) saves new values to flash, and saved values win over these.
#pragma once

#define WIFI_SSID "your-hotspot"
#define WIFI_PASS "your-password"

// Deployed app, e.g. "https://ichido.vercel.app", or a LAN dev server "http://192.168.1.20:3123".
#define APP_URL "https://your-app.vercel.app"

// Must match a key in DEVICE_SECRETS_JSON on the server.
#define STATION_ID "TABLE-A"
#define DEVICE_SECRET "long-random-secret"

// Optional: Wi-Fi password of the setup portal (8-63 characters). Without it, the password is the first 12 hex
// characters of SHA-256("ichido-portal\n" + device secret), printed on the serial console when the portal opens:
//   printf 'ichido-portal\n%s' "$DEVICE_SECRET" | shasum -a 256 | cut -c1-12
// #define PORTAL_PASSWORD "choose-a-long-one"

// Root certificate of APP_URL's issuer (PEM). Used only for https:// URLs.
static const char ROOT_CA[] = R"PEM(
-----BEGIN CERTIFICATE-----
paste the issuer's root certificate here
-----END CERTIFICATE-----
)PEM";

// Optional: if firmware images are hosted on another HTTPS host with a different root, add its PEM as
// OTA_ROOT_CA_PEM and uncomment the define. The image's signature is checked either way (config.h).
// static const char OTA_ROOT_CA_PEM[] = R"PEM(...)PEM";
// #define OTA_ROOT_CA OTA_ROOT_CA_PEM
