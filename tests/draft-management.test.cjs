const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=name=>fs.readFileSync(require.resolve('../'+name),'utf8');
const DAY_MS=24*60*60*1000;
function core(){
  const window={};vm.runInNewContext(source('showroom-phase1-core.js'),{window});
  return window.ShowroomPhase1Core;
}
function record(id,days){return {id,version:1,savedAt:new Date(Date.now()-days*DAY_MS).toISOString(),data:{cart:[{item:{code:'L-1'},quantity:1}]}};}
function browser(records){
  const dom=new JSDOM('<!doctype html><body><div id="catalog-controls-panel"></div></body>',{runScripts:'outside-only',url:'https://showroom.test/'});
  const w=dom.window,ctx=dom.getInternalVMContext();
  w.localStorage.setItem('limperial_showroom_drafts_v1',JSON.stringify(records));
  w.localStorage.setItem('limperial_saved_interest_lists','OFFICIAL_QUOTATIONS_UNTOUCHED');
  w.localStorage.setItem('limperial_quotation_revisions','REVISION_HISTORY_UNTOUCHED');
  w.setTimeout=()=>1;w.clearTimeout=()=>{};w.showNotification=()=>{};
  vm.runInContext(source('showroom-phase1-core.js'),ctx);
  vm.runInContext("let products=[],cart=[],discountPctValue=0,discountFlatValue=0,partnerCommType='pct',partnerCommValue=0,hasPartner=false,documentType='quotation',documentFormStates={quotation:{initialized:false}},showPreOrderOnDoc=true,activeSavedQuotationId='',activeSavedQuotationName='',activeSavedQuotationNo='',activeSavedQuotationRevision=0,activeViewedQuotationRevision=null;function captureDocumentFormState(){};",ctx);
  vm.runInContext(source('showroom-phase1.js'),ctx);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {
    dom,w,open:()=>w.ShowroomPhase1.showDraftRecovery(),
    drafts:()=>JSON.parse(w.localStorage.getItem('limperial_showroom_drafts_v1')),
    click:text=>{
      const button=Array.from(w.document.querySelectorAll('#showroom-phase1-modal button')).find(b=>b.textContent.trim()===text);
      assert.ok(button,'Missing button: '+text);button.click();
    }
  };
}
test('7-day inactivity retention keeps recent drafts and expires old or invalid records',()=>{
  const c=core();
  const now=Date.parse('2026-10-08T00:00:00Z');
  const rows=[
    {id:'old',version:1,savedAt:new Date(now-8*DAY_MS).toISOString(),data:{}},
    {id:'boundary',version:1,savedAt:new Date(now-7*DAY_MS).toISOString(),data:{}},
    {id:'active',version:1,savedAt:new Date(now-6*DAY_MS).toISOString(),data:{}},
    {id:'bad',version:1,savedAt:'not-a-date',data:{}}
  ];
  assert.deepEqual(Array.from(c.freshDrafts(rows,now),x=>x.id),['active']);
  assert.equal(c.DRAFT_RETENTION_MS,7*DAY_MS);
});
test('Draft Management automatically prunes old snapshots; official quotations remain untouched',()=>{
  const t=browser([record('expired',8),record('recent',2)]);
  try{
    t.open();
    assert.deepEqual(t.drafts().map(x=>x.id),['recent']);
    assert.match(t.w.document.querySelector('#showroom-phase1-modal').textContent,/7 days/);
    assert.equal(t.w.localStorage.getItem('limperial_saved_interest_lists'),'OFFICIAL_QUOTATIONS_UNTOUCHED');
  }finally{t.dom.window.close();}
});
test('discard individual draft requires confirmation and supports cancel',()=>{
  const t=browser([record('first',0)]);
  try{
    t.open();t.click('Discard');assert.equal(t.drafts().length,1);
    t.click('Cancel');assert.equal(t.drafts().length,1);
    t.click('Discard');t.click('Yes, Discard Draft');assert.equal(t.drafts().length,0);
    assert.equal(t.w.localStorage.getItem('limperial_quotation_revisions'),'REVISION_HISTORY_UNTOUCHED');
  }finally{t.dom.window.close();}
});
test('Clear All requires confirmation and never deletes formal quotations or revisions',()=>{
  const t=browser([record('first',0),record('second',2)]);
  try{
    t.open();t.click('Clear All Drafts');assert.equal(t.drafts().length,2);
    t.click('Cancel');assert.equal(t.drafts().length,2);
    t.click('Clear All Drafts');t.click('Yes, Clear All Drafts');
    assert.equal(t.drafts().length,0);
    assert.equal(t.w.localStorage.getItem('limperial_saved_interest_lists'),'OFFICIAL_QUOTATIONS_UNTOUCHED');
    assert.equal(t.w.localStorage.getItem('limperial_quotation_revisions'),'REVISION_HISTORY_UNTOUCHED');
    assert.match(t.w.document.querySelector('#showroom-phase1-modal').textContent,/No unsaved drafts available/);
  }finally{t.dom.window.close();}
});
