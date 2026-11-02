// Regression QA for the three founder comments. Responsive emulation, not physical Android.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
module.exports=async function({page,origin,check,errors,root}){
 const dir=path.join(root,'docs/qa/mortgage-redesign/fixes-2026-11-01');fs.mkdirSync(dir,{recursive:true});
 const captures=[],checks=[],captureData=[];
 const pass=(name,value)=>{check(name,value);checks.push(name);};
 const sleep=ms=>page.waitForTimeout(ms);
 async function ready(){await page.waitForFunction(()=>document.body.dataset.calculationState==='READY');}
 async function open(){await page.goto(origin+'/mortgage.html',{waitUntil:'networkidle'});await ready();}
 async function theme(dark){await page.evaluate(d=>{localStorage.setItem('theme',d?'dark':'light');initTheme();refreshMortgageChartTheme();},dark);await sleep(350);}
 async function savePNG(name){
  const pending=page.waitForEvent('download');
  await page.evaluate(()=>takeScreenshot('results-panel','yasnomera-mortgage-calculation.png'));
  const download=await pending,file=path.join(dir,name+'.png');await download.saveAs(file);
  const png=fs.readFileSync(file);captures.push({name,width:png.readUInt32BE(16),height:png.readUInt32BE(20),sha256:crypto.createHash('sha256').update(png).digest('hex')});
  return png;
 }
 if(process.argv.includes('--release-fixes-other-pages')){
  for(const name of ['honest-credit','rent-vs-mortgage']){
   await page.goto(origin+'/'+name+'.html',{waitUntil:'networkidle'});
   assert.equal(await page.evaluate(()=>typeof window.prepareCalculationScreenshot),'undefined');
   const pending=page.waitForEvent('download');
   await page.locator('button[onclick^="takeScreenshot"]').first().click();
   await(await pending).saveAs(path.join(dir,'unchanged-'+name+'-export.png'));
   pass(name+' keeps original PNG exporter without mortgage hook',!await page.locator('[data-screenshot-stage]').count());
  }
  fs.writeFileSync(path.join(dir,'other-pages.json'),JSON.stringify({checks,uncaughtErrors:errors},null,2)+'\n');return;
 }
 await page.setViewportSize({width:1440,height:900});await open();
 // Track/thumb geometry, keyboard activation, checked state and focus for both surfaces.
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?900:844});
  for(const dark of [false,true]){
   await theme(dark);
   await page.locator('#insurance-toggle').focus();await sleep(350);
   for(const on of [false,true]){
    if(await page.locator('#insurance-toggle').isChecked()!==on)await page.locator('#insurance-toggle').press('Space');
    await sleep(200);
    const geometry=await page.evaluate(()=>{
     const input=document.getElementById('insurance-toggle'),label=input.closest('label'),track=input.nextElementSibling;
     const l=label.getBoundingClientRect(),t=track.getBoundingClientRect(),p=getComputedStyle(track,'::after');
     return {hitWidth:l.width,hitHeight:l.height,trackHeight:t.height,top:parseFloat(p.top),thumbHeight:parseFloat(p.height),left:parseFloat(p.left),
       centered:Math.abs(t.y+t.height/2-(l.y+l.height/2))<.5,position:getComputedStyle(track).position,focus:document.activeElement===input,
       focusOutline:getComputedStyle(label).outlineWidth,checked:input.checked,model:state.includeInsurance,name:input.getAttribute('aria-label')};
    });
    pass(width+' '+(dark?'dark':'light')+' insurance '+on+' centered, accessible and >=44px',
      geometry.hitWidth>=44&&geometry.hitHeight>=44&&geometry.position==='relative'&&geometry.centered&&geometry.top===geometry.trackHeight/2&&
      geometry.left===(on?22:2)&&geometry.checked===on&&geometry.model===on&&geometry.focus&&parseFloat(geometry.focusOutline)>=3&&!!geometry.name);
    const name='insurance-'+(width===1440?'desktop':'mobile')+'-'+(dark?'dark':'light')+'-'+(on?'on':'off');
    await page.locator('.insurance-switch').locator('..').screenshot({path:path.join(dir,name+'.png')});
   }
  }
 }
 // Android Back equivalent: keyboard viewport grows back with the same active input.
 for(const width of [390,360]){
  await page.setViewportSize({width,height:844});await open();
  await page.locator('#one-time-amount').focus();await sleep(400);
  await page.evaluate(()=>{
   window.__qaKeyboardHeight=844;
   Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>window.__qaKeyboardHeight});
   window.__qaResizeKeyboard=height=>{window.__qaKeyboardHeight=height;window.visualViewport.dispatchEvent(new Event('resize'));};
   window.__qaResizeKeyboard(500);
  });
  pass(width+' keyboard hides sticky',!await page.locator('.mobile-sticky-results').isVisible());
  await page.evaluate(()=>window.__qaResizeKeyboard(844));
  await page.locator('#mortgage-schedule').scrollIntoViewIfNeeded();await sleep(450);
  pass(width+' Back/keyboard closed retains focus and shows sticky',
   await page.evaluate(()=>document.activeElement.id==='one-time-amount'&&!document.body.classList.contains('mortgage-keyboard-open'))&&await page.locator('.mobile-sticky-results').isVisible());
  await page.screenshot({path:path.join(dir,'sticky-'+width+'-closed-focused.png')});
  await page.locator('.mobile-sticky-results button').click();await page.waitForFunction(()=>{const r=document.getElementById('payment-hero').getBoundingClientRect();return r.top>=-1&&r.top<innerHeight;});await page.locator('.mobile-sticky-results').waitFor({state:'hidden'});
  pass(width+' result navigation works on first tap and hero hides sticky',
    await page.locator('#payment-hero').boundingBox().then(b=>b.y>=-1&&b.y<844)&&!await page.locator('.mobile-sticky-results').isVisible());
 }
 // Download complete compact PNGs, including an export while the live canvas has an active tooltip.
 for(const width of [1440,390])for(const dark of [false,true])for(const extras of [false,true]){
  await page.setViewportSize({width,height:width===1440?900:844});await open();await theme(dark);
  await page.evaluate(extra=>{
   Object.assign(state,{cost:8100000,downPayment:2450000,rate:12,mode:'term',termYears:15,termMonths:6,includeInsurance:extra,
    prepaymentStrategy:'term',recurringPrepayment:extra?20000:0,customPrepayments:extra?{1:150000,12:200000}:{}});
   document.getElementById('insurance-toggle').checked=state.includeInsurance;updateInputsDOM();updateCalculations();
   const prepare=window.prepareCalculationScreenshot;
   window.prepareCalculationScreenshot=(stage,source)=>{
    const before={pixels:chartInstance.canvas.toDataURL(),active:JSON.stringify(chartInstance.getActiveElements().map(p=>[p.datasetIndex,p.index])),tooltip:chartInstance.tooltip.opacity};prepare(stage,source);window.__qaPreparationPreservedLive=before.pixels===chartInstance.canvas.toDataURL()&&before.active===JSON.stringify(chartInstance.getActiveElements().map(p=>[p.datasetIndex,p.index]))&&before.tooltip===chartInstance.tooltip.opacity;window.__qaExportRaster=stage.querySelector('.export-chart-slot img')?.src;
    window.__qaExport={text:stage.innerText,images:stage.querySelectorAll('img').length,canvases:stage.querySelectorAll('canvas').length,
     fields:Object.fromEntries([...stage.querySelectorAll('.export-facts>div')].map(n=>[n.querySelector('span').innerText,n.querySelector('strong').innerText])),
     total:stage.querySelector('.export-total strong').innerText,payment:stage.querySelector('.export-payment p>strong').innerText,
     hasExtras:!!stage.querySelector('.export-prepayments')};
   };
  },extras);
  await page.locator('.debt-chart').scrollIntoViewIfNeeded();await sleep(1300);
  const stem=(width===1440?'desktop':'mobile')+'-'+(dark?'dark':'light')+'-'+(extras?'combined':'base');
  await savePNG('png-'+stem);const cleanRaster=await page.evaluate(()=>window.__qaExportRaster);
  const correct=await page.evaluate(()=>{
   const e=window.__qaExport,b=simulateMortgage(false),c=simulateMortgage(true);
   return e.payment===document.getElementById('res-monthly-payment').innerText&&e.total===document.getElementById('res-all-paid').innerText&&
    e.fields['Проценты банку']===document.getElementById('res-bank-interest').textContent&&e.fields['Проценты банку']===localFormatMoney(Math.round(c.totalInterest))&&e.fields['Страховка']===document.getElementById('res-insurance').textContent&&e.fields['Страховка']===localFormatMoney(Math.round(c.totalInsurance))&&
    (!e.hasExtras||(e.fields['Экономия на процентах']===localFormatMoney(b.totalInterest-c.totalInterest)&&e.fields['Закрытие через']===mortgageDuration(c.realTerm)&&
     (!state.includeInsurance||e.fields['Экономия на страховке']===localFormatMoney(b.totalInsurance-c.totalInsurance))))&&e.images===1&&e.canvases===0;
  });
  pass(stem+' export totals/insurance/benefits match current READY exactly',correct);
  const pos=await page.evaluate(()=>{const c=chartInstance,p=c.getDatasetMeta(0).data[5],r=c.canvas.getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};});
  if(width===390)await page.touchscreen.tap(pos.x,pos.y);else await page.mouse.click(pos.x,pos.y);
  await sleep(450);
  pass(stem+' live canvas has visible tooltip and active point before PNG',await page.evaluate(()=>chartInstance.tooltip.opacity>0&&chartInstance.getActiveElements().length>0));
  await page.locator('.debt-chart').screenshot({path:path.join(dir,'tooltip-'+stem+'.png')});
  await page.evaluate(()=>window.__qaLiveCanvas=chartInstance.canvas.toDataURL());
  await savePNG('png-'+stem+'-after-touch');
  pass(stem+' export chart raster is identical before and after live hover/touch',cleanRaster===await page.evaluate(()=>window.__qaExportRaster));
  pass(stem+' isolated preparation preserves live pixels/hover; chart and stage cleaned',
   await page.evaluate(()=>window.__qaPreparationPreservedLive&&chartInstance.tooltip.opacity>0&&chartInstance.getActiveElements().length>0&&
     Object.keys(Chart.instances).length===2&&!document.querySelector('[data-screenshot-stage]')));
  captureData.push({scenario:stem,values:await page.evaluate(()=>window.__qaExport),size:captures.at(-1)});
 }
 await page.setViewportSize({width:390,height:844});await open();
 await page.evaluate(()=>{state.recurringPrepayment=20000;state.customPrepayments=Object.fromEntries(Array.from({length:120},(_,i)=>[i+1,10000]));updateCalculations();});
 await savePNG('png-mobile-long-list');
 pass('120 planned payments stay compact in PNG and complete in share',
  await page.evaluate(()=>{const report=document.querySelector('.mortgage-export-report').textContent;return report.includes('120 шт.')&&report.includes(localFormatMoney(1200000))&&
   !report.includes('мес. 120:')&&Object.keys(JSON.parse(new URL(buildMortgageShareURL()).searchParams.get('customPrepayments'))).length===120;}));
 // Real failure paths: clean-chart rasterization and html2canvas, both must preserve live chart.
 for(const failure of ['chart','html2canvas']){
  const result=await page.evaluate(async failure=>{
   const live=chartInstance,instances=Object.keys(Chart.instances).length,previous=live.canvas.toDataURL(),toDataURL=HTMLCanvasElement.prototype.toDataURL,renderer=window.html2canvas;
   let downloaded=false;const download=window.downloadScreenshot;window.downloadScreenshot=()=>downloaded=true;
   try{
    if(failure==='chart')HTMLCanvasElement.prototype.toDataURL=function(...args){if(this.closest('.export-chart-slot'))throw Error('isolated clean chart failure');return toDataURL.apply(this,args);};
    else window.html2canvas=async()=>{throw Error('isolated renderer failure');};
    await takeScreenshot('results-panel');
    return{clean:!document.querySelector('[data-screenshot-stage]'),same:live===chartInstance&&live.canvas.toDataURL()===previous,instances:Object.keys(Chart.instances).length===instances,downloaded};
   }finally{HTMLCanvasElement.prototype.toDataURL=toDataURL;window.html2canvas=renderer;window.downloadScreenshot=download;}
  },failure);
  pass(failure+' failure cleans isolated scene/chart and preserves live chart',result.clean&&result.same&&result.instances&&!result.downloaded);
 }
 await page.evaluate(()=>{state.downPayment=state.cost;updateCalculations();});
 const denied=await page.evaluate(async()=>{let created=false;const old=window.createScreenshotStage;window.createScreenshotStage=(...args)=>{created=true;return old(...args)};try{await takeScreenshot('results-panel');return !created&&!window.canExportCalculation();}finally{window.createScreenshotStage=old;}});
 pass('invalid input still prevents PNG preparation',denied);
 pass('no uncaught application errors',errors.length===0);
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({checkedAt:new Date().toISOString(),device:'Chrome responsive/touch/visualViewport emulation; no physical Samsung',passed:checks.length,checks,captures,scenarios:captureData,uncaughtErrors:errors},null,2)+'\n');
};
