const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const src=fs.readFileSync(require.resolve('../quotation-table-editor.js'),'utf8');
const index=fs.readFileSync(require.resolve('../index.html'),'utf8');
const css=fs.readFileSync(require.resolve('../quotation-table-editor.css'),'utf8');

function sampleRow(id,name,price=100){
 return{id,type:'item',item:{id,code:'SKU-'+id,brand:'DELUXE ART',itemName:name,
  description:'Original description',qty:10,price,actualSalesPrice:price},
  quantity:1,discount:0,customPrice:null};
}
function boot(opts={}){
 const calls={notes:0,visuals:0,grid:0,preview:0,draft:0,service:0},messages=[],listeners={};
 const lineRows=opts.rows||[],products=opts.catalog||[];
 const results={innerHTML:'',querySelectorAll:()=>[]};
 const fakeTable={tBodies:[],querySelector:selector=>selector==='[data-qtable-results]'?results:null};
 const paper={querySelector:selector=>selector==='table'?fakeTable:null,
  addEventListener:(name,fn)=>{listeners[name]=fn}};
 const document={
  readyState:'complete',getElementById:id=>id==='quotation-live-paper'?paper:null,
  addEventListener:()=>{}
 };
 let lineCount=5;
 const state={
  window:{updateQuotationPreview:()=>{calls.preview++},ShowroomPhase1:{scheduleDraft:()=>calls.draft++}},
  document,documentType:opts.documentType||'quotation',cart:lineRows,products,
  console,Math,Number,String,Array,Promise,Intl,
  showNotification:(msg,type)=>messages.push({msg,type}),
  renderQuoteItemsNotesForm:()=>{calls.notes++},
  updateCartVisuals:()=>{calls.visuals++},renderProductGrid:()=>{calls.grid++},
  updateQuotationPreview:()=>{calls.preview++},
  addServiceFee:()=>{
   calls.service++;
   lineRows.push({id:'fee-'+(++lineCount),type:'service',
    item:{id:'fee-'+lineCount,code:'SERVICE',brand:'Service Fee',class:'Service',
     itemName:'Service Fee',description:'',qty:999999,price:0,actualSalesPrice:0},
    quantity:1,discount:0,customPrice:null});
  },
  newCartLineId:()=>('line-'+(++lineCount)),
  catalogCartEntry:(item)=>({id:'line-'+(++lineCount),item:{...item},quantity:1,
    discount:0,customPrice:null}),
  getActualSalesPrice:item=>Number(item?.actualSalesPrice??item?.price)||0,
  resolveGoogleDriveImg:src=>src||'',
  getDisplayCategory:item=>item.class||'Other'
 };
 vm.runInNewContext(src,state,{timeout:1000});
 return{state,calls,messages,listeners,results,paper,fakeTable,rows:lineRows,api:state.window.QuotationTableEditor};
}
function setForm(api,kind,fields,key=''){
 api.open(kind,key);
 Object.assign(api.getActive().values,fields);
 return api;
}
test('inline quotation table editor loads only for quotation / Sales Order',()=>{
 const q=boot(),s=boot({documentType:'sales_order'});
 assert.ok(q.api&&s.api);
 assert.match(index,/quotation-table-editor\.js\?v=/);
 assert.match(index,/quotation-table-editor\.css\?v=/);
 assert.match(src,/\['quotation','sales_order'\]\.includes\(documentType\)/);
 for(const event of ['click','input','change','submit'])assert.equal(typeof q.listeners[event],'function');
});
test('manual item is added directly with amount, quantity, discount and description without stock changes',()=>{
 const a=boot();
 setForm(a.api,'manual',{name:'Custom Crystal Light',brand:'Asfour',code:'CUSTOM-7',
   quantity:'2',price:'499.95',discount:'10',description:'For living room'});
 a.api.commit();
 assert.equal(a.rows.length,1);
 const row=a.rows[0];
 assert.equal(row.item.manualItem,true);
 assert.equal(row.type,'service');
 assert.equal(row.item.itemName,'Custom Crystal Light');
 assert.equal(row.item.description,'For living room');
 assert.equal(row.item.code,'CUSTOM-7');
 assert.equal(row.item.brand,'Asfour');
 assert.equal(row.quantity,2);
 assert.equal(row.customPrice,499.95);
 assert.equal(row.discount,10);
 assert.equal(row.item.qty,0,'manual items should not change stock');
 assert.ok(a.calls.notes>0&&a.calls.visuals>0&&a.calls.preview>0);
});
test('service fees use the original addServiceFee flow and can be entered in the table',()=>{
 const a=boot({documentType:'sales_order'});
 setForm(a.api,'service',{name:'Installation Service',quantity:'1',price:'250',
  discount:'0',description:'Onsite installation'});
 a.api.commit();
 assert.equal(a.calls.service,1);
 assert.equal(a.rows[0].type,'service');
 assert.equal(a.rows[0].item.itemName,'Installation Service');
 assert.equal(a.rows[0].item.description,'Onsite installation');
 assert.equal(a.rows[0].customPrice,250);
});
test('existing catalog row can be renamed, re-priced and discounted in this document only',()=>{
 const original={id:'catalog-1',code:'CHA-01',itemName:'Chandelier',description:'Catalog original',
   brand:'DELUXE ART',qty:5,price:2400,actualSalesPrice:2400};
 const row={id:'row-1',item:original,quantity:1,discount:0,customPrice:null};
 const b=boot({rows:[row],catalog:[original]});
 setForm(b.api,'edit',{name:'Chandelier for Lobby',quantity:'3',price:'2200',
  discount:'12.5',description:'Height 120 cm'},'row-1');
 b.api.commit();
 assert.equal(row.item.itemName,'Chandelier for Lobby');
 assert.equal(row.item.description,'Height 120 cm');
 assert.equal(row.customPrice,2200);
 assert.equal(row.quantity,3);
 assert.equal(row.discount,12.5);
 assert.equal(original.itemName,'Chandelier');
 assert.equal(original.description,'Catalog original');
 assert.equal(original.price,2400);
 assert.equal(b.rows.length,1);
 assert.equal(b.api.getActive(),null);
});
test('manual line edits retain photo and product code unless explicitly changed',()=>{
 const original=sampleRow('manual-x','Handmade Sconce',50);
 original.type='service';original.item.manualItem=true;
 original.item.imgLink='data:image/jpeg;base64,AAA';
 const b=boot({rows:[original]});
 setForm(b.api,'edit',{name:'Special Sconce',quantity:'1',price:'75',
  discount:'5',description:'New size',code:'CUSTOM-X',brand:'Workshop'},'manual-x');
 b.api.commit();
 assert.equal(original.item.imgLink,'data:image/jpeg;base64,AAA');
 assert.equal(original.item.code,'CUSTOM-X');
 assert.equal(original.item.brand,'Workshop');
 assert.equal(original.item.itemName,'Special Sconce');
});
test('invalid blank, out-of-range quantity, price or discount must not modify cart',()=>{
 const a=boot({rows:[sampleRow('old','Lamp',500)]});
 const bad=[
 {name:'',quantity:'1',price:'100',discount:'0'},
 {name:'Lamp',quantity:'0',price:'100',discount:'0'},
 {name:'Lamp',quantity:'1.5',price:'100',discount:'0'},
 {name:'Lamp',quantity:'1',price:'-1',discount:'0'},
 {name:'Lamp',quantity:'1',price:'10',discount:'120'},
 {name:'Lamp',quantity:'1',price:'',discount:'0'}
 ];
 for(const fields of bad){setForm(a.api,'edit',fields,'old');a.api.commit()}
 assert.equal(a.rows[0].quantity,1);
 assert.equal(a.rows[0].discount,0);
 assert.equal(a.rows[0].customPrice,null);
 assert.ok(a.messages.length>=6);
});
test('set bundles allow quantity and discount without overwriting component pricing',()=>{
 const bundle={id:'set-row',type:'set',setName:'Living Room Bundle',
  quantity:1,discount:0,customPrice:null,items:[{item:{id:'a',price:300},quantity:2}]};
 const a=boot({rows:[bundle]});
 setForm(a.api,'edit',{quantity:'2',discount:'7.5',price:'99999'},'set-row');
 a.api.commit();
 assert.equal(bundle.quantity,2);
 assert.equal(bundle.discount,7.5);
 assert.equal(bundle.customPrice,null);
 assert.equal(bundle.items[0].item.price,300);
});
test('catalog search filters existing products and adds as a separate quotation line',()=>{
 const catalog=[{id:'A',code:'A-1',brand:'Asfour',itemName:'Crystal Chandelier',class:'Lighting',
  description:'40 cm crystal light',qty:3,price:500,actualSalesPrice:500},
 {id:'B',code:'B-1',brand:'Deluxe',itemName:'Round Table',class:'Table',
  description:'Wood',qty:0,price:1000,actualSalesPrice:1000}];
 const a=boot({catalog});
 setForm(a.api,'catalog',{search:'crystal',brand:'Asfour'});
 a.api.refreshCatalog();
 assert.equal(a.api.getCatalogChoices().length,1);
 assert.equal(a.api.getCatalogChoices()[0].id,'A');
 assert.match(a.results.innerHTML,/Crystal Chandelier/);
 a.api.selectProduct(0);
 assert.equal(a.rows.length,1);
 assert.equal(a.rows[0].item.code,'A-1');
 a.api.selectProduct(0);
 assert.equal(a.rows.length,2);
 assert.notEqual(a.rows[0].id,a.rows[1].id);
});
test('export and print use a scrubbed copy that excludes all editable table controls',()=>{
 assert.match(index,/QuotationTableEditor\?\.cleanClone\(exportPaper\)/);
 assert.match(index,/QuotationTableEditor\?\.cleanClone\(previewPaper\.cloneNode\(true\)\)/);
 assert.match(src,/\.qtable-action-row,\.qtable-panel-row,\.qtable-cell-tools/);
 assert.match(css,/@media print/);
 const deleted=[];
 const fake={
  querySelectorAll:sel=>{
   if(sel==='.qtable-editable')return[{classList:{remove:()=>deleted.push('class')}}];
   return[{remove:()=>deleted.push('toolbar')},{remove:()=>deleted.push('input')}];
  }
 };
 const a=boot();
 const returned=a.api.cleanClone(fake);
 assert.equal(returned,fake);
 assert.deepEqual(deleted,['toolbar','input','class']);
});
test('preview row index mapping skips section and subtotal headings in grouped quotes',()=>{
 const a=boot();
 const rows=[sampleRow('a','First'),sampleRow('b','Second')];
 a.state.cart=rows;
 a.state.planDocumentGroups=()=>[{items:rows}];
 a.state.documentGroupingMode=()=> 'none';
 a.state.documentNoDiscountStyle=()=> 'plain';
 a.state.discountPctValue=0;
 const cell=(txt)=>({textContent:String(txt)});
 const tr=(texts)=>({cells:texts.map(cell)});
 const body={rows:[
  tr(['Ground Floor']),
  tr(['1','Product 1','img','1','$10','$10','$10']),
  tr(['Group subtotal']),
  tr(['2','Product 2','img','1','$20','$20','$20']),
  tr(['Sub Total:'])
 ]};
 const selected=a.api.originalRows(body);
 assert.equal(selected.length,2);
 assert.equal(selected[0].line,rows[0]);
 assert.equal(selected[1].line,rows[1]);
});
