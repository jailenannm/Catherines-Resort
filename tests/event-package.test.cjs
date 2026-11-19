'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs/promises'), path=require('node:path');
const {chromium}=require('playwright');const {seed,project}=require('./seed-emulator.cjs');const {startServer}=require('./serve.cjs');const {createEmulatorVerifier}=require('../scripts/emulator-check-in-verifier.cjs');
const root=path.resolve(__dirname,'..'), origin='http://127.0.0.1:5012', checks=[], errors=[], forbidden=[];
async function request(route,token,method='GET',body){const url=new URL('http://127.0.0.1:9000/'+route+'.json');url.searchParams.set('ns',project+'-default-rtdb');if(token&&token!=='owner')url.searchParams.set('auth',token);const r=await fetch(url,{method,headers:{'Content-Type':'application/json',...(token==='owner'?{Authorization:'Bearer owner'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};}
async function main(){assert.equal(process.env.GCLOUD_PROJECT,project);const accounts=await seed();let server;try{await fetch(origin+'/register.html')}catch{server=await startServer(5012,{cloudTest:true})}const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 async function session(account){const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',async route=>{const u=new URL(route.request().url());
 if(u.pathname==='/js/shared-reservations-config.js'){const source=await fs.readFile(path.join(root,'js/shared-reservations-config.js'),'utf8');return route.fulfill({contentType:'text/javascript',body:source+'\nwindow.SHARED_RESERVATIONS_CONFIG.mode="emulator";SHARED_RESERVATIONS_CONFIG.cloudTest=true; // Test only; cloudTest remains true for navigation.'});}
 if(u.hostname==='www.gstatic.com'&&u.pathname.includes('/firebasejs/12.6.0/'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'node_modules/firebase',path.basename(u.pathname)),'utf8')});
 if(u.pathname.includes('email.min.js'))return route.fulfill({contentType:'text/javascript',body:'window.emailjs={init(){},send(){window.__emails=(window.__emails||0)+1;throw Error("No real emails")}}'});
 if(['127.0.0.1','localhost'].includes(u.hostname)){if(u.pathname.includes('/diorama'))forbidden.push(u.pathname);return route.continue();}
 if(/firebase|emailjs/.test(u.hostname)||['identitytoolkit.googleapis.com','securetoken.googleapis.com'].includes(u.hostname))forbidden.push(u.hostname);return route.abort();});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());await page.goto(origin+'/login.html');await page.locator('#email').fill(account.email);await page.locator('#password').fill(account.password);await page.locator('#loginForm').evaluate(f=>f.requestSubmit());await page.waitForURL(u=>!u.pathname.endsWith('/login.html'));return{page,context};}
 const a=await session(accounts['guest-a']),admin=await session(accounts.administrator);
 await a.page.goto(origin+'/reservation.html');await a.page.waitForFunction(()=>!document.getElementById('confirmReservation').disabled);
 const choose=async kind=>{await a.page.locator('input[name="facility"]').evaluateAll(xs=>xs.forEach(x=>{x.checked=false;x.disabled=false;x.closest(".facility-option")?.classList.remove("selected")}));await a.page.locator('input[name="facility"][value="'+kind+'"]').locator('..').click();};
 await choose('pool');assert.equal((await a.page.evaluate(()=>calculatePrices())).total,1546);assert.equal(await a.page.locator('input[value="pool"]').isDisabled(),false);
 await a.page.locator('input[name="facility"][value="event"]').locator('..').click();assert.equal(await a.page.locator('input[value="pool"]').isChecked(),false);assert.equal(await a.page.locator('input[value="pool"]').isDisabled(),true);assert.equal((await a.page.evaluate(()=>calculatePrices())).total,16450);assert.equal(await a.page.locator('#eventPoolIncluded').isVisible(),true);
 await a.page.locator('input[value="event"]').locator('..').click();assert.equal(await a.page.locator('input[value="pool"]').isDisabled(),false);await choose('event');
 assert.equal((await a.page.evaluate(()=>reservationData.facilities)).length,1);assert.match(await a.page.locator('body').innerText(),/Stage Band/);
 await a.page.evaluate(()=>{sessionStorage.setItem('reservationSignInDraft',JSON.stringify({savedAt:Date.now(),values:{},counts:{adults:2,children:0,senior:0},facilities:['event','pool']}))});await a.page.evaluate(()=>restoreBookingDraft());await a.page.waitForFunction(()=>!document.getElementById('confirmReservation').disabled);assert.deepEqual(await a.page.locator('input[name="facility"]:checked').evaluateAll(xs=>xs.map(x=>x.value)),['event']);
 await a.page.evaluate(()=>prepareReview());assert.equal(await a.page.locator('#summaryFacilities > div').count(),1);assert.match(await a.page.locator('#summaryFacilities').innerText(),/Stage Band/);assert.equal(await a.page.locator('#reviewFacilities .review-facility-item').count(),1);assert.match(await a.page.locator('#reviewFacilities').innerText(),/Stage Band/);
 checks.push('Event alone, Pool alone, Pool then Event, removing Event and a restored double-selection normalize to one correct charge; Event total 16450 and Pool total 1546');
 await a.page.locator('#checkinDate').fill('2026-12-25');await a.page.locator('#fullName').fill('Event Bundle Emulator Guest');await a.page.locator('#mobileNumber').fill('09171234567');await a.page.locator('#emailAddress').fill('event@example.invalid');await a.page.locator('#agreeTerms').check();
 // Force failure before the actual commit, then retry the same attempt.
 let fail=true,writes=0;await a.context.route('**/sharedReservations/CBLR-*.json?*',async route=>{if(route.request().method()==='PUT'){writes++;if(fail)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"forced"}'});}return route.continue();});
 await a.page.locator('#confirmReservation').evaluate(el=>el.click());await a.page.waitForFunction(()=>!document.getElementById('confirmReservation').disabled);
 assert.equal(await a.page.locator('#successModal').evaluate(el=>el.classList.contains('show')),false);assert.equal((await request('sharedReservations','owner')).body,null);assert.equal(await a.page.locator('#fullName').inputValue(),'Event Bundle Emulator Guest');const attempt=await a.page.evaluate(()=>reservationAttempt.reference);fail=false;
 await a.page.locator('#confirmReservation').evaluate(el=>{el.click();el.click()});await a.page.locator('#successModal.show').waitFor();const reference=(await a.page.locator('#confirmationNumber').textContent()).trim();assert.equal(reference,attempt);assert.equal(writes,2);
 const records=(await request('sharedReservations','owner')).body;assert.equal(Object.keys(records).length,1);const saved=records[reference];assert.equal(saved.facilities.length,1);assert.equal(saved.facilities[0].value,'event');assert.equal(saved.facilities[0].packageVersion,2);assert.equal(saved.prices.total,16450);assert.equal(saved.rfidLinked,'');assert.equal(saved.status,'Pending Verification');
 assert.equal(await a.page.evaluate(()=>{const flag=SHARED_RESERVATIONS_CONFIG.cloudTest;SHARED_RESERVATIONS_CONFIG.cloudTest=false;const destination=reservationConfirmationDestination();SHARED_RESERVATIONS_CONFIG.cloudTest=flag;return destination}),'my-reservation.html?reservation='+reference);
 await a.page.locator('#closeModal').click();await a.page.waitForURL('**/my-reservation.html?reservation='+reference);await a.page.locator('#bookingReference',{hasText:reference}).waitFor();assert.equal(await a.page.locator('#bookedFacilities > li').count(),1);assert.match(await a.page.locator('#bookedFacilities').innerText(),/Stage Band/);assert.match(await a.page.locator('#bookingTotal').textContent(),/16,450/);
 await admin.page.goto(origin+'/admin-reservations.html');const row=admin.page.locator('.reservation-row').filter({hasText:reference});await row.waitFor();assert.match(await row.innerText(),/Stage Band/);assert.match(await row.innerText(),/16,450/);
 checks.push('Failed save stays on form with no modal/record; retry and duplicate click save exactly one pending unassigned booking; modal, My Reservation and Master Reservations agree on reference, inclusions and total');
 for(const route of ['/guest-dashboard.html','/pool.html','/check-in.html','/js/diorama-link.js','/js/firebase-config.js'])assert.equal((await fetch(origin+route)).status,403);
 const double={...saved,reference:'CBLR-650002',submissionAttemptId:'bad-double-event-pool',facilities:[saved.facilities[0],{value:'pool',name:'Pool',price:1200}],prices:{subtotal:16200,tourismTax:250,serviceCharge:1296,total:17746}};assert.equal((await request('sharedReservations/'+double.reference,accounts['guest-a'].idToken,'PUT',double)).status,401);
 const missingVersion={...saved,reference:'CBLR-650003',submissionAttemptId:'bad-old-event-new-create',facilities:[{value:'event',name:'Old Event',price:15000}]};assert.equal((await request('sharedReservations/'+missingVersion.reference,accounts['guest-a'].idToken,'PUT',missingVersion)).status,401);
 checks.push('Port 5001 success link is allowed while device pages/scripts remain blocked; rules reject new separately billed Event plus Pool and missing bundle version');
 const legacy={...double,reference:'CBLR-650004',submissionAttemptId:'legacy-event-pool-existing',facilities:[{value:'event',name:'Legacy Event Place',price:15000},{value:'pool',name:'Legacy Pool',price:1200}]};assert.equal((await request('sharedReservations/'+legacy.reference,'owner','PUT',legacy)).status,200);
 assert.equal((await admin.page.evaluate(ref=>SharedReservations.approveReservation(ref),legacy.reference)).success,true);assert.equal((await admin.page.evaluate(ref=>SharedReservations.assignRfid(ref,'0001A20F'),legacy.reference)).assigned,true);
 const event={eventId:'legacy-event-scan-fixture',readerId:'emulator-fixture-reader',uid:'0001A20F',byteCount:4,authenticated:true,fullUid:true,receivedAt:Date.now()};assert.equal((await createEmulatorVerifier({fixtures:[event]})(event.eventId)).status,'Checked In');
 const legacySaved=(await request('sharedReservations/'+legacy.reference,'owner')).body;assert.deepEqual(legacySaved.prices,legacy.prices);assert.deepEqual(legacySaved.facilities,legacy.facilities);
 await a.page.goto(origin+'/my-reservation.html?reservation='+legacy.reference);await a.page.locator('#bookingReference',{hasText:legacy.reference}).waitFor();assert.equal(await a.page.locator('#bookedFacilities > li').count(),2);assert.match(await a.page.locator('#bookingTotal').textContent(),/17,746/);
 // Shared eligibility module can be checked without loading any device page.
 await a.page.addScriptTag({path:path.join(root,'js/guest-access.js')});
 const eligibility=await a.page.evaluate(()=>({bundlePool:GuestAccess.includes({facilities:[{value:'event',packageVersion:2}]},'pool'),bundleEvent:GuestAccess.includes({facilities:[{value:'event',packageVersion:2}]},'event'),poolEvent:GuestAccess.includes({facilities:[{value:'pool'}]},'event'),legacyPool:GuestAccess.includes({facilities:[{value:'event'}]},'pool')}));assert.deepEqual(eligibility,{bundlePool:true,bundleEvent:true,poolEvent:false,legacyPool:false});

 // Exercise real owned status eligibility for the new bundle, not just mapping.
 await a.page.evaluate(ref=>GuestAccess.selectReservation(ref),reference);
 await a.page.waitForFunction(()=>!GuestAccess.state.loading&&GuestAccess.state.reservation?.status==='Pending Verification');
 assert.equal(await a.page.evaluate(()=>GuestAccess.accessFor('pool').allowed),false);
 await admin.page.evaluate(ref=>SharedReservations.approveReservation(ref),reference);
 await a.page.waitForFunction(()=>GuestAccess.state.reservation?.status==='Confirmed');
 assert.equal(await a.page.evaluate(()=>GuestAccess.accessFor('pool').allowed),false);
 await admin.page.evaluate(ref=>SharedReservations.assignRfid(ref,'0001A210'),reference);
 const bundleScan={...event,eventId:'new-bundle-scan-fixture',uid:'0001A210',receivedAt:Date.now()};
 await createEmulatorVerifier({fixtures:[bundleScan]})(bundleScan.eventId);
 await a.page.waitForFunction(()=>GuestAccess.accessFor('pool').allowed&&GuestAccess.accessFor('event').allowed);
 assert.equal(await a.page.evaluate(()=>GuestAccess.accessFor('pool').deviceAuthorized),false);
 assert.equal(await a.page.evaluate(()=>GuestAccess.guestAction('pool')),false);
 const poolOnly={...saved,reference:'CBLR-650006',status:'Checked In',facilities:[{value:'pool',name:'Pool',price:1200}],prices:{subtotal:1200,tourismTax:250,serviceCharge:96,total:1546}};
 await request('sharedReservations/'+poolOnly.reference,'owner','PUT',poolOnly);
 await a.page.evaluate(ref=>GuestAccess.selectReservation(ref),poolOnly.reference);
 await a.page.waitForFunction(()=>GuestAccess.accessFor('pool').allowed);
 assert.equal(await a.page.evaluate(()=>GuestAccess.accessFor('event').allowed),false);
 // Escape and backdrop reuse a record already confirmed saved on the server.
 for(const action of ['escape','backdrop']){
  await a.page.goto(origin+'/reservation.html');await a.page.waitForFunction(()=>!document.getElementById('confirmReservation').disabled);
  await a.page.evaluate(record=>{lastSavedReservation=record;presentReservationConfirmation(record)},saved);
  if(action==='escape')await a.page.keyboard.press('Escape');else await a.page.locator('#successModal').evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await a.page.waitForURL('**/my-reservation.html?reservation='+reference);
  await a.page.locator('#bookingReference',{hasText:reference}).waitFor();
 }
 checks.push('Legacy separately billed booking retains descriptions/totals through approval, RFID and trusted check-in; new bundle includes Event and Pool, Pool-only excludes Event, old unversioned Event meaning retained');
 await a.page.goto(origin+'/reservation.html');await a.page.waitForFunction(()=>!document.getElementById('confirmReservation').disabled);assert.equal(await a.page.locator('.security-badge,.security-icon').count(),0);assert(!(await a.page.content()).includes('256-bit Encrypted'));
 await choose("event");
 for(const width of [1440,390]){await a.page.setViewportSize({width,height:900});await a.page.locator('input[value="event"]').locator('..').scrollIntoViewIfNeeded();await a.page.screenshot({path:path.join(root,'test-results/event-package-'+width+'.png'),fullPage:true});await a.page.locator('#facility-selection-section').screenshot({path:path.join(root,'test-results/event-step3-'+width+'.png')});await a.page.locator('.reservation-intro').screenshot({path:path.join(root,'test-results/event-intro-'+width+'.png')});assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);}
 assert.equal((await request('diorama','owner')).body,null);assert.deepEqual(forbidden,[]);assert.deepEqual(errors,[]);checks.push('Badge/icon removed, desktop/mobile page has no horizontal overflow; no diorama/email/live-project requests or page errors');
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}}
main().catch(e=>{console.error(e);process.exitCode=1});
