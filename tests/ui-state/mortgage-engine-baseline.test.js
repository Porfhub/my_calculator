const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
test('approved UI preserves production engine outcomes across the 66-scenario baseline',()=>{
 const html=fs.readFileSync(path.join(root,'mortgage.html'),'utf8');
 const fixture=JSON.parse(fs.readFileSync(path.join(root,'docs/qa/mortgage-redesign/engine-comparison.json'),'utf8'));
 const context=vm.createContext({});
 const start=html.indexOf("        let activeTab = 'new';");
 vm.runInContext(html.slice(start,html.indexOf('        let chartInstance',start))+html.slice(html.indexOf('        function simulateMortgage('),html.indexOf('        function renderAmortizationTable(')),context);
 const near=(a,b,name)=>assert.ok(Math.abs(a-b)<.00001,name+': '+a+' != '+b);
 for(const row of fixture.rows){
  context.inputs=row.inputs;
  const result=vm.runInContext("activeTab=inputs.tab||'new';Object.assign(state,inputs);simulateMortgage(true)",context);
  near(result.schedule[0].payment,row.payment,row.name+' payment');
  near(result.totalInterest,row.interest,row.name+' interest');
  near(result.totalInsurance,row.insurance,row.name+' insurance');
  near(result.totalPaid,row.paid,row.name+' total');
  assert.equal(result.realTerm,row.months,row.name+' term');
  for(const saved of row.key_months)for(const key of ['payment','interest','principal','prepayment','balance','insurance'])near(result.schedule[saved.month-1][key],saved[key],row.name+' month '+saved.month+' '+key);
 }
});
