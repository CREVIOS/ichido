String sha256Hex(const uint8_t *data, size_t len) {
  uint8_t h[32];
  mbedtls_sha256(data, len, h, 0);
  char hex[65];
  for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", h[i]);
  return String(hex);
}

// ---------- settings and setup portal ----------

void loadSettings() {
  String saved = store.getString("settings", "");
  if (saved.length()) {
    int first = saved.indexOf('\n'), second = saved.indexOf('\n', first + 1);
    if (first <= 0 || second <= first) return;
    appUrl = saved.substring(0, first);
    stationId = saved.substring(first + 1, second);
    deviceSecret = saved.substring(second + 1);
    return;
  }
  // Settings stored by firmware before 1.4.
  appUrl = store.getString("app_url", APP_URL);
  stationId = store.getString("station", STATION_ID);
  deviceSecret = store.getString("secret", DEVICE_SECRET);
}

bool validSecret(const String &s) {
  if (s.length() < 16 || s.length() > 128 || s == "long-random-secret") return false;
  for (char c : s) if (c < '!' || c > '~') return false;
  return true;
}

String portalPassword() {
  String p = PORTAL_PASSWORD;
  if (p.length()) return p.length() >= 12 && p.length() <= 63 ? p : String();
#ifdef HAS_DISPLAY
  WiFi.mode(WIFI_STA);  // RF entropy for this setup session
  return newEventId().substring(0, 16);
#else
  if (!validSecret(deviceSecret)) return "";
  String seed = "ichido-portal\n" + deviceSecret;
  return sha256Hex((const uint8_t *)seed.c_str(), seed.length()).substring(0, 16);
#endif
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

bool validOrigin(const String &url) {
  if (!url.startsWith("https://") || url.length() > 128) return false;
  http_parser_url parts{};
  if (http_parser_parse_url(url.c_str(), url.length(), 0, &parts) != 0) return false;
  const unsigned origin = (1 << UF_SCHEMA) | (1 << UF_HOST);
  return parts.field_set == origin || (parts.field_set == (origin | (1 << UF_PORT)) && parts.port > 0);
}

bool validStation(const String &s) {
  if (s.isEmpty() || s.length() > 32) return false;
  for (char c : s) if (!isalnum((unsigned char)c) && c != '-' && c != '_') return false;
  return true;
}

// Open the captive portal; save what the installer entered, then restart into normal operation.
void runSetupPortal() {
  String pass = portalPassword();
  if (pass.isEmpty()) {
    Serial.println("Setup requires a per-device provisioning password");
    return;
  }
  WiFiManager wm;
  wm.setDebugOutput(false);
  wm.setShowInfoUpdate(false);
  wm.setSaveConnect(false);
  wm.setSaveConnectTimeout(5);
  WiFiManagerParameter pUrl("app_url", "App URL", validOrigin(appUrl) ? appUrl.c_str() : "", 128);
  WiFiManagerParameter pStation("station", "Station ID", validStation(stationId) ? stationId.c_str() : "", 32);
  WiFiManagerParameter pSecret("secret", "Device secret (leave empty to keep)", "", 128, "type='password'");
  wm.addParameter(&pUrl);
  wm.addParameter(&pStation);
  wm.addParameter(&pSecret);
  bool saved = false;
  wm.setSaveConfigCallback([&saved]() { saved = true; });
  wm.setBreakAfterConfig(true);          // finish on save even if the new Wi-Fi does not connect here
  wm.setConfigPortalBlocking(false);     // so the LED keeps blinking; the 5-minute limit is enforced below

  String ap = "Ichido-" + (validStation(stationId) ? stationId : String("Setup"));
  Serial.println("Setup portal open");
#ifdef HAS_DISPLAY
  drawScreen(ap.c_str(), "Setup password", sizeof(PORTAL_PASSWORD) == 1 ? pass : "See installer record");
#endif
  wm.startConfigPortal(ap.c_str(), pass.c_str());
  // WiFiManager also registers an unsigned uploader and factory erase handler.
  if (!wm.server || !wm.server->removeRoute("/u", HTTP_POST) || !wm.server->removeRoute("/update") ||
      !wm.server->removeRoute("/erase")) {
    wm.stopConfigPortal();
    ESP.restart();
    return;
  }
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
    if ((url != appUrl || station != stationId) && (secret.isEmpty() || secret == deviceSecret)) {
      Serial.println("Setup: changing the destination requires its own device secret");
    } else {
      if (secret.isEmpty()) secret = deviceSecret;
      String ssid = wm.getWiFiSSID();
      if (validOrigin(url) && validStation(station) && validSecret(secret) &&
          store.putString("settings", url + "\n" + station + "\n" + secret) > 0) {
        if (ssid.length()) {
          store.putString("ssid", ssid);
          store.putString("pass", wm.getWiFiPass());
        }
        if (store.isKey("secret")) store.remove("secret");
        Serial.println("Setup saved");
      } else {
        Serial.println("Setup rejected or storage unavailable");
      }
    }
    setRgb(true, false, true);
    delay(1000);
  } else {
    Serial.println("setup portal timed out");
  }
  wm.stopConfigPortal();
  ESP.restart();
}
