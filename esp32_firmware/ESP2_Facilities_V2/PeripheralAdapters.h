#pragma once
#include "MediaEngine.h"
// Prepared adapters, deliberately not instantiated by the uncommissioned sketch.
// DFRobot's official protocol: /MP3/NNNN.mp3 uses 0x12; no root-copy-order indexing.
struct DfPlayerAdapter {
  bool commissioned=false;
  bool (*transport)(const uint8_t*,size_t)=nullptr;
  bool send(uint8_t command,uint16_t value=0) {
    if(!commissioned||!transport)return false;
    uint8_t frame[10];dfFrame(command,value,frame);return transport(frame,10);
  }
  bool play(unsigned track){return track>=1&&track<=9999&&send(0x12,track);}
  bool pause(){return send(0x0e);}
  bool resume(){return send(0x0d);}
  bool stop(){return send(0x16);}
  bool volume(unsigned value){return value<=30&&send(0x06,value);}
};
// Adafruit-compatible renderer, independent of panel initialization/model/rotation.
// The actual ST7735 driver is intentionally not enabled on unknown hardware.
template<class Display> constexpr void renderTft(Display &display,const char *title,const char *state,const char *line) {
  const size_t columns=(display.width()>8)?size_t((display.width()-8)/6):1;
  char rows[2][27]={};wrapTft(line,rows,columns);
  display.fillScreen(0x11c8);display.setTextSize(1);display.setTextWrap(false);
  display.setTextColor(0xff9c);display.setCursor(4,4);
  char heading[2][27]={};wrapTft(title,heading,columns);display.println(heading[0]);
  display.setCursor(4,18);display.println(state);
  display.setTextColor(0xfdea);display.setCursor(4,40);display.println(rows[0]);
  display.setTextColor(0xff9c);display.setCursor(4,54);display.println(rows[1]);
}
