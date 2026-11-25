#include <ctype.h>
#include <string.h>
#include "esp_log.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "settings.h"

static const char *TAG = "settings";
static const char *NS = "voicepoint";

static bool valid_origin(const char *v)
{
    size_t n = strlen(v);
    if (n < 9 || n > 128 || strncmp(v, "https://", 8) != 0) return false;
    for (const char *p = v + 8; *p; p++) {
        if (!(isalnum((unsigned char)*p) || *p == '.' || *p == '-' || *p == ':')) return false;
    }
    return true;
}

static bool valid_station(const char *v)
{
    size_t n = strlen(v);
    if (n < 1 || n > 32) return false;
    for (const char *p = v; *p; p++) {
        if (!(isalnum((unsigned char)*p) || *p == '_' || *p == '-')) return false;
    }
    return true;
}

static bool valid_secret(const char *v)
{
    size_t n = strlen(v);
    if (n < 16 || n > 128) return false;
    for (const char *p = v; *p; p++) {
        if (*p < 0x21 || *p > 0x7e) return false;
    }
    return true;
}

static void get(nvs_handle_t h, const char *key, char *out, size_t size)
{
    size_t len = size;
    if (nvs_get_str(h, key, out, &len) != ESP_OK) out[0] = '\0';
}

// First boot: write the Kconfig values that are set, so a later build without them keeps the device's settings.
static void seed(nvs_handle_t h)
{
    const struct { const char *key; const char *value; } first[] = {
        {"app", CONFIG_VP_APP_URL}, {"station", CONFIG_VP_STATION}, {"secret", CONFIG_VP_DEVICE_SECRET},
        {"ssid", CONFIG_VP_WIFI_SSID}, {"pass", CONFIG_VP_WIFI_PASSWORD},
    };
    for (size_t i = 0; i < sizeof(first) / sizeof(first[0]); i++) {
        size_t len = 0;
        if (first[i].value[0] && nvs_get_str(h, first[i].key, NULL, &len) == ESP_ERR_NVS_NOT_FOUND) {
            nvs_set_str(h, first[i].key, first[i].value);
        }
    }
    nvs_commit(h);
}

bool settings_load(vp_settings_t *s)
{
    memset(s, 0, sizeof(*s));
    nvs_handle_t h;
    if (nvs_open(NS, NVS_READWRITE, &h) != ESP_OK) {
        ESP_LOGE(TAG, "NVS unavailable");
        return false;
    }
    seed(h);
    get(h, "app", s->app, sizeof(s->app));
    get(h, "station", s->station, sizeof(s->station));
    get(h, "secret", s->secret, sizeof(s->secret));
    get(h, "ssid", s->ssid, sizeof(s->ssid));
    get(h, "pass", s->pass, sizeof(s->pass));
    nvs_close(h);
    bool ok = valid_origin(s->app) && valid_station(s->station) && valid_secret(s->secret) && s->ssid[0];
    if (!ok) ESP_LOGE(TAG, "settings incomplete: app %d, station %d, secret %d, wifi %d",
                      valid_origin(s->app), valid_station(s->station), valid_secret(s->secret), s->ssid[0] != 0);
    return ok;
}

bool settings_pending(char key[33])
{
    nvs_handle_t h;
    if (nvs_open(NS, NVS_READONLY, &h) != ESP_OK) return false;
    size_t len = 33;
    bool found = nvs_get_str(h, "pending", key, &len) == ESP_OK && strlen(key) == 32;
    nvs_close(h);
    return found;
}

void settings_set_pending(const char *key)
{
    nvs_handle_t h;
    if (nvs_open(NS, NVS_READWRITE, &h) != ESP_OK) return;
    nvs_set_str(h, "pending", key);
    nvs_commit(h);
    nvs_close(h);
}

void settings_clear_pending(void)
{
    nvs_handle_t h;
    if (nvs_open(NS, NVS_READWRITE, &h) != ESP_OK) return;
    nvs_erase_key(h, "pending");
    nvs_commit(h);
    nvs_close(h);
}
