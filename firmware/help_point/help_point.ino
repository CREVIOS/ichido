// Ichido Help Point — ESP32 prop that stands in for an ATM on the demo table.
//
// Button  : reports the fault "card not returned" once per press. An interrupt latches presses made while
//           a request is in flight. Each press gets a random 32-hex event id, saved to flash before sending and
//           retried with backoff until the server acknowledges it, so a reboot or outage never loses the alert
//           and retries never open a second case.
// RGB LED : shows the station state polled from the server:
//           idle = off, received = amber, review = blue, field = amber blinking,
//           guided = blue slow pulse, fraud = red steady (the operator suspects phone fraud: staff are coming),
//           offline / no valid state yet = red blinking.
//           Device states: setup hold = white fast blink, setup portal open = magenta slow blink,
//           firmware download = white steady.
//           There is deliberately no green "collect your card" signal.
// Heartbeat: every 60 s, POST /api/device/heartbeat with uptime, free heap, Wi-Fi RSSI, firmware version
//           and the last fault-ack and poll round trips, so the desk can see the device is alive.
// Setup   : hold the button for 8 s while powering on. The device opens a password-protected Wi-Fi setup
//           portal "Ichido-<station>" for 5 minutes (WiFiManager) to set Wi-Fi, app URL, station id and device
//           secret. Values are saved to flash; secrets.h only supplies the first-boot defaults.
// Updates : every 6 h (and after the first heartbeat), GET /api/device/firmware. A newer version is installed
//           only if its manifest is signed by the key in config.h and the downloaded image matches the signed
//           SHA-256. The new image stays on probation (bootloader rollback) until it delivers a heartbeat; if it
//           crashes, reboots, or has not reached the server within 10 minutes, the previous image boots again.
//
// Wiring (classic ESP32 dev board; change the pins below for C3/S3 boards):
//   button : GPIO14 -> button -> GND (internal pull-up)
//   LED    : GPIO25 red, GPIO26 green, GPIO27 blue, each through 330 Ω; common cathode to GND.
//
// Libraries: WiFiManager by tzapu (arduino-cli lib install WiFiManager). Everything else ships with the core.

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <Update.h>
#include <WiFiManager.h>
#include <esp_ota_ops.h>
#include "mbedtls/base64.h"
#include "mbedtls/pk.h"
#include "mbedtls/sha256.h"
#include "secrets.h"
#include "config.h"

#define FW_VERSION "1.2.0"

#ifndef PORTAL_PASSWORD
#define PORTAL_PASSWORD ""
#endif
#ifndef OTA_ROOT_CA
#define OTA_ROOT_CA ROOT_CA
#endif

const int PIN_BUTTON = 14;
const int PIN_R = 25, PIN_G = 26, PIN_B = 27;

const unsigned long DEBOUNCE_MS = 40;
const unsigned long POLL_MS = 2000;
const unsigned long STALE_MS = 10000;      // no successful poll for this long -> show offline
const unsigned long RETRY_MIN_MS = 1500;
const unsigned long RETRY_MAX_MS = 30000;
const unsigned long HEARTBEAT_MS = 60000;
const unsigned long SETUP_HOLD_MS = 8000;
const unsigned long PORTAL_MS = 5UL * 60 * 1000;
const unsigned long OTA_CHECK_MS = 6UL * 60 * 60 * 1000;
const unsigned long OTA_PROBATION_MS = 10UL * 60 * 1000;
const char *KNOWN_STATES[] = {"idle", "received", "review", "field", "guided", "fraud"};

Preferences store;
String appUrl, stationId, deviceSecret;    // from flash, falling back to secrets.h
String state = "";
bool haveState = false;                    // offline until the first valid answer
unsigned long lastFreshMs = 0, lastPollMs = 0;
String pendingEvent = "";                  // unacknowledged fault event (also kept in flash)
unsigned long retryDelayMs = RETRY_MIN_MS, lastRetryMs = 0;
volatile unsigned long pressedAtMs = 0;    // set by the interrupt, consumed in loop()
unsigned long lastAcceptedPressMs = 0;
long ackRttMs = -1, pollRttMs = -1;        // last round trips; -1 = none since boot
unsigned long lastHeartbeatMs = 0;
bool heartbeatSent = false;
bool onProbation = false;                  // running a freshly installed image that has not proved itself yet
bool otaChecked = false;
unsigned long lastOtaMs = 0;

