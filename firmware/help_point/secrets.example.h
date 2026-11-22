// Copy to secrets.h (git-ignored) and fill in.
// WIFI_*, APP_URL, STATION_ID and DEVICE_SECRET are first-boot defaults only: the setup portal (hold the
// button for 8 s while powering on) saves new values to flash, and saved values win over these.
#pragma once

#define WIFI_SSID ""
#define WIFI_PASS ""

// HTTPS app origin, including an optional port. No trailing slash.
#define APP_URL "https://your-app.vercel.app"

// Must match a key in DEVICE_SECRETS_JSON on the server.
#define STATION_ID "TABLE-A"
#define DEVICE_SECRET ""

// Leave WIFI_SSID, WIFI_PASS, DEVICE_SECRET and PORTAL_PASSWORD empty in shared OTA images.
// The OLED shows a random setup password per session. For a headless first USB flash, set a unique
// PORTAL_PASSWORD (12-63 characters) or supply a per-device DEVICE_SECRET. See docs/DEPLOY.md.
// #define PORTAL_PASSWORD ""

// Pinned trust anchor for APP_URL. Obtain its PEM from the CA through a trusted channel.
static const char ROOT_CA[] = R"PEM(
-----BEGIN CERTIFICATE-----
paste the issuer's root certificate here
-----END CERTIFICATE-----
)PEM";

// Optional: if firmware images are hosted on another HTTPS host with a different root, add its PEM as
// OTA_ROOT_CA_PEM and uncomment the define. The image's signature is checked either way (config.h).
// static const char OTA_ROOT_CA_PEM[] = R"PEM(...)PEM";
// #define OTA_ROOT_CA OTA_ROOT_CA_PEM
