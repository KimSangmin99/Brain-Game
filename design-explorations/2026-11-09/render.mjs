import {chromium} from '@playwright/test';
import fs from 'node:fs';
const root=new URL('./',import.meta.url);
const html=fs.readFileSync(new URL('index.html',root),'utf8');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const size of ['desktop','mobile']){
  const page=await browser.newPage({viewport:size==='desktop'?{width:1200,height:840}:{width:390,height:844},deviceScaleFactor:1});
  await page.setContent(html);
  for(const view of ['a','b','c']){
   await page.evaluate(v=>{document.body.classList.add('capture');show(v);},view);
   await page.screenshot({path:new URL(`${view}-${size}.png`,root).pathname});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   if(overflow)throw new Error(`${view} ${size} overflows`);
   console.log(`PASS ${view} ${size}: no horizontal overflow`);
  }
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:1200,height:900}});await page.setContent(html);
 for(const view of ['b','c','a']){await page.locator(`[data-view=${view}]`).click();if(!await page.locator(`#${view}`).isVisible())throw new Error('Comparison tab failed');}
 console.log('PASS comparison tabs');
}finally{await browser.close();}
