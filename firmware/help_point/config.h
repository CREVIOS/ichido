// Firmware-wide settings that are not secret and are the same on every Help Point. Committed to git.
#pragma once

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
