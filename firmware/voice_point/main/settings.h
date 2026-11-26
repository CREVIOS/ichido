#pragma once
#include <stdbool.h>

// Device settings in NVS (namespace "voicepoint"), seeded from the first-boot Kconfig values once.
typedef struct {
    char app[129];      // https://host[:port], no path
    char station[33];   // [A-Za-z0-9_-]{1,32}
    char secret[129];   // 16-128 printable ASCII
    char ssid[33];
    char pass[65];
} vp_settings_t;

// False when NVS is unavailable or a value is missing or malformed: the device must not call the server.
bool settings_load(vp_settings_t *s);

// The event id of a press not yet acknowledged by the server, kept across reboots (32 hex + NUL).
bool settings_pending(char key[33]);
void settings_set_pending(const char *key);
void settings_clear_pending(void);
