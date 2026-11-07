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
  assert.ok(select);
  assert.deepEqual([...select.options].map(x=>x.value),['Service Fee','Maintenance Fee','Cleaning Fee','Delivery/Installation','Other']);
  select.value='Delivery/Installation';select.dispatchEvent(new w.Event('change',{bubbles:true}));
  fillForm({quantity:'1',price:'150',discount:'0'});
  click('[data-qtable-form] button[type="submit"]');
  assert.equal(w.cart[3].item.itemName,'Delivery/Installation');
  assert.equal(w.cart[3].customPrice,150);
  assert.equal(w.cart[3].type,'service');
  assert.ok(!w.cart[3].item.manualItem);
  assert.equal(w.products[0].qty,4);
 }
});
test('Other allows a custom service name that remains editable when reopened',()=>{
 const {w,paper,click,fillForm,api}=boot();
 click('[data-qtable-insert="a"]');click('[data-qtable-add-kind="service"]');
 const select=paper.querySelector('[data-qtable-service-type]');
 assert.equal(select.value,'Service Fee');
 select.value='Other';select.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(paper.querySelector('[data-qtable-input="name"]').value,'');
 fillForm({name:'Special site inspection',quantity:'1',price:'80',discount:'5'});
 click('[data-qtable-form] button[type="submit"]');
 const line=w.cart[1];assert.equal(line.item.itemName,'Special site inspection');
 assert.equal(line.customPrice,80);assert.equal(line.discount,5);
 api.open('edit',line.id);
 assert.equal(paper.querySelector('[data-qtable-service-type]').value,'Other');
 assert.equal(paper.querySelector('[data-qtable-input="name"]').value,'Special site inspection');
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


test('per-row Hide PO controls quotation and Sales Order label display only, not quantities or stock',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://showroom.test/'}),w=dom.window,ctx=dom.getInternalVMContext();
 try{
  w.setInterval=()=>1;w.setTimeout=()=>1;
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
   if(match[1].includes('let products ='))vm.runInContext(match[1],ctx);
  w.onload=null;
  vm.runInContext("products=loadFallbackProducts();filteredProducts=[...products];showNotification=()=>{};cart=[catalogCartEntry(products[0]),catalogCartEntry(products[1])];cart[0].forcePreorder=true;cart[1].forcePreorder=true;documentType='quotation';showPreOrderOnDoc=true;",ctx);
  w.eval(workspace);w.eval(editor);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.updateQuotationPreview();
  const paper=w.document.getElementById('quotation-live-paper');
  const rows=()=>[...paper.querySelectorAll('tr[data-qtable-key]')];
  const containsPO=row=>/pre[\s-]*order:\s*1\s*pc/i.test(row.cells[1].textContent);
  assert.equal(rows().length,2);
  assert.ok(containsPO(rows()[0])&&containsPO(rows()[1]));
  assert.equal(paper.querySelectorAll('[data-qtable-preorder]').length,2);
  const initial=vm.runInContext("cart.map(x=>({qty:x.quantity,force:x.forcePreorder,stock:x.item.qty,price:x.customPrice,discount:x.discount}))",ctx);
  paper.querySelector('[data-qtable-preorder]').click();
  assert.equal(vm.runInContext("cart[0].hidePreorderOnDoc",ctx),true);
  assert.equal(containsPO(rows()[0]),false);
  assert.equal(containsPO(rows()[1]),true,'other lines remain visible');
  assert.match(rows()[0].querySelector('[data-qtable-preorder]').textContent,/Show PO/);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext("cart.map(x=>({qty:x.quantity,force:x.forcePreorder,stock:x.item.qty,price:x.customPrice,discount:x.discount}))",ctx))),JSON.parse(JSON.stringify(initial)));
  const exported=w.QuotationTableEditor.cleanClone(paper.cloneNode(true));
  assert.equal(exported.querySelector('[data-qtable-preorder]'),null);
  assert.doesNotMatch(exported.querySelectorAll('tr[data-qtable-key]')[0].cells[1].textContent,/pre[\s-]*order:\s*1\s*pc/i);
  assert.match(exported.querySelectorAll('tr[data-qtable-key]')[1].cells[1].textContent,/pre[\s-]*order:\s*1\s*pc/i);
  vm.runInContext("documentType='sales_order';salesOrderDepositMode='amount';",ctx);
  w.updateQuotationPreview();
  assert.equal(containsPO(rows()[0]),false);
  assert.equal(containsPO(rows()[1]),true);
  rows()[0].querySelector('[data-qtable-preorder]').click();
  assert.equal(vm.runInContext("cart[0].hidePreorderOnDoc",ctx),false);
  assert.ok(containsPO(rows()[0]));
  vm.runInContext('toggleDocPreOrder(false)',ctx);
  assert.equal(containsPO(rows()[0]),false);
  assert.equal(containsPO(rows()[1]),false);
  vm.runInContext('toggleDocPreOrder(true)',ctx);
  assert.ok(containsPO(rows()[0])&&containsPO(rows()[1]));
 }finally{dom.window.close()}
});


