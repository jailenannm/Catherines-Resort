'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright'),{startServer}=require('./serve.cjs');
const {createFacilityCommandService}=require('../scripts/facility-command-service.cjs');
const root=path.resolve(__dirname,'..');
function tone(){const rate=8000,length=rate*4,b=Buffer.alloc(44+length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(length*2,40);for(let i=0;i<length;i++)b.writeInt16LE(Math.round(Math.sin(i/rate*440*Math.PI*2)*100),44+i*2);return b;}
(async()=>{
 const server=await startServer(15019),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--autoplay-policy=no-user-gesture-required']}),errors=[],writes=[];
 let hall=true,stale=false,owner='ktv',catalog=true,booking={reference:'CBLR-920001',ownerUid:'guest-fixture',status:'Checked In',facilities:[{value:'ktv'}]};
 const policy=createFacilityCommandService({verifyIdToken:async token=>token==='fixture-token'?{uid:'guest-fixture'}:null,readBooking:async()=>booking,readTelemetry:async()=>({hallOpen:hall,receivedAt:Date.now()-(stale?10000:0),audioOwner:owner})});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
  if(u.pathname==='/ktv.html'){
   let html=await fs.readFile(path.join(root,'ktv.html'),'utf8');html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
   const stub=`window.__fixture=${JSON.stringify(booking)};window.__emit=()=>window.__listener?.({user:{uid:'guest-fixture'},reservation:window.__fixture,verifiedAt:Date.now(),loading:false});window.SHARED_RESERVATIONS_CONFIG={mode:'emulator'};window.SharedReservations={async identity(){return{user:{uid:'guest-fixture',async getIdToken(){return 'fixture-token'}},admin:false}},watchIdentity(fn){queueMicrotask(fn);return()=>{}},subscribeOwnedReservation(ref,fn){window.__listener=fn;window.__emit();return()=>{}},async signOut(){window.__fixture=null;window.__emit()}};`;
   html=html.replace('</body>','<script>'+stub+'</script><script src="js/guest-access.js"></script><script src="js/ktv-preview.js"></script><script src="js/control-shell.js"></script><script src="js/ktv.js"></script></body>');return route.fulfill({contentType:'text/html',body:html});
  }
  if(u.pathname==='/api/ktv-preview-readiness'){
   try{const result=await policy.readiness(route.request().headers().authorization?.replace('Bearer ',''),route.request().postDataJSON().reference);return route.fulfill({json:result});}catch{return route.fulfill({status:403,json:{error:'Not ready'}});}
  }
  if(u.pathname==='/assets/ktv/catalog.json')return route.fulfill({json:catalog?[{id:'tone',title:'Synthetic test tone',artist:'Automated fixture',audio:'/assets/ktv/tone.wav',lyrics:'/assets/ktv/tone.json'},{id:'missing',title:'Missing track fixture',audio:'/assets/ktv/missing.wav',lyrics:'/assets/ktv/tone.json'}]:[]});
  if(u.pathname==='/assets/ktv/tone.json')return route.fulfill({json:[{start:0,end:1,text:'Fixture line one'},{start:1,end:4,text:'Fixture line two'}]});
  if(u.pathname==='/assets/ktv/tone.wav'){const bytes=tone(),range=route.request().headers().range,match=/bytes=(\d+)-(\d*)/.exec(range||'');if(match){const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;return route.fulfill({status:206,contentType:'audio/wav',headers:{'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${bytes.length}`},body:bytes.subarray(start,end+1)});}return route.fulfill({contentType:'audio/wav',headers:{'Accept-Ranges':'bytes'},body:bytes});}
  if(u.pathname==='/assets/ktv/missing.wav')return route.fulfill({status:404,body:'Missing'});
  if(route.request().method()!=='GET')writes.push(u.pathname);
  if(/firebase-config|diorama-link|database\.js/.test(u.pathname))throw Error('Unexpected device connector');return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.goto('http://127.0.0.1:15019/ktv.html?reservation='+booking.reference);await page.getByRole('button',{name:'Synthetic test tone — Automated fixture'}).click();await page.locator('#karaokePlay:enabled').waitFor();await page.locator('#karaokeSearch').fill('missing');assert.equal(await page.locator('#karaokeSongs button').count(),1);await page.locator('#karaokeSearch').fill('');await page.locator('#karaokePlay').click();await page.locator('#karaokeStatus',{hasText:'Playing — local browser preview'}).waitFor();await page.locator('#karaokePause').click();assert(await page.locator('audio').evaluate(a=>a.paused));await page.locator('audio').evaluate(a=>{a.currentTime=1.2;a.dispatchEvent(new Event('timeupdate'));});await page.locator('#karaokeLyrics',{hasText:'Fixture line two'}).waitFor();await page.locator('#karaokePlay').click();await page.waitForFunction(()=>!document.querySelector('audio').paused);await page.locator('#karaokeStop').click();assert.equal(await page.locator('audio').evaluate(a=>a.currentTime),0);assert.equal(await page.locator('#karaokeLyrics').textContent(),'');
 await page.locator('#karaokePlay').click();hall=false;await page.waitForFunction(()=>document.querySelector('audio').paused);await page.locator('#karaokePlay:disabled').waitFor();hall=true;await page.locator('#karaokePlay:enabled').waitFor();stale=true;await page.locator('#karaokePlay:disabled').waitFor();stale=false;owner='event';await page.locator('#karaokePlay:disabled').waitFor();owner='ktv';await page.locator('#karaokePlay:enabled').waitFor();
 await page.getByRole('button',{name:'Missing track fixture'}).click();await page.locator('#karaokePlay:enabled').waitFor();await page.locator('#karaokePlay').click();await page.locator('#karaokeStatus',{hasText:/Missing|unsupported/}).waitFor();
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(root,'test-results/ktv-preview-'+width+'.png'),fullPage:true});}
 booking.status='Confirmed';await page.evaluate(record=>{window.__fixture=record;window.__emit()},booking);await page.locator('.cs-locked').waitFor();assert.equal(await page.locator('#karaokePreview').count(),0);
 booking.status='Checked In';booking.facilities=[{value:'pool'}];await page.evaluate(record=>{window.__fixture=record;window.__emit()},booking);assert.equal(await page.locator('#karaokePreview').count(),0);
 booking.facilities=[{value:'ktv'}];await page.evaluate(record=>{window.__fixture=record;window.__emit()},booking);await page.locator('#karaokePreview').waitFor();await page.evaluate(()=>SharedReservations.signOut());await page.locator('.cs-locked').waitFor();assert.equal(await page.locator('#karaokePreview').count(),0);
 catalog=false;await page.goto('http://127.0.0.1:15019/ktv.html?reservation='+booking.reference);await page.locator('#karaokeStatus',{hasText:'No approved local tracks'}).waitFor();assert(await page.locator('#karaokePlay').isDisabled());assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 console.log('PASS: search/select/play/pause/resume/stop, actual synthetic WAV playback and timed lyric seeking, missing media/catalog, fresh/closed/stale Hall, Event audio ownership, lost status/package/sign-out, desktop/mobile layout; no Firebase or device transport/writes.');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