// The Arduino core marks a new image valid right at boot unless this returns true; we confirm it ourselves
// after the first successful heartbeat (see heartbeat()).
extern "C" bool verifyRollbackLater() { return true; }

String newEventId() {
  char buf[33];
  for (int i = 0; i < 4; i++) sprintf(buf + i * 8, "%08lx", (unsigned long)esp_random());
  return String(buf);
}

void IRAM_ATTR onPress() { pressedAtMs = millis(); }

bool isKnownState(const String &s) {
  for (const char *k : KNOWN_STATES) if (s == k) return true;
  return false;
}

void setRgb(bool r, bool g, bool b) {
  digitalWrite(PIN_R, r); digitalWrite(PIN_G, g); digitalWrite(PIN_B, b);
}

String sha256Hex(const uint8_t *data, size_t len) {
  uint8_t h[32];
  mbedtls_sha256(data, len, h, 0);
  char hex[65];
  for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", h[i]);
  return String(hex);
}

// ---------- settings and setup portal ----------

void loadSettings() {
  appUrl = store.getString("app_url", APP_URL);
  stationId = store.getString("station", STATION_ID);
  deviceSecret = store.getString("secret", DEVICE_SECRET);
}

String portalPassword() {
  String p = PORTAL_PASSWORD;
  if (p.length() >= 8 && p.length() <= 63) return p;
  String seed = "ichido-portal\n" + deviceSecret;
  return sha256Hex((const uint8_t *)seed.c_str(), seed.length()).substring(0, 12);
}

// True when the button is held from power-on for SETUP_HOLD_MS. Short bounces do not end the hold.
bool heldForSetup() {
  if (digitalRead(PIN_BUTTON) != LOW) return false;
  unsigned long t0 = millis(), lastLow = t0;
  while (millis() - lastLow < DEBOUNCE_MS) {
    if (digitalRead(PIN_BUTTON) == LOW) lastLow = millis();
    if (lastLow - t0 >= SETUP_HOLD_MS) return true;
    bool on = (millis() / 125) % 2;
    setRgb(on, on, on);
    delay(5);
  }
  setRgb(false, false, false);
  return false;
}

bool validUrl(const String &u) {
  return (u.startsWith("https://") || u.startsWith("http://")) && u.length() <= 128 && u.indexOf(' ') < 0;
}

bool validStation(const String &s) {
  if (s.isEmpty() || s.length() > 32) return false;
  for (char c : s) if (!isalnum(c) && c != '-' && c != '_') return false;
  return true;
}

// Open the captive portal; save what the installer entered, then restart into normal operation.
void runSetupPortal() {
  WiFiManager wm;
  WiFiManagerParameter pUrl("app_url", "App URL", appUrl.c_str(), 128);
  WiFiManagerParameter pStation("station", "Station ID", stationId.c_str(), 32);
  WiFiManagerParameter pSecret("secret", "Device secret (leave empty to keep)", "", 128, "type='password'");
  wm.addParameter(&pUrl);
  wm.addParameter(&pStation);
  wm.addParameter(&pSecret);
  bool saved = false;
  wm.setSaveConfigCallback([&saved]() { saved = true; });
  wm.setBreakAfterConfig(true);          // finish on save even if the new Wi-Fi does not connect here
  wm.setConfigPortalBlocking(false);     // so the LED keeps blinking; the 5-minute limit is enforced below

  String ap = "Ichido-" + stationId, pass = portalPassword();
  Serial.printf("setup portal: Wi-Fi \"%s\", password %s, open for %lu s\n", ap.c_str(), pass.c_str(), PORTAL_MS / 1000);
  wm.startConfigPortal(ap.c_str(), pass.c_str());
  unsigned long t0 = millis();
  while (!saved && millis() - t0 < PORTAL_MS) {
    wm.process();
    bool on = (millis() / 600) % 2;
    setRgb(on, false, on);
    delay(10);
  }

  if (saved) {
    String url = pUrl.getValue(), station = pStation.getValue(), secret = pSecret.getValue();
    url.trim(); station.trim(); secret.trim();
    if (validUrl(url)) store.putString("app_url", url); else Serial.println("setup: app URL not saved (invalid)");
    if (validStation(station)) store.putString("station", station); else Serial.println("setup: station not saved (invalid)");
    if (secret.length() >= 16) store.putString("secret", secret);
    else if (!secret.isEmpty()) Serial.println("setup: device secret not saved (shorter than 16 characters)");
    String ssid = wm.getWiFiSSID();
    if (!ssid.isEmpty()) { store.putString("ssid", ssid); store.putString("pass", wm.getWiFiPass()); }
    Serial.println("setup: saved");
    setRgb(true, false, true);
    delay(1000);
  } else {
    Serial.println("setup portal timed out");
  }
  wm.stopConfigPortal();
  ESP.restart();
}

