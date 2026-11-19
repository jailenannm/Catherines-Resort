#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdlib.h>
struct PlaybackClock {
 int64_t revision=-1; int track=0; uint32_t base=0, changed=0; uint8_t state=0;
 constexpr uint32_t position(uint32_t now) const { return state==1 ? base+uint32_t(now-changed) : base; }
 constexpr void apply(int64_t rev,int id,uint8_t next,uint32_t pos,uint32_t now) { if(rev==revision)return; revision=rev;track=id;state=next;base=next?pos:0;changed=now; }
 constexpr void stop(uint32_t now) { state=0;track=0;base=0;changed=now; }
};
struct LyricCue { uint32_t at=0; char text[121]={0}; };
// Bounded parser for a single LRC cue. Backend handles metadata/multiple timestamps.
inline bool parseCue(const char *line,LyricCue &cue) {
 if(!line||line[0]!='[')return false;
 char *end;long minutes=strtol(line+1,&end,10);if(end==line+1||*end!=':'||minutes<0||minutes>99)return false;
 const char *secondsStart=end+1;long seconds=strtol(secondsStart,&end,10);if(end==secondsStart||seconds<0||seconds>59)return false;
 unsigned fraction=0,digits=0;
 if(*end=='.'){++end;while(*end>='0'&&*end<='9'){if(digits>=3)return false;fraction=fraction*10+(*end++-'0');++digits;}if(!digits)return false;while(digits++<3)fraction*=10;}
 if(*end!=']'||strlen(end+1)>120)return false;
 cue.at=(minutes*60+seconds)*1000+fraction;strcpy(cue.text,end+1);return true;
}
inline const char *currentLyric(const LyricCue *cues,size_t count,uint32_t position,int offset) {
 const char *line="";const int64_t at=int64_t(position)+offset;
 for(size_t i=0;i<count;++i)if(int64_t(cues[i].at)<=at)line=cues[i].text;return line;
}
// Fixed font preview: UTF-8 code points unsupported by a panel font become one '?'.
inline constexpr void wrapTft(const char *input,char rows[2][27],size_t width=26) {
 if(width>26)width=26;size_t row=0,col=0;for(size_t r=0;r<2;r++)for(size_t c=0;c<27;c++)rows[r][c]=0;
 while(*input&&row<2){unsigned char c=*input++;if(c>=128){while((*input&0xC0)==0x80)++input;c='?';}
 if(c=='\n'||col==width){++row;col=0;if(row>=2)break;if(c=='\n')continue;}rows[row][col++]=c;}
}
inline constexpr void dfFrame(uint8_t command,uint16_t parameter,uint8_t out[10]) {
 out[0]=0x7e;out[1]=0xff;out[2]=6;out[3]=command;out[4]=1;out[5]=parameter>>8;out[6]=parameter&255;
 const uint16_t check=uint16_t(0-(0xff+6+command+1+out[5]+out[6]));out[7]=check>>8;out[8]=check&255;out[9]=0xef;
}
