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

// Three decimal components, each 0..999 without leading zeros.
long versionNumber(const String &version) {
  long value = 0;
  size_t i = 0;
  for (int part = 0; part < 3; part++) {
    size_t start = i;
    while (i < version.length() && version[i] >= '0' && version[i] <= '9') i++;
    size_t digits = i - start;
    if (!digits || digits > 3 || (digits > 1 && version[start] == '0')) return -1;
    value = value * 1000 + version.substring(start, i).toInt();
    if (part < 2 && (i >= version.length() || version[i++] != '.')) return -1;
  }
  return i == version.length() ? value : -1;
}

bool manifestSigned(const String &version, const String &url, const String &sha, const String &sigB64) {
  uint8_t sig[512];
  size_t sigLen = 0;
  if (mbedtls_base64_decode(sig, sizeof sig, &sigLen, (const uint8_t *)sigB64.c_str(), sigB64.length()) != 0) return false;
  String msg = "ichido-fw/2\n" + version + "\n" + url + "\n" + sha;
  uint8_t hash[32];
  mbedtls_sha256((const uint8_t *)msg.c_str(), msg.length(), hash, 0);
  mbedtls_pk_context pk;
  mbedtls_pk_init(&pk);
  int parsed = mbedtls_pk_parse_public_key(&pk, (const uint8_t *)OTA_PUBLIC_KEY, sizeof OTA_PUBLIC_KEY);
  size_t bits = parsed == 0 ? mbedtls_pk_get_bitlen(&pk) : 0;
  bool ok = (bits == 3072 || bits == 4096) && mbedtls_pk_get_type(&pk) == MBEDTLS_PK_RSA &&
            mbedtls_pk_verify(&pk, MBEDTLS_MD_SHA256, hash, sizeof hash, sig, sigLen) == 0;
  mbedtls_pk_free(&pk);
  if (parsed != 0) Serial.println("firmware: no signing key in config.h, updates disabled");
  return ok;
}

// Streams the image into the idle OTA slot while hashing it; commits only if the hash matches.
// ponytail: needs a Content-Length (static hosting gives one); chunked downloads are refused.
bool installImage(const String &url, const String &sha) {
  if (!url.startsWith("https://") || url.length() > 400) return false;
  WiFiClientSecure tls; HTTPClient http;
  tls.setCACert(OTA_ROOT_CA);
  if (!http.begin(tls, url)) return false;
  http.setTimeout(15000);
  int code = http.GET();
  int size = http.getSize();
  if (code != 200 || size <= 0 || !http.getStreamPtr() || !Update.begin(size)) {
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
  unsigned long started = millis(), lastData = started;
  while (done < size && millis() - lastData < 15000 && millis() - started < 180000) {
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
#if !CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE
  return;  // OTA requires a bootloader that can recover an unconfirmed image.
#endif
  WiFiClientSecure tls; HTTPClient http;
  if (!begin(http, tls, "/api/device/firmware")) return;
  http.addHeader("X-Firmware", FW_VERSION);
  int code = http.GET();
  String body = code == 200 ? readBody(http, 2048) : "";
  http.end();
  Serial.printf("firmware check -> %d\n", code);
  if (code != 200) return;   // 204: no update published
  String version = jsonField(body, "version"), url = jsonField(body, "url");
  String sha = jsonField(body, "sha256"), sig = jsonField(body, "signature_v2");
  if (versionNumber(version) <= versionNumber(FW_VERSION)) return;
  if (sha.length() != 64 || !manifestSigned(version, url, sha, sig)) {
    Serial.printf("firmware %s refused: manifest not signed by our key\n", version.c_str());
    return;
  }
  Serial.printf("firmware %s: downloading\n", version.c_str());
  setRgb(true, true, true);
#ifdef HAS_DISPLAY
  drawScreen("Help Point", "Updating", "firmware...");
#endif
  if (!installImage(url, sha)) return;
  Serial.printf("firmware %s installed, restarting\n", version.c_str());
  delay(200);
  ESP.restart();
}

bool runningOnProbation() {
  esp_ota_img_states_t st;
  return esp_ota_get_state_partition(esp_ota_get_running_partition(), &st) == ESP_OK && st == ESP_OTA_IMG_PENDING_VERIFY;
}
