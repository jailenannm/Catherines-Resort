'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright'),{seed,project}=require('./seed-emulator.cjs'),{startServer}=require('./serve.cjs');
const root=path.resolve(__dirname,'..'),origin='http://127.0.0.1:5000';
(async()=>{
 const accounts=await seed(),server=await startServer(),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});const errors=[],lookups=[],dialogs=[];let mode='available',writes=0;
 const year=new Date().getFullYear()+1,date=year+'-04-15',blocked=year+'-04-16';
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Manila'});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());
  if(u.pathname==='/js/shared-reservations-config.js')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'js/shared-reservations-config.js'),'utf8')+'\nSHARED_RESERVATIONS_CONFIG.availabilityEndpoint="/api/reservation-availability";'});
  if(u.pathname==='/api/reservation-availability'){
   assert.equal(route.request().method(),'GET');lookups.push(Object.fromEntries(u.searchParams));if(mode==='fail')return route.fulfill({status:503,json:{error:'Test failure'}});
   const days={},first=new Date(u.searchParams.get('from')+'T12:00:00'),last=new Date(u.searchParams.get('to')+'T12:00:00');for(let d=new Date(first);d<=last;d.setDate(d.getDate()+1))days[d.toISOString().slice(0,10)]='available';days[u.searchParams.get('date')]=mode==='unavailable'?'unavailable':'available';days[blocked]='unavailable';
   return route.fulfill({json:{slotId:u.searchParams.get('slotId'),facilities:u.searchParams.get('facilities').split(','),verifiedAt:Date.now()-(mode==='stale'?70000:0),source:'Emulator-only calendar fixture',days}});
  }
  if(u.pathname.includes('/sharedReservations/')&&route.request().method()==='PUT')writes++;
  if(u.hostname==='www.gstatic.com'&&u.pathname.includes('/firebasejs/12.6.0/'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'node_modules/firebase',path.basename(u.pathname)),'utf8')});
  if(u.pathname.includes('email.min.js'))return route.fulfill({contentType:'text/javascript',body:'window.emailjs={init(){},send(){throw Error("No real test email")}}'});
  if(['/js/firebase-config.js','/js/diorama-link.js'].includes(u.pathname))throw Error('Unexpected device connector');if(['localhost','127.0.0.1'].includes(u.hostname))return route.continue();return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss()});await page.goto(origin+'/login.html');await page.evaluate(async a=>SharedReservations.signIn(a.email,a.password,true),accounts['guest-a']);
 await page.goto(origin+'/index.html');await page.locator('#stayDate').fill(date);await page.locator('#duration').selectOption('evening-sanctuary');await page.locator('#guests').selectOption({label:'11–30 Guests'});await page.locator('#quarters').selectOption({label:'Swimming Pool & Bridge'});await page.locator('#availabilityForm').getByRole('button',{name:'Check Availability',exact:true}).click();await page.waitForURL('**/reservation.html');await page.waitForFunction(()=>!document.getElementById('confirmReservation').disabled);
 for (const width of [1440,390]) {
 await page.setViewportSize({width,height:1000});
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(100);
 const initialHeader=await page.locator('.public-header').evaluate(n=>({height:n.getBoundingClientRect().height,background:getComputedStyle(n).backgroundImage}));
 assert.equal(initialHeader.background,'none');
 await page.locator('[data-previous="1"]').click();
 assert.equal(await page.locator('[aria-current="step"]').getAttribute('data-step'),'1');
 await page.locator('#checkinDate').fill('');await page.locator('[data-next="2"]').click();
 assert.equal(await page.locator('.progress-step.completed').count(),0);
 assert.equal(await page.locator('[aria-current="step"]').getAttribute('data-step'),'1');
 await page.locator('#checkinDate').fill(date);await page.locator('[data-next="2"]').click();
 assert.equal(await page.locator('[data-step="1"] .step-circle').textContent(),'\u2713');
 assert.equal(await page.locator('[aria-current="step"]').getAttribute('data-step'),'2');
 await page.waitForTimeout(150);
 const geometry=await page.evaluate(()=>({bar:document.querySelector('.progress-section').getBoundingClientRect().toJSON(),nav:document.querySelector('[data-public-header]').getBoundingClientRect().toJSON(),heading:document.querySelector('#guest-information-section').getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth}));
 assert(Math.abs(geometry.bar.top-geometry.nav.bottom)<2,JSON.stringify(geometry));assert(geometry.heading.top>=geometry.bar.bottom,JSON.stringify(geometry));assert(geometry.heading.top<500);assert(!geometry.overflow);
 assert(await page.locator('.public-header').evaluate(n=>n.classList.contains('is-scroll-dark')));
 assert.equal(await page.locator('.public-header').evaluate(n=>n.getBoundingClientRect().height),initialHeader.height);
 assert.equal(await page.locator('.progress-section').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(246, 234, 219)');
 assert.equal(await page.locator('.public-header .public-brand').evaluate(n=>getComputedStyle(n).color),'rgb(255, 250, 244)');
 if(width===390){await page.locator('#menuToggle').click();assert.equal(await page.locator('#mainNav').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(20, 38, 35)');await page.locator('#menuToggle').click();await page.locator('[data-step="2"]').click();}
 await page.screenshot({path:'test-results/progress-'+width+'.png'});
 await page.locator('[data-next="3"]').click();assert.equal(await page.locator('[aria-current="step"]').getAttribute('data-step'),'2');
 await page.locator('#fullName').fill('Progress Guest');await page.locator('#mobileNumber').fill('09171234567');await page.locator('#emailAddress').fill('progress@example.invalid');
 const assertHeading=async step=>{await page.waitForTimeout(100);assert(await page.evaluate(number=>{const heading=document.querySelector('[data-step-content="'+number+'"]').getBoundingClientRect();const bar=document.querySelector('.progress-section').getBoundingClientRect();return heading.top>=bar.bottom-1&&heading.top<innerHeight;},step));};
 await page.locator('[data-next="3"]').click();await assertHeading(3);
 const facility=id=>page.locator('input[name="facility"][value="'+id+'"]');
 const card=id=>page.locator('.facility-option').filter({has:facility(id)});
 const subtotal=async amount=>assert.equal(await page.locator('#subtotal').textContent(),'₱'+amount.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
 for(const id of ['pool','cottage','ktv','event','buyout']) {
   // Each selection uses the actual visible native checkbox.
   await facility(id).check();
   assert.equal(await card(id).locator('.facility-selection-state').textContent(),'Selected');
   assert((await page.locator('#summaryFacilities').textContent()).includes(await card(id).locator('h3').textContent().then(t=>t.trim()))||id==='pool');
   await facility(id).uncheck();assert.equal(await card(id).locator('.facility-selection-state').textContent(),'Select');
 }
 await facility('pool').check();await subtotal(1200);await facility('event').check();await subtotal(15000);
 assert(await facility('pool').isDisabled());assert(!(await facility('pool').isChecked()));assert.equal(await card('pool').locator('.facility-selection-state').textContent(),'Included in Event');
 await facility('event').uncheck();assert(!(await facility('pool').isDisabled()));await facility('pool').check();await subtotal(1200);
 await page.locator('[data-previous="2"]').click();await page.locator('[data-next="3"]').click();assert(await facility('pool').isChecked());await subtotal(1200);
 for(const id of ['cottage','pool','event','buyout']) {await card(id).scrollIntoViewIfNeeded();await card(id).locator('img').evaluate(img=>img.decode());assert.equal(await card(id).locator('img').evaluate(img=>getComputedStyle(img).objectFit),'cover');}
 await card('cottage').screenshot({path:'test-results/facility-card-'+width+'.png'});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const layout=await card('cottage').evaluate(n=>({image:n.querySelector('.facility-thumbnail').getBoundingClientRect().toJSON(),details:n.querySelector('.facility-information').getBoundingClientRect().toJSON(),price:n.querySelector('.facility-price').getBoundingClientRect().toJSON()}));
 if(width===390)assert(layout.details.top>=layout.image.bottom&&layout.price.top>=layout.details.bottom);else assert(layout.details.left>=layout.image.right&&layout.price.left>=layout.details.right);
 await page.locator('[data-next="4"]').click();await assertHeading(4);assert.equal(await page.locator('.progress-step.completed').count(),3);
 await page.locator('[data-previous="3"]').click();await assertHeading(3);

 await page.locator('[data-previous="2"]').click();assert.equal(await page.locator('#fullName').inputValue(),'Progress Guest');
 assert(await page.evaluate(()=>document.querySelector('#guest-information-section').getBoundingClientRect().top>=document.querySelector('.progress-section').getBoundingClientRect().bottom));
 await page.locator('#fullName').fill('Changed Guest');assert.equal(await page.locator('.progress-step.completed').count(),1);
 await page.locator('[data-previous="1"]').click();await page.locator('#checkinDate').fill(date);assert.equal(await page.locator('.progress-step.completed').count(),0);
 await page.locator('#fullName').fill('');await page.locator('#mobileNumber').fill('');await page.locator('#emailAddress').fill('');
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(100);
 assert.equal(await page.locator('.public-header').evaluate(n=>getComputedStyle(n).backgroundImage),'none');
 assert.equal(await page.locator('.public-header').evaluate(n=>n.getBoundingClientRect().height),initialHeader.height);
 }
 await page.setViewportSize({width:1440,height:1000});
 assert.equal(await page.locator('#checkinDate').inputValue(),date);assert.equal(await page.locator('#stayDuration').inputValue(),'evening-sanctuary');assert(await page.locator('input[name="facility"][value="pool"]').isChecked());await page.locator('#guestRangePreference',{hasText:'11–30 Guests'}).waitFor();assert.notEqual(await page.evaluate(()=>reservationData.adults),11);
 await page.locator('#availabilityStatus',{hasText:'Available for the selected'}).waitFor();assert.equal(await page.locator('.calendar-month:visible').count(),2);assert(await page.locator('[data-calendar-date="'+blocked+'"]').isDisabled());assert.equal(writes,0);
 const chosen=year+'-04-17';await page.locator('[data-calendar-date="'+chosen+'"]').click();assert.equal(await page.locator('#checkinDate').inputValue(),chosen);await page.locator('[data-calendar-date="'+chosen+'"][aria-pressed="true"]').waitFor();assert.match(await page.locator('#summaryDate').textContent(),/17/);
 await page.locator('#checkinDate').fill(year+'-07-19');await page.locator('[data-calendar-date="'+year+'-07-19"][aria-pressed="true"]').waitFor();await page.locator('#calendarPrevious').click();assert.match(await page.locator('#calendarMonth0').textContent(),/June/);await page.locator('#calendarNext').click();assert.match(await page.locator('#calendarMonth0').textContent(),/July/);
 await page.locator('#checkinDate').fill(date);mode='fail';await page.locator('#stayDuration').selectOption('day-retreat');await page.locator('#availabilityStatus',{hasText:'Couldn’t verify availability'}).waitFor();mode='stale';await page.locator('#stayDuration').selectOption('coastal-22h');await page.locator('#availabilityStatus',{hasText:'Couldn’t verify availability'}).waitFor();
 mode='available';await page.locator('input[name="facility"][value="event"]').evaluate(n=>n.click());await page.locator('#availabilityStatus',{hasText:'Available for the selected'}).waitFor();assert.deepEqual(lookups.at(-1).facilities,'event');await page.locator('input[name="facility"][value="event"]').evaluate(n=>n.click());await page.locator('#availabilityStatus',{hasText:'after facility selection'}).waitFor();assert.equal(writes,0);
 await page.locator('input[name="facility"][value="pool"]').evaluate(n=>n.click());await page.locator('#fullName').fill('Calendar Emulator Guest');await page.locator('#mobileNumber').fill('09171234567');await page.locator('#emailAddress').fill('calendar@example.invalid');await page.locator('#agreeTerms').evaluate(n=>n.click());
 mode='unavailable';const before=lookups.length;await page.locator('#confirmReservation').click();await page.waitForFunction(()=>!document.getElementById('confirmReservation').disabled);assert(dialogs.some(message=>message.includes('unavailable')));assert(lookups.length>before);assert.equal(writes,0);
 mode='available';await page.locator('#confirmReservation').dblclick();await page.locator('#successModal.show').waitFor();const reference=await page.locator('#confirmationNumber').textContent();assert.equal(writes,1);const token=await page.evaluate(()=>firebase.app('shared-reservations').auth().currentUser.getIdToken());const saved=await(await fetch('http://127.0.0.1:9000/sharedReservations/'+reference+'.json?ns='+project+'-default-rtdb&auth='+encodeURIComponent(token))).json();assert.equal(saved.status,'Pending Verification');assert.equal(saved.rfidLinked,'');assert.equal(saved.prices.total,1546);assert.equal(saved.checkinDate,date);assert.equal(saved.staySlotId,'coastal-22h');
 await page.locator('#successModal').evaluate(n=>{n.classList.remove('show');document.body.style.overflow=''});
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.locator('.calendar-month:visible').count(),width===1440?2:1);assert(await page.locator('.availability-calendar').evaluate(n=>n.scrollWidth<=n.clientWidth+1));await page.locator('.availability-calendar').screenshot({path:path.join(root,'test-results/calendar-'+width+'.png')});}
 await page.evaluate(()=>{delete SHARED_RESERVATIONS_CONFIG.availabilityEndpoint;return ReservationCalendar.refresh(true)});await page.locator('#availabilityStatus',{hasText:'Couldn’t verify availability'}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile progress initial state, invalid validation, checkmark, active step, sticky/heading geometry, Back/input preservation and completion invalidation; homepage prefill/range preference, two/one months, both date directions and overview, month navigation, verified unavailable/failure/stale/no-facility states, facilities/slot recheck, submission recheck and one pending shared save with unchanged Pool total/blank RFID; no browsing writes, emails or devices.');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
