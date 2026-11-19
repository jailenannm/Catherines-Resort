#pragma once
#include <Arduino.h>
// Supplied map, not proof of wiring. No code here configures or drives these pins.
namespace Facilities {
struct Pin { uint8_t gpio; bool output; };
constexpr Pin pins[] = {
 {26,true}, // cottage relay: only implemented output
 {14,true}, {34,false}, // KTV servo / Hall
 {25,true}, {27,true}, {32,true}, // KTV RGB: driver unknown
 {33,true}, {19,true}, {16,true}, // Event / stage / pump
 {18,true}, {23,true}, {5,true}, {21,true}, {22,true}, // TFT, deliberately no MISO19
 {13,true}, {17,false}, // ESP TX->DFPlayer RX / ESP RX<-DFPlayer TX
 {35,false}, {36,false}, {39,false} // mic / reserved legacy RX / possible button
};
constexpr bool validPins() {
 for (size_t i=0;i<sizeof(pins)/sizeof(pins[0]);++i) {
  if (pins[i].output && pins[i].gpio>=34) return false;
  for (size_t j=i+1;j<sizeof(pins)/sizeof(pins[0]);++j) if(pins[i].gpio==pins[j].gpio)return false;
 }
 return true;
}
static_assert(validPins(),"Conflicting GPIO assignments or input-only output");
}
void printFacilityCapabilities() {
 Serial.println("COTTAGE GPIO26: signed backend authority; GPIO report, not physical sensing");
 Serial.println("EVENT GPIO33 / STAGE GPIO19: BLOCKED - relay polarity/driver and command policy unverified");
 Serial.println("POOL PUMP GPIO16: BLOCKED - hardware, driver and operation policy unverified");
 Serial.println("KTV servo14 / Hall34: BLOCKED - calibration, polarity, bias and freshness source required");
 Serial.println("KTV RGB25/27/32: BLOCKED - driver/polarity unverified");
 Serial.println("TFT18/23/5/21/22: BLOCKED - verify panel/controller/init; MISO19 prohibited");
 Serial.println("DFPlayer TX13/RX17: BLOCKED - track map, wiring, speaker repair and audio owner policy required");
 Serial.println("MIC35 / legacy RX36 / proposed buttons36,39: NOT COMMISSIONED; no internal pull-ups");
 Serial.println("Disabled pins are not configured. Their physical state is UNKNOWN, not confirmed OFF.");
}
