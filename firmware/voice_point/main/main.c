// Ichido Voice Point: a Help Point with a microphone and speaker (README.md).
//
// Like the Help Point (firmware/help_point), a press reports the station's fault and the light follows the case. When an
// operator starts device voice for the case, the status poll says voice=1: the device asks for a join grant
// (POST /api/device/voice), joins the case's LiveKit room as its caller, and the AI intake agent talks to the person at the
// station. A press during the voice session confirms the read-back the agent just spoke (X-Action: confirm).

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_netif_sntp.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "livekit.h"

#include "board.h"
#include "media.h"
#include "server.h"
#include "settings.h"
#include "ui.h"
#include "voice.h"

#define FW_VERSION   "0.1.0"
#define POLL_MS      2000
#define HEARTBEAT_MS 60000
#define STALE_MS     10000    // no fresh status for this long: show offline

static const char *TAG = "voice_point";
static vp_settings_t settings;
static volatile bool online;

static int64_t now_ms(void) { return esp_timer_get_time() / 1000; }

static void on_wifi(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && (id == WIFI_EVENT_STA_START || id == WIFI_EVENT_STA_DISCONNECTED)) {
        online = false;
        esp_wifi_connect();
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        online = true;
        ESP_LOGI(TAG, "Wi-Fi up");
    }
}

static void wifi_start(void)
{
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, on_wifi, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_wifi, NULL));
    wifi_config_t w = {0};
    // The SSID (32) and password (64) fields need not be NUL-terminated at full length.
    memcpy(w.sta.ssid, settings.ssid, strnlen(settings.ssid, sizeof(w.sta.ssid)));
    memcpy(w.sta.password, settings.pass, strnlen(settings.pass, sizeof(w.sta.password)));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &w));
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));   // low audio latency
    ESP_ERROR_CHECK(esp_wifi_start());
}

static void new_key(char key[33])
{
    for (int i = 0; i < 16; i++) sprintf(key + 2 * i, "%02x", (unsigned)(esp_random() & 0xff));
}

// A press that opens (or re-reports) the case. The id is saved before the first send, so a reboot retries the same
// event and the server never opens a second case for one press.
static char pending[33];
static int64_t retry_at;
static int retry_ms = 1500;
static int ack_ms = -1;

static void send_pending(void)
{
    if (!pending[0] || !online || now_ms() < retry_at) return;
    ui_show(UI_SENDING);
    int64_t started = now_ms();
    int status = server_press(pending, false);
    if (status == 204 || status == 400 || status == 401 || status == 403) {
        if (status != 204) ESP_LOGE(TAG, "press refused: %d", status);
        else ack_ms = (int)(now_ms() - started);
        settings_clear_pending();
        pending[0] = '\0';
        retry_ms = 1500;
        return;
    }
    ESP_LOGW(TAG, "press not acknowledged (%d), retry in %d ms", status, retry_ms);
    retry_at = now_ms() + retry_ms;
    retry_ms = retry_ms * 2 > 30000 ? 30000 : retry_ms * 2;
}

static void on_press(void)
{
    if (voice_in_room()) {
        // The person confirms what the agent read back. 409: nothing to confirm yet (the agent asks again).
        char key[33];
        new_key(key);
        int status = server_press(key, true);
        ESP_LOGI(TAG, "confirm: %d", status);
        ui_show(status == 204 ? UI_HANDLED : UI_ERROR);
        return;
    }
    if (pending[0]) return;   // the last press is still being sent
    new_key(pending);
    settings_set_pending(pending);
    retry_at = 0;
    send_pending();
}

// The voice session follows the status poll: join while voice=1, leave when it goes, and rejoin with a fresh grant
// when the connection ends or the grant's session runs out (at most 10 minutes per voice lease).
static int64_t next_join, session_until;

static void follow_voice(bool wanted)
{
    int64_t now = now_ms();
    if (voice_in_room() && (!wanted || voice_ended() || now >= session_until)) {
        ESP_LOGI(TAG, "leaving the room (%s)", !wanted ? "voice ended" : voice_ended() ? "connection ended" : "session over");
        voice_leave();
        next_join = now + 1000;
    }
    if (!wanted || voice_in_room() || now < next_join) return;
    char url[160];
    char *token = NULL;
    int ttl = 0;
    int status = server_voice(url, sizeof(url), &token, &ttl);
    if (status == 200 && token && voice_join(url, token)) {
        session_until = now + (int64_t)ttl * 1000 - 3000;
        ESP_LOGI(TAG, "joining the case's room (session %d s)", ttl);
    } else {
        ESP_LOGW(TAG, "no voice grant (%d)", status);
        next_join = now + (status == 404 ? 2000 : 5000);
    }
    free(token);
}

static ui_light_t light_for(const vp_status_t *s)
{
    if (voice_connected()) return UI_VOICE;
    if (strcmp(s->state, "idle") == 0) return UI_IDLE;
    if (strcmp(s->state, "field") == 0 || strcmp(s->state, "guided") == 0) return UI_HANDLED;
    return UI_RECEIVED;
}

void app_main(void)
{
    esp_err_t err = nvs_flash_init();
    if (err != ESP_OK) {
        // Never erase: NVS holds the station's credentials. Re-provision instead.
        ESP_LOGE(TAG, "NVS unavailable (%s)", esp_err_to_name(err));
        return;
    }
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    ui_init();
    bool ready = settings_load(&settings);
    if (!ready) {
        ui_show(UI_ERROR);
        if (!settings.ssid[0]) return;
        // Wi-Fi only: join the network so it can be checked, but never call the server without credentials.
        wifi_start();
        for (bool shown = false;; vTaskDelay(pdMS_TO_TICKS(1000))) {
            if (online && !shown) ESP_LOGW(TAG, "Wi-Fi works; waiting for the app URL, station and device secret");
            shown = online;
        }
    }
    ESP_LOGI(TAG, "Voice Point %s, station %s", FW_VERSION, settings.station);
    server_init(&settings);

    livekit_system_init();
    board_init();
    if (media_init() != 0) {
        ui_show(UI_ERROR);
        return;
    }
    wifi_start();
    esp_sntp_config_t sntp = ESP_NETIF_SNTP_DEFAULT_CONFIG_MULTIPLE(2, ESP_SNTP_SERVER_LIST("time.google.com", "pool.ntp.org"));
    esp_netif_sntp_init(&sntp);

    if (settings_pending(pending)) ESP_LOGI(TAG, "resending an unacknowledged press");
    int64_t last_poll = -POLL_MS, last_ok = 0, last_beat = -HEARTBEAT_MS;
    int poll_ms = -1;
    vp_status_t status = {0};
    for (;;) {
        if (ui_pressed()) on_press();
        send_pending();
        int64_t now = now_ms();
        if (online && now - last_poll >= POLL_MS) {
            last_poll = now;
            if (server_poll(&status) == 200) {
                poll_ms = (int)(now_ms() - now);
                last_ok = now_ms();
                follow_voice(status.voice);
                if (!pending[0]) ui_show(light_for(&status));
            }
        }
        if (now_ms() - last_ok > STALE_MS) {
            ui_show(UI_OFFLINE);
            if (voice_in_room() && !online) voice_leave();
        }
        if (online && now - last_beat >= HEARTBEAT_MS) {
            last_beat = now;
            server_heartbeat(FW_VERSION, ack_ms, poll_ms);
        }
        vTaskDelay(pdMS_TO_TICKS(15));
    }
}
