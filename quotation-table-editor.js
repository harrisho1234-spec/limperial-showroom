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
let active=null,choices=[],updateTimer=null,installed=false,inline=null,drag=null,addMenuAfter=null;
const SERVICE_TYPES=['Service Fee','Maintenance Fee','Cleaning Fee','Delivery/Installation','Other'];
const table=()=>$('quotation-live-paper')?.querySelector('table:has(thead)')||$('quotation-live-paper')?.querySelector('table');
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
 const selectedService=String(val('name',row?title(row):'Service Fee')).trim();
 if(service)html+='<label class="qtable-field qtable-wide"><span>Service type</span>'+
  '<select data-qtable-service-type aria-label="Choose a service fee">'+
  SERVICE_TYPES.map(name=>'<option value="'+escapeValue(name)+'"'+((name===selectedService||(name==='Other'&&!SERVICE_TYPES.includes(selectedService)))?' selected':'')+'>'+escapeValue(name)+'</option>').join('')+
  '</select></label>';
 html+=addField(set?'Product set (read-only)':service?'Service description (editable)':'Item name',
  'name',val('name',row?title(row):service?'Service Fee':''),{readonly:set,wide:true,maxlength:160});
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
function open(kind,key='',afterKey=null){
 if(!editorEnabled())return;
 const current=active?.kind;
 if(current&&current!=='catalog')active.values={...active.values,...readForm()};
 inline=null;addMenuAfter=null;
 active={kind,key:String(key),afterKey,values:kind==='catalog'&&current==='catalog'?active.values:kind==='service'?{name:'Service Fee',quantity:'1',price:'0',discount:'0'}:{},limit:8,photoData:null};
 decorate();
 if(kind==='catalog')refreshCatalog();
 const field=table()?.querySelector(kind==='catalog'?'[data-qtable-filter="search"]':'[data-qtable-input="name"]');
 field?.focus({preventScroll:true});
}
function cancel(){active=null;inline=null;addMenuAfter=null;decorate()}
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
function numericCell(cell,line,field,value){
 if(!cell)return;
 if(!cell.querySelector('.qtable-original')){
  const original=document.createElement('span');original.className='qtable-original';
  while(cell.firstChild)original.appendChild(cell.firstChild);
  cell.appendChild(original);
 }
 const host=document.createElement('span');host.className='qtable-inline-host';
 host.innerHTML='<input type="number" data-qtable-number="'+field+'" data-qtable-key="'+escapeValue(keyFor(line))+'" aria-label="'+field+'" min="'+(field==='quantity'?1:0)+'" step="'+(field==='quantity'?1:'0.01')+'" value="'+value+'">';
 cell.appendChild(host);
}
function handleNumber(event){
 const input=event.target,field=input.dataset.qtableNumber;if(!field)return;
 const line=rowByKey(input.dataset.qtableKey);if(!line)return;
 const n=Number(input.value);
 if(!input.value.trim()||!Number.isFinite(n)||n<0||
  (field==='quantity'&&(!Number.isInteger(n)||n<1||n>9999))||
  (field==='discount'&&n>100)||(field==='price'&&n>999999999)){
  notice('Enter a valid '+field+'.','error');input.value=field==='price'?unitPrice(line):line[field]||0;return;
 }
 if(field==='price'&&isSet(line))return;
 line[field==='price'?'customPrice':field]=Math.round(n*100)/100;updateDocument();
}
function decorate(){
 const t=table();
 if(!t)return;
 // Only these two document types have an editable quotation-style table.
 if(!editorEnabled()){active=null;return}
 const body=t.tBodies?.[0];if(!body)return;
 body.querySelectorAll('.qtable-action-row,.qtable-panel-row').forEach(el=>el.remove());
 t.querySelectorAll('.qtable-inline-host').forEach(el=>el.remove());
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
  const discountHeader=[...t.tHead?.rows?.[0]?.cells||[]].some(th=>/discount|dis(?:c)?\./i.test(String(th.textContent||'')));
  if(discountHeader) setCellEditable(node.cells[node.cells.length-2],key,'discount');
  numericCell(node.cells[3],line,'quantity',line.quantity||1);
  if(!isSet(line))numericCell(node.cells[4],line,'price',unitPrice(line));
  if(discountHeader)numericCell(node.cells[node.cells.length-2],line,'discount',line.discount||0);
  if(cell){
   const tools=document.createElement('span');
   tools.className='qtable-cell-tools';
   const safe=escapeValue(key);
   tools.innerHTML='<button type="button" data-qtable-edit="'+safe+'" aria-label="Edit '+escapeValue(title(line))+' in quotation">✎ Edit</button>'+
    '<button type="button" data-qtable-move="-1" data-qtable-key="'+safe+'" aria-label="Move row up">↑</button>'+
    '<button type="button" data-qtable-move="1" data-qtable-key="'+safe+'" aria-label="Move row down">↓</button>';
   tools.innerHTML+='<button type="button" data-qtable-drag="'+safe+'" aria-label="Drag row to reorder">⠿</button>';
   cell.appendChild(tools);
   if(!isSet(line)){
    const host=document.createElement('span');host.className='qtable-inline-host';
    host.innerHTML='<input data-qtable-inline data-qtable-existing="'+safe+'" aria-label="Product name or code" autocomplete="off" maxlength="160" value="'+escapeValue(title(line))+'"><span data-qtable-suggestions></span>';
    cell.insertBefore(host,cell.firstChild);
   }
  }
 }
 const cols=headerCount();
 const summary=[...body.rows].find(row=>row.cells?.[0]?.textContent?.includes('Sub Total:'));
 const anchors=matches.length?matches:[{node:null,line:null}];
 for(const {node,line} of anchors){
  const key=line?keyFor(line):'';
  const expanded=addMenuAfter===key;
  const action=document.createElement('tr');action.className='qtable-action-row';
  action.dataset.qtableAnchor=key;
  action.innerHTML='<td colspan="'+cols+'"><div class="qtable-add-wrap">'+
   '<button type="button" class="qtable-add-button" data-qtable-insert="'+escapeValue(key)+'" aria-expanded="'+expanded+'" aria-label="Add an item '+(line?'after '+escapeValue(title(line)):'to quotation')+'">＋ Add item</button>'+
   (expanded?'<div class="qtable-add-menu" role="group" aria-label="Choose item type">'+
    '<div class="qtable-add-title"><strong>Add item '+(line?'below this row':'to quotation')+'</strong>'+
    '<button type="button" data-qtable-menu-close aria-label="Close add item menu">✕</button></div>'+
    '<button type="button" data-qtable-add-kind="catalog"><b>⌕</b><span><strong>Search existing product</strong><small>Find by code, name, brand or category</small></span></button>'+
    '<button type="button" data-qtable-add-kind="manual"><b>✎</b><span><strong>Manual item</strong><small>Enter an item not in the catalog</small></span></button>'+
    '<button type="button" data-qtable-add-kind="service"><b>＋</b><span><strong>Service fee</strong><small>Maintenance, cleaning, delivery / installation or Other</small></span></button>'+
    '</div>':'')+'</div></td>';
  if(node)node.insertAdjacentElement('afterend',action);
  else if(summary)body.insertBefore(action,summary);else body.appendChild(action);
 }
 if(active){
  const panel=document.createElement('tr');panel.className='qtable-panel-row';
  panel.innerHTML='<td colspan="'+cols+'">'+rowEditorHtml()+'</td>';
  const anchor=matches.find(x=>keyFor(x.line)===(active.kind==='edit'?active.key:active.afterKey))?.node;
  if(anchor)anchor.insertAdjacentElement('afterend',panel);
  else if(summary)body.insertBefore(panel,summary);else body.appendChild(panel);
  if(active.kind==='catalog')refreshCatalog();
 }
 if(inline)refreshSuggestions();
}
// Insertion is anchored by stable row ID, so grouped previews and cart order
// cannot accidentally insert beside a different product.
function placeAfter(line,afterKey){
 if(afterKey===null||afterKey===undefined)return;
 const all=rows(),anchor=rowByKey(afterKey);
 const i=all.indexOf(line);if(i<0)return;
 all.splice(i,1);
 all.splice(anchor?all.indexOf(anchor)+1:all.length,0,line);
 if(anchor?.documentSections)line.documentSections={...anchor.documentSections};
 if(anchor&&typeof documentGroupingMode==='function'&&documentGroupingMode()==='discount')line.discount=Number(anchor.discount)||0;
}
function startInline(afterKey=''){
 const key=String(afterKey);
 if(addMenuAfter===key){addMenuAfter=null;decorate();return}
 active=null;inline=null;addMenuAfter=key;decorate();
 table()?.querySelector('.qtable-add-menu [data-qtable-add-kind]')?.focus({preventScroll:true});
}
function inlineHost(){
 return [...table()?.querySelectorAll('.qtable-inline-host')||[]].find(host=>{
  const input=host.querySelector('[data-qtable-inline]');
  return inline?.key?input?.dataset.qtableExisting===inline.key:host.classList.contains('qtable-new-line');
 });
}
function refreshSuggestions(){
 if(!inline)return;
 const host=inlineHost(),box=host?.querySelector('[data-qtable-suggestions]');if(!box)return;
 const q=inline.text.trim().toLowerCase();
 inline.choices=inline.kind==='catalog'&&q?catalog().filter(p=>p&&p.id!=null&&!p.hidden&&catalogMatch(p,q))
  .sort((a,b)=>(String(b.code).toLowerCase()===q)-(String(a.code).toLowerCase()===q)).slice(0,5):[];
 host.querySelectorAll('[data-qtable-kind]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.qtableKind===inline.kind)));
 box.innerHTML=q?'<span class="qtable-suggestions">'+inline.choices.map((p,i)=>
  '<button type="button" data-qtable-suggestion="'+i+'">'+escapeValue(p.code||'')+' · '+escapeValue(p.itemName||'Product')+'<small>'+escapeValue(p.brand||'')+' · '+fmt(p.actualSalesPrice??p.price)+' · '+escapeValue(status(p))+'</small></button>').join('')+
  '<button type="button" data-qtable-use-text>'+escapeValue(inline.key?'Keep text: ':inline.kind==='service'?'Add service: ':'Add manual item: ')+escapeValue(inline.text)+'</button></span>':'';
}
function commitInline(choiceIndex){
 if(!inline||!editorEnabled())return;
 const state=inline,name=state.text.trim().slice(0,160),old=state.key?rowByKey(state.key):null;
 if(!name)return;
 if(state.key&&!old){cancel();return}
 const product=Number.isInteger(choiceIndex)?state.choices[choiceIndex]:null;
 if(Number.isInteger(choiceIndex)&&!product)return;
 if(product?.isSet&&old){notice('Add product sets as a new row.','info');return}
 let target;
 if(product){
  if(product.isSet){
   if(rows().some(x=>x.type==='set'&&String(x.setId||x.id)===String(product.setId||product.id))){notice('This set is already selected. Adjust its quantity instead.');return}
   const before=new Set(rows());toggleCartSelection(product.id);target=rows().find(x=>!before.has(x));
   if(!target)return;
  }else{
   target=catalogCartEntry(window.SeasonalPromos?.view?.(product)||product,old?.id,old?.quantity||1);
   if(old){
    target.rowHeight=old.rowHeight;
    if(old.documentSections){target.documentSections={...old.documentSections};target.discount=old.discount}
    if(old.documentCodes)target.documentCodes={...old.documentCodes};
    rows().splice(rows().indexOf(old),1,target);
   }else rows().push(target);
  }
 }else if(old){
  // Renaming an existing catalog line retains its inventory identity.
  old.item={...old.item,itemName:name};target=old;
 }else{
  // Reuse validated manual/service construction and existing stock semantics.
  inline=null;open(state.kind==='service'?'service':'manual','',state.afterKey);
  active.values={name,quantity:'1',price:'0',discount:'0'};decorate();commit();return;
 }
 if(!old)placeAfter(target,state.afterKey);
 inline=null;active=null;updateDocument();
}
function handleFocus(event){
 const input=event.target;
 if(!input.matches?.('[data-qtable-inline]'))return;
 if(input.dataset.qtableExisting){
  active=null;inline={key:input.dataset.qtableExisting,kind:isService(rowByKey(input.dataset.qtableExisting))?'service':'catalog',text:input.value,choices:[]};
 }
 refreshSuggestions();
}
function handleKey(event){
 if(event.key==='Escape'&&addMenuAfter!==null){event.preventDefault();addMenuAfter=null;decorate();return}
 if(!event.target.closest?.('.qtable-inline-host'))return;
 if(event.key==='Escape'){event.preventDefault();cancel();return}
 if(event.key==='Enter'&&event.target.matches?.('[data-qtable-inline]')&&!event.isComposing){event.preventDefault();commitInline();return}
 if(event.key==='ArrowDown'&&event.target.matches?.('[data-qtable-inline]')){
  event.preventDefault();inlineHost()?.querySelector('[data-qtable-suggestion], [data-qtable-use-text]')?.focus();
 }
}
function handleBlur(event){
 const host=event.target.closest?.('.qtable-inline-host');if(!host||!inline)return;
 // Clicking a suggestion or kind button must complete before blur can commit.
 if(event.relatedTarget&&host.contains(event.relatedTarget))return;
 if(event.target.matches?.('[data-qtable-inline]')&&(!inline.key||inline.text.trim()!==title(rowByKey(inline.key))))commitInline();
}
function pointerDown(event){
 const handle=event.target.closest?.('[data-qtable-drag]');
 if(!handle||event.isPrimary===false||event.button>0)return;
 event.preventDefault();drag={key:handle.dataset.qtableDrag,id:event.pointerId,y:event.clientY,handle,target:null};
 try{handle.setPointerCapture(event.pointerId)}catch(_){}
}
function pointerMove(event){
 if(!drag||event.pointerId!==drag.id||Math.abs(event.clientY-drag.y)<7)return;
 const row=document.elementFromPoint?.(event.clientX,event.clientY)?.closest('tr[data-qtable-key]');
 table()?.querySelectorAll('.qtable-drop').forEach(el=>el.classList.remove('qtable-drop'));
 drag.target=null;
 if(row&&table()?.contains(row)&&row.dataset.qtableKey!==drag.key){
  const rect=row.getBoundingClientRect();drag.target={key:row.dataset.qtableKey,after:event.clientY>rect.top+rect.height/2};row.classList.add('qtable-drop');
 }
 const scroller=$('quotation-live-paper-container'),rect=scroller?.getBoundingClientRect();
 if(rect){if(event.clientY>rect.bottom-32)scroller.scrollTop+=16;if(event.clientY<rect.top+32)scroller.scrollTop-=16}
}
function pointerEnd(event){
 if(!drag||event.pointerId!==drag.id)return;
 const d=drag;drag=null;
 try{d.handle.releasePointerCapture(d.id)}catch(_){}
 table()?.querySelectorAll('.qtable-drop').forEach(el=>el.classList.remove('qtable-drop'));
 if(event.type!=='pointercancel'&&d.target)window.QuotationWorkspace?.moveTo(d.key,d.target.key,d.target.after);
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
 if(!editing)placeAfter(target,active.afterKey);
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
 let target=null;
 if(item.isSet){
  const already=rows().some(x=>x.type==='set'&&String(x.setId||x.id)===String(item.setId||item.id));
  if(already){notice('This set is already selected. Adjust its quantity instead.','info');return}
  const before=new Set(rows());toggleCartSelection(item.id);
  target=rows().find(x=>!before.has(x))||null;
 }else{
  const product=window.SeasonalPromos?.view?.(item)||item;
  target=catalogCartEntry(product);
  rows().push(target);
 }
 if(!target)return;
 placeAfter(target,active?.afterKey);
 if(active?.kind==='catalog')active.afterKey=keyFor(target);
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
 if(target.closest?.('[data-qtable-inline]'))return;
 const insert=target.closest?.('[data-qtable-insert]');
 if(insert){event.preventDefault();startInline(insert.dataset.qtableInsert);return}
 const addKind=target.closest?.('[data-qtable-add-kind]');
 if(addKind){event.preventDefault();open(addKind.dataset.qtableAddKind,'',addMenuAfter);return}
 if(target.closest?.('[data-qtable-menu-close]')){event.preventDefault();addMenuAfter=null;decorate();return}
 if(target.closest?.('[data-qtable-use-text]')){event.preventDefault();commitInline();return}
 const suggestion=target.closest?.('[data-qtable-suggestion]');
 if(suggestion){event.preventDefault();commitInline(Number(suggestion.dataset.qtableSuggestion));return}
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
 if(cell&&!target.closest?.('.row-resizer-handle')&&!target.closest?.('a')&&!target.closest?.('button')&&!target.closest?.('input')){
  event.preventDefault();open('edit',cell.dataset.qtableKey);
 }
}
function handleInput(event){
 if(event.target.matches?.('[data-qtable-inline]')){inline.text=event.target.value;refreshSuggestions();return}
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
function handleServiceType(event){
 const select=event.target;
 if(!select.matches?.('[data-qtable-service-type]')||!active)return;
 const name=table()?.querySelector('.qtable-edit-panel [data-qtable-input="name"]');
 if(!name)return;
 const previous=String(name.value||'');
 const chosen=select.value;
 if(chosen==='Other'){
  if(SERVICE_TYPES.includes(previous))name.value='';
 }else name.value=chosen;
 active.values.name=name.value;
 name.focus({preventScroll:true});
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
 root.querySelectorAll('.qtable-action-row,.qtable-panel-row,.qtable-cell-tools,.qtable-inline-host').forEach(el=>el.remove());
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
 paper.addEventListener('change',handleNumber);
 paper.addEventListener('change',handleServiceType);
 paper.addEventListener('submit',handleSubmit);
 paper.addEventListener('focusin',handleFocus);
 paper.addEventListener('focusout',handleBlur);
 paper.addEventListener('keydown',handleKey);
 paper.addEventListener('pointerdown',pointerDown);
 paper.addEventListener('pointermove',pointerMove);
 paper.addEventListener('pointerup',pointerEnd);
 paper.addEventListener('pointercancel',pointerEnd);
 const original=window.updateQuotationPreview;
 if(typeof original==='function'){
  window.updateQuotationPreview=function(){
   const out=original.apply(this,arguments);
   decorate();
   return out;
  };
 }
 window.QuotationTableEditor={startInline,commitInline,getInline:()=>inline,getAddMenuAfter:()=>addMenuAfter,decorate,open,cancel,cleanClone,commit,selectProduct,move,getActive:()=>active,
  originalRows,formFields,catalogMatch,refreshCatalog,getCatalogChoices:()=>choices.slice()};
 decorate();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();
