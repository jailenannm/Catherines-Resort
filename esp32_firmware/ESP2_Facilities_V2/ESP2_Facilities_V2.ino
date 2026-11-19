// Version2 isolated facilities commissioning. NO physical GPIO/UART/SPI writes.
// v1 ESP1 and cottage firmware are preserved separately.
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <mbedtls/md.h>
#include <esp_system.h>
#include "facilities-v2-config.h"
#include "device-sync-secrets.h"
#include "MediaEngine.h"
#include "PeripheralAdapters.h"
#include "FacilityCapabilities.h"
#ifndef CBLR_V2_SIMULATION
#error "Set CBLR_V2_SIMULATION explicitly to 0 or 1"
#endif
#if CBLR_V2_SIMULATION != 0 && CBLR_V2_SIMULATION != 1
#error "Invalid simulation mode"
#endif
static_assert(sizeof(CBLR_DEVICE_KEY)>=33,"Device key too short");
struct OutputState { bool cottage=false,event=false,stage=false,pump=false;char door[6]="stop",effect[6]="off";uint8_t rgb[3]={0}; };
struct Plan { bool requiresHall=false;char title[121]={0};OutputState outputs;int64_t version=-1,audioRevision=-1;int track=0,offset=0;uint8_t player=0,volume=15;uint32_t position=0,receivedAt=0,lease=0;LyricCue cues[8];size_t count=0; };
portMUX_TYPE mux=portMUX_INITIALIZER_UNLOCKED;
TaskHandle_t outputHandle=nullptr,networkHandle=nullptr;
Plan plan;OutputState applied;PlaybackClock clockState;bool hallReady=false,leaseValid=false;int64_t appliedVersion=-1;
char currentLine[121]={0};
String mac(const String &text) { unsigned char digest[32];if(mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),(const unsigned char*)CBLR_DEVICE_KEY,strlen(CBLR_DEVICE_KEY),(const unsigned char*)text.c_str(),text.length(),digest))return "";char out[65];for(size_t i=0;i<32;++i)snprintf(out+i*2,3,"%02x",digest[i]);return String(out); }
bool equalMac(const String&a,const String&b){if(a.length()!=64||b.length()!=64)return false;uint8_t diff=0;for(size_t i=0;i<64;++i)diff|=a[i]^b[i];return diff==0;}
const char *playerName(uint8_t state){return state==1?"playing":state==2?"paused":"stopped";}
void outputTask(void*) {
 for(;;){
  portENTER_CRITICAL(&mux);
  const uint32_t now=millis();leaseValid=plan.lease&&uint32_t(now-plan.receivedAt)<plan.lease;
  if(leaseValid&&CBLR_V2_SIMULATION){applied=plan.outputs;if(plan.requiresHall&&!hallReady){clockState.stop(now);applied.rgb[0]=applied.rgb[1]=applied.rgb[2]=0;}else clockState.apply(plan.audioRevision,plan.track,plan.player,plan.position,now);if(!hallReady){applied.rgb[0]=applied.rgb[1]=applied.rgb[2]=0;strcpy(applied.effect,"off");}else if(!strcmp(applied.effect,"disco")){const int channel=(now/500)%3;for(int i=0;i<3;++i)applied.rgb[i]=i==channel?max(plan.outputs.rgb[0],max(plan.outputs.rgb[1],plan.outputs.rgb[2])):0;}appliedVersion=plan.version;}
  else {applied=OutputState();clockState.stop(now);appliedVersion=-1;}
  const char *line=leaseValid&&clockState.state?currentLyric(plan.cues,plan.count,clockState.position(now),plan.offset):"";
  strncpy(currentLine,line,120);currentLine[120]=0;
  portEXIT_CRITICAL(&mux);
  vTaskDelay(pdMS_TO_TICKS(20));
 }
}
class LimitedBody : public Stream {
 public:
  String text;size_t limit;bool overflow=false;
  explicit LimitedBody(size_t maximum):limit(maximum){text.reserve(maximum);}
  using Print::write;
  size_t write(uint8_t byte) override {if(text.length()>=limit){overflow=true;return 0;}text+=char(byte);return 1;}
  int available() override{return 0;}int read() override{return -1;}int peek() override{return -1;}void flush() override{}
};
bool readBoundedJson(HTTPClient &http,JsonDocument &doc,size_t limit){LimitedBody body(limit);if(http.writeToStream(&body)<0||body.overflow)return false;return !deserializeJson(doc,body.text);}
void pollBackend() {
 WiFiClient client;HTTPClient http;http.setConnectTimeout(1500);http.setTimeout(2000);
 if(!http.begin(client,String(BENCH_SERVER)+"/health"))return;
 int code=http.GET();JsonDocument health;bool error=!readBoundedJson(http,health,512);http.end();if(code!=200||error||!health["serverTime"].is<uint64_t>())return;
 OutputState outputs;PlaybackClock player;int64_t ack;bool hall;
 portENTER_CRITICAL(&mux);outputs=applied;player=clockState;ack=appliedVersion;hall=hallReady;portEXIT_CRITICAL(&mux);
 JsonDocument report;auto out=report["outputs"].to<JsonObject>();out["cottage_lights"]=outputs.cottage;out["event_lights"]=outputs.event;out["stage_lights"]=outputs.stage;out["pool_pump"]=outputs.pump;out["ktv_door"]=outputs.door;out["ktv_rgb_effect"]=outputs.effect;auto rgb=out["ktv_rgb"].to<JsonArray>();for(auto c:outputs.rgb)rgb.add(c);
 report["audio"]["revision"]=player.revision;
 if(player.track)report["audio"]["trackId"]=player.track;else report["audio"]["trackId"]=nullptr;
 report["audio"]["state"]=playerName(player.state);report["audio"]["positionMs"]=player.position(millis());report["hall"]["ready"]=bool(CBLR_V2_SIMULATION)&&hall;report["hall"]["ageMs"]=0;report["error"]=CBLR_V2_SIMULATION?"":"UNCOMMISSIONED";
 String reportText;serializeJson(report,reportText);char nonce[48];snprintf(nonce,sizeof(nonce),"facility_%08lx%08lx%08lx%08lx",(unsigned long)esp_random(),(unsigned long)esp_random(),(unsigned long)esp_random(),(unsigned long)esp_random());
 JsonDocument fields;auto f=fields.to<JsonArray>();f.add("cblr-facilities-request-v2");f.add("esp2");f.add(nonce);f.add(health["serverTime"].as<uint64_t>());f.add(ack);f.add(reportText);f.add(bool(CBLR_V2_SIMULATION));String signedText;serializeJson(fields,signedText);
 JsonDocument payload;payload["deviceId"]="esp2";payload["requestId"]=nonce;payload["observedAt"]=health["serverTime"].as<uint64_t>();payload["ackVersion"]=ack;payload["report"]=reportText;payload["simulation"]=bool(CBLR_V2_SIMULATION);String body;serializeJson(payload,body);
 const uint32_t started=millis();if(!http.begin(client,String(BENCH_SERVER)+"/device/facilities/v2/sync"))return;http.addHeader("Content-Type","application/json");http.addHeader("X-Device-Signature",mac(signedText));code=http.POST(body);
 if(http.getSize()>12288){http.end();return;}JsonDocument response;error=!readBoundedJson(http,response,12288);http.end();uint32_t elapsed=millis()-started;
 if(code!=200||error||response["deviceId"].as<String>()!="esp2"||response["requestId"].as<String>()!=nonce||!response["simulation"].is<bool>()||response["simulation"].as<bool>()!=bool(CBLR_V2_SIMULATION)||!response["version"].is<int64_t>()||!response["validForMs"].is<uint32_t>()||!response["serverTime"].is<uint64_t>()||!response["desired"].is<String>())return;
 const int64_t version=response["version"].as<int64_t>();const uint32_t ttl=response["validForMs"].as<uint32_t>();if(version<0||ttl>10000||ttl<=elapsed)return;
 fields.clear();f=fields.to<JsonArray>();f.add("cblr-facilities-state-v2");f.add("esp2");f.add(nonce);f.add(version);f.add(response["desired"].as<String>());f.add(response["serverTime"].as<uint64_t>());f.add(ttl);f.add(bool(CBLR_V2_SIMULATION));signedText="";serializeJson(fields,signedText);if(!equalMac(mac(signedText),response["signature"].as<String>()))return;
 JsonDocument desired;if(deserializeJson(desired,response["desired"].as<String>()))return;
 for(const char *k:{"cottage_lights","event_lights","stage_lights","pool_pump"})if(!desired[k].is<bool>())return;
 Plan next;next.version=version;next.receivedAt=millis();next.lease=ttl-elapsed;next.outputs.cottage=desired["cottage_lights"];next.outputs.event=desired["event_lights"];next.outputs.stage=desired["stage_lights"];next.outputs.pump=desired["pool_pump"];
 String door=desired["ktv_door"].as<String>();if(door!="open"&&door!="close"&&door!="stop")return;strncpy(next.outputs.door,door.c_str(),5);
 String effect=desired["ktv_rgb_effect"]|"off";if(effect!="off"&&effect!="solid"&&effect!="disco")return;strncpy(next.outputs.effect,effect.c_str(),5);
 if(desired["ktv_rgb"].size()!=3)return;for(size_t i=0;i<3;++i){int n=desired["ktv_rgb"][i];if(n<0||n>255)return;next.outputs.rgb[i]=n;}
 next.requiresHall=desired["audio"]["category"].as<String>()=="ktv";strncpy(next.title,desired["audio"]["title"]|"",120);next.audioRevision=desired["audio"]["revision"]|int64_t(-1);next.track=desired["audio"]["trackId"]|0;String state=desired["audio"]["state"].as<String>();if(state!="playing"&&state!="paused"&&state!="stopped")return;next.player=state=="playing"?1:state=="paused"?2:0;next.position=desired["audio"]["positionMs"]|0U;next.volume=desired["audio"]["volume"]|15;
 next.offset=desired["lyricWindow"]["offsetMs"]|0;if(abs(next.offset)>30000)return;auto cues=desired["lyricWindow"]["cues"].as<JsonArray>();if(cues.size()>8)return;for(auto cue:cues){String text=cue["text"].as<String>();if(text.length()>120||!cue["at"].is<uint32_t>())return;next.cues[next.count].at=cue["at"];strcpy(next.cues[next.count++].text,text.c_str());}
 const uint32_t totalAge=millis()-started;if(totalAge>=ttl)return;next.receivedAt=millis();next.lease=ttl-totalAge;
 portENTER_CRITICAL(&mux);if(next.version>=plan.version)plan=next;portEXIT_CRITICAL(&mux);
}
void networkTask(void*){for(;;){if(WiFi.status()==WL_CONNECTED)pollBackend();vTaskDelay(pdMS_TO_TICKS(1000));}}
uint32_t wifiAt=0;char input[48];size_t used=0;bool overflow=false;
void status(){char line[121],title[121];int64_t version;bool valid;PlaybackClock player;portENTER_CRITICAL(&mux);strcpy(line,currentLine);strcpy(title,plan.title);version=appliedVersion;valid=leaseValid;player=clockState;portEXIT_CRITICAL(&mux);char rows[2][27];wrapTft(line,rows);Serial.printf("V2 %s | Wi-Fi %s | lease %s | applied %lld | track %d %s\n",CBLR_V2_SIMULATION?"SIMULATION":"UNCOMMISSIONED",WiFi.status()==WL_CONNECTED?"CONNECTED":"NOT CONNECTED",valid?"VALID":"EXPIRED/MISSING",(long long)version,player.track,playerName(player.state));Serial.printf("Signed track title: %s\n",title);Serial.printf("Task stack high-water marks: output=%u network=%u\n",outputHandle?unsigned(uxTaskGetStackHighWaterMark(outputHandle)):0,networkHandle?unsigned(uxTaskGetStackHighWaterMark(networkHandle)):0);Serial.printf("TFT text preview (not physical display): [%s] [%s]\n",rows[0],rows[1]);}
void setup(){Serial.begin(115200);Serial.println("ESP2 V2: physical outputs/UART/SPI DISABLED. STATUS; SIM HALL READY; SIM HALL CLOSED");WiFi.mode(WIFI_STA);WiFi.begin(CBLR_WIFI_SSID,CBLR_WIFI_PASSWORD);wifiAt=millis();if(xTaskCreatePinnedToCore(outputTask,"v2_output",4096,nullptr,2,&outputHandle,1)!=pdPASS){Serial.println("Output task failed; no network activation");return;}if(xTaskCreatePinnedToCore(networkTask,"v2_network",12288,nullptr,1,&networkHandle,0)!=pdPASS)Serial.println("Network task failed; leases cannot renew");}
void loop(){if(WiFi.status()!=WL_CONNECTED&&uint32_t(millis()-wifiAt)>20000){wifiAt=millis();WiFi.disconnect();WiFi.begin(CBLR_WIFI_SSID,CBLR_WIFI_PASSWORD);}while(Serial.available()){char c=Serial.read();if(c=='\r'||c=='\n'){input[used]=0;if(!overflow){if(!strcmp(input,"STATUS"))status();else if(CBLR_V2_SIMULATION&&(!strcmp(input,"SIM HALL READY")||!strcmp(input,"SIM HALL CLOSED"))){portENTER_CRITICAL(&mux);hallReady=!strcmp(input,"SIM HALL READY");portEXIT_CRITICAL(&mux);Serial.println("SIMULATED Hall state only; no physical sensor was read.");}else if(used)Serial.println("STATUS | SIM HALL READY/CLOSED (simulation only)");}else Serial.println("Oversized command ignored");used=0;overflow=false;}else if(used<sizeof(input)-1&&!overflow)input[used++]=c;else overflow=true;}delay(1);}
