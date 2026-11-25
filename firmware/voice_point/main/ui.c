#include <stdatomic.h>
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "led_strip.h"
#include "ui.h"

static const char *TAG = "ui";
static led_strip_handle_t led;
static ui_light_t shown = UI_OFFLINE;
static bool shown_once;
static void watch_button(void *arg);

void ui_init(void)
{
    gpio_config_t button = {
        .pin_bit_mask = 1ULL << CONFIG_VP_BUTTON_GPIO,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&button));
#if CONFIG_VP_LED_GPIO >= 0
    led_strip_config_t strip = {
        .strip_gpio_num = CONFIG_VP_LED_GPIO,
        .max_leds = 1,
        .led_model = LED_MODEL_WS2812,
        .color_component_format = LED_STRIP_COLOR_COMPONENT_FMT_GRB,
    };
    led_strip_rmt_config_t rmt = { .clk_src = RMT_CLK_SRC_DEFAULT, .resolution_hz = 10 * 1000 * 1000 };
    if (led_strip_new_rmt_device(&strip, &rmt, &led) != ESP_OK) {
        ESP_LOGW(TAG, "no status LED");
        led = NULL;
    }
#endif
    ui_show(UI_OFFLINE);
    xTaskCreate(watch_button, "button", 2048, NULL, 5, NULL);
}

void ui_show(ui_light_t light)
{
    if (!led || (shown_once && light == shown)) return;
    // Dim colours: the LED sits behind a label. Same meaning as the Help Point's light where they overlap.
    static const uint8_t rgb[][3] = {
        [UI_OFFLINE] = {24, 0, 0}, [UI_IDLE] = {4, 4, 4}, [UI_SENDING] = {16, 10, 0}, [UI_RECEIVED] = {0, 0, 24},
        [UI_VOICE] = {0, 20, 20}, [UI_HANDLED] = {0, 24, 0}, [UI_ERROR] = {24, 0, 12},
    };
    led_strip_set_pixel(led, 0, rgb[light][0], rgb[light][1], rgb[light][2]);
    led_strip_refresh(led);
    shown = light;
    shown_once = true;
}

// The main loop blocks on HTTPS calls for seconds, so a task samples the button every 10 ms and latches a press.
static atomic_bool latched;

static void watch_button(void *arg)
{
    bool down = false;
    int64_t since = 0;
    for (;;) {
        bool low = gpio_get_level(CONFIG_VP_BUTTON_GPIO) == 0;
        int64_t now = esp_timer_get_time();
        if (low && !down) {
            if (since == 0) since = now;
            if (now - since >= 40000) {   // 40 ms debounce, as the Help Point
                down = true;
                atomic_store(&latched, true);
            }
        } else if (!low) {
            down = false;
            since = 0;
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

bool ui_pressed(void) { return atomic_exchange(&latched, false); }
