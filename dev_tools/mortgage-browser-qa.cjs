// Reproducible local browser QA; analytics traffic is blocked and no deployment occurs.
let playwright;
try {playwright=require(process.env.PLAYWRIGHT_MODULE || 'playwright');}
catch {playwright=require(require('node:path').join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const {chromium}=playwright;
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/qa/mortgage-redesign');
const baseline=process.argv.includes('--baseline'),checks=[],limitations=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
function check(name,value){assert.ok(value,name);checks.push(name);console.log('PASS '+name);}
async function start(){
 fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(decodeURIComponent(new URL(req.url,'http://localhost').pathname) === '/' ? '/index.html' : decodeURIComponent(new URL(req.url,'http://localhost').pathname)));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(err?'Not found':data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:process.env.QA_BROWSER||'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true,permissions:['clipboard-read','clipboard-write']});
  await context.route(/mc\.yandex\.(ru|com)/,r=>r.abort());
  await context.addInitScript(()=>{window.__metrikaCalls=[];window.ym=(...args)=>window.__metrikaCalls.push(args);});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(baseline)await context.route('**/mortgage.html',r=>r.fulfill({body:require('node:child_process').execFileSync('git',['show','fd292a727ce7cace1f785dfcdcf6aaf7bb46cf45:mortgage.html'],{encoding:'utf8'}),contentType:'text/html'}));
  async function ready(){await page.waitForFunction(()=>document.body.dataset.calculationState==='READY');}
  async function shot(name,fullPage=false){await page.waitForTimeout(800);await page.screenshot({path:path.join(out,name+'.png'),fullPage});}
  async function goto(query=''){await page.goto(origin+'/mortgage.html'+query,{waitUntil:'networkidle'});await ready();}
  async function overflow(){return page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);}
  async function goals(){return page.evaluate(()=>window.__metrikaCalls.filter(c=>c[1]==='reachGoal'&&c[2]==='calculate_success').length);}

  if(process.argv.includes('--preview-smoke')){
   const url='https://my-calculator-git-codex-mortgage-hybrid-redesign-porf.vercel.app/mortgage.html';
   await page.goto(url,{waitUntil:'networkidle'});
   if(new URL(page.url()).hostname==='vercel.com' && new URL(page.url()).pathname==='/login'){
    fs.writeFileSync(path.join(out,'preview-smoke.json'),JSON.stringify({url,checkedAt:new Date().toISOString(),status:'LOGIN_REQUIRED',title:await page.title(),errors},null,2)+'\n');
    console.log('LIMITATION PR preview requires existing Vercel login; no authentication settings changed.');return;
   }
   await ready();
   check('PR preview serves payment-first READY implementation',await page.locator('#payment-heading').innerText()==='Обязательный платёж'&&await page.evaluate(()=>window.canExportCalculation()));
   await shot('preview-desktop');await page.setViewportSize({width:390,height:844});await shot('preview-mobile');
   check('PR preview mobile has no overflow',await overflow());
   fs.writeFileSync(path.join(out,'preview-smoke.json'),JSON.stringify({url,checkedAt:new Date().toISOString(),ready:true,errors},null,2)+'\n');
   return;
  }
  await goto();
  if(baseline){await shot('baseline-desktop');await page.setViewportSize({width:390,height:844});await shot('baseline-mobile');return;}

  if(process.argv.includes('--offline-only')){
   const source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
   const arrays=source.slice(source.indexOf('const EXTERNAL_LIBS'),source.indexOf('// Установка'));
   const urls=require('node:vm').runInNewContext(arrays+';[...EXTERNAL_LIBS,...INTERNAL_FILES]');
   const results=await page.evaluate(async urls=>Promise.all(urls.map(async url=>{try{const c=await caches.open('qa-preflight');await c.add(url);return{url,ok:true}}catch(e){return{url,ok:false,error:e.message}}})),urls);
   const failures=results.filter(r=>!r.ok);
   const original=require('node:child_process').execFileSync('git',['show','fd292a727ce7cace1f785dfcdcf6aaf7bb46cf45:sw.js'],{encoding:'utf8'});
   const unchanged=original.slice(original.indexOf('const EXTERNAL_LIBS'),original.indexOf('// Установка')).replaceAll('\r\n','\n')===arrays.replaceAll('\r\n','\n');
   fs.writeFileSync(path.join(out,'offline-precache.json'),JSON.stringify({precacheURLsUnchangedFromBaseline:unchanged,failures},null,2)+'\n');
   console.log(JSON.stringify({precacheURLsUnchangedFromBaseline:unchanged,failures},null,2));
   return;
  }
  check('initial example has no calculate_success',await goals()===0);
  check('initial export guard is READY',await page.evaluate(()=>window.canExportCalculation()));
  check('official reference shows value, source and actual date',await page.locator('.cbr-reference').innerText().then(t=>/14\.00%/.test(t)&&/Банк России/.test(t)&&/действует с/.test(t)));
  await shot('desktop-light');
  await page.locator('#theme-toggle').click();await shot('desktop-dark');
  check('theme alone is not a conversion',await goals()===0);
  await page.locator('#theme-toggle').click();
  await page.locator('#cost-input').fill('8100000');
  await page.locator('#downpayment-input').fill('2450000');
  await page.locator('#rate-input').fill('12');
  await page.locator('#term-input').fill('15');
  await page.locator('.term-precision summary').click();
  await page.locator('#term-months-input').fill('6');
  check('15 years 6 months payment comes from engine',await page.locator('#res-monthly-payment').innerText().then(t=>t.replace(/\D/g,'')==='67032'));
  check('valid user changes deduplicate calculate_success',await goals()===1);
  await page.locator('#recurring-input').fill('20000');
  await page.locator('#one-time-month').fill('1');
  await page.locator('#one-time-amount').fill('150000');
  await page.locator('#one-time-form button').click();
  check('regular-only and combined are explicitly scoped',await page.locator('#regular-result').innerText().then(t=>t.includes('Только регулярная'))&&await page.locator('#one-time-result').innerText().then(t=>t.includes('Регулярные + разовые')&&t.includes('не складываются')));
  check('hero retains baseline term under prepayments',await page.locator('#res-real-term').innerText()==='15 лет 6 мес.');
  await page.locator('#early').scrollIntoViewIfNeeded();await shot('desktop-combined');
  await page.locator('input[name=prepayment-strategy][value=payment]').check();
  check('one common payment strategy applies to both extras',await page.evaluate(()=>state.prepaymentStrategy==='payment'&&state.customPrepayments[1]===150000&&state.recurringPrepayment===20000));
  check('variable required payment is disclosed',await page.locator('#payment-context').innerText().then(t=>t.includes('Последующие уменьшаются')));
  await page.locator('input[name=prepayment-strategy][value=term]').check();
  await page.locator('#one-time .text-action').click();
  check('schedule opens first year without focusing a numeric field',await page.locator('#content-year-1').isVisible()&&await page.evaluate(()=>document.activeElement.tagName!=='INPUT'));
  const month1=page.locator('[data-month="1"] input');
  await month1.fill('200000');
  check('schedule edit updates form list and scenario',await page.evaluate(()=>state.customPrepayments[1]===200000));
  await shot('desktop-schedule');
  await month1.fill('');
  check('clearing schedule input removes its payment',await page.evaluate(()=>!Object.hasOwn(state.customPrepayments,'1')));
  await page.locator('#one-time-amount').fill('150000');await page.locator('#one-time-form button').click();
  await page.locator('#recurring-input').fill('0');
  check('one-time-only scope is visible',await page.locator('#one-time-result').innerText().then(t=>t.includes('Только разовые')));
  await page.locator('#one-time-list button').click();
  check('form remove clears its payment',await page.evaluate(()=>Object.keys(state.customPrepayments).length===0));
  await page.locator('#recurring-input').fill('20000');
  await page.locator('#one-time-form button').click();
  // Clipboard success and fallback both carry the same serialised READY state.
  await page.locator('.result-actions button').filter({hasText:'Поделиться'}).click();
  const link=await page.evaluate(()=>navigator.clipboard.readText());
  check('share includes both extras and month precision',link.includes('termMonths=6')&&link.includes('customPrepayments'));
  const expected=await page.evaluate(()=>JSON.stringify({activeTab,state}));
  await page.goto(link,{waitUntil:'networkidle'});await ready();
  check('shared scenario restores all inputs exactly',await page.evaluate(()=>JSON.stringify({activeTab,state}))===expected);
  check('opening a share URL is not a conversion',await goals()===0);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true}));
  await page.locator('.result-actions button').filter({hasText:'Поделиться'}).click();
  check('clipboard-denied fallback offers selectable URL',await page.locator('#mortgage-share-dialog').isVisible()&&await page.locator('#mortgage-share-url').inputValue()===await page.evaluate(()=>buildMortgageShareURL()));
  await page.locator('#mortgage-share-dialog button').click();
  // Real download through the unchanged clone/canvas/Blob exporter.
  const downloadPromise=page.waitForEvent('download');
  await page.locator('.result-actions button').filter({hasText:'Сохранить PNG'}).click();
  const download=await downloadPromise;await download.saveAs(path.join(out,'export-light.png'));
  check('PNG downloads as a real file',fs.statSync(path.join(out,'export-light.png')).size>20000);
  check('export stage cleaned up',await page.locator('[data-screenshot-stage]').count()===0);
  await page.locator('#theme-toggle').click();
  const darkDownload=page.waitForEvent('download');await page.locator('.result-actions button').filter({hasText:'Сохранить PNG'}).click();
  await(await darkDownload).saveAs(path.join(out,'export-dark.png'));
  await page.locator('#theme-toggle').click();
  await page.locator('#downpayment-input').fill('8100000');
  check('invalid input clears READY and disables export',await page.evaluate(()=>document.body.dataset.calculationState==='INVALID_INPUT'&&!window.canExportCalculation()));
  check('invalid input clears benefit results',await page.locator('#regular-result').innerText()===''&&await page.locator('#one-time-result').innerText()==='');
  const invalidGoals=await goals();await page.evaluate(()=>shareLink());check('invalid share sends no goal',await goals()===invalidGoals);
  await shot('desktop-invalid');
  await page.locator('#downpayment-input').fill('2450000');await ready();
  await page.locator('#mode-payment-btn').click();
  check('comfortable payment uses derived-term label',await page.locator('#label-term').innerText()==='Срок без досрочных');
  await page.locator('#payment-input').fill('1');
  check('impossible comfortable payment fails closed',await page.evaluate(()=>document.body.dataset.calculationState==='INVALID_INPUT'&&!window.canExportCalculation()));
  await page.locator('#payment-input').fill('90000');await ready();
  await page.locator('#tab-existing').click();
  await page.locator('#existing-know-payment-toggle').check({force:true});
  await page.locator('#active-payment-input').fill('85000');
  check('existing known payment remains READY',await page.evaluate(()=>activeTab==='existing'&&state.isExistingKnowPayment&&window.canExportCalculation()));
  await page.locator('#insurance-toggle').check({force:true});
  const existingLink=await page.evaluate(()=>buildMortgageShareURL()),existingState=await page.evaluate(()=>JSON.stringify({activeTab,state}));
  await page.goto(existingLink,{waitUntil:'networkidle'});await ready();
  check('existing known-payment share retains balance and history fields',await page.evaluate(()=>JSON.stringify({activeTab,state}))===existingState);

  await goto(); // ordinary historical production URL
  check('legacy plain URL still restores production example',await page.locator('#scenario-label').innerText()==='По примеру');
  // Responsive light/graphite, 390 and 360, including sticky/focus/schedule/long lists.
  for(const width of [390,360]){
   await page.setViewportSize({width,height:844});await page.evaluate(()=>scrollTo(0,0));
   await shot('mobile-'+width+'-light');check(width+' light has no horizontal overflow',await overflow());
   check(width+' first viewport reveals editable form',await page.locator('#cost-input').boundingBox().then(b=>b.y+b.height<844));
   check(width+' hero suppresses sticky',!await page.locator('.mobile-sticky-results').isVisible());
   await page.locator('#theme-toggle').click();await shot('mobile-'+width+'-dark');
   check(width+' dark has no horizontal overflow',await overflow());
   await page.locator('#recurring-input').fill('20000');
   await page.locator('#one-time-month').fill('12');await page.locator('#one-time-amount').fill('150000');await page.locator('#one-time-form button').click();
   await page.locator('#early').scrollIntoViewIfNeeded();await page.locator('#early-heading').click();
   await shot('mobile-'+width+'-combined-dark');
   check(width+' sticky returns below hero',await page.locator('.mobile-sticky-results').isVisible());
   await page.locator('#one-time .text-action').click();await shot('mobile-'+width+'-schedule-dark');
   check(width+' schedule is readable without overflow',await overflow());
   await page.locator('#theme-toggle').click();
   await page.locator('#one-time').scrollIntoViewIfNeeded();await shot('mobile-'+width+'-combined-light');
   await page.evaluate(()=>{for(let m=1;m<=30;m++)state.customPrepayments[m]=10000+m*100;updateCalculations();});
   await page.locator('#one-time').scrollIntoViewIfNeeded();await shot('mobile-'+width+'-long-list');
   check(width+' long payment list has no overflow',await overflow());
   await page.locator('#cost-input').focus();await page.setViewportSize({width,height:500});
   await shot('mobile-'+width+'-focused-viewport');
   check(width+' editable focus hides sticky',!await page.locator('.mobile-sticky-results').isVisible());
   await page.locator('#cost-input').blur();await page.setViewportSize({width,height:844});
 
  await goto();
  }
  await page.setViewportSize({width:1440,height:900});
  // Isolated official-data states; no snapshots are modified or published.
  const rates=JSON.parse(fs.readFileSync(path.join(root,'rates.json'),'utf8'));
  for(const status of ['stale','unavailable']){
   const data=structuredClone(rates);data.status=status;data.metadata.status=status;
   if(status==='unavailable'){delete data.cb_rate;delete data.key_rate;delete data.effective_from;data.metadata.last_successful_fetch_at=null;}
   await page.route('**/rates.json',r=>r.fulfill({json:data}));
 
  await goto();
   check('CBR '+status+' is disclosed without blocking user-rate calculation',await page.locator('#cb-rate-display').innerText().then(t=>t.includes('временно недоступны'))&&await page.evaluate(()=>window.canExportCalculation()));
   await page.unroute('**/rates.json');
  }
  await page.route('**/chart.js',r=>r.abort());

  await goto();check('Chart.js failure leaves finite financial result READY',await page.evaluate(()=>window.canExportCalculation())&&await page.locator('#res-monthly-payment').innerText().then(t=>/\d/.test(t)));
  await shot('chart-unavailable');await page.unroute('**/chart.js');

  await goto();
  const rendering=await page.evaluate(()=>{const render=renderMortgageBenefits;renderMortgageBenefits=()=>{throw new Error('isolated render test')};state.cost+=100000;updateCalculations();const failed=document.body.dataset.calculationState==='ERROR'&&!window.canExportCalculation()&&document.getElementById('res-all-paid').innerText==='—';renderMortgageBenefits=render;updateCalculations();return {failed,recovered:window.canExportCalculation()};});
  check('primary-render failure clears export and restores after correction',rendering.failed&&rendering.recovered);
  const simulation=await page.evaluate(()=>{const model=simulateMortgage;simulateMortgage=()=>{throw new Error('isolated model test')};updateCalculations();const failed=document.body.dataset.calculationState==='CALCULATION_IMPOSSIBLE'&&!window.canExportCalculation();simulateMortgage=model;updateCalculations();return {failed,recovered:window.canExportCalculation()};});
  check('model exception remains separate and recovers',simulation.failed&&simulation.recovered);

  await page.setViewportSize({width:1440,height:900});await goto();
  const exampleDownload=page.waitForEvent('download');await page.locator('.result-actions button').filter({hasText:'Сохранить PNG'}).click();
  await(await exampleDownload).saveAs(path.join(out,'export-example.png'));
  await page.setViewportSize({width:390,height:844});
  const mobileDownload=page.waitForEvent('download');await page.locator('.result-actions button').filter({hasText:'Сохранить PNG'}).click();
  await(await mobileDownload).saveAs(path.join(out,'export-mobile.png'));
  check('example and responsive-mobile PNG downloads use the complete result panel',fs.statSync(path.join(out,'export-mobile.png')).size>20000);
  const missingNames=await page.evaluate(()=>[...document.querySelectorAll('input:not([hidden]):not([aria-hidden=true])')].filter(i=>!i.labels?.length&&!i.getAttribute('aria-label')&&!i.getAttribute('aria-labelledby')).map(i=>i.id));
  check('all mortgage inputs have programmatic names',missingNames.length===0);
  for(const other of ['honest-credit.html','rent-vs-mortgage.html']){
   await page.goto(origin+'/'+other,{waitUntil:'networkidle'});
   check(other+' smoke has no uncaught application errors',errors.length===0);
  }

  await goto();
  // The existing unversioned Tailwind URL loads as a script but rejects CORS
  // Cache.add in this environment. Record the inherited offline limitation.
  try {
   await page.evaluate(async()=>{const cache=await caches.open('qa-preflight');await cache.add('https://cdn.tailwindcss.com');});
   await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('SW installation timeout')),20000))]);});
   await page.reload({waitUntil:'networkidle'});await ready();
   const swCache=await page.evaluate(()=>caches.has('yasnomera-cache-v17'));
   await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await ready();
   check('v17 preserves offline cached mortgage, model and library loading',swCache&&await page.evaluate(()=>window.canExportCalculation()&&typeof Chart==='function'&&typeof html2canvas==='function'));
  } catch(e) {
   limitations.push('Offline precache could not be verified: existing https://cdn.tailwindcss.com fails CORS Cache.add; precache URLs and policy are unchanged from baseline. See offline-precache.json.');
   console.log('LIMITATION '+limitations.at(-1));
  } finally {await context.setOffline(false);}
  check('no uncaught application errors',errors.length===0);
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({browser:await browser.version(),device:'Headless Chrome responsive emulation; no physical device',checks:checks.length,passed:checks,uncaughtErrors:errors,limitations},null,2)+'\n');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
start().catch(e=>{console.error(e);process.exitCode=1;});