test('quotation row Remove uses two-step confirmation and removes only the exact duplicate line',()=>{
 for(const docType of ['quotation','sales_order']){
  const {w,paper,click,api}=boot(docType);
  const sameCatalog=w.products[0];
  const untouched=w.cart[1],first=w.cart[0];
  const originalCatalog=JSON.stringify(sameCatalog);
  first.discount=15;first.documentSections={quotation:'Ground Floor'};
  first.customPrice=275;
  const firstKey=first.id;
  assert.equal(paper.querySelectorAll('[data-qtable-delete]').length,2);
  click('[data-qtable-delete="a"]');
  assert.equal(api.getPendingDeleteKey(),firstKey);
  assert.equal(w.cart.length,2,'first click only asks for confirmation');
  assert.match(paper.querySelector('.qtable-delete-confirm').textContent,/Remove this row/);
  click('[data-qtable-cancel-delete]');
  assert.equal(api.getPendingDeleteKey(),null);
  assert.equal(w.cart.length,2,'cancel leaves all items untouched');
  click('[data-qtable-delete="a"]');
  const yes=paper.querySelector('[data-qtable-confirm-delete="a"]');
  assert.ok(yes);
  yes.click();
  assert.equal(api.getPendingDeleteKey(),null);
  assert.equal(w.cart.length,1);
  assert.strictEqual(w.cart[0],untouched,'a second row with the same catalog product stays in place');
  assert.equal(paper.querySelectorAll('tr[data-qtable-key]').length,1);
  assert.equal(paper.querySelectorAll('[data-qtable-delete]').length,1);
  assert.equal(JSON.stringify(sameCatalog),originalCatalog,'catalog master was never modified');
  assert.equal(paper.querySelectorAll('[data-qtable-insert]').length,1);
  assert.equal(api.getActive(),null);
  click('[data-qtable-delete="b"]');
  click('[data-qtable-confirm-delete="b"]');
  assert.equal(w.cart.length,0);
  assert.ok(paper.querySelector('[data-qtable-insert=""]'),'the empty quotation still supports adding new lines');
 }
});
test('row removal Escape cancels confirmation without modifying the cart',()=>{
 const {w,paper,click,api}=boot();
 click('[data-qtable-delete="a"]');
 const confirm=paper.querySelector('.qtable-delete-confirm');
 assert.ok(confirm);
 confirm.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(api.getPendingDeleteKey(),null);
 assert.equal(w.cart.length,2);
 assert.equal(paper.querySelector('.qtable-delete-confirm'),null);
});
test('manual items can show pre-order from the table and stay synchronized with the Interest List',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://showroom.test/'}),w=dom.window,ctx=dom.getInternalVMContext();
 try{
  w.setInterval=()=>1;w.setTimeout=()=>1;
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
   if(match[1].includes('let products ='))vm.runInContext(match[1],ctx);
  w.onload=null;
  vm.runInContext("products=loadFallbackProducts();filteredProducts=[...products];showNotification=()=>{};cart=[{id:'manual-test',type:'service',item:{id:'manual-test',manualItem:true,code:'MANUAL',brand:'Other',class:'Manual',itemName:'Custom installation',description:'By site requirement',qty:0,price:150,actualSalesPrice:150,costing:0},quantity:1,discount:0,customPrice:150,rowHeight:90,forcePreorder:false}];documentType='quotation';showPreOrderOnDoc=true;",ctx);
  w.eval(workspace);w.eval(editor);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.updateQuotationPreview();
  const paper=w.document.getElementById('quotation-live-paper');
  const row=()=>paper.querySelector('tr[data-qtable-key="manual-test"]');
  const labelVisible=()=>/pre[\s-]*order:\s*1\s*pc/i.test(row().cells[1].textContent);
  const entry=()=>vm.runInContext("cart[0]",ctx);
  const original=JSON.stringify({qty:entry().quantity,discount:entry().discount,price:entry().customPrice,stock:entry().item.qty});
  assert.equal(labelVisible(),false);
  assert.match(row().querySelector('[data-qtable-force-po]').textContent,/Mark PO/);
  assert.equal(row().querySelector('[data-qtable-preorder]'),null);
  row().querySelector('[data-qtable-force-po]').click();
  assert.equal(entry().forcePreorder,true);
  assert.equal(labelVisible(),true);
  assert.match(row().querySelector('[data-qtable-force-po]').textContent,/Remove PO/);
  assert.ok(row().querySelector('[data-qtable-preorder]'),'manual pre-order retains the separate Hide PO control');
  row().querySelector('[data-qtable-preorder]').click();
  assert.equal(entry().hidePreorderOnDoc,true);
  assert.equal(entry().forcePreorder,true,'hiding a label must not change actual order status');
  assert.equal(labelVisible(),false);
  row().querySelector('[data-qtable-force-po]').click();
  assert.equal(entry().forcePreorder,false);
  assert.equal(labelVisible(),false);
  row().querySelector('[data-qtable-force-po]').click();
  assert.equal(entry().forcePreorder,true);
  assert.equal(entry().hidePreorderOnDoc,false,'marking PO again makes the label visible');
  assert.equal(labelVisible(),true);
  assert.equal(JSON.stringify({qty:entry().quantity,discount:entry().discount,price:entry().customPrice,stock:entry().item.qty}),original);
  vm.runInContext("documentType='sales_order'",ctx);w.updateQuotationPreview();
  assert.equal(labelVisible(),true,'Sales Order uses the same manual item status');
  row().querySelector('[data-qtable-force-po]').click();
  assert.equal(labelVisible(),false);
  assert.equal(entry().forcePreorder,false);
  vm.runInContext("toggleForcePreorder('manual-test')",ctx);
  assert.equal(entry().forcePreorder,true);
  assert.equal(labelVisible(),true,'the existing Interest List control updates the table');
  assert.match(row().querySelector('[data-qtable-force-po]').textContent,/Remove PO/);
  const exported=w.QuotationTableEditor.cleanClone(paper.cloneNode(true));
  assert.equal(exported.querySelector('[data-qtable-force-po]'),null,'export excludes the editing controls');
  assert.match(exported.querySelector('tr[data-qtable-key]').cells[1].textContent,/pre[\s-]*order:\s*1\s*pc/i);
 }finally{dom.window.close()}
});


