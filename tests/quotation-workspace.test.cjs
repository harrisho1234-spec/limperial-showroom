const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../quotation-workspace.js'),'utf8');
const css=fs.readFileSync(require.resolve('../quotation-workspace.css'),'utf8');
const index=fs.readFileSync(require.resolve('../index.html'),'utf8');

function harness(options={}){
 const events={},nodes={},messages=[],calls={notes:0,visuals:0,grid:0,preview:0,service:0,manual:0};
 const makeElement=(obj={})=>({value:'',innerHTML:'',textContent:'',hidden:false,
  setAttribute(){},addEventListener(){},querySelectorAll:()=>[],classList:{contains:()=>false,add(){},remove(){}},
  ...obj});
 const root=makeElement({addEventListener:(name,fn)=>{events[name]=fn},querySelectorAll:()=>[],contains:()=>true});
 const modal=makeElement();
 const heading={parentElement:{insertBefore:(node)=>{nodes['quotation-workspace']=node}}};
 nodes['share-modal']=modal;
 nodes['quote-items-notes-form']={previousElementSibling:heading};
 for(const id of ['qwb-results','qwb-search','qwb-brand','qwb-category','qwb-stock',
 'qwb-count','qwb-more','qwb-sort','qwb-selected','qwb-selected-count','qwb-order-note']){
  nodes[id]=makeElement();
 }
 const doc={
  readyState:'complete',getElementById:id=>nodes[id]||null,
  createElement:()=>root,addEventListener(){},
  elementFromPoint:()=>null
 };
 const rows=options.cart||[],products=options.products||[
  {id:'lamp-1',code:'LP-A1',brand:'DELUXE ART',class:'Chandelier',itemName:'Gold Chandelier',
   description:'Crystal light',qty:3,price:2500,imgLink:'https://example.com/lamp.jpg'},
  {id:'table-1',code:'TL-001',brand:'Mobilpiu',class:'Table',itemName:'Dining Table',
   description:'Wood and brass',qty:0,price:5000}
 ];
 let nextId=10;
 const state={
  window:{
   addEventListener:()=>{},openShareModal:()=>{},setDocType:()=>{},
   updateQuotationPreview:()=>{calls.preview++}
  },
  document:doc,cart:rows,products,documentType:options.documentType||'quotation',
  setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},
  requestAnimationFrame:fn=>fn(),
  console,Array,Number,String,Math,Promise,
  showNotification:(value)=>messages.push(value),
  getActualSalesPrice:p=>p.price,
  catalogCartEntry:p=>({id:'row-'+(++nextId),item:{...p},quantity:1,discount:0,customPrice:null}),
  newCartLineId:()=>('row-'+(++nextId)),
  updateQuotationPreview:()=>{calls.preview++},
  renderQuoteItemsNotesForm:()=>{calls.notes++},
  updateCartVisuals:()=>{calls.visuals++},
  renderProductGrid:()=>{calls.grid++},
  addServiceFee:()=>{
    calls.service++;
    rows.push({id:'service-1',type:'service',item:{id:'service-1',itemName:'Service Fee',price:0},
      quantity:1,discount:0,customPrice:0});
  },
  openManualInterestItem:()=>{calls.manual++},
  openReplaceCartItem:()=>{},formatCurrency:v=>'$'+Number(v).toFixed(2),
  confirm:()=>true,
  windowNoop:()=>{}
 };
 vm.runInNewContext(source,state,{timeout:2000});
 return{state,events,nodes,rows,products,messages,calls,api:state.window.QuotationWorkspace};
}
function row(key,label){
 return{id:key,quantity:1,discount:0,customPrice:null,
  item:{id:key,code:key,itemName:label,price:100}};
}
function clickEvent({id='',action='',key='',index=''}={}){
 const elt={id,dataset:{qwbAction:action,qwbKey:key,qwbAdd:index},
  closest:selector=>{
   if(selector==='#'+id&&id)return elt;
   if(selector==='[data-qwb-action]'&&action)return elt;
   if(selector==='[data-qwb-add]'&&index!=='')return elt;
   return null;
  }};
 return{target:elt};
}
test('quotation and Sales Order both load the same item builder; inventory stays unchanged',()=>{
 const a=harness();assert.ok(a.api);
 assert.ok(a.nodes['quotation-workspace'].innerHTML.includes('Build Items Here'));
 assert.ok(a.nodes['quotation-workspace'].innerHTML.includes('Manual Item'));
 assert.ok(a.nodes['quotation-workspace'].innerHTML.includes('Service Fee'));
 assert.match(index,/quotation-workspace\.js\?v=/);
 assert.match(index,/quotation-workspace\.css\?v=/);
 const b=harness({documentType:'inventory'});
 b.api.refresh();
 assert.equal(b.nodes['quotation-workspace'].hidden,true);
});
test('catalog search filters by brand, category, stock and shows catalog photos',()=>{
 const x=harness();
 x.api.refresh();
 assert.match(x.nodes['qwb-results'].innerHTML,/Gold Chandelier/);
 assert.match(x.nodes['qwb-results'].innerHTML,/Dining Table/);
 assert.match(x.nodes['qwb-results'].innerHTML,/lamp\.jpg/);
 x.nodes['qwb-brand'].value='Mobilpiu';
 x.api.refresh();
 assert.doesNotMatch(x.nodes['qwb-results'].innerHTML,/Gold Chandelier/);
 assert.match(x.nodes['qwb-results'].innerHTML,/Dining Table/);
 x.nodes['qwb-brand'].value='';
 x.nodes['qwb-stock'].value='in';
 x.api.refresh();
 assert.match(x.nodes['qwb-results'].innerHTML,/Gold Chandelier/);
 assert.doesNotMatch(x.nodes['qwb-results'].innerHTML,/Dining Table/);
 x.nodes['qwb-stock'].value='';
 x.nodes['qwb-search'].value='TL-001';
 x.api.refresh();
 assert.match(x.nodes['qwb-results'].innerHTML,/Dining Table/);
 assert.doesNotMatch(x.nodes['qwb-results'].innerHTML,/Gold Chandelier/);
 x.nodes['qwb-search'].value='';
 x.nodes['qwb-sort'].value='price-high';
 x.api.refresh();
 assert.ok(x.nodes['qwb-results'].innerHTML.indexOf('Dining Table')<x.nodes['qwb-results'].innerHTML.indexOf('Gold Chandelier'));
});
test('adding the same catalog product twice creates separately editable quotation rows',()=>{
 const x=harness();
 x.api.refresh();
 x.events.click(clickEvent({index:'0'}));
 x.events.click(clickEvent({index:'0'}));
 assert.equal(x.rows.length,2);
 assert.notEqual(x.rows[0].id,x.rows[1].id);
 assert.equal(x.rows[0].item.code,'LP-A1');
 assert.ok(x.calls.notes>0&&x.calls.preview>0&&x.calls.visuals>0);
});
test('service fee and manual item reuse existing cart and manual-item flows',()=>{
 const x=harness();
 x.api.refresh();
 x.events.click(clickEvent({id:'qwb-service'}));
 assert.equal(x.calls.service,1);
 assert.equal(x.rows[0].type,'service');
 x.events.click(clickEvent({id:'qwb-manual'}));
 assert.equal(x.calls.manual,1);
 x.api.editField('service-1','name','Installation and delivery');
 x.api.editField('service-1','price','250.75');
 x.api.editField('service-1','quantity','2');
 assert.equal(x.rows[0].item.itemName,'Installation and delivery');
 assert.equal(x.rows[0].customPrice,250.75);
 assert.equal(x.rows[0].quantity,2);
});
test('reorder moves existing line objects and preserves discount and room assignment',()=>{
 const a=row('a','Chandelier'),b=row('b','Table'),c=row('c','Lamp');
 b.discount=35;b.documentSections={quotation:'Living Room'};
 const x=harness({cart:[a,b,c]});
 x.api.moveTo('a','c',true);
 assert.deepEqual(Array.from(x.rows.map(r=>r.id)),['b','c','a']);
 assert.equal(x.rows[0],b);
 assert.equal(x.rows[0].discount,35);
 assert.equal(x.rows[0].documentSections.quotation,'Living Room');
 x.api.moveBy('a',-1);
 assert.deepEqual(Array.from(x.rows.map(r=>r.id)),['b','a','c']);
 assert.ok(x.calls.notes>0&&x.calls.preview>0);
});
test('mobile pointer drag moves a row; desktop drag and arrow controls stay present',()=>{
 const a=row('a','A'),b=row('b','B'),c=row('c','C');
 const x=harness({cart:[a,b,c]});
 x.api.refresh();
 const classList={add(){},remove(){}};
 const firstRow={dataset:{qwbLine:'a'},classList};
 const secondRow={dataset:{qwbLine:'b'},classList,
  getBoundingClientRect:()=>({top:100,height:70})};
 const handle={
  dataset:{qwbDrag:'a'},setPointerCapture(){},hasPointerCapture:()=>false,
  closest:selector=>selector==='[data-qwb-line]'?firstRow:null
 };
 const ev={pointerType:'touch',isPrimary:true,pointerId:6,clientY:50,clientX:20,
  preventDefault(){},target:{closest:selector=>selector==='[data-qwb-drag]'?handle:null}};
 x.events.pointerdown(ev);
 x.state.document.elementFromPoint=()=>({closest:selector=>selector==='[data-qwb-line]'?secondRow:null});
 x.events.pointermove({...ev,clientY:155});
 x.events.pointerup({...ev,clientY:155});
 assert.deepEqual(Array.from(x.rows.map(r=>r.id)),['b','a','c']);
 assert.ok(x.nodes['qwb-selected'].innerHTML.includes('data-qwb-action="up"'));
 assert.ok(x.nodes['qwb-selected'].innerHTML.includes('data-qwb-action="down"'));
 assert.match(css,/touch-action:none/);
 assert.ok(x.events.dragstart&&x.events.dragover&&x.events.drop);
});
test('numeric edits reject invalid discounts and do not change other lines',()=>{
 const a=row('a','A'),b=row('b','B');
 const x=harness({cart:[a,b]});x.api.refresh();
 x.api.editField('a','quantity','3');
 x.api.editField('a','discount','12.5');
 x.api.editField('a','price','89.95');
 x.api.editField('a','discount','110');
 assert.equal(a.quantity,3);assert.equal(a.discount,12.5);assert.equal(a.customPrice,89.95);
 assert.equal(b.quantity,1);assert.equal(b.discount,0);
 assert.match(x.messages.join(' '),/Discount cannot exceed/);
});
test('catalog output escapes item names before inserting HTML',()=>{
 const x=harness({products:[{id:'evil',code:'XX',brand:'Other',class:'Lamp',
  itemName:'<img src=x onerror=alert(1)>',price:1,qty:2}]});
 x.api.refresh();
 assert.doesNotMatch(x.nodes['qwb-results'].innerHTML,/<img src=x onerror=/);
 assert.match(x.nodes['qwb-results'].innerHTML,/&lt;img src=x/);
});


test('manual and replacement item additions refresh existing document notes and group editors',()=>{
 assert.match(index,/closeManualInterestItem\(\);updateCartVisuals\(\);renderProductGrid\(\);renderQuoteItemsNotesForm\(\);updateQuotationPreview\(\)/);
 assert.match(index,/cart\.splice\(index,1,next\);[\s\S]*?renderQuoteItemsNotesForm\(\);[\s\S]*?updateCartVisuals\(\)/);
 assert.match(index,/window\.dispatchEvent\(new Event\("showroom:products-loaded"\)\)/);
});