// ---------- server requests ----------

// The transport clients are passed in and declared before HTTPClient by the caller, so they outlive it.
// HTTPS with the configured root CA; plain HTTP is allowed only for a LAN dev server.
bool begin(HTTPClient &http, WiFiClientSecure &tls, WiFiClient &plain, const String &path) {
  String url = appUrl + path;
  bool ok = url.startsWith("https://") ? (tls.setCACert(ROOT_CA), http.begin(tls, url)) : http.begin(plain, url);
  if (!ok) return false;
  http.setTimeout(4000);
  http.addHeader("X-Station", stationId);
  http.addHeader("Authorization", "Bearer " + deviceSecret);
  return true;
}

bool sendFault(const String &eventId) {
  WiFiClientSecure tls; WiFiClient plain; HTTPClient http;
  if (!begin(http, tls, plain, "/api/device")) return false;
  http.addHeader("Content-Type", "text/plain");
  unsigned long t0 = millis();
  int code = http.POST(eventId);
  http.end();
  Serial.printf("fault %s -> %d\n", eventId.c_str(), code);
  if (code == 204) ackRttMs = millis() - t0;
  return code == 204;
}

void poll() {
  WiFiClientSecure tls; WiFiClient plain; HTTPClient http;
  if (!begin(http, tls, plain, "/api/device")) return;
  unsigned long t0 = millis();
  int code = http.GET();
  if (code == 200) {
    pollRttMs = millis() - t0;
    String body = http.getString();
    body.trim();
    if (isKnownState(body)) { state = body; haveState = true; lastFreshMs = millis(); }
  }
  http.end();
}

void heartbeat() {
  WiFiClientSecure tls; WiFiClient plain; HTTPClient http;
  if (!begin(http, tls, plain, "/api/device/heartbeat")) return;
  http.addHeader("Content-Type", "application/json");
  char body[192];
  snprintf(body, sizeof body,
           "{\"uptime_s\":%llu,\"free_heap\":%u,\"rssi\":%d,\"fw\":\"%s\",\"ack_ms\":%ld,\"poll_ms\":%ld}",
           (unsigned long long)(esp_timer_get_time() / 1000000), (unsigned)ESP.getFreeHeap(), (int)WiFi.RSSI(),
           FW_VERSION, ackRttMs, pollRttMs);
  int code = http.POST(body);
  http.end();
  Serial.printf("heartbeat -> %d\n", code);
  if (code == 204 && onProbation) {
    esp_ota_mark_app_valid_cancel_rollback();   // the new image reached the server: keep it
    onProbation = false;
    Serial.println("firmware " FW_VERSION " confirmed");
  }
}

// ---------- signed firmware updates ----------

// Reads one string field from the server's compact JSON manifest. Values with escapes are refused.
String jsonField(const String &body, const char *key) {
  String k = String("\"") + key + "\":\"";
  int a = body.indexOf(k);
  if (a < 0) return "";
  a += k.length();
  int b = body.indexOf('"', a);
  if (b < 0) return "";
  String v = body.substring(a, b);
  return v.indexOf('\\') >= 0 ? "" : v;
}

