'use strict';
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const { startBenchServer } = require('../scripts/rfid-bench-server.cjs');
const { requestFields } = require('../scripts/reservation-device-sync.cjs');
const { requestFields: v2Fields } = require('../scripts/facilities-v2.cjs');
(async () => {
 if(process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19000' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:19099' || process.env.GCLOUD_PROJECT !== 'demo-catherines-reservations') throw Error('Isolated test emulators required.');
 const db='http://127.0.0.1:19000', ns='demo-catherines-reservations-default-rtdb';
 async function read(path=''){const r=await fetch(db+'/'+path+'.json?ns='+ns,{headers:{Authorization:'Bearer owner'}});assert(r.ok);return r.json();}
 async function write(path,value){const r=await fetch(db+'/'+path+'.json?ns='+ns,{method:'PUT',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(value)});assert(r.ok);}
 async function signup(tag){const r=await fetch('http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-reservations-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:tag+'-'+Date.now()+'@example.test',password:'FixtureOnly123!',returnSecureToken:true})});assert(r.ok);return r.json();}
 const a=await signup('sync-a'),b=await signup('sync-b');
 const reference='CBLR-819991', uid='00ABCDEF';
 await write('sharedReservations/'+reference,{reference,ownerUid:a.localId,guestName:'Fixture Guest',status:'Confirmed',rfidLinked:uid,facilities:[{value:'cottage'}]});
 await write('rfidAssignments/'+uid,reference);
 const devices={esp1:{key:'fixture-one-012345678901234567890123456'},esp2:{key:'fixture-two-012345678901234567890123456'}};
 const readerKey='fixture-reader-012345678901234567890';
 const server=await startBenchServer({host:'127.0.0.1',port:0,readerKeys:{'esp1-bench':readerKey},deviceSync:{devices,webOrigin:'http://127.0.0.1:15000',facilitiesV2:{simulation:true,catalog:{version:1,indexing:'unverified',tracks:[]},audioPolicy:'nonpreemptive-fifo'}}});
 const base='http://127.0.0.1:'+server.address().port;
 let sequence=0;
 async function sync(deviceId,ackVersion=-1,actual=null){const p={deviceId,requestId:'isolated-sync-event-'+ ++sequence,observedAt:Date.now(),ackVersion,actual};const r=await fetch(base+'/device/sync',{method:'POST',headers:{'Content-Type':'application/json','X-Device-Signature':createHmac('sha256',devices[deviceId].key).update(requestFields(p)).digest('hex')},body:JSON.stringify(p)});assert.equal(r.status,200);return r.json();}
 let browser;
 try {
  assert.equal((await sync('esp1')).desired,false);
  const event={readerId:'esp1-bench',eventId:'isolated-rfid-event-0001',uid,byteCount:4,observedAt:Date.now()};
  const sig=createHmac('sha256',readerKey).update(JSON.stringify([event.readerId,event.eventId,event.uid,event.byteCount,event.observedAt])).digest('hex');
  const scan=await fetch(base+'/scan',{method:'POST',headers:{'Content-Type':'application/json','X-Reader-Signature':sig},body:JSON.stringify(event)});
  assert.equal(scan.status,200);assert.equal((await scan.json()).guestName,'Fixture Guest');
  const v2Command = await fetch(base+'/guest/facilities/v2/command',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+a.idToken},body:JSON.stringify({reference,type:'cottage_lights',value:true,requestId:'isolated-v2-command-0001'})});
  assert.equal(v2Command.status,200);
  const v2Other = await fetch(base+'/guest/facilities/v2/state?reference='+reference,{headers:{Authorization:'Bearer '+b.idToken}});assert.equal(v2Other.status,403);
  async function v2Poll() {const p={deviceId:'esp2',requestId:'isolated-v2-poll-'+String(++sequence).padStart(8,'0'),observedAt:Date.now(),ackVersion:-1,report:'{}',simulation:true};const r=await fetch(base+'/device/facilities/v2/sync',{method:'POST',headers:{'Content-Type':'application/json','X-Device-Signature':createHmac('sha256',devices.esp2.key).update(v2Fields(p)).digest('hex')},body:JSON.stringify(p)});assert.equal(r.status,200);return JSON.parse((await r.json()).desired);}
  assert.equal((await v2Poll()).cottage_lights,true);
  assert.equal((await sync('esp1')).desired,true);assert.equal((await sync('esp2')).desired,false);
  const denied=await fetch(base+'/guest/cottages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+b.idToken},body:JSON.stringify({reference,on:true,requestId:'wrong-owner-command-001'})});assert.equal(denied.status,403);
  const direct=await fetch(db+'/reservationDeviceSync/desired.json?ns='+ns+'&auth='+encodeURIComponent(a.idToken),{method:'PUT',headers:{'Content-Type':'application/json'},body:'{"cottageLights":true}'});assert.equal(direct.status,401);
  const protectedV2=await fetch(db+'/reservationFacilitiesV2/desired.json?ns='+ns+'&auth='+encodeURIComponent(a.idToken),{method:'PUT',headers:{'Content-Type':'application/json'},body:'{"event_lights":true}'});assert.equal(protectedV2.status,401);
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage();
  await page.route('http://127.0.0.1:15000/**',r=>r.fulfill({contentType:'text/html',body:'<main id="controlsSection"></main>'}));
  // Browser -> real HTTP adapter -> real isolated Auth/RTDB. Only the port is bridged.
  await page.route('http://127.0.0.1:8787/**',async route=>{const req=route.request(),url=new URL(req.url());const r=await fetch(base+url.pathname+url.search,{method:req.method(),headers:{...req.headers(),origin:'http://127.0.0.1:15000'},...(req.postData()?{body:req.postData()}: {})});await route.fulfill({status:r.status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:15000'},body:await r.text()});});
  await page.goto('http://127.0.0.1:15000/');
  await page.evaluate(({token,reference})=>{window.SHARED_RESERVATIONS_CONFIG={mode:'emulator',deviceSyncEnabled:true};window.SharedReservations={identity:async()=>({user:{getIdToken:async()=>token}})};window.GuestAccess={accessFor:()=>({allowed:true,reservation:{reference}}),subscribe:fn=>{window.refresh=fn;fn();return()=>{};}};Object.defineProperty(crypto,'randomUUID',{value:undefined});},{token:a.idToken,reference});
  await page.addScriptTag({content:await fs.readFile('js/reservation-device-controls.js','utf8')});await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
  await page.getByRole('button',{name:'COTTAGES ON'}).click();
  await page.locator('[data-feedback]',{hasText:'Command pending'}).waitFor();
  assert.equal((await read('reservationDeviceSync/requests/'+reference)).on,true);
  const desired=await sync('esp2');assert.equal(desired.desired,true);await sync('esp2',desired.version,true);
  await page.evaluate(()=>window.refresh());await page.locator('[data-feedback]',{hasText:'Device acknowledged'}).waitFor();
  // Fixture departure initiation, isolated store only. Existing checkout suites exercise owner transition rules.
  await write('sharedReservations/'+reference+'/status','Checking Out');
  assert.equal((await sync('esp1')).desired,false);assert.equal((await sync('esp2')).desired,false);
  assert.equal((await read('sharedReservations/'+reference)).status,'Checking Out');
  assert.equal((await v2Poll()).cottage_lights,false);
  console.log('PASS: v2 mounted HTTP + real isolated Auth/RTDB, owner/token checks and checkout revocation, with v1 RFID/pathway/cottage compatibility and browser cottage flow; authenticated RFID commit/name, pathway OFF-before/ON-after, no automatic cottages, wrong owner denied, protected direct write denied, requested/acknowledged feedback, checkout revokes both outputs. Synthetic test data only.');
 } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
