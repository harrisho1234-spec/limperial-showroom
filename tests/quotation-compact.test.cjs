const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const editor=fs.readFileSync(require.resolve('../quotation-table-editor.js'),'utf8');
const workspace=fs.readFileSync(require.resolve('../quotation-workspace.js'),'utf8');
const vm=require('node:vm');
function boot(type='quotation'){
 const dom=new JSDOM('<div id="quotation-live-paper-container"><div id="quotation-live-paper" data-compact-quotation></div></div>',{runScripts:'outside-only'});
 const w=dom.window,paper=w.document.getElementById('quotation-live-paper');let id=0;
 const product={id:'catalog',code:'ABC-1',itemName:'Crystal lamp',description:'Real catalog details',brand:'Asfour',qty:4,actualSalesPrice:125,imgLink:'https://example.com/photo.jpg'};
 const row=(key)=>({id:key,item:{...product},quantity:1,discount:0,customPrice:null});
 Object.assign(w,{cart:[row('a'),row('b')],products:[product],documentType:type,
  newCartLineId:()=>`new-${++id}`,showNotification:()=>{},renderQuoteItemsNotesForm:()=>{},updateCartVisuals:()=>{},renderProductGrid:()=>{},
  getActualSalesPrice:p=>p?.actualSalesPrice||0,
  catalogCartEntry:(p,key,quantity=1)=>({id:key||`new-${++id}`,item:{...p},quantity,discount:0,customPrice:null}),
  addServiceFee:()=>w.cart.push({id:`fee-${++id}`,type:'service',item:{code:'SERVICE',itemName:'Service Fee'},quantity:1,discount:0,customPrice:0}),
  updateQuotationPreview:()=>{paper.innerHTML='<table><thead><tr>'+['No','Description','Photo','Qty','Price','Discount','Total'].map(x=>`<th>${x}</th>`).join('')+'</tr></thead><tbody>'+w.cart.map((r,i)=>`<tr><td>${i+1}</td><td><div>${r.item.itemName}</div><div>${r.item.description||''}</div></td><td>photo</td><td>${r.quantity}</td><td>${r.customPrice??r.item.actualSalesPrice??0}</td><td>${r.discount}</td><td>total</td></tr>`).join('')+'<tr><td colspan="7">Sub Total:</td></tr></tbody></table>';}
 });
 w.eval(workspace);w.eval(editor);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.updateQuotationPreview();
 const click=selector=>paper.querySelector(selector).click();
 const fillForm=values=>Object.entries(values).forEach(([field,value])=>{
  const input=paper.querySelector('[data-qtable-input="'+field+'"]');
  assert.ok(input,'missing form field: '+field);
  input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));
 });
 return{w,paper,click,fillForm,api:w.QuotationTableEditor,dom};
}
test('compact menu inserts existing catalog product at exact row and scrubs exports',()=>{
 const {w,paper,click,api}=boot();
 assert.equal(w.document.getElementById('quotation-workspace'),null);
 assert.equal(paper.querySelectorAll('[data-qtable-insert]').length,2);
 assert.doesNotMatch(paper.textContent,/Build directly|Build Items Here/);
 assert.equal(paper.querySelectorAll('.qtable-new-line').length,0);
 click('[data-qtable-insert="a"]');
 assert.equal(paper.querySelectorAll('[data-qtable-add-kind]').length,3);
 click('[data-qtable-add-kind="catalog"]');
 const search=paper.querySelector('[data-qtable-filter="search"]');search.value='ABC';
 search.dispatchEvent(new w.Event('input',{bubbles:true}));api.refreshCatalog();
 assert.equal(paper.querySelectorAll('[data-qtable-pick]').length,1);
 click('[data-qtable-pick="0"]');
 assert.deepEqual(Array.from(w.cart,x=>x.id),['a','new-1','b']);
 assert.equal(w.cart[1].item.description,'Real catalog details');
 assert.equal(w.cart[1].item.imgLink,w.products[0].imgLink);
 const clone=api.cleanClone(paper.cloneNode(true));
 assert.equal(clone.querySelector('input,button,.qtable-action-row'),null);
 assert.match(clone.textContent,/Crystal lamp/);
 assert.equal(w.products[0].qty,4);
});
test('menu adds manual rows and presets a selectable service fee without inventory changes',()=>{
 for(const type of ['quotation','sales_order']){
  const {w,paper,click,fillForm}=boot(type);
  click('[data-qtable-insert="a"]');click('[data-qtable-add-kind="manual"]');
  fillForm({name:'Custom work',quantity:'1',price:'75',discount:'0'});
  click('[data-qtable-form] button[type="submit"]');
  assert.equal(w.cart[1].item.itemName,'Custom work');
  assert.equal(w.cart[1].item.manualItem,true);
  assert.equal(w.cart[1].type,'service');
  click('[data-qtable-insert="b"]');click('[data-qtable-add-kind="service"]');
  const select=paper.querySelector('[data-qtable-service-type]');
  assert.ok(select);assert.ok([...select.options].some(x=>x.value==='Installation fee'));
  select.value='Installation fee';select.dispatchEvent(new w.Event('change',{bubbles:true}));
  fillForm({quantity:'1',price:'150',discount:'0'});
  click('[data-qtable-form] button[type="submit"]');
  assert.equal(w.cart[3].item.itemName,'Installation fee');
  assert.equal(w.cart[3].customPrice,150);
  assert.equal(w.cart[3].type,'service');
  assert.ok(!w.cart[3].item.manualItem);
  assert.equal(w.products[0].qty,4);
 }
});
test('existing text edits clone catalog data; replacement keeps row ID, quantity and sections',()=>{
 const {w,paper,click,api}=boot();
 let input=paper.querySelector('[data-qtable-existing="a"]');input.focus();input.value='Lobby lamp';input.dispatchEvent(new w.Event('input',{bubbles:true}));
 input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 assert.equal(w.cart[0].item.itemName,'Lobby lamp');assert.equal(w.products[0].itemName,'Crystal lamp');
 w.cart[0].quantity=3;w.cart[0].documentSections={quotation:'Lobby'};
 input=paper.querySelector('[data-qtable-existing="a"]');input.focus();input.value='ABC';input.dispatchEvent(new w.Event('input',{bubbles:true}));click('[data-qtable-suggestion="0"]');
 assert.equal(w.cart[0].id,'a');assert.equal(w.cart[0].quantity,3);assert.equal(w.cart[0].documentSections.quotation,'Lobby');
 assert.equal(api.getInline(),null);
});
test('numeric cell updates validate quantity, price and discount; cancel leaves cart intact',()=>{
 const {w,paper,click}=boot();
 const change=(field,value)=>{const input=paper.querySelector(`[data-qtable-number="${field}"]`);input.value=value;input.dispatchEvent(new w.Event('change',{bubbles:true}));};
 change('quantity','3');change('price','120.55');change('discount','12.5');
 assert.equal(w.cart[0].quantity,3);assert.equal(w.cart[0].customPrice,120.55);assert.equal(w.cart[0].discount,12.5);
 change('quantity','1.5');change('price','-1');change('discount','101');
 assert.equal(w.cart[0].quantity,3);assert.equal(w.cart[0].customPrice,120.55);assert.equal(w.cart[0].discount,12.5);
 click('[data-qtable-insert="a"]');assert.equal(paper.querySelectorAll('[data-qtable-add-kind]').length,3);
 click('[data-qtable-menu-close]');assert.equal(paper.querySelectorAll('[data-qtable-add-kind]').length,0);assert.equal(w.cart.length,2);
});
test('pointer dragging and arrows reorder table rows for touch and mouse',()=>{
 for(const pointerType of ['touch','mouse']){
  const {w,paper,click}=boot();
  const handle=paper.querySelector('[data-qtable-drag="a"]'),target=paper.querySelector('tr[data-qtable-key="b"]');
  w.document.elementFromPoint=()=>target;target.getBoundingClientRect=()=>({top:20,height:20});
  const event=(type,y)=>{const e=new w.Event(type,{bubbles:true});Object.assign(e,{pointerType,pointerId:1,clientX:10,clientY:y,button:0});handle.dispatchEvent(e);};
  event('pointerdown',0);event('pointermove',45);event('pointerup',45);
  assert.deepEqual(Array.from(w.cart,x=>x.id),['b','a']);
  click('[data-qtable-move="-1"][data-qtable-key="a"]');assert.deepEqual(Array.from(w.cart,x=>x.id),['a','b']);
 }
});
test('empty table supports first insertion and picker escapes untrusted catalog text',()=>{
 const {w,paper,click,api}=boot();
 w.cart.length=0;w.products[0].itemName='<img src=x onerror=alert(1)>';w.updateQuotationPreview();
 click('[data-qtable-insert=""]');click('[data-qtable-add-kind="catalog"]');
 const search=paper.querySelector('[data-qtable-filter="search"]');search.value='ABC';
 search.dispatchEvent(new w.Event('input',{bubbles:true}));api.refreshCatalog();
 assert.equal(paper.querySelector('[data-qtable-results] img[onerror]'),null);
 click('[data-qtable-pick="0"]');assert.equal(w.cart.length,1);
});
test('real quotation renderer preserves totals, groups, saved line metadata and Sales Order deposit',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://showroom.test/'}),w=dom.window,ctx=dom.getInternalVMContext();
 try{
  w.setInterval=()=>1;w.setTimeout=()=>1;
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].includes('let products ='))vm.runInContext(match[1],ctx);
  w.onload=null;
  vm.runInContext("products=loadFallbackProducts(); filteredProducts=[...products];showNotification=()=>{};cart=[catalogCartEntry(products[0]),catalogCartEntry(products[1])];documentType='quotation';",ctx);
  w.eval(workspace);w.eval(editor);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.updateQuotationPreview();
  const paper=w.document.getElementById('quotation-live-paper');
  const keys=vm.runInContext('cart.map(x=>x.id)',ctx);
  paper.querySelector('[data-qtable-insert]').click();
  paper.querySelector('[data-qtable-add-kind="manual"]').click();
  const input=paper.querySelector('[data-qtable-input="name"]');input.value='Custom installation';
  input.dispatchEvent(new w.Event('input',{bubbles:true}));
  paper.querySelector('[data-qtable-form] button[type="submit"]').click();
  assert.equal(vm.runInContext('cart[1].item.itemName',ctx),'Custom installation');
  assert.equal(vm.runInContext('cart[2].id',ctx),keys[1]);
  const price=paper.querySelectorAll('[data-qtable-number="price"]')[1];price.value='250';price.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(vm.runInContext('cart[1].customPrice',ctx),250);
  assert.match(w.QuotationTableEditor.cleanClone(paper.cloneNode(true)).textContent,/\$250/);
  assert.equal(paper.querySelectorAll('[data-qtable-number="discount"]').length,3);
  vm.runInContext("documentType='sales_order';salesOrderDepositMode='amount';",ctx);
  w.document.getElementById('so-deposit-amount').value='25';w.updateQuotationPreview();
  assert.match(paper.textContent,/Deposit Paid/);assert.match(paper.textContent,/\$25/);
  assert.equal(paper.querySelectorAll('[data-qtable-insert]').length,3);
 }finally{dom.window.close()}
});
