'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright'),{startServer}=require('./serve.cjs');
const {seedDashboardPreview}=require('../scripts/seed-dashboard-preview.cjs');
const {createEmulatorDepartureVerifier}=require('../scripts/emulator-departure-verifier.cjs');
const root=path.resolve(__dirname,'..'),project='demo-catherines-reservations',origin='http://127.0.0.1:5000',checks=[],errors=[],forbidden=[];
async function db(route,method='GET',body,token='owner'){
 const url=new URL('http://127.0.0.1:9000/'+route+'.json?ns='+project+'-default-rtdb');if(token&&token!=='owner')url.searchParams.set('auth',token);
 return fetch(url,{method,headers:{'Content-Type':'application/json',...(token==='owner'?{Authorization:'Bearer owner'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
(async()=>{
 const {accounts,references}=await seedDashboardPreview(),reference=references.pool,before=await (await db('sharedReservations/'+reference)).json(),server=await startServer(),restricted=await startServer(5017,{cloudTest:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 let putCount=0,fail=false,lost=false;
 try{
 async function session(account){
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.endsWith('/status.json')&&route.request().method()==='PUT'){putCount++;if(fail){fail=false;return route.fulfill({status:503,json:{error:'Fixture save failure'}});}if(lost){lost=false;await route.fetch();return route.abort();}}
   if(['/js/firebase-config.js','/js/diorama-link.js'].includes(u.pathname)){forbidden.push(u.pathname);return route.abort();}
   if(u.hostname==='www.gstatic.com'&&u.pathname.includes('/firebasejs/12.6.0/'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'node_modules/firebase',path.basename(u.pathname)),'utf8')});
   if(['127.0.0.1','localhost'].includes(u.hostname))return route.continue();return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/login.html');if(account)await page.evaluate(async a=>SharedReservations.signIn(a.email,a.password,true),account);return{context,page};
 }
 const guest=await session(accounts['guest-a']),admin=await session(accounts.administrator),other=await session(accounts['guest-b']),signedOut=await session();
 const url=origin+'/checkout.html?reservation='+reference;
 for(const visitor of [signedOut,other]){await visitor.page.goto(url);await visitor.page.locator('#checkoutMessage',{hasText:'unavailable'}).waitFor();assert(await visitor.page.locator('#requestCheckout').isHidden());}
 const rejected=await other.page.evaluate(async ref=>{try{await SharedReservations.requestCheckout(ref);return false}catch{return true}},reference);assert(rejected);
 checks.push('Signed-out and other-owner requests/pages denied; reference is a selector only; no legacy device connector loaded');
 await guest.page.goto(url);await guest.page.locator('#requestCheckout').waitFor();assert(await guest.page.evaluate(async ref=>{const config=SHARED_RESERVATIONS_CONFIG;config.mode='production';try{await SharedReservations.requestCheckout(ref);return false}catch(error){return error.message.includes('only in the emulator')}finally{config.mode='emulator'}},reference));fail=true;await guest.page.locator('#requestCheckout').click();await guest.page.locator('#checkoutMessage',{hasText:'not confirmed'}).waitFor();assert.equal((await(await db('sharedReservations/'+reference)).json()).status,'Checked In');assert(await guest.page.locator('#requestCheckout').isEnabled());
 const dashboard=await guest.context.newPage(),reservation=await guest.context.newPage();await dashboard.goto(origin+'/guest-dashboard.html?reservation='+reference);await dashboard.locator('#poolSection').waitFor();await reservation.goto(origin+'/my-reservation.html?reservation='+reference);await reservation.locator('#openCheckout').waitFor();assert.equal(await reservation.locator('#openCheckout').getAttribute('href'),'checkout.html?reservation='+reference);
 await admin.page.goto(origin+'/admin-reservations.html');await admin.page.locator('.reservation-row[data-ref="'+reference+'"]').waitFor();
 const count=putCount;await guest.page.locator('#requestCheckout').dblclick();await guest.page.locator('#checkoutStatus',{hasText:'Checking Out'}).waitFor();assert.equal(putCount,count+1);await guest.page.evaluate(ref=>Promise.all([SharedReservations.requestCheckout(ref),SharedReservations.requestCheckout(ref)]),reference);assert.equal(putCount,count+1);
 await reservation.locator('#bookingStatus',{hasText:'Checking Out'}).waitFor();await dashboard.locator('#bookingStatus',{hasText:'Checking Out'}).waitFor();await admin.page.locator('.reservation-row[data-ref="'+reference+'"] .checkin-state',{hasText:'Checking Out'}).waitFor();assert.equal(await dashboard.locator('[data-facility="pool"]').getAttribute('href'),null);await guest.page.reload();await guest.page.locator('#checkoutStatus',{hasText:'Checking Out'}).waitFor();
 const facility=await guest.context.newPage();await facility.goto(origin+'/pool.html?reservation='+reference);await facility.locator('.cs-locked').waitFor();assert.equal(await facility.locator('#pageContent[data-eligible="true"]').count(),0);
 const after=await(await db('sharedReservations/'+reference)).json();assert.deepEqual({...after,status:before.status},before);checks.push('Failed save retains Checked In and allows retry; duplicate click/retry creates one status transition; guest/admin match after shared confirmation and refresh; details/RFID/prices preserved; facility access locks');
 const token=await guest.page.evaluate(()=>firebase.app('shared-reservations').auth().currentUser.getIdToken()),adminToken=await admin.page.evaluate(()=>firebase.app('shared-reservations').auth().currentUser.getIdToken());
 const deniedRef='CBLR-930007';await db('sharedReservations/'+deniedRef,'PUT',{...before,reference:deniedRef});const otherToken=await other.page.evaluate(()=>firebase.app('shared-reservations').auth().currentUser.getIdToken());for(const t of [otherToken,null])assert([401,403].includes((await db('sharedReservations/'+deniedRef+'/status','PUT','Checking Out',t)).status));
 for(const t of [token,adminToken,null]){assert([401,403].includes((await db('sharedReservations/'+reference+'/status','PUT','Completed',t)).status));assert([401,403].includes((await db('verifiedDepartures/fake','PUT',{reference},t)).status));}
 assert([401,403].includes((await db('sharedReservations/'+reference+'/rfidLinked','PUT','',token)).status));
 for(const status of ['Pending Verification','Confirmed','Completed','Cancelled']){const record={...before,reference:'CBLR-930005',status};await db('sharedReservations/'+record.reference,'PUT',record);assert(await guest.page.evaluate(async ref=>{try{await SharedReservations.requestCheckout(ref);return false}catch{return true}},record.reference));}
 checks.push('Ineligible statuses rejected; owner/admin/unauthenticated clients cannot complete or forge departure receipts; RFID assignment unchanged');
 const retryRef='CBLR-930006';await db('sharedReservations/'+retryRef,'PUT',{...before,reference:retryRef});lost=true;const retry=await guest.page.evaluate(ref=>SharedReservations.requestCheckout(ref),retryRef);assert.equal(retry.status,'Checking Out');const retryCount=putCount;await guest.page.evaluate(ref=>SharedReservations.requestCheckout(ref),retryRef);assert.equal(putCount,retryCount);checks.push('Lost write acknowledgement recovered by fresh shared read; same-reference retry performs no second write');
 const now=Date.now(),event={eventId:'fixture-departure-valid-0001',reference,receivedAt:now,trusted:true,exitConfirmed:true,gateClear:true,motorStopped:true,facilitiesReset:true};
 const complete=createEmulatorDepartureVerifier({fixtures:[event,{...event,eventId:'fixture-departure-ir-only-001',exitConfirmed:false},{...event,eventId:'fixture-departure-stale-0001',receivedAt:now-20000}],now:()=>now});
 for(const id of ['unknown','fixture-departure-ir-only-001','fixture-departure-stale-0001'])await assert.rejects(()=>complete(id),/evidence/);
 const failedComplete=createEmulatorDepartureVerifier({fixtures:[event],now:()=>now,transport:async(url,options)=>options.method==='PUT'?new Response('{}',{status:503}):fetch(url,options)});await assert.rejects(()=>failedComplete(event.eventId),/not confirmed/);assert.equal((await(await db('sharedReservations/'+reference)).json()).status,'Checking Out');
 const premature={...event,eventId:'fixture-departure-premature-001',reference:deniedRef};await assert.rejects(()=>createEmulatorDepartureVerifier({fixtures:[premature],now:()=>now})(premature.eventId),/Checking Out/);
 const outcomes=await Promise.all([complete(event.eventId),complete(event.eventId)]);assert(outcomes.every(r=>r.status==='Completed'));assert.equal(Object.keys(await(await db('verifiedDepartures')).json()).length,1);await guest.page.locator('#checkoutStatus',{hasText:'Completed'}).waitFor();await reservation.locator('#bookingStatus',{hasText:'Completed'}).waitFor();await admin.page.locator('.reservation-row[data-ref="'+reference+'"] .checkin-state',{hasText:'Completed'}).waitFor();
 assert.equal((await(await db('sharedReservations/'+reference)).json()).rfidLinked,before.rfidLinked);assert.equal(await(await db('diorama')).json(),null);checks.push('Unknown/single-IR/stale evidence cannot complete; server-controlled complete evidence commits once concurrently; guest/admin see Completed and RFID is retained without device resets');
 for(const width of [1440,390]){await guest.page.setViewportSize({width,height:900});assert(await guest.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await guest.page.screenshot({path:path.join(root,'test-results/checkout-'+width+'.png'),fullPage:true});}
 assert.equal((await fetch('http://127.0.0.1:5017/checkout.html')).status,403);assert.equal((await fetch('http://127.0.0.1:5017/js/checkout.js')).status,403);assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);checks.push('Desktop/mobile fit, restricted server checkout route/script denial, zero device writes/live Firebase/email requests');
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));await new Promise(r=>restricted.close(r));}
})().catch(e=>{console.error(e);console.error({checks,errors,forbidden});process.exitCode=1});
