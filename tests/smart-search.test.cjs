const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function search(){
  const root={};
  vm.runInNewContext(fs.readFileSync(require.resolve('../showroom-search-core.js'),'utf8'),{window:root});
  return root.ShowroomSearchCore;
}
test('two search words match across product category and name',()=>{
  const core=search();
  const items=[
    {code:'CH-9',class:'Chandelier',itemName:'Gold Crystal Water Drop'},
    {code:'CH-10',class:'Chandelier',itemName:'Silver Crystal Water Drop'},
    {code:'L-11',class:'Lighting',itemName:'Gold Wall Lamp'}
  ];
  assert.deepEqual(Array.from(core.results(items,'chandelier gold'),x=>x.item.code),['CH-9']);
});
test('codes containing hyphens and separate numeric terms are searchable',()=>{
  const core=search();
  const item={code:'PR-CF-003-GL',itemName:'Water Drop'};
  assert.ok(core.score(item,'PR-CF-003-GL')>0);
  assert.ok(core.score(item,'003')>0);
  assert.ok(core.score(item,'PR 003')>0);
});
test('search weights code and title above incidental material matches',()=>{
  const core=search();
  const items=[
    {code:'LIGHT-88',itemName:'Gold Hanging Lamp',class:'Lighting'},
    {code:'GOLD',itemName:'White Sofa',description:'golden trims'}
  ];
  const r=core.results(items,'gold');
  assert.equal(r[0].item.code,'GOLD');
});
test('created set component descriptions are included in token matching',()=>{
  const core=search();
  const set={code:'SET-A',isSet:true,itemName:'Living Room Arrangement'};
  const component={code:'CH-90',class:'Chandelier',description:'Brushed gold'};
  assert.ok(core.score(set,'chandelier gold',[component])>0);
});
test('results are bounded and immutable',()=>{
  const core=search();
  const items=Array.from({length:100},(_,i)=>({code:'L-'+i,itemName:'Gold Pendant '+i}));
  const copy=JSON.stringify(items);
  assert.equal(core.results(items,'gold').length,7);
  assert.equal(JSON.stringify(items),copy);
});
