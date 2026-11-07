/* In-table quotation / Sales Order editing. Edits the existing cart only;
   never mutates the master catalog, stock, or customer records. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const escapeValue=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'' :'&#39;'}[ch]));
const keyFor=row=>String(row?.id??row?.item?.id??'');
const editorEnabled=()=>typeof documentType!=='undefined'&&['quotation','sales_order'].includes(documentType);
const rows=()=>typeof cart!=='undefined'&&Array.isArray(cart)?cart:[];
const catalog=()=>typeof products!=='undefined'&&Array.isArray(products)?products:[];
const fmt=amount=>'$'+(Number(amount)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
let active=null,choices=[],updateTimer=null,installed=false;
const table=()=>$('quotation-live-paper')?.querySelector('table');
const headerCount=()=>table()?.tHead?.rows?.[0]?.cells?.length||7;
const rowByKey=key=>rows().find(row=>keyFor(row)===String(key));
const description=row=>row?.type==='set'?'Product set':row?.item?.description||'';
const title=row=>row?.type==='set'?String(row.setName||'Product Set'):String(row?.item?.itemName||'Item');
const isManual=row=>!!row?.item?.manualItem;
const isService=row=>row?.type==='service'&&!isManual(row);
const isSet=row=>row?.type==='set';
function category(item){
 try{if(typeof getDisplayCategory==='function')return String(getDisplayCategory(item)||item?.class||'Other')}catch(_){}
 return String(item?.class||'Other');
}
function unitPrice(row){
 if(row?.customPrice!==null&&row?.customPrice!==undefined)return Number(row.customPrice)||0;
 if(isSet(row)){
  const components=(row.items||[]).reduce((sum,x)=>sum+(Number(x?.item?.actualSalesPrice??x?.item?.price??0)||0)*(Number(x?.quantity)||1),0);
  try{if(typeof getSetBasePrice==='function')return Number(getSetBasePrice(row,components))||0}catch(_){}
  return Number(row.setPrice??row.price)||0;
 }
 const item=row?.item||{};
 try{if(typeof getActualSalesPrice==='function')return Number(getActualSalesPrice(item))||0}catch(_){}
 return Number(item.actualSalesPrice??item.price)||0;
}
function notice(message,type='info'){if(typeof showNotification==='function')showNotification(message,type)}
function addField(label,name,value,options={}){
 const text=String(value??'');
 const attrs=' data-qtable-input="'+escapeValue(name)+'"';
 const caption='<span>'+escapeValue(label)+'</span>';
 if(options.readonly)return '<label class="qtable-field">'+caption+'<div class="qtable-readonly">'+escapeValue(text)+'</div></label>';
 if(options.multiline)return '<label class="qtable-field qtable-wide">'+caption+'<textarea rows="2" maxlength="'+(options.maxlength||1000)+'"'+attrs+'>'+escapeValue(text)+'</textarea></label>';
 const type=options.type||'text',max=options.maxlength?' maxlength="'+options.maxlength+'"':'',
 min=type==='number'?' min="0"':'',
 step=type==='number'?' step="'+(options.step||'0.01')+'"':'';
 return '<label class="qtable-field'+(options.wide?' qtable-wide':'')+'">'+caption+
  '<input type="'+type+'"'+attrs+min+step+max+' value="'+escapeValue(text)+'"></label>';
}
function formFields(kind,row){
 const manual=kind==='manual'||isManual(row),service=kind==='service'||isService(row),set=isSet(row);
 const item=row?.item||{};
 const form=active?.values||{};
 const val=(key,defaultValue)=>Object.prototype.hasOwnProperty.call(form,key)?form[key]:defaultValue;
 let html='';
 html+=addField(set?'Product set (read-only)':'Item name', 'name',val('name',row?title(row):service?'Service Fee':''),{readonly:set,wide:true,maxlength:160});
 if(!service&&!set){
   html+=addField('Brand','brand',val('brand',item.brand||''),{readonly:!manual,maxlength:100});
   html+=addField('Code','code',val('code',item.code==='MANUAL'?'':item.code||''),{readonly:!manual,maxlength:100});
 }
 html+=addField('Quantity','quantity',val('quantity',row?.quantity||1),{type:'number',step:'1'});
 html+=addField('Unit price ($)','price',val('price',unitPrice(row)),{readonly:set,type:'number'});
 html+=addField('Discount (%)','discount',val('discount',row?.discount||0),{type:'number'});
 if(!set)html+=addField('Description / specifications','description',val('description',item.description||''),{multiline:true});
 if(manual){
  html+='<label class="qtable-field qtable-wide"><span>Photo (optional) · Upload here or edit later</span>'+
   '<input type="file" accept="image/*" data-qtable-photo>'+
   '</label>';
  if(active?.photoData||item.imgLink)html+='<div class="qtable-photo-status">Photo '+(active?.photoData?'selected':'already attached')+
    ' · <button type="button" data-qtable-clear-photo>Remove photo</button></div>';
 }
 return html;
}
function catalogFields(){
 const state=active||{},data=state.values||{};
 const brands=[...new Set(catalog().map(x=>String(x?.brand||'').trim()).filter(Boolean))].sort();
 const cats=[...new Set(catalog().map(category).filter(Boolean))].sort();
 const select=(field,all,values)=>{
  const current=String(data[field]||'');
  return '<select data-qtable-filter="'+field+'" aria-label="'+all+'"><option value="">'+all+'</option>'+
   values.map(x=>'<option value="'+escapeValue(x)+'"'+(x===current?' selected':'')+'>'+escapeValue(x)+'</option>').join('')+'</select>';
 };
 return '<div class="qtable-catalog-filters">'+
  '<input type="search" data-qtable-filter="search" autocomplete="off" placeholder="Search code, name, brand, description..." value="'+escapeValue(data.search||'')+'" aria-label="Search catalog in quotation table">'+
  select('brand','All brands',brands)+select('category','All categories',cats)+
  select('stock','All stock',['In stock','Pre-order','No stock'])+
  '</div><div class="qtable-catalog-results" data-qtable-results></div>';
}
function rowEditorHtml(){
 if(!active)return '';
 const kind=active.kind;
 const line=kind==='edit'?rowByKey(active.key):null;
 if(kind==='edit'&&!line)return '';
 const titleText=kind==='edit'?'Edit this quotation row':kind==='catalog'?'Add existing catalog product':
   kind==='manual'?'Add a manual item':'Add a service fee';
 let content=kind==='catalog'?catalogFields():
  '<form data-qtable-form><div class="qtable-form-grid">'+formFields(kind,line)+'</div>'+
   '<p class="qtable-disclaimer">Changes affect this quotation / Sales Order only, not master product data or stock.</p>'+
   '<div class="qtable-form-buttons"><button type="submit" class="qtable-primary">'+(kind==='edit'?'Save changes':'Add to table')+'</button>'+
   '<button type="button" data-qtable-cancel>Cancel</button></div></form>';
 if(kind==='catalog')content+='<div class="qtable-form-buttons"><button type="button" data-qtable-cancel>Close product picker</button></div>';
 return '<div class="qtable-edit-panel"><div class="qtable-edit-heading"><b>'+titleText+
   '</b><button type="button" data-qtable-cancel aria-label="Close editor">✕</button></div>'+
   content+'</div>';
}
function readForm(){
 const root=table()?.querySelector('.qtable-edit-panel');
 if(!root)return {};
 const data={};
 root.querySelectorAll('[data-qtable-input]').forEach(input=>{data[input.dataset.qtableInput]=input.value});
 return data;
}
function open(kind,key=''){
 if(!editorEnabled())return;
 const current=active?.kind;
 if(current&&current!=='catalog')active.values={...active.values,...readForm()};
 active={kind,key:String(key),values:kind==='catalog'&&current==='catalog'?active.values:{},limit:8,photoData:null};
 decorate();
 if(kind==='catalog')refreshCatalog();
 const field=table()?.querySelector(kind==='catalog'?'[data-qtable-filter="search"]':'[data-qtable-input="name"]');
 field?.focus({preventScroll:true});
}
function cancel(){active=null;decorate()}
function catalogMatch(product,query){
 const words=query.toLowerCase().split(/\s+/).filter(Boolean);
 const haystack=[product?.code,product?.itemName,product?.brand,product?.description,product?.keyMaterial,product?.class,product?.subclass]
  .map(x=>String(x||'')).join(' ').toLowerCase();
 return words.every(word=>haystack.includes(word));
}
function status(product){
 const qty=Number(product?.qty)||0;
 if(qty>0)return 'In stock';
 return product?.preorderAvailable?'Pre-order':'No stock';
}
function refreshCatalog(){
 if(!active||active.kind!=='catalog')return;
 const container=table()?.querySelector('[data-qtable-results]');if(!container)return;
 const filters=active.values||{};
 const query=String(filters.search||'').trim();
 const brand=String(filters.brand||''),cat=String(filters.category||''),stock=String(filters.stock||'');
 const all=catalog().filter(x=>x&&x.id!=null&&(!brand||String(x.brand||'')===brand)&&
  (!cat||category(x)===cat)&&(!stock||status(x)===stock)&&catalogMatch(x,query));
 if(query){
  const lowered=query.toLowerCase();
  all.sort((a,b)=>{
   const relevance=x=>{
    const code=String(x.code||'').toLowerCase(),name=String(x.itemName||'').toLowerCase();
    return (code===lowered?100:code.startsWith(lowered)?50:0)+(name.startsWith(lowered)?25:0);
   };
   return relevance(b)-relevance(a);
  });
 }
 choices=all.slice(0,Math.max(8,active.limit||8));
 container.innerHTML=all.length?'<div class="qtable-result-count">'+all.length+' matching products</div>'+
  choices.map((item,i)=>{
   const image=(()=>{try{const src=resolveGoogleDriveImg(item.imgLink||'');return /^https:\/\//i.test(src)?'<img src="'+escapeValue(src)+'" alt="" loading="lazy">':''}catch(_){return ''}})();
   return '<div class="qtable-catalog-product">'+image+'<div><b>'+escapeValue(item.itemName||'Product')+'</b>'+
    '<small>'+escapeValue(item.code||'')+' · '+escapeValue(item.brand||'')+
    ' · '+escapeValue(status(item))+' · '+fmt(item.actualSalesPrice??item.price)+'</small></div>'+
    '<button type="button" data-qtable-pick="'+i+'">+ Add</button></div>';
  }).join('')+
  (all.length>choices.length?'<button type="button" data-qtable-more>Show more ('+(all.length-choices.length)+' remaining)</button>':'')
  :'<p>No matching products. Adjust the search or filters.</p>';
}
function lineMap(){
 const all=rows();
 try{
  if(typeof planDocumentGroups==='function'){
    const groups=planDocumentGroups(all,documentGroupingMode(),Number(discountPctValue)||0,documentNoDiscountStyle());
    return groups.flatMap(g=>g.items);
  }
 }catch(e){console.warn('Quotation table grouping unavailable',e)}
 return all;
}
function originalRows(tbody){
 const ordered=lineMap(),matched=[];
 let index=0;
 for(const row of [...tbody.rows]){
  const cells=row.cells;
  if(!cells||cells.length<6)continue;
  const expected=String(index+1);
  const actual=String(cells[0]?.textContent||'').trim();
  if(actual!==expected)continue;
  const cartRow=ordered[index++];
  if(!cartRow)break;
  matched.push({node:row,line:cartRow});
 }
 return matched;
}
function setCellEditable(cell,key,field){
 if(!cell)return;
 cell.classList.add('qtable-editable');
 cell.dataset.qtableKey=key;
 cell.dataset.qtableField=field;
 cell.title='Tap to edit '+field+' in this quotation';
}
function decorate(){
 const t=table();
 if(!t)return;
 // Only these two document types have an editable quotation-style table.
 if(!editorEnabled()){active=null;return}
 const body=t.tBodies?.[0];if(!body)return;
 body.querySelectorAll('.qtable-action-row,.qtable-panel-row').forEach(el=>el.remove());
 t.querySelectorAll('.qtable-cell-tools').forEach(el=>el.remove());
 t.querySelectorAll('.qtable-editable').forEach(el=>{
  el.classList.remove('qtable-editable');delete el.dataset.qtableKey;delete el.dataset.qtableField;
 });
 t.querySelectorAll('[data-qtable-key]').forEach(el=>{if(el.tagName==='TR')delete el.dataset.qtableKey});
 const matches=originalRows(body);
 for(const {node,line} of matches){
  const key=keyFor(line),cell=node.cells[1];
  node.dataset.qtableKey=key;
  setCellEditable(cell,key,'description');
  setCellEditable(node.cells[3],key,'quantity');
  setCellEditable(node.cells[4],key,'price');
  if(node.cells.length>=8) setCellEditable(node.cells[node.cells.length-2],key,'discount');
  if(cell){
   const tools=document.createElement('span');
   tools.className='qtable-cell-tools';
   const safe=escapeValue(key);
   tools.innerHTML='<button type="button" data-qtable-edit="'+safe+'" aria-label="Edit '+escapeValue(title(line))+' in quotation">✎ Edit</button>'+
    '<button type="button" data-qtable-move="-1" data-qtable-key="'+safe+'" aria-label="Move row up">↑</button>'+
    '<button type="button" data-qtable-move="1" data-qtable-key="'+safe+'" aria-label="Move row down">↓</button>';
   cell.appendChild(tools);
  }
 }
 const cols=headerCount();
 const action=document.createElement('tr');
 action.className='qtable-action-row';
 action.innerHTML='<td colspan="'+cols+'"><div class="qtable-action-content">'+
  '<strong>Build directly in this table</strong>'+
  '<button type="button" data-qtable-open="catalog">+ Existing Product</button>'+
  '<button type="button" data-qtable-open="manual">+ Manual Item</button>'+
  '<button type="button" data-qtable-open="service">+ Service Fee</button></div></td>';
 const summary=[...body.rows].find(row=>row.cells?.[0]?.textContent?.includes('Sub Total:'));
 if(summary)body.insertBefore(action,summary);else body.appendChild(action);
 if(active){
  const panel=document.createElement('tr');
  panel.className='qtable-panel-row';
  panel.innerHTML='<td colspan="'+cols+'">'+rowEditorHtml()+'</td>';
  action.insertAdjacentElement('afterend',panel);
  if(active.kind==='catalog')refreshCatalog();
 }
}
function commit(){
 if(!active||active.kind==='catalog')return;
 const kind=active.kind,editing=kind==='edit',line=editing?rowByKey(active.key):null;
 if(editing&&!line){notice('The selected line is no longer available.','error');cancel();return}
 const input={...active.values,...readForm()};
 const set=editing&&isSet(line),manual=kind==='manual'||isManual(line),service=kind==='service'||isService(line);
 const name=set?title(line):String(input.name||'').trim().slice(0,160);
 const quantity=Number(input.quantity),price=Number(input.price),discount=Number(input.discount);
 if(!name){notice('Please enter an item or service name.','error');return}
 if(!Number.isInteger(quantity)||quantity<1||quantity>9999){
  notice('Quantity must be a whole number from 1 to 9999.','error');return
 }
 if(!set&&(!String(input.price??'').trim()||!Number.isFinite(price)||price<0||price>999999999)){
  notice('Enter a valid unit price.','error');return
 }
 if(!String(input.discount??'').trim()||!Number.isFinite(discount)||discount<0||discount>100){
  notice('Discount must be between 0 and 100%.','error');return
 }
 const cents=amount=>Math.round(amount*100)/100;
 let target=line;
 if(!editing){
  if(kind==='service'){
   addServiceFee();
   target=rows().at(-1);
  }else{
   const id=newCartLineId();
   target={id,type:'service',item:{id:'manual-'+id,manualItem:true,code:'MANUAL',
    brand:'Other',class:'Manual',itemName:'',description:'',qty:0,
    price:0,actualSalesPrice:0,salesPrice:0,costing:0,margin:0,
    location:'Not in Catalog',imgLink:''},
    quantity:1,discount:0,customPrice:0,rowHeight:90,forcePreorder:false};
   rows().push(target);
  }
 }
 if(set){
   target.quantity=quantity;target.discount=cents(discount);
 }else{
   // Item is cloned so no mutation can leak into the master catalog objects.
   target.item={...target.item,itemName:name,description:String(input.description||'').slice(0,1000)};
   if(manual){
    target.item.brand=String(input.brand||'').trim().slice(0,100)||'Other';
    target.item.code=String(input.code||'').trim().slice(0,100)||'MANUAL';
    target.item.manualItem=true;
    if(active.photoData!==null&&active.photoData!==undefined)target.item.imgLink=active.photoData;
   }
   target.quantity=quantity;
   target.customPrice=cents(price);
   target.discount=cents(discount);
 }
 active=null;updateDocument();
 notice(editing?'Quotation row updated.':'Item added to quotation.','success');
}
function updateDocument(){
 if(typeof renderQuoteItemsNotesForm==='function')renderQuoteItemsNotesForm();
 if(typeof updateCartVisuals==='function')updateCartVisuals();
 if(typeof renderProductGrid==='function')renderProductGrid();
 if(typeof updateQuotationPreview==='function')updateQuotationPreview();
 window.ShowroomPhase1?.scheduleDraft?.();
}
function selectProduct(index){
 const item=choices[Number(index)];
 if(!item)return;
 if(item.isSet){
   const already=rows().some(x=>x.type==='set'&&String(x.setId||x.id)===String(item.setId||item.id));
   if(already){notice('This set is already selected. Adjust its quantity instead.','info');return}
   toggleCartSelection(item.id);
 }else{
   const product=window.SeasonalPromos?.view?.(item)||item;
   rows().push(catalogCartEntry(product));
 }
 // Keep picker open to add several catalog items without reopening.
 updateDocument();
 notice('Product added to quotation.','success');
}
function move(key,direction){
 if(window.QuotationWorkspace?.moveBy)return window.QuotationWorkspace.moveBy(key,direction);
 const all=rows(),i=all.findIndex(x=>keyFor(x)===key),j=i+direction;
 if(i<0||j<0||j>=all.length)return;
 [all[i],all[j]]=[all[j],all[i]];
 updateDocument();
}
function handleClick(event){
 if(!editorEnabled())return;
 const target=event.target;
 const pick=target.closest?.('[data-qtable-pick]');
 if(pick){event.preventDefault();selectProduct(pick.dataset.qtablePick);return}
 if(target.closest?.('[data-qtable-more]')){
  if(active){active.limit=(active.limit||8)+8;refreshCatalog()}return;
 }
 if(target.closest?.('[data-qtable-cancel]')){event.preventDefault();cancel();return}
 if(target.closest?.('[data-qtable-clear-photo]')){
  if(active){active.photoData='';decorate()}return;
 }
 const action=target.closest?.('[data-qtable-open]');
 if(action){event.preventDefault();open(action.dataset.qtableOpen);return}
 const moving=target.closest?.('[data-qtable-move]');
 if(moving){event.preventDefault();move(String(moving.dataset.qtableKey),Number(moving.dataset.qtableMove));return}
 const edit=target.closest?.('[data-qtable-edit]');
 if(edit){event.preventDefault();open('edit',edit.dataset.qtableEdit);return}
 const cell=target.closest?.('td.qtable-editable');
 if(cell&&!target.closest?.('.row-resizer-handle')&&!target.closest?.('a')&&!target.closest?.('button')){
  event.preventDefault();open('edit',cell.dataset.qtableKey);
 }
}
function handleInput(event){
 if(!active)return;
 const target=event.target;
 const filter=target.dataset.qtableFilter;
 if(filter){
  active.values[filter]=target.value;
  if(filter==='search'){
   clearTimeout(updateTimer);updateTimer=setTimeout(()=>{if(active?.kind==='catalog')refreshCatalog()},90);
  }else if(active.kind==='catalog')refreshCatalog();
 }else if(target.dataset.qtableInput)active.values[target.dataset.qtableInput]=target.value;
}
function handleSubmit(event){
 if(!event.target.matches?.('[data-qtable-form]'))return;
 event.preventDefault();commit();
}
async function handlePhoto(event){
 const input=event.target;if(!input.matches?.('[data-qtable-photo]')||!active)return;
 const file=input.files?.[0];if(!file)return;
 if(!file.type.startsWith('image/')||file.size>12000000){notice('Choose an image smaller than 12 MB.','error');return}
 const url=URL.createObjectURL(file),img=new Image(),editor=active;
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});
  const scale=Math.min(1,640/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  const photo=canvas.toDataURL('image/jpeg',0.6);
  if(photo.length>120000)throw Error('Photo remains too large after compression');
  if(active===editor){active.photoData=photo;active.values={...active.values,...readForm()};decorate()}
 }catch(e){notice(e.message||'Unable to read photo.','error')}
 finally{URL.revokeObjectURL(url)}
}
function cleanClone(root){
 if(!root)return root;
 root.querySelectorAll('.qtable-action-row,.qtable-panel-row,.qtable-cell-tools').forEach(el=>el.remove());
 root.querySelectorAll('.qtable-editable').forEach(el=>el.classList.remove('qtable-editable'));
 return root;
}
function install(){
 if(installed)return;installed=true;
 const paper=$('quotation-live-paper');
 if(!paper)return;
 paper.addEventListener('click',handleClick);
 paper.addEventListener('input',handleInput);
 paper.addEventListener('change',handlePhoto);
 paper.addEventListener('submit',handleSubmit);
 const original=window.updateQuotationPreview;
 if(typeof original==='function'){
  window.updateQuotationPreview=function(){
   const out=original.apply(this,arguments);
   decorate();
   return out;
  };
 }
 window.QuotationTableEditor={decorate,open,cancel,cleanClone,commit,selectProduct,move,getActive:()=>active,
  originalRows,formFields, catalogMatch};
 decorate();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();