# Voice Point

The Help Point with a microphone and speaker. It reports the station's fault and follows the case like
`firmware/help_point`, and it can carry the case's voice intake itself:

1. A press opens the station's case as an AI case (`POST /api/device` with `X-Display: 1`).
2. An operator hears the caller's language on the handset and starts device voice in the case's AI panel.
3. The device's status poll shows `voice=1`. It asks for a join grant (`POST /api/device/voice`) and joins the
   case's LiveKit room as the case's caller. The intake agent greets the person and reads back what it understood.
4. A press during the voice session confirms that read-back (`X-Action: confirm`). An ATM case then goes to a person, and
   the agent says so before it leaves.
5. The device rejoins with a new grant when a session ends (at most 10 minutes) and leaves when `voice=1` goes.

The server side is `web/lib/device-voice.ts` and `supabase/migrations/20261126000000_device_voice.sql`.

## Boards

| Board | Target | Audio | LED | Button |
|---|---|---|---|---|
| ESP32-S31-Function-CoreBoard-1 | `esp32s31` (preview) | ES8311 codec + NS4150B amplifier, onboard mic | WS2812 GPIO60 | BOOT GPIO61 |
| Sparkle IoT XH-S3E-AI | `esp32s3` | I2S amplifier (BCLK 15, WS 16, DOUT 7, enable 17), I2S mic (WS 4, SCK 5, SD 6) | WS2812 GPIO48 | BOOT GPIO0 |

The S31 speaker connector is 1.25 mm, 2 pins, driven from both sides (BTL): use a 4-8 Ω speaker and never connect either
wire to GND. The XH-S3E mic pins come from other owners' reports (xiaozhi-esp32 issue 2206); check the mic level after flashing.

## Build

ESP-IDF 6.1.1. The LiveKit ESP32 SDK is fetched from the PR #131 branch (ESP32-S31 support), pinned in
`main/idf_component.yml`.

```sh
. ~/esp/esp-idf-v6.1.1/export.sh
# ESP32-S31
idf.py --preview -B build-s31 -D SDKCONFIG=build-s31/sdkconfig -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.local" set-target esp32s31 build
idf.py -B build-s31 -p /dev/ttyACM0 flash monitor
# XH-S3E (ESP32-S3)
idf.py -B build-s3 -D SDKCONFIG=build-s3/sdkconfig -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.local" set-target esp32s3 build
```

`set-target` reads the defaults once; afterwards `idf.py -B <dir> build` is enough. Set `SDKCONFIG_DEFAULTS` before
`set-target`, and always include `sdkconfig.defaults`: the target's own file (`sdkconfig.defaults.esp32s31` or `.esp32s3`)
is added automatically.

## Provisioning

Put the first-boot settings in `sdkconfig.local` (git-ignored, `chmod 600`):

```
CONFIG_VP_APP_URL="https://<ichido app origin>"
CONFIG_VP_STATION="<station id>"
CONFIG_VP_DEVICE_SECRET="<the station's entry in DEVICE_SECRETS_JSON>"
CONFIG_VP_WIFI_SSID="<2.4 GHz network>"
CONFIG_VP_WIFI_PASSWORD="<password>"
```

They are written to NVS (namespace `voicepoint`) on the first boot only and are compiled into that image: do not share
it. A setup portal and signed over-the-air updates, as on the Help Point, are not built yet. The device never erases NVS;
to re-provision, erase the flash (`idf.py erase-flash`) and flash again with the new values.

## Light

Dim white idle, blue case received, cyan in the voice room, green handled or a confirmed press, amber sending, red offline,
magenta missing settings or a refused press.

## Linux

ModemManager probes new USB serial ports and can break flashing. Ignore Espressif devices:

```
echo 'ATTRS{idVendor}=="303a", ENV{ID_MM_DEVICE_IGNORE}="1"' | sudo tee /etc/udev/rules.d/99-espressif-no-modemmanager.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
```
