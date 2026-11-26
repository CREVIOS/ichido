idf_component_register(SRCS "main.c" "settings.c" "server.c" "voice.c" "ui.c" "board.c" "media.c"
                       INCLUDE_DIRS "."
                       PRIV_REQUIRES nvs_flash esp_wifi esp_netif esp_event esp_http_client esp-tls esp_driver_gpio app_update)
