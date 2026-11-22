// Ichido Help Point — ESP32 prop that stands in for an ATM on the demo table.
//
// Button  : reports the fault "card not returned" once per press (debounced).
//           Each press gets a random 32-hex event id; retries reuse it, so the server opens one case.
// RGB LED : shows the station state polled from the server:
//           idle = off, received = amber, review = blue, field = amber blinking,
//           guided = blue slow pulse, offline / no fresh state = red blinking.
//           There is deliberately no green "collect your card" signal.
//
// Wiring (classic ESP32 dev board; change the pins below for C3/S3 boards):
//   button : GPIO14 -> button -> GND (internal pull-up)
//   LED    : GPIO25 red, GPIO26 green, GPIO27 blue, each through 330 Ω; common cathode to GND.
//
// Settings live in secrets.h (copy secrets.example.h; secrets.h is git-ignored).

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "secrets.h"

const int PIN_BUTTON = 14;
const int PIN_R = 25, PIN_G = 26, PIN_B = 27;

const unsigned long DEBOUNCE_MS = 40;
const unsigned long POLL_MS = 2000;
const unsigned long STALE_MS = 10000;      // no successful poll for this long -> show offline
const unsigned long RETRY_MS = 1500;
const int MAX_RETRIES = 8;

String state = "offline";
unsigned long lastFreshMs = 0, lastPollMs = 0;
String pendingEvent = "";                  // an unacknowledged fault event, retried with the same id
int pendingTries = 0;
unsigned long lastRetryMs = 0;
int lastButton = HIGH, stableButton = HIGH;
unsigned long buttonChangedMs = 0;

String newEventId() {
  char buf[33];
  for (int i = 0; i < 4; i++) sprintf(buf + i * 8, "%08lx", (unsigned long)esp_random());
  return String(buf);
}

// HTTPS with the configured root CA; plain HTTP is allowed only for a LAN dev server.
bool begin(HTTPClient &http, WiFiClientSecure &tls, WiFiClient &plain, const String &path) {
  String url = String(APP_URL) + path;
  bool ok = url.startsWith("https://") ? (tls.setCACert(ROOT_CA), http.begin(tls, url)) : http.begin(plain, url);
  if (!ok) return false;
  http.setTimeout(4000);
  http.addHeader("X-Station", STATION_ID);
  http.addHeader("Authorization", String("Bearer ") + DEVICE_SECRET);
  return true;
}

bool sendFault(const String &eventId) {
  HTTPClient http; WiFiClientSecure tls; WiFiClient plain;
  if (!begin(http, tls, plain, "/api/device")) return false;
  http.addHeader("Content-Type", "text/plain");
  int code = http.POST(eventId);
  http.end();
  Serial.printf("fault %s -> %d\n", eventId.c_str(), code);
  return code == 204;
}

void poll() {
  HTTPClient http; WiFiClientSecure tls; WiFiClient plain;
  if (!begin(http, tls, plain, "/api/device")) return;
  int code = http.GET();
  if (code == 200) {
    state = http.getString();
    state.trim();
    lastFreshMs = millis();
  }
  http.end();
}

void setRgb(bool r, bool g, bool b) {
  digitalWrite(PIN_R, r); digitalWrite(PIN_G, g); digitalWrite(PIN_B, b);
}

void showState() {
  unsigned long t = millis();
  bool stale = WiFi.status() != WL_CONNECTED || t - lastFreshMs > STALE_MS;
  bool fast = (t / 250) % 2, slow = (t / 900) % 2;
  if (stale) return setRgb(fast, false, false);
  if (state == "received") return setRgb(true, true, false);
  if (state == "review") return setRgb(false, false, true);
  if (state == "field") return setRgb(fast, fast, false);
  if (state == "guided") return setRgb(false, false, slow);
  setRgb(false, false, false);
}

void readButton() {
  int raw = digitalRead(PIN_BUTTON);
  if (raw != lastButton) { buttonChangedMs = millis(); lastButton = raw; }
  if (millis() - buttonChangedMs < DEBOUNCE_MS || raw == stableButton) return;
  stableButton = raw;
  if (stableButton == LOW && pendingEvent.isEmpty()) {
    pendingEvent = newEventId();
    pendingTries = 0;
    lastRetryMs = 0;
  }
}

void retryPending() {
  if (pendingEvent.isEmpty() || millis() - lastRetryMs < RETRY_MS) return;
  lastRetryMs = millis();
  if (sendFault(pendingEvent) || ++pendingTries >= MAX_RETRIES) pendingEvent = "";
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_R, OUTPUT); pinMode(PIN_G, OUTPUT); pinMode(PIN_B, OUTPUT);
  stableButton = lastButton = digitalRead(PIN_BUTTON);  // a button held during boot does not fire
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void loop() {
  readButton();
  if (WiFi.status() == WL_CONNECTED) {
    retryPending();
    if (millis() - lastPollMs > POLL_MS) { lastPollMs = millis(); poll(); }
  }
  showState();
  delay(10);
}
