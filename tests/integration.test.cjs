const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=f=>fs.readFileSync(require.resolve('../'+f),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
async function setup(){
 const html=source('index.html');
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://showroom.test/'});
 const w=dom.window,ctx=dom.getInternalVMContext();
 w.setInterval=()=>1;w.setTimeout=()=>1;w.HTMLElement.prototype.scrollIntoView=()=>{};
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if(m[1].includes('let products =')) vm.runInContext(m[1],ctx);
 w.onload=null;
 vm.runInContext("products=loadFallbackProducts(); filteredProducts=[...products]; showNotification=()=>{};",ctx);
 const state={campaigns:[{id:'c',name:'Test Seasonal',badge:'<Summer>',start_date:'2020-01-01',end_date:'2099-12-31',is_enabled:true,discount_percent:12.5,items:[{code:'LMP-CH-01',promo_price:53.27}],created_at:'2026-01-01',updated_at:'v1'}],role:'manager',fail:false,saved:null};
 const client={auth:{getUser:async()=>({data:{user:{id:'manager'}}}),signOut:async()=>{},signInWithPassword:async()=>({})},rpc:async()=>({data:state.role}),from(){
  let payload,mode,filters=[];
  const q={select(){if(!mode)return q;return Promise.resolve().then(()=>{
    if(state.fail)throw Error('Offline');
    if(mode==='update'&&!state.campaigns.some(c=>filters.every(([k,v])=>c[k]===v)))return {data:[]};
    const row={...state.campaigns[0],...payload,id:mode==='insert'?'new':'c',updated_at:'v2'};
    state.saved=row;state.campaigns=[row];return {data:[{id:row.id}]};
   });},order:async()=>state.fail?{error:Error('Unavailable')}:{data:structuredClone(state.campaigns)},update(p){payload=p;mode='update';return q;},insert(p){payload=p;mode='insert';return q;},eq(k,v){filters.push([k,v]);return q;}};return q;
 }};
 w.supabase={createClient:()=>client};
 for(const f of ['promotion-config.js','seasonal-core.js','seasonal-promotions.js'])vm.runInContext(source(f),ctx);
 await tick();await w.SeasonalPromos.refresh();
 return {dom,w,ctx,state,run:code=>vm.runInContext(code,ctx)};
}
test('real storefront integration preserves source prices, quotes, filters and sort',async()=>{
 const t=await setup();const {w,run,state}=t;
 try{
  assert.match(w.document.querySelector('#seasonal-promotions-section').textContent,/Test Seasonal/);
  assert.match(w.document.querySelector('#seasonal-promotions-section').textContent,/53.27/);
  assert.equal(w.document.querySelector('#seasonal-promotions-section Summer'),null);
  const before=run('JSON.stringify(products)');
  w.toggleCartSelection('LMP-CH-01');
  assert.equal(run('cart[0].customPrice'),53.27);assert.equal(run('cart[0].discount'),0);
  assert.equal(run('JSON.stringify(products)'),before);
  run("currentClassFilter='Lighting'; sortNewArrival=true;");
  w.document.querySelector('#search-input').value='Aurelia';
  w.document.querySelector('#seasonal-view-all').click();
  assert.equal(run('currentClassFilter'),'Lighting');assert.equal(run('sortNewArrival'),true);
  assert.equal(w.document.querySelector('#search-input').value,'Aurelia');
  assert.equal(w.SeasonalPromos.showingAll,true);
  w.resetFilters();assert.equal(w.SeasonalPromos.showingAll,false);
  state.campaigns=[];await w.SeasonalPromos.refresh();
  assert.equal(run('cart[0].customPrice'),53.27);assert.equal(run('JSON.stringify(products)'),before);
  assert.ok(w.document.querySelector('#seasonal-promotions-section').classList.contains('hidden'));
 }finally{t.dom.window.close();}
});
test('manager creation, preselected products, save, edit, background refresh and conflicts',async()=>{
 const t=await setup();const {w,state}=t;const ui=id=>w.document.getElementById(id);
 try{
  w.toggleCartSelection('LMP-CH-01');w.SeasonalPromos.setManagerMode(true);await w.SeasonalPromos.openManager();
  ui('sp-create').click();assert.match(ui('sp-count').textContent,/1 selected/);
  ui('sp-title').value='New Campaign';ui('sp-percent').value='';
  await w.SeasonalPromos.refresh();assert.equal(ui('sp-title').value,'New Campaign');
  ui('sp-editor-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  assert.equal(state.saved.name,'New Campaign');assert.equal(state.saved.discount_percent,null);
  w.document.querySelector('[data-sp-edit]').click();ui('sp-title').value='Unsaved edit';
  state.campaigns[0].updated_at='someone-else';await w.SeasonalPromos.refresh();
  assert.equal(ui('sp-title').value,'Unsaved edit');
  ui('sp-editor-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  assert.equal(state.saved.name,'New Campaign');assert.equal(ui('sp-save').disabled,false);
  state.fail=true;ui('sp-editor-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  assert.equal(ui('sp-save').disabled,false);assert.equal(ui('sp-title').value,'Unsaved edit');
 }finally{t.dom.window.close();}
});
test('non-manager cannot open campaign editing; zero prices match cart and detail',async()=>{
 const t=await setup();const {w,state,run}=t;
 try{
  state.role='sales';w.SeasonalPromos.setManagerMode(true);await w.SeasonalPromos.openManager();
  assert.ok(w.document.getElementById('sp-login'));assert.equal(w.document.getElementById('sp-create'),null);
  state.campaigns[0].items[0].promo_price=0;await w.SeasonalPromos.refresh();
  w.toggleCartSelection('LMP-CH-01');assert.equal(run('cart[0].customPrice'),0);
  w.openProductDetailModal('LMP-CH-01');
  assert.match(w.document.getElementById('detail-modal-price').textContent,/\$0/);
 }finally{t.dom.window.close();}
});
