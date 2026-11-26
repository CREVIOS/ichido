#pragma once
#include <stdbool.h>
#include <stddef.h>
#include "settings.h"

// The Ichido device API (web/app/api/device/*), authenticated with X-Station and the device secret.
// Each call returns the HTTP status, or -1 when there was no answer.

typedef struct {
    char state[16];   // idle | received | review | field | guided | fraud
    bool voice;       // voice=1: an operator started device voice; join the room
} vp_status_t;

void server_init(const vp_settings_t *s);

// GET /api/device with X-Display: 1, every 2 s.
int server_poll(vp_status_t *out);

// POST /api/device with a 32-hex event id; confirm adds X-Action: confirm (a press during a voice session).
int server_press(const char *key, bool confirm);

// POST /api/device/voice. On 200, url and token (heap, caller frees) and the token's lifetime in seconds.
int server_voice(char *url, size_t url_size, char **token, int *ttl);

// POST /api/device/heartbeat every 60 s; ack_ms / poll_ms are -1 until measured.
int server_heartbeat(const char *fw, int ack_ms, int poll_ms);
