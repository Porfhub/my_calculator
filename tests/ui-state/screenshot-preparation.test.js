const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const utilities=fs.readFileSync(path.resolve(__dirname,'../../js/ui-utils.js'),'utf8');
const source=utilities.slice(utilities.indexOf('async function takeScreenshot('),utilities.indexOf('function shareLink()'));
test('optional screenshot preparation remains scoped and cleanup covers hook/render failures',async()=>{
 for(const mode of ['legacy','prepared','prepare-failure','render-failure','invalid']){
  const calls=[],stage={remove:()=>calls.push('cleanup')},element={id:'results-panel'};
  const context=vm.createContext({
   window:{},document:{getElementById:()=>element},canExportCurrentCalculation:()=>mode!=='invalid',
   reachGoal:g=>calls.push(g),showToast:()=>{},
   createScreenshotStage:()=>{calls.push('clone');return stage;},
   renderScreenshot:async()=>{calls.push('render');if(mode==='render-failure')throw Error('renderer');return {};},
   canvasToBlob:async()=>({}),downloadScreenshot:()=>calls.push('download')
  });
  if(mode!=='legacy')context.window.prepareCalculationScreenshot=async(s,e)=>{
   assert.equal(s,stage);assert.equal(e,element);calls.push('prepare');if(mode==='prepare-failure')throw Error('chart');
  };
  vm.runInContext(source,context);
  await vm.runInContext("takeScreenshot('results-panel')",context);
  if(mode==='invalid'){assert.deepEqual(calls,[]);continue;}
  assert.equal(calls.at(-1),'cleanup',mode);
  if(mode==='prepare-failure')assert.ok(!calls.includes('render')&&!calls.includes('download'));
  else if(mode==='render-failure')assert.ok(!calls.includes('download'));
  else assert.ok(calls.includes('download'),mode);
  if(mode==='legacy')assert.ok(!calls.includes('prepare'));
 }
});
