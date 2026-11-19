'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const h=path.resolve('esp32_firmware/ESP2_Facilities_V2/MediaEngine.h').replaceAll('\\','/');
const adapter=path.resolve('esp32_firmware/ESP2_Facilities_V2/PeripheralAdapters.h').replaceAll('\\','/');
const src=`#include "${h}"
#include "${adapter}"
constexpr bool test() {
 PlaybackClock c;c.apply(1,2,1,0,100);if(c.position(1100)!=1000)return false;
 c.apply(2,2,2,1000,1100);if(c.position(5000)!=1000)return false;
 c.apply(3,2,1,1000,5000);if(c.position(5500)!=1500)return false;
 c.apply(4,4,1,0,5500);if(c.position(5501)!=1)return false;
 c.stop(5600);if(c.state||c.track||c.position(9000))return false;
 uint8_t frame[10]={};dfFrame(0x12,2,frame);if(frame[0]!=0x7e||frame[3]!=0x12||frame[6]!=2||frame[7]!=0xfe||frame[8]!=0xe6||frame[9]!=0xef)return false;
 char rows[2][27]={};wrapTft("ABCDEFGHI",rows,4);return rows[0][3]=='D'&&rows[1][0]=='E'&&rows[1][3]=='H'&&rows[1][4]==0;
}
static_assert(test(),"Clock, pause/resume, track reset, DFPlayer frame and TFT wrap");
struct FakeDisplay {
 int count=0,y=0;int ys[4]={};char text[4][27]={};
 constexpr int width(){return 128;}
 constexpr void fillScreen(int){}constexpr void setTextSize(int){}constexpr void setTextWrap(bool){}constexpr void setTextColor(int){}
 constexpr void setCursor(int,int at){y=at;}
 constexpr void println(const char *s){if(count<4){ys[count]=y;for(int i=0;i<26&&s[i];++i)text[count][i]=s[i];count++;}}
};
constexpr bool renderTest(){FakeDisplay d;renderTft(d,"FIXTURE TRACK","playing","ABCDEFGHIJKLMNOPQRSTUV");return d.count==4&&d.ys[0]==4&&d.ys[1]==18&&d.ys[2]==40&&d.ys[3]==54&&d.text[2][19]=='T'&&d.text[3][0]=='U';}
static_assert(renderTest(),"Actual TFT renderer, width-aware two-row layout, title and status");`;
fs.mkdirSync('.local/facilities-v2-build',{recursive:true});fs.writeFileSync('.local/facilities-v2-build/media.cpp',src);
const compiler=path.join(process.env.LOCALAPPDATA,'Arduino15/packages/esp32/tools/esp-x32/2601/bin/xtensa-esp32-elf-g++.exe');execFileSync(compiler,['-std=c++17','-c','.local/facilities-v2-build/media.cpp','-o','.local/facilities-v2-build/media.o'],{stdio:'pipe'});
console.log('PASS: actual portable C++ clock/track/pause/resume/stop, DFPlayer MP3-folder frame checksum and bounded TFT wrapping compile-time simulations. No hardware.');
