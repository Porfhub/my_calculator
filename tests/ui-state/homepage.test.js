const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {getDatasetStatus,getCentralBankRate} = require('../../js/api');
const html = fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const source = html.split('// HOME_RATE_MODEL_START')[1].split('// HOME_RATE_MODEL_END')[0];
const context = vm.createContext({getDatasetStatus,getCentralBankRate,URL,Date,Intl});
vm.runInContext(source,context);
const view=(data,now=Date.parse('2026-11-02T15:00:00Z'))=>context.homepageRateView(data,now);
function fixture() {
 return {metadata:{schema_version:2,dataset_id:'key_rate',status:'ok',source_url:'https://www.cbr.ru/hd_base/keyrate/',last_successful_fetch_at:'2026-11-02T10:14:17Z'},key_rate:{value_percent:14,effective_from:'2026-07-27'},status:'ok',cb_rate:14};
}
test('homepage rate shows numeric value and actual successful fetch date, including zero rate',()=>{
 const data=fixture(), before=JSON.stringify(data), result=view(data);
 assert.equal(result.status,'ok'); assert.equal(result.value,14);
 assert.equal(result.checked,Date.parse(data.metadata.last_successful_fetch_at));
 assert.equal(JSON.stringify(data),before);
 data.key_rate.value_percent=0; data.cb_rate=0; assert.equal(view(data).value,0);
});
test('homepage last-known rates are visibly stale after soft TTL or explicit upstream failure',()=>{
 const data=fixture(); data.metadata.last_successful_fetch_at='2026-10-29T15:00:00Z';
 assert.equal(view(data).status,'stale'); assert.equal(view(data).value,14); assert.ok(view(data).message);
 data.metadata.last_successful_fetch_at='2026-11-02T10:14:17Z';data.metadata.status='stale';data.status='stale';
 assert.equal(view(data).status,'stale');
});
test('homepage never presents expired, unavailable or inconsistent snapshots as a current rate',()=>{
 for(const change of [d=>{d.metadata.last_successful_fetch_at='2026-10-20T00:00:00Z'}, d=>{d.metadata.status='unavailable';d.status='unavailable'},d=>{d.status='stale'},d=>{d.cb_rate=15},d=>{d.metadata.schema_version=1}]){
  const data=fixture();change(data);assert.equal(view(data).value,null);assert.equal(view(data).status,'unavailable');
 }
 assert.equal(view(null).value,null);
});
test('homepage numeric and provenance guards reject malformed or nonofficial rate data',()=>{
 for(const change of [d=>{d.key_rate.value_percent=-1;d.cb_rate=-1},d=>{d.key_rate.value_percent=101;d.cb_rate=101},d=>{d.key_rate.value_percent='14'},d=>{d.metadata.source_url='https://cbr.ru.evil.test/'},d=>{d.metadata.source_url='http://www.cbr.ru/'},d=>{d.metadata.last_successful_fetch_at='invalid'},d=>{d.metadata.last_successful_fetch_at='2026-12-02T00:00:00Z'},d=>{d.key_rate.effective_from='2026-02-31'},d=>{d.key_rate.effective_from='2026-12-02'}]){
  const data=fixture();change(data);assert.equal(view(data).status,'unavailable');assert.equal(view(data).value,null);
 }
});
test('homepage rate freshness boundaries agree with publish soft/hard TTL policy',()=>{
 const {DATASET_POLICIES:{rates:policy}} = require('../../data_validation/policies');
 const data=fixture(), fetched=Date.parse(data.metadata.last_successful_fetch_at);
 assert.equal(view(data,fetched+policy.softTtlMs).status,'ok');
 assert.equal(view(data,fetched+policy.softTtlMs+1).status,'stale');
 assert.equal(view(data,fetched+policy.hardTtlMs).status,'stale');
 assert.equal(view(data,fetched+policy.hardTtlMs+1).value,null);
});
test('all ten calculator destinations have useful descriptions and remain navigable without JS',()=>{
 const links=[...html.matchAll(/<a class="calculator-link[^>]+href="([^"]+)"[^>]+data-calculator="([^"]+)"[\s\S]*?<\/a>/g)];
 assert.equal(links.length,10); assert.equal(new Set(links.map(x=>x[1])).size,10);
 for(const [block,file] of links){ assert.ok(fs.existsSync(path.join(__dirname,'../..',file)),file);assert.match(block,/<p id="description-[^"]+">[^<]+<\/p>/); }
 assert.doesNotMatch(html,/calculate_success/);
});
