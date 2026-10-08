const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=name=>fs.readFileSync(require.resolve('../'+name),'utf8');
function loadCore(){
  const window={};
  vm.runInNewContext(source('showroom-phase1-core.js'),{window});
  return window.ShowroomPhase1Core;
}
test('quotation compare detects added, removed and repriced lines',()=>{
  const core=loadCore();
  const before={cart:[{item:{code:'A',itemName:'Lamp',actualSalesPrice:100},quantity:2,discount:10},{item:{code:'B',itemName:'Chair',actualSalesPrice:45},quantity:1,discount:0}],discountPctValue:5,discountFlatValue:0};
  const after={cart:[{item:{code:'A',itemName:'Lamp',actualSalesPrice:130},quantity:3,discount:5},{item:{code:'C',itemName:'Table',actualSalesPrice:60},quantity:1,discount:0}],discountPctValue:8,discountFlatValue:10};
  const result=core.compare(before,after);
  assert.equal(result.changes.length,3);
  assert.deepEqual(Array.from(result.changes.map(x=>x.kind)).sort(),['added','changed','removed']);
  assert.equal(result.oldTotal,213.75);
  assert.equal(result.discountChanged,true);
  assert.equal(before.cart[0].quantity,2);
});
test('customer presentation excludes costing and margin',()=>{
  const core=loadCore();
  const item=core.presentationLine({item:{id:'1',itemName:'Table',code:'T-1',costing:80,margin:130,price:250,qty:4},quantity:2,discount:10},0);
  assert.equal(item.net,450);
  assert.equal('costing' in item,false);
  assert.equal('margin' in item,false);
  assert.equal(item.stock,4);
});
test('autosave persists a draft and only confirmed save clears it',()=>{
  const browser={};
  vm.runInNewContext(source('showroom-phase1-core.js'),{window:browser});
  const storage=new Map();
  const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  let init,job;
  const document={readyState:'loading',addEventListener:(event,fn)=>{if(event==='DOMContentLoaded')init=fn},getElementById:()=>null,hidden:false};
  const cart=[{item:{id:'x',code:'A',itemName:'Lamp',actualSalesPrice:100},quantity:2,discount:10,customPrice:95}];
  const vars={
    window:{...browser,addEventListener(){}},document,localStorage,products:[],cart,
    discountPctValue:5,discountFlatValue:10,partnerCommType:'pct',partnerCommValue:0,hasPartner:false,documentType:'quotation',
    documentFormStates:{quotation:{initialized:true,fields:{'quote-customer-input':{value:'Customer X'}}}},
    showPreOrderOnDoc:true,activeSavedQuotationId:'',activeSavedQuotationName:'',activeSavedQuotationNo:'',
    activeSavedQuotationRevision:0,activeViewedQuotationRevision:null,
    captureDocumentFormState(){},showNotification(){},
    setTimeout(callback,time){if(time===750)job=callback;return 1},clearTimeout(){}
  };
  const ctx=vm.createContext(vars);
  vm.runInContext(source('showroom-phase1.js'),ctx);
  init();
  vars.window.ShowroomPhase1.scheduleDraft();
  job();
  const record=JSON.parse(storage.get('limperial_showroom_drafts_v1'));
  assert.equal(record.length,1);
  assert.equal(record[0].data.cart[0].customPrice,95);
  assert.equal(record[0].data.discountFlatValue,10);
  vars.window.ShowroomPhase1.savedSuccessfully();
  assert.equal(JSON.parse(storage.get('limperial_showroom_drafts_v1')).length,0);
});