test('regular catalog products can mark/remove forced PO without altering stock or automatic shortages',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://showroom.test/'}),w=dom.window,ctx=dom.getInternalVMContext();
 try{
  w.setInterval=()=>1;w.setTimeout=()=>1;
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
   if(match[1].includes('let products ='))vm.runInContext(match[1],ctx);
  w.onload=null;
  vm.runInContext("products=loadFallbackProducts();filteredProducts=[...products];showNotification=()=>{};cart=[catalogCartEntry(products[0]),catalogCartEntry(products[1])];cart[0].item.qty=5;cart[1].item.qty=0;cart[0].quantity=1;cart[1].quantity=1;documentType='quotation';showPreOrderOnDoc=true;",ctx);
  w.eval(workspace);w.eval(editor);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.updateQuotationPreview();
  const paper=w.document.getElementById('quotation-live-paper');
  const rows=()=>[...paper.querySelectorAll('tr[data-qtable-key]')];
  const label=row=>/pre[\s-]*order:\s*1\s*pc/i.test(row.cells[1].textContent);
  const details=()=>JSON.stringify(vm.runInContext("cart.map(x=>({quantity:x.quantity,discount:x.discount,customPrice:x.customPrice,stock:x.item.qty,code:x.item.code}))",ctx));
  const before=details();
  assert.equal(rows().length,2);
  assert.equal(rows()[0].querySelector('[data-qtable-force-po]').textContent.trim(),'+ Mark PO');
  assert.equal(label(rows()[0]),false,'in-stock product starts without a pre-order label');
  assert.equal(label(rows()[1]),true,'out-of-stock product still shows automatic pre-order');
  rows()[0].querySelector('[data-qtable-force-po]').click();
  assert.equal(vm.runInContext("cart[0].forcePreorder",ctx),true);
  assert.equal(vm.runInContext("cart[1].forcePreorder",ctx),false);
  assert.equal(label(rows()[0]),true);
  assert.equal(rows()[0].querySelector('[data-qtable-force-po]').textContent.trim(),'✓ Remove PO');
  rows()[0].querySelector('[data-qtable-preorder]').click();
  assert.equal(label(rows()[0]),false,'Hide PO affects label only');
  assert.equal(vm.runInContext("cart[0].forcePreorder",ctx),true);
  rows()[0].querySelector('[data-qtable-force-po]').click();
  assert.equal(vm.runInContext("cart[0].forcePreorder",ctx),false);
  rows()[0].querySelector('[data-qtable-force-po]').click();
  assert.equal(vm.runInContext("cart[0].hidePreorderOnDoc",ctx),false,'marking again reveals previously hidden label');
  assert.equal(label(rows()[0]),true);
  rows()[0].querySelector('[data-qtable-force-po]').click();
  assert.equal(label(rows()[0]),false,'removing forced PO restores normal stock-based behavior');
  rows()[1].querySelector('[data-qtable-force-po]').click();
  assert.equal(label(rows()[1]),true);
  rows()[1].querySelector('[data-qtable-force-po]').click();
  assert.equal(vm.runInContext("cart[1].forcePreorder",ctx),false);
  assert.equal(label(rows()[1]),true,'real stock shortage is still a pre-order after clearing the forced flag');
  assert.equal(details(),before,'prices, stock, quantities, discounts and item identity are unchanged');
  vm.runInContext("documentType='sales_order';salesOrderDepositMode='amount';",ctx);w.updateQuotationPreview();
  assert.ok(rows().every(row=>row.querySelector('[data-qtable-force-po]')),'normal products have controls in Sales Order too');
  assert.equal(label(rows()[1]),true);
  const clean=w.QuotationTableEditor.cleanClone(paper.cloneNode(true));
  assert.equal(clean.querySelector('[data-qtable-force-po]'),null,'export has no editing controls');
 }finally{dom.window.close()}
});


