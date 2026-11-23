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
// Display : optional SSD1306 OLED (HAS_DISPLAY in config.h). Polls with X-Display: 1 and shows the state in words,
//           the guard's progress and a single-use code after a physical press or staffed issue. Pairing or expiry clears it.
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
//   OLED   : SDA GPIO21, SCL GPIO22, VCC 3V3, GND (SSD1306 128x64, I2C address 0x3C). Optional.
//
// Libraries: WiFiManager by tzapu (MIT) and, with HAS_DISPLAY, U8g2 by olikraus (BSD-2-Clause):
//   arduino-cli lib install WiFiManager U8g2. Everything else ships with the core.

#include <WiFi.h>
#include <HTTPClient.h>
#include <http_parser.h>
#include <StreamString.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <Update.h>
#include <WiFiManager.h>
#include <esp_ota_ops.h>
#include <esp_flash_encrypt.h>
#include "mbedtls/base64.h"
#include "mbedtls/pk.h"
#include "mbedtls/sha256.h"
#include "secrets.h"
#include "config.h"
#ifdef HAS_DISPLAY
#include <Wire.h>
#include <U8g2lib.h>
#endif

#define FW_VERSION "1.4.0"

#ifndef PORTAL_PASSWORD
#define PORTAL_PASSWORD ""
#endif
#ifndef OTA_ROOT_CA
#define OTA_ROOT_CA ROOT_CA
#endif

#if defined(ICHIDO_REQUIRE_ENCRYPTED_NVS) && !CONFIG_NVS_ENCRYPTION
#error "This build requires an ESP32 core built with CONFIG_NVS_ENCRYPTION"
#endif

const int PIN_BUTTON = 14;
const int PIN_R = 25, PIN_G = 26, PIN_B = 27;
const int PIN_SDA = 21, PIN_SCL = 22;

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
String pairCode = "";                      // shown on the display while the server offers it
unsigned long codeUntilMs = 0;
String guardState = "";                    // requested | on_way | arrived | done, or empty

#ifdef HAS_DISPLAY
U8G2_SSD1306_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);
String shownKey = "";                      // what is on the screen now, so it is redrawn only on change

// Up to three lines of text, or (with code set) the pairing code in large type.
void drawScreen(const char *title, const String &l1, const String &l2 = "", const String &code = "") {
  String key = String(title) + "|" + l1 + "|" + l2 + "|" + code;
  if (key == shownKey) return;
  shownKey = key;
  oled.clearBuffer();
  oled.setFont(u8g2_font_6x12_tr);
  oled.drawStr(0, 10, title);
  oled.drawHLine(0, 13, 128);
  if (code.length()) {
    oled.setFont(u8g2_font_logisoso22_tr);
    oled.drawStr((128 - oled.getStrWidth(code.c_str())) / 2, 44, code.c_str());
    oled.setFont(u8g2_font_6x12_tr);
    oled.drawStr(0, 62, l1.c_str());
  } else {
    oled.setFont(u8g2_font_helvR10_tr);
    oled.drawStr(0, 34, l1.c_str());
    oled.drawStr(0, 52, l2.c_str());
  }
  oled.sendBuffer();
}
#endif

bool validCode(const String &c) {
  if (c.length() != 6) return false;
  for (char ch : c) if (!isupper(ch) && !isdigit(ch)) return false;
  return true;
}

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

// ---------- status light and button ----------

#ifdef HAS_DISPLAY
// Words for the station state. The code is shown only while fresh and unexpired; never while offline.
void showDisplay(bool stale) {
  const char *title = "Ichido Help Point";
  if (stale) return drawScreen(title, "Offline", "Reconnecting...");
  long left = (long)(codeUntilMs - millis()) / 1000;
  if (pairCode.length() && left > 0) {
    char line[32];
    snprintf(line, sizeof line, "Type on phone  %ld:%02ld", left / 60, left % 60);
    return drawScreen("Your code", line, "", pairCode);
  }
  if (guardState == "on_way") return drawScreen(title, "Staff are on", "the way");
  if (guardState == "arrived") return drawScreen(title, "Staff have", "arrived");
  if (state == "field") return drawScreen(title, "Staff visit", "requested");
  if (state == "received") return drawScreen(title, "Alert sent", "Operator notified");
  if (state == "review") return drawScreen(title, "Operator is", "checking");
  if (state == "guided") return drawScreen(title, "Guidance", "confirmed");
  drawScreen(title, "Press the button", "for help");
}
#endif

void showState() {
  unsigned long t = millis();
  bool stale = !haveState || WiFi.status() != WL_CONNECTED || t - lastFreshMs > STALE_MS;
#ifdef HAS_DISPLAY
  showDisplay(stale);
#endif
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
  // The offline signer accepts only images built without installer or station credentials.
  constexpr bool shareable = sizeof(WIFI_SSID) == 1 && sizeof(WIFI_PASS) == 1 &&
                             sizeof(DEVICE_SECRET) == 1 && sizeof(PORTAL_PASSWORD) == 1;
  Serial.println(shareable ? "ichido-release/2:" FW_VERSION : "Ichido private USB build " FW_VERSION);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_R, OUTPUT); pinMode(PIN_G, OUTPUT); pinMode(PIN_B, OUTPUT);
#ifdef HAS_DISPLAY
  Wire.begin(PIN_SDA, PIN_SCL);
  oled.begin();
  drawScreen("Ichido Help Point", "Starting...", "firmware " FW_VERSION);
#endif
  // The core initializes the default NVS partition with encryption when CONFIG_NVS_ENCRYPTION is enabled.
#if defined(ICHIDO_REQUIRE_ENCRYPTED_NVS) && CONFIG_IDF_TARGET_ESP32
  if (!esp_flash_encryption_enabled()) {
    Serial.println("Device disabled: protected NVS keys require flash encryption");
    for (;;) delay(1000);
  }
#endif
  if (!store.begin("helppoint", false)) {
    Serial.println("Device disabled: NVS unavailable");
    for (;;) delay(1000);
  }
  loadSettings();
  // Any reboot before the first heartbeat (including opening the portal) rolls a new image back.
  onProbation = runningOnProbation();
  if (onProbation) Serial.println("firmware on probation until the first heartbeat");
  if (heldForSetup()) runSetupPortal();               // does not return
  pendingEvent = store.getString("pending", "");     // resend an alert interrupted by a reboot
  attachInterrupt(digitalPinToInterrupt(PIN_BUTTON), onPress, FALLING);
  WiFi.mode(WIFI_STA);
#if CONFIG_MBEDTLS_HAVE_TIME_DATE
  configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
#endif
  String ssid = store.getString("ssid", WIFI_SSID);
  if (!ssid.isEmpty()) WiFi.begin(ssid.c_str(), store.getString("pass", WIFI_PASS).c_str());
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
