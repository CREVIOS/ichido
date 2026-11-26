#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "cJSON.h"
#include "esp_crt_bundle.h"
#include "esp_heap_caps.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "server.h"

static const char *TAG = "server";
static const vp_settings_t *cfg;

void server_init(const vp_settings_t *s) { cfg = s; }

// One HTTPS request with the device's credentials. The reply body is read into resp (NUL-terminated, bounded).
static int request(esp_http_client_method_t method, const char *path, const char *body, const char *type,
                   bool display, bool confirm, char *resp, size_t resp_size)
{
    char url[192];
    char auth[140];
    snprintf(url, sizeof(url), "%s%s", cfg->app, path);
    snprintf(auth, sizeof(auth), "Bearer %s", cfg->secret);
    esp_http_client_config_t c = {
        .url = url,
        .method = method,
        .timeout_ms = 6000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .disable_auto_redirect = true,
        .buffer_size = 2048,
    };
    esp_http_client_handle_t h = esp_http_client_init(&c);
    if (!h) return -1;
    esp_http_client_set_header(h, "X-Station", cfg->station);
    esp_http_client_set_header(h, "Authorization", auth);
    if (display) esp_http_client_set_header(h, "X-Display", "1");
    if (confirm) esp_http_client_set_header(h, "X-Action", "confirm");
    if (type) esp_http_client_set_header(h, "Content-Type", type);
    int len = body ? (int)strlen(body) : 0;
    int status = -1;
    if (esp_http_client_open(h, len) == ESP_OK) {
        if (len == 0 || esp_http_client_write(h, body, len) == len) {
            esp_http_client_fetch_headers(h);
            status = esp_http_client_get_status_code(h);
            size_t got = 0;
            if (resp && resp_size) {
                int n;
                while (got + 1 < resp_size && (n = esp_http_client_read(h, resp + got, resp_size - 1 - got)) > 0) got += n;
                resp[got] = '\0';
            }
        }
    }
    esp_http_client_close(h);
    esp_http_client_cleanup(h);
    return status;
}

int server_poll(vp_status_t *out)
{
    char body[257];
    int status = request(HTTP_METHOD_GET, "/api/device", NULL, NULL, true, false, body, sizeof(body));
    if (status != 200) return status;
    memset(out, 0, sizeof(*out));
    char *line = strtok(body, "\n");
    if (line) snprintf(out->state, sizeof(out->state), "%s", line);
    while ((line = strtok(NULL, "\n"))) {
        if (strcmp(line, "voice=1") == 0) out->voice = true;
    }
    return status;
}

int server_press(const char *key, bool confirm)
{
    return request(HTTP_METHOD_POST, "/api/device", key, "text/plain", true, confirm, NULL, 0);
}

int server_voice(char *url, size_t url_size, char **token, int *ttl)
{
    *token = NULL;
    size_t size = 4096;
    char *body = heap_caps_malloc(size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!body) return -1;
    int status = request(HTTP_METHOD_POST, "/api/device/voice", NULL, NULL, false, false, body, size);
    if (status == 200) {
        cJSON *j = cJSON_Parse(body);
        const cJSON *u = cJSON_GetObjectItem(j, "url");
        const cJSON *t = cJSON_GetObjectItem(j, "token");
        const cJSON *l = cJSON_GetObjectItem(j, "ttl");
        if (cJSON_IsString(u) && cJSON_IsString(t) && cJSON_IsNumber(l) && strlen(u->valuestring) < url_size) {
            snprintf(url, url_size, "%s", u->valuestring);
            *token = strdup(t->valuestring);
            *ttl = l->valueint;
        } else {
            ESP_LOGE(TAG, "voice grant: unexpected reply");
            status = -1;
        }
        cJSON_Delete(j);
    }
    free(body);
    return status;
}

int server_heartbeat(const char *fw, int ack_ms, int poll_ms)
{
    wifi_ap_record_t ap = {0};
    int rssi = esp_wifi_sta_get_ap_info(&ap) == ESP_OK ? ap.rssi : -127;
    char body[200];
    snprintf(body, sizeof(body),
             "{\"uptime_s\":%lld,\"free_heap\":%u,\"rssi\":%d,\"fw\":\"%s\",\"ack_ms\":%d,\"poll_ms\":%d}",
             (long long)(esp_timer_get_time() / 1000000), (unsigned)esp_get_free_heap_size(), rssi, fw, ack_ms, poll_ms);
    return request(HTTP_METHOD_POST, "/api/device/heartbeat", body, "application/json", false, false, NULL, 0);
}
