'use strict';
const assert=require('node:assert/strict'),{createHmac}=require('node:crypto');
const {createFacilitiesV2,requestFields,responseFields,includes}=require('../scripts/facilities-v2.cjs');
const {validateCatalog,parseLrc}=require('../scripts/song-catalog.cjs');
(async()=>{
 let now=100000,rev=0,fail=false,seq=0;
 const booking=(ownerUid,kind,status='Checked In')=>({ownerUid,status,facilities:[{value:kind,...(kind==='event'?{packageVersion:2}:{})}]});
 let root={sharedReservations:{'CBLR-900001':booking('a','cottage'),'CBLR-900002':booking('b','event'),'CBLR-900003':booking('a','ktv'),'CBLR-900004':booking('a','pool'),'CBLR-900005':booking('a','cottage','Pending Verification'),'CBLR-900006':booking('a','ktv','Confirmed'),'CBLR-900007':booking('b','ktv'),'CBLR-900008':booking('b','cottage')}};
 const original=structuredClone(root.sharedReservations);
 const catalog={version:1,indexing:'mp3-folder',tracks:[{id:1,title:'FIXTURE WELCOME',category:'welcome'},{id:2,title:'FIXTURE A',category:'ktv'},{id:3,title:'FIXTURE THANKS',category:'checkout'},{id:4,title:'FIXTURE B',category:'ktv'},{id:5,title:'FIXTURE EVENT',category:'event'}].map(t=>({...t,artist:null,file:String(t.id).padStart(4,'0')+'.mp3',folder:'MP3',durationMs:100000,lyrics:t.id===2?'0002.lrc':null,offsetMs:0,verified:true}))};
 const devices={esp2:{key:'FIXTURE_DEVICE_KEY_01234567890123456789'}};
 const store={read:async()=>({value:structuredClone(root),version:rev}),compareAndSet:async(version,next)=>{if(fail)throw Error('FORCED_FAILURE');if(version!==rev)return false;root=next;rev++;return true;}};
 const api=createFacilitiesV2({store,devices,catalog,now:()=>now,simulation:true,audioPolicy:'nonpreemptive-fifo',loadLyrics:()=> '[00:00.00]LINE_A\n[00:01.50]LINE_B'});
 const a={uid:'a'},b={uid:'b'};
 const cmd=(reference,type,value,category)=>({reference,type,value,category,requestId:'fixture-command-'+String(++seq).padStart(8,'0')});
 async function poll(report={hall:{ready:true,ageMs:0}},ackVersion=-1){const p={deviceId:'esp2',requestId:'fixture-poll-'+String(++seq).padStart(10,'0'),observedAt:now,ackVersion,report:JSON.stringify(report),simulation:true};const signature=createHmac('sha256',devices.esp2.key).update(requestFields(p)).digest('hex');const r=await api.sync(p,signature);assert.equal(r.signature,createHmac('sha256',devices.esp2.key).update(responseFields(r)).digest('hex'));return {r,p,signature};}
 await assert.rejects(()=>api.command(b,cmd('CBLR-900001','cottage_lights',true)),/FORBIDDEN/);
 for(const ref of ['CBLR-900005','CBLR-900006'])await assert.rejects(()=>api.state(a,ref),/FORBIDDEN/);
 for(const type of ['event_lights','stage_lights','cottage_lights','ktv_rgb'])await assert.rejects(()=>api.command(a,cmd('CBLR-900004',type,true)),/FORBIDDEN/);
 assert(includes(root.sharedReservations['CBLR-900002'],'pool'));assert(!includes(booking('x','event-old'),'pool'));assert(!includes({facilities:[{value:'event'}]},'pool'));
 await api.command(b,cmd('CBLR-900002','event_lights',true));await api.command(b,cmd('CBLR-900002','stage_lights',true));await assert.rejects(()=>api.command(b,cmd('CBLR-900002','pool_pump',true)),/FORBIDDEN/);
 const on=cmd('CBLR-900001','cottage_lights',true);fail=true;await assert.rejects(()=>api.command(a,on),/FORCED/);fail=false;
 await Promise.all([api.command(a,on),api.command(a,on)]);assert.equal(Object.keys(root.reservationFacilitiesV2.commands).filter(k=>k===on.requestId).length,1);
 await api.command(b,cmd('CBLR-900008','cottage_lights',true));await api.command(a,cmd('CBLR-900001','cottage_lights',false));await api.command(a,on);assert.equal(root.reservationFacilitiesV2.claims[on.reference].cottage_lights.value,false);assert((await api.state(a,on.reference)).desired.cottage_lights);
 let s=await poll();await assert.rejects(()=>api.sync(s.p,'0'.repeat(64)),/INVALID_DEVICE/);assert.deepEqual(await api.sync(s.p,s.signature),s.r);
 await assert.rejects(()=>api.sync({...s.p,ackVersion:99},s.signature),/INVALID_DEVICE/);
 const desired=JSON.parse(s.r.desired),outputs=Object.fromEntries(Object.entries(desired).filter(([k])=>!['audio','lyricWindow'].includes(k)));
 await poll({outputs,audio:desired.audio,hall:{ready:true,ageMs:0}},s.r.version);assert((await api.state(a,on.reference)).device.acknowledged);
 await poll({hall:{ready:false,ageMs:0}});
 await assert.rejects(()=>api.command(a,cmd('CBLR-900003','audio_playback',{action:'play',trackId:2},'ktv')),/HALL_NOT_READY/);
 await poll();
 await assert.rejects(()=>api.command(a,cmd('CBLR-900003','ktv_door','open')),/FORBIDDEN/);assert.equal((await api.state(a,'CBLR-900003')).desired.ktv_door,'stop');now+=2100;assert.equal((await api.state(a,'CBLR-900003')).desired.ktv_door,'stop');await poll();
 await api.command(a,cmd('CBLR-900003','ktv_rgb','disco'));assert.equal((await api.state(a,'CBLR-900003')).desired.ktv_rgb_effect,'disco');
 await api.command(a,cmd('CBLR-900003','ktv_rgb',[255,0,0]));await assert.rejects(()=>api.command(b,cmd('CBLR-900007','ktv_rgb',[0,0,255])),/RESOURCE_BUSY/);
 await assert.rejects(()=>api.command(a,cmd('CBLR-900003','audio_playback',{action:'play',trackId:999},'ktv')),/TRACK_UNAVAILABLE/);
 await api.command(a,cmd('CBLR-900003','audio_playback',{action:'play',trackId:2,queue:[2,4]},'ktv'));
 await assert.rejects(()=>api.command(b,cmd('CBLR-900002','audio_playback',{action:'play',trackId:5},'event')),/AUDIO_BUSY/);
 now+=1000;await api.command(a,cmd('CBLR-900003','audio_playback',{action:'pause'},'ktv'));let view=await api.state(a,'CBLR-900003');assert.equal(view.audio.positionMs,1000);assert.equal(view.audio.state,'paused');
 now+=1000;assert.equal((await api.state(a,'CBLR-900003')).audio.positionMs,1000);await poll();
 await api.command(a,cmd('CBLR-900003','audio_playback',{action:'resume'},'ktv'));now+=500;assert.equal((await api.state(a,'CBLR-900003')).audio.positionMs,1500);
 await api.command(a,cmd('CBLR-900003','audio_playback',{action:'next'},'ktv'));assert.equal((await api.state(a,'CBLR-900003')).audio.trackId,4);
 const oldTrack=await api.state(a,'CBLR-900003');await poll({audio:{revision:oldTrack.audio.revision,trackId:4,state:'playing',positionMs:5000},hall:{ready:true,ageMs:0}});
 await api.command(a,cmd('CBLR-900003','audio_playback',{action:'previous'},'ktv'));assert.equal((await api.state(a,'CBLR-900003')).lyricWindow.cues[0].text,'LINE_A');assert.equal((await api.state(a,'CBLR-900003')).audio.trackId,2);
 await assert.rejects(()=>api.command(a,cmd('CBLR-900003','audio_playback',{action:'previous'},'ktv')),/QUEUE_BOUNDARY/);
 await api.command(a,cmd('CBLR-900003','audio_playback',{action:'volume',volume:17},'ktv'));assert.equal((await api.state(a,'CBLR-900003')).audio.volume,17);await assert.rejects(()=>api.command(a,cmd('CBLR-900003','audio_playback',{action:'volume',volume:31},'ktv')),/INVALID_VOLUME/);
 root.verifiedCheckins={eventOne:{reference:'CBLR-900001',checkedInAt:now}};await api.state(a,'CBLR-900003');await api.state(a,'CBLR-900003');assert.equal(root.reservationFacilitiesV2.audio.pending.length,1);
 await api.command(a,cmd('CBLR-900003','audio_playback',{action:'stop'},'ktv'));assert.equal((await api.state(a,'CBLR-900003')).audio.state,'busy');
 assert.equal(root.reservationFacilitiesV2.audio.category,'welcome');
 root.sharedReservations['CBLR-900001'].status='Completed';root.verifiedDepartures={done:{reference:'CBLR-900001',completedAt:now}};await api.state(b,'CBLR-900008');assert.equal(root.reservationFacilitiesV2.audio.category,'checkout');
 root.sharedReservations['CBLR-900008'].status='Checking Out';assert.equal((await api.state(b,'CBLR-900002')).desired.cottage_lights,false);
 await assert.rejects(()=>api.command(a,on),/FORBIDDEN/);
 now+=16000;await assert.rejects(()=>api.sync(s.p,s.signature),/INVALID_DEVICE/);assert.equal((await api.state(b,'CBLR-900002')).device.state,'Offline');
 assert.deepEqual(root.sharedReservations['CBLR-900002'],original['CBLR-900002']);assert.equal(root.diorama,undefined);
 const live=createFacilitiesV2({store,devices,catalog,simulation:false});await assert.rejects(()=>live.command(b,cmd('CBLR-900002','event_lights',true)),/AWAITING_VERIFICATION/);
 assert.throws(()=>createFacilitiesV2({store,devices,catalog,simulation:false,commissioned:{pool_pump:true}}),/DRIVER_REVIEW/);
 assert.throws(()=>validateCatalog({...catalog,tracks:[{...catalog.tracks[0],file:'0002.mp3'}]}),/INVALID_TRACK/);
 assert.deepEqual(parseLrc('[00:01.50]LINE_A\n[00:03.000]LINE_B').map(c=>c.at),[1500,3000]);assert.throws(()=>parseLrc('[00:99.00]BAD'),/INVALID_LRC/);
 function firebase(value) {
  if(value==null)return undefined;
  if(Array.isArray(value)){const a=value.map(firebase);return a.length?a:undefined;}
  if(typeof value==='object'){const o=Object.fromEntries(Object.keys(value).sort().map(k=>[k,firebase(value[k])]).filter(([,v])=>v!==undefined));return Object.keys(o).length?o:undefined;}
  return value;
 }
 let roundRoot={sharedReservations:{'CBLR-990001':booking('a','event')}},roundVersion=0;
 const roundApi=createFacilitiesV2({devices,catalog,now:()=>now,simulation:true,audioPolicy:'nonpreemptive-fifo',store:{read:async()=>({value:structuredClone(roundRoot),version:roundVersion}),compareAndSet:async(v,r)=>{if(v!==roundVersion)return false;roundRoot=firebase(r);roundVersion++;return true;}}});
 const initial=await roundApi.state(a,'CBLR-990001');
 async function roundPoll(report) {const p={deviceId:'esp2',requestId:'roundtrip-poll-'+String(++seq).padStart(8,'0'),observedAt:now,ackVersion:-1,report:JSON.stringify(report),simulation:true};return roundApi.sync(p,createHmac('sha256',devices.esp2.key).update(requestFields(p)).digest('hex'));}
 await roundPoll({hall:{ready:true,ageMs:0}});const wire=JSON.parse((await roundPoll({hall:{ready:true,ageMs:0}})).desired);assert.equal(wire.audio.trackId,null);await roundPoll({audio:wire.audio,hall:{ready:true,ageMs:0}});assert.equal((await roundApi.state(a,'CBLR-990001')).version,initial.version);
 await roundApi.command(a,cmd('CBLR-990001','event_lights',true));const afterRound=await roundApi.state(a,'CBLR-990001');assert.equal((await roundApi.state(a,'CBLR-990001')).version,afterRound.version);
 await roundApi.command(a,cmd('CBLR-990001','audio_playback',{action:'play',trackId:5},'event'));const missing=await roundApi.state(a,'CBLR-990001');await roundPoll({error:'TRACK_MISSING',audio:{revision:missing.audio.revision,trackId:5,state:'playing',positionMs:0},hall:{ready:true,ageMs:0}});assert.equal((await roundApi.state(a,'CBLR-990001')).audio.state,'stopped');
 console.log('PASS: Firebase null/empty-container removal and key reordering preserve state normalization and stable desired versions.');
 console.log('PASS: v2 owner/status/package and Event-vs-Pool security; every relay intent, shared OR, CAS concurrency, failed-save retry, signed sync/ack/replay/offline, Hall gate, catalog mapping/missing song, play/pause/resume/queue, exclusive audio, receipt event deduplication, checkout release/scheduling, lyrics bounds and physical activation block. Fake store only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
