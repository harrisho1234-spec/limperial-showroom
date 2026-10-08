const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../showroom-analytics.js'),'utf8');
function setup(){
  const calls=[],client={
    rpc:async(name,args)=>{calls.push({name,args});return {data:true,error:null}},
    auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})}
  };
  const window={APP_CONFIG:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'},supabase:{createClient:()=>client}};
  const document={addEventListener(){}};
  vm.runInNewContext(source,{window,document,navigator:{onLine:true},console});
  return {api:window.ShowroomAnalytics,calls};
}
test('product views are recorded at most once per 15-minute window',async()=>{
  const {api,calls}=setup();
  assert.equal(await api.record({code:'CH-01',customerName:'not-to-be-sent'},'view'),true);
  assert.equal(await api.record({code:'CH-01'},'view'),false);
  assert.equal(calls.length,1);
  assert.deepEqual(Object.keys(calls[0].args).sort(),['p_event','p_product_code']);
  assert.equal(JSON.stringify(calls).includes('not-to-be-sent'),false);
});
test('favorite and compare events only record product code and action',async()=>{
  const {api,calls}=setup();
  await api.record({code:'LAMP-A',cost:123,margin:77},'favorite');
  await api.record({code:'LAMP-A'},'compare');
  assert.deepEqual(Array.from(calls,x=>x.args.p_event),['favorite','compare']);
  assert.equal(JSON.stringify(calls).includes('margin'),false);
});
test('quotation interest records each product once without customer data',async()=>{
  const {api,calls}=setup();
  api.recordQuote({id:'QUOTE-0001',customerName:'private',state:{cart:[
    {item:{code:'CHAIR-1'},quantity:1},
    {item:{code:'CHAIR-1'},quantity:2},
    {type:'set',setId:'SET1',quantity:1,items:[]}
  ]}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,2);
  assert.deepEqual(Array.from(calls,x=>x.args.p_product_code),['CHAIR-1','SET-SET1']);
  assert.equal(JSON.stringify(calls).includes('private'),false);
});