// a > b for dotted numeric versions ("1.10.0" > "1.9.3").
bool isNewer(const String &a, const char *b) {
  int x[3] = {0, 0, 0}, y[3] = {0, 0, 0};
  if (sscanf(a.c_str(), "%d.%d.%d", &x[0], &x[1], &x[2]) < 1) return false;
  sscanf(b, "%d.%d.%d", &y[0], &y[1], &y[2]);
  for (int i = 0; i < 3; i++) if (x[i] != y[i]) return x[i] > y[i];
  return false;
}

// The signature covers "ichido-fw/1\n<version>\n<sha256 hex>" (see scripts/sign-firmware.mjs), so neither
// the image nor its version can be swapped. Fails closed while config.h holds the placeholder key.
bool manifestSigned(const String &version, const String &sha, const String &sigB64) {
  uint8_t sig[512];
  size_t sigLen = 0;
  if (mbedtls_base64_decode(sig, sizeof sig, &sigLen, (const uint8_t *)sigB64.c_str(), sigB64.length()) != 0) return false;
  String msg = "ichido-fw/1\n" + version + "\n" + sha;
  uint8_t hash[32];
  mbedtls_sha256((const uint8_t *)msg.c_str(), msg.length(), hash, 0);
  mbedtls_pk_context pk;
  mbedtls_pk_init(&pk);
  int parsed = mbedtls_pk_parse_public_key(&pk, (const uint8_t *)OTA_PUBLIC_KEY, sizeof OTA_PUBLIC_KEY);
  bool ok = parsed == 0 && mbedtls_pk_verify(&pk, MBEDTLS_MD_SHA256, hash, sizeof hash, sig, sigLen) == 0;
  mbedtls_pk_free(&pk);
  if (parsed != 0) Serial.println("firmware: no signing key in config.h, updates disabled");
  return ok;
}

// Streams the image into the idle OTA slot while hashing it; commits only if the hash matches.
// ponytail: needs a Content-Length (static hosting gives one); chunked downloads are refused.
bool installImage(const String &url, const String &sha) {
  bool https = url.startsWith("https://");
  if (!https && !(url.startsWith("http://") && appUrl.startsWith("http://"))) return false;   // http only for LAN dev
  WiFiClientSecure tls; WiFiClient plain; HTTPClient http;
  if (!(https ? (tls.setCACert(OTA_ROOT_CA), http.begin(tls, url)) : http.begin(plain, url))) return false;
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.setTimeout(15000);
  int code = http.GET();
  int size = http.getSize();
  if (code != 200 || size <= 0 || !Update.begin(size)) {
    Serial.printf("firmware download -> %d, size %d\n", code, size);
    http.end();
    return false;
  }
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  mbedtls_sha256_starts(&ctx, 0);
  WiFiClient *s = http.getStreamPtr();
  uint8_t buf[1024];
  int done = 0;
  unsigned long lastData = millis();
  while (done < size && millis() - lastData < 15000) {
    int n = s->read(buf, min((int)sizeof buf, size - done));
    if (n <= 0) { delay(5); continue; }
    lastData = millis();
    mbedtls_sha256_update(&ctx, buf, n);
    if (Update.write(buf, n) != (size_t)n) break;
    done += n;
  }
  uint8_t h[32];
  mbedtls_sha256_finish(&ctx, h);
  mbedtls_sha256_free(&ctx);
  http.end();
  char hex[65];
  for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", h[i]);
  if (done != size || !sha.equalsIgnoreCase(hex)) {
    Serial.printf("firmware rejected: %d/%d bytes, hash %s\n", done, size, done == size ? "mismatch" : "-");
    Update.abort();
    return false;
  }
  return Update.end();   // boots the new slot next; the old slot stays for rollback
}

void checkFirmware() {
  WiFiClientSecure tls; WiFiClient plain; HTTPClient http;
  if (!begin(http, tls, plain, "/api/device/firmware")) return;
  http.addHeader("X-Firmware", FW_VERSION);
  int code = http.GET();
  String body = code == 200 ? http.getString() : "";
  http.end();
  Serial.printf("firmware check -> %d\n", code);
  if (code != 200) return;   // 204: no update published
  String version = jsonField(body, "version"), url = jsonField(body, "url");
  String sha = jsonField(body, "sha256"), sig = jsonField(body, "signature");
  if (!isNewer(version, FW_VERSION)) return;
  if (sha.length() != 64 || !manifestSigned(version, sha, sig)) {
    Serial.printf("firmware %s refused: manifest not signed by our key\n", version.c_str());
    return;
  }
  Serial.printf("firmware %s: downloading\n", version.c_str());
  setRgb(true, true, true);
  if (!installImage(url, sha)) return;
  Serial.printf("firmware %s installed, restarting\n", version.c_str());
  delay(200);
  ESP.restart();
}

