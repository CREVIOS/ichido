// Firmware-wide settings that are not secret and are the same on every Help Point. Committed to git.
#pragma once

// Optional 0.96" SSD1306 128x64 I2C OLED (U8g2 library, BSD-2-Clause: arduino-cli lib install U8g2).
// It shows the single-use pairing code only while the operator has pressed 端末に表示 for an open case, so a caller
// who cannot hear or speak on the ATM handset can still connect; otherwise it shows the station state.
// Wiring: SDA -> GPIO21, SCL -> GPIO22, VCC -> 3V3, GND -> GND (address 0x3C). Delete this line to build without it.
#define HAS_DISPLAY

// Public half of the firmware signing key (RSA, 3072 bits or more).
// Updates are installed only when their manifest is signed by the matching private key
// (scripts/sign-firmware.mjs). While this is the placeholder, the device never installs an update.
//
//   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out ota-private.pem   # keep offline, never commit
//   openssl pkey -in ota-private.pem -pubout                                             # paste below
static const char OTA_PUBLIC_KEY[] = R"PEM(
-----BEGIN PUBLIC KEY-----
paste the firmware signing public key here
-----END PUBLIC KEY-----
)PEM";
