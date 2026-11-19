'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright'),{startServer}=require('./serve.cjs'),{seedDashboardPreview}=require('../scripts/seed-dashboard-preview.cjs');
const root=path.resolve(__dirname,'..'),pages=['index.html','reservation.html','login.html','register.html'],checks=[],errors=[],forbidden=[];
(async()=>{
 const {accounts}=await seedDashboardPreview(),servers=[await startServer(),await startServer(5017,{cloudTest:true})],browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 async function session(origin,account){const context=await browser.newContext({viewport:{width:1440,height:900}});await context.route('**/*',async route=>{const u=new URL(route.request().url());
  if(u.pathname==='/js/shared-reservations-config.js')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'js/shared-reservations-config.js'),'utf8')+'\nSHARED_RESERVATIONS_CONFIG.cloudTest=location.port==="'+new URL('http://127.0.0.1:5017').port+'";'});
  if(u.hostname==='www.gstatic.com'&&u.pathname.includes('/firebasejs/12.6.0/'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'node_modules/firebase',path.basename(u.pathname)),'utf8')});
  if(['/js/firebase-config.js','/js/diorama-link.js'].includes(u.pathname)){forbidden.push(u.pathname);return route.abort();}
  if(['localhost','127.0.0.1'].includes(u.hostname))return route.continue();return route.abort();});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/login.html');if(account)await page.evaluate(async a=>SharedReservations.signIn(a.email,a.password,true),account);return{context,page};}
 const metrics=[],signatures=new Map();
 for(const origin of ['http://127.0.0.1:5000','http://127.0.0.1:5017']){
  const guest=await session(origin,accounts['guest-a']),page=guest.page;
  for(const width of [1440,390])for(const file of pages){
   await page.setViewportSize({width,height:900});await page.goto(origin+'/'+file);await page.locator('.site-footer').waitFor();await page.evaluate(()=>document.fonts.ready);
   const footer=page.locator('.site-footer');assert.equal(await footer.locator('.footer-links a').count(),4);assert.deepEqual(await footer.locator('.footer-links a').allTextContents(),['Facilities','Book Now','My Reservation','Contact']);assert.deepEqual(await footer.locator('.footer-links a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),['index.html#facilities','reservation.html','my-reservation.html','index.html#contact']);assert.equal(await footer.locator('.footer-location').textContent(),'Bagasbas, Daet, Camarines Norte');
   const dimensions=await footer.evaluate(el=>({nameFont:getComputedStyle(el.querySelector(".footer-name")).fontFamily,bodyFont:getComputedStyle(el).fontFamily,locationLine:getComputedStyle(el.querySelector(".footer-location")).lineHeight,copyLine:getComputedStyle(el.querySelector(".footer-bottom p")).lineHeight,padding:getComputedStyle(el).padding,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,overflow:el.scrollWidth>el.clientWidth,background:getComputedStyle(el).backgroundColor,direction:getComputedStyle(el.querySelector('.footer-main')).flexDirection,text:el.innerText}));assert(dimensions.height<(width===1440?190:310),JSON.stringify(dimensions));assert(!dimensions.overflow);assert.equal(dimensions.direction,width===1440?'row':'column');assert.equal(dimensions.background,'rgb(243, 232, 216)');assert(!/Plan Your Visit|Diorama Preview|Sanctuary Quarters|Guest Experience|\p{Extended_Pictographic}/u.test(dimensions.text.replace(/©/g,"")));
   const signature=[dimensions.height,dimensions.background,dimensions.direction,dimensions.nameFont,dimensions.bodyFont,dimensions.locationLine,dimensions.copyLine,dimensions.padding],key=origin+':'+width;if(signatures.has(key))assert.deepEqual(signature,signatures.get(key),'Footer must match Home across pages');else signatures.set(key,signature);
   for(const link of await footer.locator('a').all()){assert(await link.evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=14&&n.getBoundingClientRect().height>=44));await link.focus();assert(await link.evaluate(n=>getComputedStyle(n).outlineStyle!=='none'));}
   metrics.push({origin,width,page:file,height:dimensions.height});await footer.screenshot({path:path.join(root,'test-results/footer-'+new URL(origin).port+'-'+width+'-'+file+'.png')});
  }
  await page.setViewportSize({width:1440,height:900});
  for(const start of pages)for(const label of ['Facilities','Book Now','My Reservation','Contact']){
   await page.goto(origin+'/'+start);await page.locator('.site-footer').getByRole('link',{name:label,exact:true}).click();
   if(label==='Book Now'){await page.waitForURL('**/reservation.html');await page.waitForFunction(()=>!document.getElementById('confirmReservation').disabled);}
   if(label==='My Reservation'){await page.waitForURL('**/my-reservation.html');await page.locator('#bookingReference',{hasText:'CBLR-'}).waitFor();}
   if(label==='Facilities'){await page.waitForURL('**/index.html#facilities');assert(await page.locator('#facilities').count());}
   if(label==='Contact'){await page.waitForURL('**/index.html#contact');await page.locator('.site-footer#contact').waitFor();await page.waitForFunction(()=>{const r=document.getElementById('contact').getBoundingClientRect();return r.top<innerHeight&&r.bottom>0});}
  }
  await guest.context.close();
  for(const label of ['Book Now','My Reservation']){
   const visitor=await session(origin),p=visitor.page;await p.goto(origin+'/index.html');await p.locator('.site-footer').getByRole('link',{name:label,exact:true}).click();
   if(label==='My Reservation'){await p.locator('#signInLink').waitFor();await p.locator('#signInLink').click();}
   await p.waitForURL('**/login.html?next='+(label==='Book Now'?'reservation.html':'my-reservation.html'));await p.locator('#email').fill(accounts['guest-a'].email);await p.locator('#password').fill(accounts['guest-a'].password);await p.locator('#loginForm').evaluate(form=>form.requestSubmit());await p.waitForURL('**/'+(label==='Book Now'?'reservation.html':'my-reservation.html'));await visitor.context.close();
  }
  checks.push('All four footer links clicked from Home/Reservation/Sign In/Create Account; signed-in booking/owned-list access and signed-out login return passed for '+origin);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);console.log(JSON.stringify({passed:checks.length,layouts:metrics.length,checks,metrics},null,2));
 }finally{await browser.close();await Promise.all(servers.map(s=>new Promise(r=>s.close(r))))}
})().catch(error=>{console.error(error);console.error({checks,errors,forbidden});process.exitCode=1});
