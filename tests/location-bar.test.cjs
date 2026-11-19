'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright'),{startServer}=require('./serve.cjs');
const root=path.resolve(__dirname,'..'),pages=['index.html','reservation.html','login.html','register.html'];
(async()=>{
 const servers=[await startServer(15020),await startServer(15021,{cloudTest:true})],browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),errors=[];let checked=0;
 try{
 const context=await browser.newContext({deviceScaleFactor:1});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
  if(u.pathname.endsWith('.html')){
   let html=await fs.readFile(path.join(root,path.basename(u.pathname)),'utf8');
   assert(!/Live Tide:|Water: 28|Diorama Connected/.test(html));
   html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
   html=html.replace('</head>',`<script>window.SHARED_RESERVATIONS_CONFIG={mode:location.port==='15020'?'emulator':'production',cloudTest:location.port==='15021'};window.SharedReservations={async identity(){throw Error('Signed out fixture')},watchIdentity(fn){queueMicrotask(fn);return()=>{}}};</script>`+(pages.slice(0,2).includes(path.basename(u.pathname))?'<script src="js/public-header.js" defer></script>':'')+'</head>');
   return route.fulfill({contentType:'text/html',body:html});
  }
  assert.equal(route.request().method(),'GET');return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const port of [15020,15021])for(const width of [1440,390])for(const file of pages){
  await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:'+port+'/'+file);await page.evaluate(()=>document.fonts.ready);
  const bar=page.locator('[data-location-bar]');assert.equal(await bar.count(),1);assert.equal((await bar.innerText()).trim(),'Bagasbas, Daet, Camarines Norte');assert.equal(await bar.locator('img,svg,i,.status-dot').count(),0);
  const metrics=await bar.evaluate(node=>{const rect=node.getBoundingClientRect(),css=getComputedStyle(node);return{height:rect.height,width:rect.width,scroll:node.scrollWidth,client:node.clientWidth,background:css.backgroundColor,text:node.textContent}});
  assert(metrics.height>=28&&metrics.height<=40);assert(metrics.scroll<=metrics.client);assert(!/\p{Extended_Pictographic}/u.test(metrics.text));assert.equal(metrics.background,file==='index.html'?'rgb(23, 62, 70)':file==='reservation.html'?'rgb(22, 71, 77)':'rgb(22, 70, 77)');
  await bar.screenshot({path:path.join(root,'test-results/location-bar-'+port+'-'+width+'-'+file+'.png')});checked++;
 }
 const allHtml=await fs.readdir(root);for(const file of allHtml.filter(f=>f.endsWith('.html'))){const html=await fs.readFile(path.join(root,file),'utf8');assert(!/Live Tide:|Water: 28|Diorama Connected/.test(html),file);if(/class="(?:status-bar|topbar|top-bar)"/.test(html))assert(html.includes('data-location-bar'),file);}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:checked,checks:'All four bars, desktop/mobile, emulator and reservation-only cloud-test servers: location text only, no icons/emoji/readings/connection claim, original teal colors, compact fit; all root HTML audited. Auth doubles only; no device/Firebase requests.'},null,2));
 }finally{await browser.close();await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))))}
})().catch(error=>{console.error(error);process.exitCode=1});
