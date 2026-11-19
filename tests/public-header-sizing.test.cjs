'use strict';
// Actual page HTML/CSS/header with isolated Auth doubles; no Firebase or device SDK.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright'),{startServer}=require('./serve.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=await startServer(15018),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),errors=[],metrics=[];
 try{
 const context=await browser.newContext({deviceScaleFactor:1});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1')return route.abort();
  if(url.pathname.endsWith('.html')){
   let html=await fs.readFile(path.join(root,path.basename(url.pathname)),'utf8');
   html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
   html=html.replace('</head>',`<script>window.SHARED_RESERVATIONS_CONFIG={cloudTest:true};window.SharedReservations={async identity(){return {user:{uid:'header-fixture'},admin:false}},watchIdentity(fn){queueMicrotask(fn);return()=>{}},async signOut(){}};</script><script src="js/public-header.js" defer></script></head>`);
   return route.fulfill({contentType:'text/html',body:html});
  }
  if(!['GET','HEAD'].includes(route.request().method()))throw Error('Unexpected write');
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 for(const width of [1440,1280,390,320]){
  await page.setViewportSize({width,height:900});let height;
  for(const route of ['index.html','reservation.html','my-reservation.html']){
   await page.goto('http://127.0.0.1:15018/'+route);await page.locator('#bookButton').waitFor();await page.evaluate(()=>document.fonts.ready);
   const result=await page.locator('.public-header').evaluate(header=>{
    const image=header.querySelector('.public-brand img'),rect=image.getBoundingClientRect(),brand=header.querySelector('.public-brand'),canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let left=canvas.width,right=0,top=canvas.height,bottom=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4;if(pixels[i+3]>32&&Math.min(pixels[i],pixels[i+1],pixels[i+2])<220){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}}return{height:header.getBoundingClientRect().height,logoWidth:rect.width,logoHeight:rect.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,visibleWidth:rect.width*(right-left+1)/canvas.width,brandSize:getComputedStyle(brand.querySelector('strong')).fontSize,subtitleSize:getComputedStyle(brand.querySelector('small')).fontSize,dpr:devicePixelRatio};
   });
   assert.equal(result.dpr,1);assert.equal(result.brandSize,'26px');assert.equal(result.subtitleSize,'14px');assert.equal(result.logoWidth,width>1200?88:68);assert(Math.abs(result.logoHeight/result.logoWidth-result.naturalHeight/result.naturalWidth)<.01);assert(result.visibleWidth>result.logoWidth*.8,'Oval should occupy most of its image width');
   if(width>1200)assert(result.height>=72&&result.height<=75,JSON.stringify(result));
   if(height)assert.equal(result.height,height);height=result.height;
   assert.equal(await page.locator(".public-header").evaluate(node=>node.scrollWidth<=node.clientWidth+1),true); if(width>=390)assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   const bounds=await page.locator('.public-brand,#menuToggle,#myReservationLink,#bookButton,#profileLink').evaluateAll(nodes=>nodes.filter(node=>getComputedStyle(node).display!=='none').map(node=>({id:node.id||node.className,left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right,top:node.getBoundingClientRect().top,bottom:node.getBoundingClientRect().bottom})));
   for(const rect of bounds)assert(rect.left>=0&&rect.right<=width+1,JSON.stringify(rect));
   for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){const a=bounds[i],b=bounds[j];assert(!(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1),'Overlapping controls');}
   assert(await page.locator('#profileLink').evaluate(node=>node.getBoundingClientRect().height>=44));
   await page.locator('#profileLink').click();await page.locator('#accountMenu').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('#accountMenu').isVisible(),false);
   if(width<=1200){await page.locator('#menuToggle').click();await page.locator('#mainNav.open').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('#mainNav').isVisible(),false);}
   if(route==='index.html'){
    await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});if(width<=1200)await page.locator('#menuToggle').click();await page.locator('#mainNav a[href="index.html#facilities"]').click();await page.waitForFunction(()=>{const bottom=document.querySelector('.public-header').getBoundingClientRect().bottom,top=document.getElementById('facilities').getBoundingClientRect().top;return top>=bottom&&top<=bottom+24});
    await page.evaluate(()=>scrollTo(0,800));assert(Math.abs(await page.locator('.public-header').evaluate(node=>node.getBoundingClientRect().top))<1);await page.evaluate(()=>scrollTo(0,0));
   }
   metrics.push({width,page:route,...result});await page.screenshot({path:path.join(root,'test-results/header-sizing-'+route.replace('.html','')+'-'+width+'.png')});
  }
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:12,checks:'Actual Home/Reservation/My Reservation header at 1440/1280/390/320px; 100% zoom, logo aspect/visible bounds, unchanged brand fonts, height, fit, account/mobile menus, sticky and anchor offsets; isolated Auth doubles, zero Firebase/device calls',metrics},null,2));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
