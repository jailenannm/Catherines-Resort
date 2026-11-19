'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright'),{startServer}=require('./serve.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=await startServer(15022),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),errors=[];
 try{
 const context=await browser.newContext({deviceScaleFactor:1});await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.pathname==='/js/shared-reservations.js')return route.fulfill({contentType:'text/javascript',body:'window.SharedReservations={register(){throw Error("No test account creation")}};'});
  if(u.pathname==='/js/database.js')return route.fulfill({contentType:'text/javascript',body:'window.ResortDB={};'});
  if(u.hostname!=='127.0.0.1')return route.abort();return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const results=[];
 const styles=node=>{const s=getComputedStyle(node);return Object.fromEntries(['height','backgroundColor','borderRadius','paddingLeft','paddingRight','fontSize','color','fontFamily','borderColor','boxShadow'].map(key=>[key,s[key]]).concat([['placeholder',getComputedStyle(node,'::placeholder').color]]));};
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:15022/login.html');await page.evaluate(()=>document.fonts.ready);await page.addStyleTag({content:"*{transition:none!important}"});const normal=await page.locator('#email').evaluate(styles);await page.locator('#email').focus();const focus=await page.locator('#email').evaluate(styles);const error=await page.locator('#emailError').evaluate(n=>({font:getComputedStyle(n).fontSize,color:getComputedStyle(n).color}));await page.screenshot({path:path.join(root,'test-results/signin-reference-'+width+'.png'),fullPage:true});
  await page.goto('http://127.0.0.1:15022/register.html');await page.evaluate(()=>document.fonts.ready);await page.addStyleTag({content:"*{transition:none!important}"});
  assert(!/\p{Extended_Pictographic}/u.test((await page.locator('body').innerText()).replace(/©/g,'')));
  for(const id of ['fullName','phoneNumber','registerEmail','registerPassword','confirmPassword']){
   const input=page.locator('#'+id);assert.deepEqual(await input.evaluate(styles),normal,id+' must reuse Sign In appearance');await input.focus();assert.deepEqual(await input.evaluate(styles),focus);await input.blur();
   assert(await input.getAttribute('aria-describedby'));const fit=await input.evaluate(n=>{const s=getComputedStyle(n),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=s.font;return{client:n.clientWidth,padding:s.padding,border:s.borderWidth,needed:ctx.measureText(n.placeholder).width,available:n.getBoundingClientRect().width-parseFloat(s.borderLeftWidth)-parseFloat(s.borderRightWidth)-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)}});assert(fit.needed<=fit.available+1,JSON.stringify({width,id,fit,parents:await input.evaluate(n=>[n,n.parentElement,n.closest(".name-phone-row"),n.closest(".form-inner"),n.closest(".form-panel")].filter(Boolean).map(n=>({cls:n.className,width:n.getBoundingClientRect().width,grid:getComputedStyle(n).gridTemplateColumns})))}));
  }
  assert.deepEqual(await page.locator('#fullNameError').evaluate(n=>({font:getComputedStyle(n).fontSize,color:getComputedStyle(n).color})),error);
  const row=await page.locator('#fullName,#phoneNumber').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));assert.equal(Math.abs(row[0]-row[1])<1,width===1440);
  for(const [id,toggle]of [['registerPassword','toggleRegisterPassword'],['confirmPassword','toggleConfirmPassword']]){await page.locator('#'+id).fill('VisibleTest123!');await page.locator('#'+toggle).focus();assert(await page.locator('#'+toggle).evaluate(n=>getComputedStyle(n).outlineStyle!=='none'));await page.keyboard.press('Space');assert.equal(await page.locator('#'+id).getAttribute('type'),'text');assert.equal(await page.locator('#'+toggle).getAttribute('aria-label'),'Hide password');assert.equal(await page.locator('#'+toggle+' svg').count(),1);await page.keyboard.press('Space');assert.equal(await page.locator('#'+id).getAttribute('type'),'password');assert.equal(await page.locator('#'+toggle).getAttribute('aria-pressed'),'false');}
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(root,'test-results/register-design-'+width+'.png'),fullPage:true});results.push({width,height:normal.height,fontSize:normal.fontSize,namePhone:width===1440?'side by side':'stacked'});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:3,checks:'100% desktop/mobile comparisons of all five fields to Sign In, focus/error/placeholder styles, placeholder fit, responsive row, monochrome icons, keyboard password toggles and accessible labels. Auth doubles only; no account creation.',results},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