bool runningOnProbation() {
  esp_ota_img_states_t st;
  return esp_ota_get_state_partition(esp_ota_get_running_partition(), &st) == ESP_OK && st == ESP_OTA_IMG_PENDING_VERIFY;
}

// ---------- status light and button ----------

void showState() {
  unsigned long t = millis();
  bool stale = !haveState || WiFi.status() != WL_CONNECTED || t - lastFreshMs > STALE_MS;
  bool fast = (t / 250) % 2, slow = (t / 900) % 2;
  if (stale) return setRgb(fast, false, false);
  if (state == "received") return setRgb(true, true, false);
  if (state == "review") return setRgb(false, false, true);
  if (state == "field") return setRgb(fast, fast, false);
  if (state == "guided") return setRgb(false, false, slow);
  if (state == "fraud") return setRgb(true, false, false);
  setRgb(false, false, false);
}

// A press is accepted once per debounce window and only when no fault is already waiting.
void readButton() {
  unsigned long at = pressedAtMs;
  if (at == 0 || at == lastAcceptedPressMs || at - lastAcceptedPressMs < DEBOUNCE_MS) return;
  lastAcceptedPressMs = at;
  if (!pendingEvent.isEmpty() || digitalRead(PIN_BUTTON) != LOW) return;
  pendingEvent = newEventId();
  store.putString("pending", pendingEvent);   // persisted before the first send
  retryDelayMs = RETRY_MIN_MS;
  lastRetryMs = 0;
}

void retryPending() {
  if (pendingEvent.isEmpty() || millis() - lastRetryMs < retryDelayMs) return;
  lastRetryMs = millis();
  if (sendFault(pendingEvent)) {
    pendingEvent = "";
    store.remove("pending");
  } else {
    retryDelayMs = min(retryDelayMs * 2, RETRY_MAX_MS);
  }
}

void setup() {
  Serial.begin(115200);
  Serial.printf("Ichido Help Point firmware %s\n", FW_VERSION);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_R, OUTPUT); pinMode(PIN_G, OUTPUT); pinMode(PIN_B, OUTPUT);
  store.begin("helppoint", false);
  loadSettings();
  // Any reboot before the first heartbeat (including opening the portal) rolls a new image back.
  onProbation = runningOnProbation();
  if (onProbation) Serial.println("firmware on probation until the first heartbeat");
  if (heldForSetup()) runSetupPortal();               // does not return
  pendingEvent = store.getString("pending", "");     // resend an alert interrupted by a reboot
  attachInterrupt(digitalPinToInterrupt(PIN_BUTTON), onPress, FALLING);
  WiFi.mode(WIFI_STA);
  WiFi.begin(store.getString("ssid", WIFI_SSID).c_str(), store.getString("pass", WIFI_PASS).c_str());
}

void loop() {
  readButton();
  if (onProbation && millis() > OTA_PROBATION_MS) {
    Serial.println("new firmware never reached the server: rolling back");
    esp_ota_mark_app_invalid_rollback_and_reboot();
  }
  if (WiFi.status() == WL_CONNECTED) {
    retryPending();
    if (millis() - lastPollMs > POLL_MS) { lastPollMs = millis(); poll(); }
    if (!heartbeatSent || millis() - lastHeartbeatMs >= HEARTBEAT_MS) { lastHeartbeatMs = millis(); heartbeatSent = true; heartbeat(); }
    // Only a confirmed image looks for the next one, and never while an alert is waiting to be sent.
    if (!onProbation && heartbeatSent && pendingEvent.isEmpty() && (!otaChecked || millis() - lastOtaMs >= OTA_CHECK_MS)) {
      otaChecked = true; lastOtaMs = millis(); checkFirmware();
    }
  }
  showState();
  delay(10);
}