test('Discount entry sits below Sub Total and applies % and $ to the existing batch calculation exactly once',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://showroom.test/'}),w=dom.window,ctx=dom.getInternalVMContext();
 try{
  w.setInterval=()=>1;w.setTimeout=()=>1;
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
   if(match[1].includes('let products ='))vm.runInContext(match[1],ctx);
  w.onload=null;
  vm.runInContext("products=loadFallbackProducts();filteredProducts=[...products];showNotification=()=>{};cart=[catalogCartEntry(products[0]),catalogCartEntry(products[1])];cart[0].quantity=2;cart[0].customPrice=100;cart[0].discount=10;cart[1].quantity=1;cart[1].customPrice=200;cart[1].discount=0;documentType='quotation';discountPctValue=0;discountFlatValue=0;",ctx);
  w.eval(workspace);w.eval(editor);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.updateQuotationPreview();
  const paper=w.document.getElementById('quotation-live-paper');
  const before=JSON.stringify(vm.runInContext("cart.map(r=>({id:r.id,qty:r.quantity,price:r.customPrice,discount:r.discount,stock:r.item.qty}))",ctx));
  const fields=()=>({
   percent:paper.querySelector('[data-qtable-footer-percent]'),
   amount:paper.querySelector('[data-qtable-footer-amount]'),
   form:paper.querySelector('[data-qtable-footer-discount-form]')
  });
  assert.equal(paper.querySelector('.qtable-discount-row'),null,'customer-facing discount line is optional');
  assert.ok(fields().percent&&fields().amount,'both percentage and dollar inputs are visible even without a batch discount');
  assert.equal(paper.querySelectorAll('tr.qtable-discount-entry-row').length,1);
  assert.match(paper.querySelector('.qtable-discount-inline-title').textContent,/Discount \(optional\)/);
  assert.equal(paper.querySelector('tr:has(td[colspan="3"])').nextElementSibling.className,'qtable-discount-entry-row','entry is immediately below Sub Total');
  paper.querySelector('[data-qtable-insert]').click();
  assert.equal(paper.querySelectorAll('[data-qtable-add-kind]').length,3,'discount is no longer a product Add item type');
  paper.querySelector('[data-qtable-menu-close]').click();
  fields().percent.value='10';fields().amount.value='40';
  fields().form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(vm.runInContext('discountPctValue',ctx),10);
  assert.equal(vm.runInContext('discountFlatValue',ctx),40);
  assert.equal(w.document.getElementById('discount-pct').value,'10');
  assert.equal(w.document.getElementById('mobile-discount-pct').value,'10');
  assert.equal(w.document.getElementById('discount-flat').value,'40');
  assert.equal(w.document.getElementById('mobile-discount-flat').value,'40');
  assert.equal(JSON.stringify(vm.runInContext("cart.map(r=>({id:r.id,qty:r.quantity,price:r.customPrice,discount:r.discount,stock:r.item.qty}))",ctx)),before);
  const subtotal=paper.querySelector('tr:has(td[colspan="3"])');
  const discount=paper.querySelector('.qtable-discount-row');
  const grand=paper.querySelector('.qtable-grand-total-row');
  assert.ok(subtotal&&discount&&grand);
  assert.match(subtotal.cells[subtotal.cells.length-1].textContent,/\$400/);
  assert.match(discount.cells[0].textContent,/Discount:/);
  assert.doesNotMatch(discount.cells[0].textContent,/Batch Discount|Bulk Discount/);
  assert.match(discount.cells[1].textContent,/-\$98/);
  assert.match(grand.cells[1].textContent,/\$302/);
  assert.equal(paper.querySelectorAll('tr[data-qtable-key]').length,2,'discount is not an inventory item');
  assert.match(w.document.getElementById('quote-textarea').value,/Discount:\s*-\$98/);
  const exported=w.QuotationTableEditor.cleanClone(paper.cloneNode(true));
  assert.equal(exported.querySelector('.qtable-discount-entry-row'),null,'entry controls excluded from customer exports');
  assert.equal(exported.querySelector('.qtable-discount-row'),null,'export has no extra Discount row');
  assert.equal(exported.querySelector('.qtable-grand-total-row'),null,'export has no extra Grand Total row');
  assert.equal(exported.querySelector('.qtable-discount-tools'),null,'footer editor buttons are excluded from exports');
  const compact=exported.querySelector('.qtable-export-summary');
  assert.ok(compact,'export retains one Sub Total row');
  assert.match(compact.cells[compact.cells.length-3].textContent,/\$400/,'gross amount retained');
  assert.match(compact.cells[compact.cells.length-2].textContent,/-24\.5%/,'effective total discount rate shown');
  assert.match(compact.cells[compact.cells.length-2].textContent,/-\$98/,'full discount amount shown in same row');
  assert.match(compact.cells[compact.cells.length-1].textContent,/\$302/,'net amount in rightmost column');
  assert.equal(fields().percent.value,'10');
  assert.equal(fields().amount.value,'40');
  paper.querySelector('[data-qtable-edit-discount]').click();
  assert.strictEqual(w.document.activeElement,fields().percent,'Edit focuses inline percentage field rather than opening a second editor');
  vm.runInContext("documentType='sales_order';salesOrderDepositMode='pct'",ctx);
  w.document.getElementById('so-deposit-pct').value='50';
  w.updateQuotationPreview();
  assert.match(paper.textContent,/Deposit Paid/);
  assert.match(paper.querySelector('.qtable-grand-total-row').textContent,/\$302/);
  const salesOrderExport=w.QuotationTableEditor.cleanClone(paper.cloneNode(true));
  const soRows=[...salesOrderExport.querySelectorAll('tr')];
  const soSummary=salesOrderExport.querySelector('.qtable-export-summary');
  assert.ok(soSummary,'Sales Order export has the compact summary');
  assert.equal(salesOrderExport.querySelector('.qtable-discount-row,.qtable-grand-total-row,.qtable-discount-entry-row'),null);
  assert.match(soSummary.cells[soSummary.cells.length-1].textContent,/\$302/);
  assert.match(soSummary.nextElementSibling.textContent,/Deposit Paid/,'deposit follows Sub Total directly in export');
  assert.match(soSummary.nextElementSibling.nextElementSibling.textContent,/Remaining Balance/);
  assert.equal(soRows.filter(row=>row.textContent.includes('Sub Total:')).length,1,'single subtotal row');
  const entry=paper.querySelector('.qtable-discount-entry-row');
  const deposit=[...paper.querySelectorAll('tr')].find(row=>row.textContent.includes('Deposit Paid'));
  assert.ok(entry.compareDocumentPosition(deposit)&w.Node.DOCUMENT_POSITION_FOLLOWING,'entry occurs above Sales Order deposit');
  paper.querySelector('.qtable-footer-clear').click();
  assert.equal(vm.runInContext('discountPctValue',ctx),0);
  assert.equal(vm.runInContext('discountFlatValue',ctx),0);
  assert.equal(paper.querySelector('.qtable-discount-row'),null);
  assert.ok(fields().form,'optional editor remains available after clearing');
  const clearedExport=w.QuotationTableEditor.cleanClone(paper.cloneNode(true));
  assert.equal(clearedExport.querySelector('.qtable-discount-entry-row,.qtable-discount-row,.qtable-grand-total-row'),null);
  assert.ok(clearedExport.querySelector('tr.qtable-export-summary'),'item-only discounts preserve original single summary');
  assert.equal(JSON.stringify(vm.runInContext("cart.map(r=>({id:r.id,qty:r.quantity,price:r.customPrice,discount:r.discount,stock:r.item.qty}))",ctx)),before,'item discounts and stock remain unchanged');
  const desktopFlat=w.document.getElementById('discount-flat');desktopFlat.value='25';
  vm.runInContext("handleDiscountChange('flat')",ctx);
  assert.equal(vm.runInContext('discountFlatValue',ctx),25);
  assert.equal(w.document.getElementById('mobile-discount-flat').value,'25');
  assert.equal(fields().amount.value,'25','outside discount updates footer inputs');
  assert.match(paper.querySelector('.qtable-grand-total-row').textContent,/\$355/);
  const mobileFlat=w.document.getElementById('mobile-discount-flat');mobileFlat.value='35';
  vm.runInContext("handleMobileDiscountChange('flat')",ctx);
  assert.equal(w.document.getElementById('discount-flat').value,'35');
  assert.equal(fields().amount.value,'35');
  assert.match(paper.querySelector('.qtable-grand-total-row').textContent,/\$345/);
  fields().percent.value='-2';
  fields().form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(vm.runInContext('discountFlatValue',ctx),35,'invalid discount does not mutate saved values');
  assert.equal(vm.runInContext('discountPctValue',ctx),0);
 }finally{dom.window.close()}
});
