// Visual audit of the implemented app. Requires a local production server.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base=process.env.DESIGN_A_BASE_URL || 'http://localhost:3100';
const folder=new URL('./implemented/',import.meta.url);fs.mkdirSync(folder,{recursive:true});
const routes={home:'/',games:'/games',pattern:'/games/pattern',sequence:'/games/sequence',switch:'/games/switch',patternIntro:'/games/pattern/play?stage=1',sequenceIntro:'/games/sequence/play?stage=1',records:'/records',account:'/account',login:'/login',register:'/register',guide:'/account/guide',challenges:'/challenges',notFound:'/not-a-page'};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];
async function inspect(page,name,width){
 await page.locator('main h1').first().waitFor();await page.evaluate(()=>document.fonts.ready);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 const small=await page.locator('button:not(:disabled),.button:not([aria-disabled=true])').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&(r.height<43.9||r.width<43.9);}).map(n=>({text:n.textContent?.trim(),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
 if(overflow||small.length)throw new Error(JSON.stringify({name,width,overflow,small}));
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:new URL(`${name}-${width}.png`,folder).pathname,fullPage:false});
 results.push({name,width,overflow,smallControls:small.length});
}
try{
 for(const width of [360,768,1280]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [name,path] of Object.entries(routes)){await page.goto(base+path);await inspect(page,name,width);}
  if(errors.length)throw new Error(errors.join('\n'));await context.close();
 }
 // A 640 CSS-pixel viewport exercises reflow corresponding to a 1280-wide screen at 200% zoom.
 const context=await browser.newContext({viewport:{width:640,height:900},deviceScaleFactor:2});const page=await context.newPage();
 for(const name of ['home','games','patternIntro','login']){await page.goto(base+routes[name]);await inspect(page,`${name}-reflow`,640);}await context.close();
 const large=await browser.newContext({viewport:{width:360,height:900}});await large.addInitScript(()=>localStorage.setItem('brain-large-type','true'));const lp=await large.newPage();
 for(const name of ['home','games','pattern','sequenceIntro','login','register']){await lp.goto(base+routes[name]);await lp.locator('.large-type').waitFor();await inspect(lp,`${name}-large`,360);}await large.close();
 // Render real gameplay feedback/result via normal inputs, speeding only the local clock for captures.
 const game=await browser.newContext({viewport:{width:1280,height:900}});const gp=await game.newPage();await gp.clock.install();await gp.goto(base+routes.patternIntro);await gp.getByRole('button',{name:'바로 도전하기'}).click();
 for(let round=0;round<5;round++){
  await gp.getByRole('button',{name:'패턴 보기',exact:true}).click();const labels=await gp.locator('.memory-cell.lit').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label').split(' · ')[0]));
  await gp.clock.runFor(3200);for(const name of labels)await gp.getByRole('button',{name,exact:true}).click();await gp.getByRole('button',{name:'선택 확정 (2/2)',exact:true}).click();
  if(round===0)await inspect(gp,'patternFeedback',1280);
  await gp.getByRole('button',{name:round===4?'결과 확인':'다음 문항',exact:true}).click();
 }
 await inspect(gp,'patternResult',1280);await gp.goto(base+'/records');await gp.locator('.record-card').first().waitFor();await inspect(gp,'recordsFilled',1280);await gp.setViewportSize({width:360,height:900});await inspect(gp,'recordsFilled',360);await game.close();
 fs.writeFileSync(new URL('audit.json',folder),JSON.stringify(results,null,2));console.log(`PASS ${results.length} implemented views: no horizontal overflow, no small button targets, no page errors`);
}finally{await browser.close();}
