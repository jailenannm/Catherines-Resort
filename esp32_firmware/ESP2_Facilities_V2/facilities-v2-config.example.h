#pragma once
#define CBLR_WIFI_SSID "REPLACE_LOCALLY"
#define CBLR_WIFI_PASSWORD "REPLACE_LOCALLY"
#define BENCH_SERVER "http://192.168.1.39:8787"
// Explicitly opt into isolated simulation only. 0 never drives physical outputs.
#define CBLR_V2_SIMULATION 0
// All real relay/servo/RGB/TFT/DFPlayer adapters remain uncommissioned.
// No unknown relay polarities or servo angles are provided.
