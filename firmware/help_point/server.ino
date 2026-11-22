// ---------- server requests ----------

// The transport clients are passed in and declared before HTTPClient by the caller, so they outlive it.
// Credentials are sent only over TLS authenticated by the compiled-in CA.
bool begin(HTTPClient &http, WiFiClientSecure &tls, const String &path) {
  if (!validOrigin(appUrl) || !validStation(stationId) || !validSecret(deviceSecret)) return false;
  tls.setCACert(ROOT_CA);
  if (!http.begin(tls, appUrl + path)) return false;
  http.setTimeout(4000);
  http.addHeader("X-Station", stationId);
  http.addHeader("Authorization", "Bearer " + deviceSecret);
  return true;
}

bool sendFault(const String &eventId) {
  WiFiClientSecure tls; HTTPClient http;
  if (!begin(http, tls, "/api/device")) return false;
  http.addHeader("Content-Type", "text/plain");
  unsigned long t0 = millis();
  int code = http.POST(eventId);
  http.end();
  Serial.printf("fault -> %d\n", code);
  if (code == 204) ackRttMs = millis() - t0;
  return code == 204;
}

// HTTPClient handles both fixed-length and chunked replies. Stop before either fills the heap.
class BoundedBody : public StreamString {
 public:
  explicit BoundedBody(size_t maxSize) : limit(maxSize) {}
  size_t write(const uint8_t *data, size_t size) override {
    return size <= limit - length() ? StreamString::write(data, size) : 0;
  }
  size_t write(uint8_t byte) override { return write(&byte, 1); }
 private:
  size_t limit;
};

String readBody(HTTPClient &http, int limit) {
  BoundedBody body(limit);
  if (http.getSize() > limit || http.writeToStream(&body) <= 0) return "";
  return body;
}

void poll() {
  WiFiClientSecure tls; HTTPClient http;
  if (!begin(http, tls, "/api/device")) return;
#ifdef HAS_DISPLAY
  http.addHeader("X-Display", "1");
#endif
  unsigned long t0 = millis();
  int code = http.GET();
  if (code == 200) {
    pollRttMs = millis() - t0;
    String body = readBody(http, 256);
    body.trim();
    // First line: the state. With X-Display, then key=value lines: code=, ttl= (seconds left), guard=.
    int nl = body.indexOf('\n');
    String first = nl < 0 ? body : body.substring(0, nl);
    first.trim();
    if (isKnownState(first)) {
      state = first; haveState = true; lastFreshMs = millis();
      String c = "", g = "";
      long ttl = 0;
      while (nl >= 0) {
        int next = body.indexOf('\n', nl + 1);
        String line = body.substring(nl + 1, next < 0 ? body.length() : next);
        line.trim();
        if (line.startsWith("code=")) c = line.substring(5);
        else if (line.startsWith("ttl=")) ttl = line.substring(4).toInt();
        else if (line.startsWith("guard=")) g = line.substring(6);
        nl = next;
      }
      pairCode = validCode(c) && ttl > 0 && ttl <= 300 ? c : "";
      codeUntilMs = millis() + (pairCode.length() ? (unsigned long)ttl * 1000 : 0);
      guardState = g;
    }
  }
  http.end();
}

void heartbeat() {
  WiFiClientSecure tls; HTTPClient http;
  if (!begin(http, tls, "/api/device/heartbeat")) return;
  http.addHeader("Content-Type", "application/json");
  char body[192];
  snprintf(body, sizeof body,
           "{\"uptime_s\":%llu,\"free_heap\":%u,\"rssi\":%d,\"fw\":\"%s\",\"ack_ms\":%ld,\"poll_ms\":%ld}",
           (unsigned long long)(esp_timer_get_time() / 1000000), (unsigned)ESP.getFreeHeap(), (int)WiFi.RSSI(),
           FW_VERSION, ackRttMs, pollRttMs);
  int code = http.POST(body);
  http.end();
  Serial.printf("heartbeat -> %d\n", code);
  if (code == 204 && onProbation && esp_ota_mark_app_valid_cancel_rollback() == ESP_OK) {
    onProbation = false;
    Serial.println("firmware " FW_VERSION " confirmed");
  }
}
