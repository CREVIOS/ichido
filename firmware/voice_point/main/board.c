// From the LiveKit ESP32 SDK example (Apache-2.0, github.com/livekit/client-sdk-esp32, components/livekit/examples/minimal),
// with the ESP32-S31-Function-CoreBoard-1 (use_mclk: 1) and Sparkle IoT XH-S3E-AI board profiles added.
#include <string.h>
#include "esp_log.h"
#include "codec_init.h"
#include "codec_board.h"
#include "board.h"

static const char *TAG = "board";

static board_capture_layout_t capture_layout = {
    // Default: 4-channel TDM input (e.g. ES7210) with mic on the first two channels
    .channel = 4,
    .channel_mask = 1 | 2
};

/// Boards not included in the codec_board component's board_cfg.txt, described
/// using the same section format and registered with `codec_board_parse_all_config`.
static const char *get_custom_board_cfg(const char *board_type)
{
    if (strcmp(board_type, "ESP32_S31_FUNCTION_COREBOARD_1") == 0) {
        // ES8311 mono codec + NS4150B amplifier. Pin assignments from the board schematic:
        // https://dl.espressif.com/schematics/esp32-s31-function-coreboard-1-schematics.pdf
        return "i2c: {sda: 51, scl: 50}\n"
               "i2s: {mclk: 52, bclk: 53, ws: 55, dout: 56, din: 54}\n"
               "in_out: {codec: ES8311, pa: 57, use_mclk: 1, pa_gain: 6}\n";
    }
    if (strcmp(board_type, "XH_S3E_AI") == 0) {
        // Sparkle IoT XH-S3E-AI: I2S amplifier on I2S0 (enable on GPIO17), I2S MEMS mic on I2S1.
        // Pins reported by owners in github.com/78/xiaozhi-esp32 issue 2206; the mic pins are unconfirmed.
        return "i2s: {mclk: -1, bclk: 15, ws: 16, dout: 7, din: -1}\n"
               "i2s: {mclk: -1, bclk: 5, ws: 4, dout: -1, din: 6}\n"
               "out: {codec: DUMMY, pa: 17, i2c_port: -1}\n"
               "in: {codec: DUMMY, i2s_port: 1, i2c_port: -1}\n";
    }
    return NULL;
}

void board_init()
{
    ESP_LOGI(TAG, "Initializing board");

    // Initialize codec board
    codec_init_cfg_t cfg = {
        .in_mode = CODEC_I2S_MODE_TDM,
        .in_use_tdm = true,
        .reuse_dev = false
    };
    const char *custom_cfg = get_custom_board_cfg(CONFIG_VP_CODEC_BOARD);
    if (custom_cfg != NULL) {
        if (codec_board_parse_all_config(custom_cfg) != 0) {
            ESP_LOGE(TAG, "Failed to parse custom board configuration");
            return;
        }
        // Single ES8311 codec: standard I2S with the DAC reference on the second channel
        cfg.in_mode = CODEC_I2S_MODE_STD;
        cfg.in_use_tdm = false;
        capture_layout.channel = 2;
        capture_layout.channel_mask = 0;
    } else {
        set_codec_board_type(CONFIG_VP_CODEC_BOARD);
    }
    init_codec(&cfg);
}

board_capture_layout_t board_get_capture_layout(void)
{
    return capture_layout;
}
