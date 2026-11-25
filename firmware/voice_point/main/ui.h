#pragma once
#include <stdbool.h>

// Status LED (one WS2812) and the button.
typedef enum { UI_OFFLINE, UI_IDLE, UI_SENDING, UI_RECEIVED, UI_VOICE, UI_HANDLED, UI_ERROR } ui_light_t;

void ui_init(void);
void ui_show(ui_light_t light);
// True once per debounced press since the last call.
bool ui_pressed(void);
