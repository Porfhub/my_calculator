const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const dir=path.resolve(__dirname,'../docs/qa/mortgage-redesign');
function engine(html){
 const begin=html.indexOf("        let activeTab = 'new';"),end=html.indexOf('        let chartInstance',begin);
 const fn=html.slice(html.indexOf('        function simulateMortgage('),html.indexOf('        function renderAmortizationTable('));
 const c=vm.createContext({});
 vm.runInContext(html.slice(begin,end)+'\n'+fn,c);
 return changes=>{c.changes=changes;vm.runInContext("activeTab=changes.tab||'new'; Object.assign(state,changes);",c);return vm.runInContext('simulateMortgage(true)',c);};
}
const cases=[];
for(const tab of ['new','existing'])for(const mode of ['term','payment'])for(const strategy of ['term','payment'])for(const insured of [false,true])for(const extras of ['none','regular','once','combined']){
 cases.push({name:[tab,mode,strategy,insured?'insured':'uninsured',extras].join('/'),inputs:{tab,mode,isExistingKnowPayment:mode==='payment',cost:8100000,downPayment:2450000,rate:12,termYears:15,targetPayment:90000,activeOriginalLoan:8000000,activeRate:12,activeOriginalTermYears:20,activePaidMonths:36,activeCurrentBalance:5300000,activePayment:85000,prepaymentStrategy:strategy,includeInsurance:insured,recurringPrepayment:['regular','combined'].includes(extras)?20000:0,customPrepayments:['once','combined'].includes(extras)?{1:150000,12:200000}:{} }});
}
cases.push({name:'zero-rate/minimum-loan',inputs:{cost:1000000,downPayment:999999,rate:0,termYears:1,mode:'term',isExistingKnowPayment:false,recurringPrepayment:0,customPrepayments:{},includeInsurance:false}});
cases.push({name:'boundary/50-years',inputs:{cost:1000000,downPayment:0,rate:0.1,termYears:50,mode:'term',recurringPrepayment:0,customPrepayments:{},includeInsurance:true}});
const before=engine(require('node:child_process').execFileSync('git',['show','fd292a727ce7cace1f785dfcdcf6aaf7bb46cf45:mortgage.html'],{encoding:'utf8'}));
const after=engine(fs.readFileSync(path.resolve(__dirname,'../mortgage.html'),'utf8'));
const rows=cases.map(({name,inputs})=>{
 const a=JSON.parse(JSON.stringify(before(inputs))),b=JSON.parse(JSON.stringify(after(inputs)));
 assert.deepEqual(b,a,name);
 const hash=crypto.createHash('sha256').update(JSON.stringify(a.schedule)).digest('hex');
 return {name,inputs,payment:a.schedule[0].payment,interest:a.totalInterest,insurance:a.totalInsurance,paid:a.totalPaid,months:a.realTerm,schedule_sha256:hash,key_months:[0,11,59,a.schedule.length-1].filter((m,i,arr)=>m<a.schedule.length&&arr.indexOf(m)===i).map(m=>a.schedule[m])};
});
fs.writeFileSync(path.join(dir,'engine-comparison.json'),JSON.stringify({baseline:'fd292a727ce7cace1f785dfcdcf6aaf7bb46cf45',scenarios:rows.length,identical:true,rows},null,2)+'\n');
console.log(rows.length+' scenarios: identical payments, interest, insurance, totals, duration and every schedule entry.');
