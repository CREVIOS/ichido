#include <stdatomic.h>
#include "esp_log.h"
#include "livekit.h"
#include "media.h"
#include "voice.h"

static const char *TAG = "voice";
static livekit_room_handle_t room;
static atomic_int state = LIVEKIT_CONNECTION_STATE_DISCONNECTED;
static atomic_bool was_connected;

static void on_state_changed(livekit_connection_state_t s, void *ctx)
{
    ESP_LOGI(TAG, "room: %s", livekit_connection_state_str(s));
    if (s == LIVEKIT_CONNECTION_STATE_CONNECTED) atomic_store(&was_connected, true);
    atomic_store(&state, s);
    livekit_failure_reason_t reason = livekit_room_get_failure_reason(room);
    if (reason != LIVEKIT_FAILURE_REASON_NONE) ESP_LOGW(TAG, "failure: %s", livekit_failure_reason_str(reason));
}

bool voice_join(const char *url, const char *token)
{
    if (room) return true;
    livekit_room_options_t options = {
        .publish = {
            .kind = LIVEKIT_MEDIA_TYPE_AUDIO,
            .audio_encode = { .codec = LIVEKIT_AUDIO_CODEC_OPUS, .sample_rate = 16000, .channel_count = 1 },
            .capturer = media_get_capturer(),
        },
        .subscribe = { .kind = LIVEKIT_MEDIA_TYPE_AUDIO, .renderer = media_get_renderer() },
        .on_state_changed = on_state_changed,
    };
    atomic_store(&was_connected, false);
    atomic_store(&state, LIVEKIT_CONNECTION_STATE_CONNECTING);
    if (livekit_room_create(&room, &options) != LIVEKIT_ERR_NONE) {
        ESP_LOGE(TAG, "room create failed");
        room = NULL;
        atomic_store(&state, LIVEKIT_CONNECTION_STATE_FAILED);
        return false;
    }
    if (livekit_room_connect(room, url, token) != LIVEKIT_ERR_NONE) {
        ESP_LOGE(TAG, "room connect failed");
        voice_leave();
        atomic_store(&state, LIVEKIT_CONNECTION_STATE_FAILED);
        return false;
    }
    return true;
}

void voice_leave(void)
{
    if (!room) return;
    livekit_room_close(room);
    livekit_room_destroy(room);
    room = NULL;
    atomic_store(&state, LIVEKIT_CONNECTION_STATE_DISCONNECTED);
}

bool voice_in_room(void) { return room != NULL; }
bool voice_connected(void) { return room && atomic_load(&state) == LIVEKIT_CONNECTION_STATE_CONNECTED; }

bool voice_ended(void)
{
    int s = atomic_load(&state);
    return room && (s == LIVEKIT_CONNECTION_STATE_FAILED ||
                    (s == LIVEKIT_CONNECTION_STATE_DISCONNECTED && atomic_load(&was_connected)));
}
