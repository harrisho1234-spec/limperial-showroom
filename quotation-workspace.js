/* L'Imperial quotation / Sales Order in-modal product picker and arranger.
   Uses the existing cart, product catalog, pricing, manual-item and service
   routines. Does not create another catalog, customer record or data store. */
(function(){
'use strict';
const ROOT='quotation-workspace';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const cartRows=()=>typeof cart!=='undefined'&&Array.isArray(cart)?cart:[];
const catalog=()=>typeof products!=='undefined'&&Array.isArray(products)?products:[];
const docEnabled=()=>typeof documentType!=='undefined'&&['quotation','sales_order'].includes(documentType);
const keyOf=row=>String(row?.id??row?.item?.id??'');
const money=amount=>'$'+(Number(amount)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const groupMode=()=>$('doc-group-mode')?.value||'none';
let resultItems=[],limit=12,searchTimer=null,dragKey='',touchDrag=null,dragOver=null,renderScheduled=false;

function imageUrl(value){
  let src=String(value||'');
  try{if(typeof resolveGoogleDriveImg==='function')src=resolveGoogleDriveImg(src)||src}catch(_){}
  return /^https:\/\//i.test(src)||/^data:image\/(?:jpeg|png|webp);base64,/i.test(src)?src:'';
}
function thumb(src){
  const uri=imageUrl(src);
  return uri?'<img class="qwb-thumb" loading="lazy" alt="" src="'+esc(uri)+'">':
    '<div class="qwb-thumb qwb-no-photo" aria-hidden="true">✧</div>';
}
function category(item){
  try{if(typeof getDisplayCategory==='function')return String(getDisplayCategory(item)||item.class||'Other')}
  catch(_){}
  return String(item?.class||'Other');
}
function stockStatus(item){
  if(Number(item?.qty||0)>0)return 'in';
  return item?.preorderAvailable?'preorder':'out';
}
function statusLabel(item){
  const qty=Number(item?.qty||0);
  return qty>0?'Stock '+qty:item?.preorderAvailable?'Pre-order':'No stock';
}
function itemPrice(item){
  try{if(typeof getActualSalesPrice==='function')return Number(getActualSalesPrice(item))||0}catch(_){}
  return Number(item?.actualSalesPrice??item?.price??0)||0;
}
function linePrice(row){
  if(row?.customPrice!==null&&row?.customPrice!==undefined)return Number(row.customPrice)||0;
  if(row?.type==='set')return Number(row.setPrice??row.price??0)||0;
  return itemPrice(row?.item);
}
function label(row){
  return row?.type==='set' ? String(row.setName||'Product Set') :
   String(row?.item?.itemName||(row?.type==='service'?'Service Fee':'Item'));
}
function active(){
  const modal=$('share-modal');
  return !!modal&&docEnabled()&&!modal.classList.contains('pointer-events-none');
}
function isVisible(){
  return !!$(ROOT)&&active();
}
function selectOptions(el,values){
  if(!el)return;
  const old=el.value;
  el.innerHTML='<option value="">'+(el.id==='qwb-brand'?'All brands':'All categories')+'</option>'+
   values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  el.value=values.includes(old)?old:'';
}
function refreshFilters(){
  const items=catalog().filter(x=>!x?.hidden);
  const unique=map=>[...new Set(items.map(map).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  selectOptions($('qwb-brand'),unique(x=>String(x.brand||'').trim()));
  selectOptions($('qwb-category'),unique(category));
}
function searchMatches(item,query){
  if(!query)return 1;
  const words=query.toLowerCase().split(/\s+/).filter(Boolean);
  const text=[item.code,item.itemName,item.brand,item.class,item.subclass,item.keyMaterial,item.description,
    item.location].map(v=>String(v||'')).join(' ').toLowerCase();
  return words.every(w=>text.includes(w))?1:0;
}
function renderResults(){
  const box=$('qwb-results');
  if(!box)return;
  const q=String($('qwb-search')?.value||'').trim();
  const brand=$('qwb-brand')?.value||'';
  const cat=$('qwb-category')?.value||'';
  const stock=$('qwb-stock')?.value||'';
  const sort=$('qwb-sort')?.value||'suggested';
  let matches=catalog().filter(p=>p&&p.id!==undefined&&(!brand||p.brand===brand)&&
    (!cat||category(p)===cat)&&(!stock||stockStatus(p)===stock)&&searchMatches(p,q));
  if(q)matches.sort((a,b)=>{
    const score=item=>{
      const code=String(item.code||'').toLowerCase(),name=String(item.itemName||'').toLowerCase(),term=q.toLowerCase();
      return (code===term?100:code.startsWith(term)?60:0)+(name.startsWith(term)?35:0);
    };
    return score(b)-score(a);
  });
  if(sort==='name')matches.sort((a,b)=>String(a.itemName||'').localeCompare(String(b.itemName||'')));
  if(sort==='price-low')matches.sort((a,b)=>itemPrice(a)-itemPrice(b));
  if(sort==='price-high')matches.sort((a,b)=>itemPrice(b)-itemPrice(a));
  const count=matches.length;
  resultItems=matches.slice(0,Math.max(12,limit));
  const allSelected=new Set(cartRows().filter(x=>x.type!=='service').map(x=>String(x.item?.id??x.setId??'')));
  $('qwb-count').textContent=count+' match'+(count===1?'':'es');
  if(!count){
    box.innerHTML='<p class="qwb-empty">'+(catalog().length?'No products match these filters. Try another brand, category or search.':'The catalog is loading. Reopen the quotation when products finish loading.')+'</p>';
    $('qwb-more').hidden=true;return;
  }
  box.innerHTML=resultItems.map((item,i)=>{
    const selected=allSelected.has(String(item.id))||allSelected.has(String(item.setId||''));
    return '<div class="qwb-product" data-qwb-product="'+i+'">'+thumb(item.imgLink)+
       '<div class="qwb-product-info"><b>'+esc(item.itemName||'Product')+'</b>'+
       '<small>'+esc(item.code||'')+' · '+esc(item.brand||'')+'</small>'+
       '<small>'+esc(category(item))+' · '+esc(statusLabel(item))+' · '+money(itemPrice(item))+'</small></div>'+
       '<button type="button" class="qwb-add" data-qwb-add="'+i+'" aria-label="Add '+esc(item.itemName||'product')+'">'+
        (selected?'Add again':'+ Add')+'</button></div>';
  }).join('');
  $('qwb-more').hidden=count<=resultItems.length;
  $('qwb-more').textContent='Show more ('+(count-resultItems.length)+' remaining)';
}
function selectedRow(line,i,total){
  const key=keyOf(line),manual=!!line.item?.manualItem,service=line.type==='service'&&!manual;
  const set=line.type==='set',code=set?'SET':line.item?.code||'';
  const price=linePrice(line),quantity=Math.max(1,Number(line.quantity)||1);
  const discount=Number(line.discount)||0;
  const isFixed=set?' disabled title="Edit Set price in the Set builder"':'';
  const type=service?'Service':manual?'Manual item':set?'Product set':'Catalog item';
  const photo=set?line.imgLink||line.photoUrl||'':line.item?.imgLink||'';
  return '<div class="qwb-line" data-qwb-line="'+esc(key)+'" role="listitem">'+
    '<div class="qwb-line-top">'+
    '<button type="button" class="qwb-grip" draggable="true" data-qwb-drag="'+esc(key)+'" aria-label="Drag '+esc(label(line))+' to reorder" title="Hold and drag on mobile or desktop">⠿</button>'+
    thumb(photo)+
    '<div class="qwb-line-name">'+
    (service?'<input aria-label="Service description" data-qwb-field="name" data-qwb-key="'+esc(key)+'" maxlength="160" value="'+esc(label(line))+'">':
      '<b title="'+esc(label(line))+'">'+esc(label(line))+'</b>')+
    '<small>'+esc(code)+' · '+type+'</small></div>'+
    '<div class="qwb-arrows"><button data-qwb-action="up" data-qwb-key="'+esc(key)+'" type="button" aria-label="Move '+esc(label(line))+' up" '+(i===0?'disabled':'')+'>↑</button>'+
    '<button data-qwb-action="down" data-qwb-key="'+esc(key)+'" type="button" aria-label="Move '+esc(label(line))+' down" '+(i===total-1?'disabled':'')+'>↓</button></div></div>'+
    '<div class="qwb-edit-grid">'+
    '<label>Qty<input type="number" min="1" max="9999" step="1" data-qwb-field="quantity" data-qwb-key="'+esc(key)+'" value="'+quantity+'"></label>'+
    '<label>Unit $<input type="number" min="0" step="0.01" data-qwb-field="price" data-qwb-key="'+esc(key)+'" value="'+price+'"'+isFixed+'></label>'+
    '<label>Disc. %<input type="number" min="0" max="100" step="0.01" data-qwb-field="discount" data-qwb-key="'+esc(key)+'" value="'+discount+'"></label></div>'+
    '<div class="qwb-line-actions">'+
    (set?'':service?'<button type="button" data-qwb-action="service" data-qwb-key="'+esc(key)+'">Edit fee</button>':
     '<button type="button" data-qwb-action="replace" data-qwb-key="'+esc(key)+'">Replace</button>')+
    (!set?'<button type="button" data-qwb-action="duplicate" data-qwb-key="'+esc(key)+'">Duplicate</button>':'')+
    (manual?'<button type="button" data-qwb-action="manual" data-qwb-key="'+esc(key)+'">Photo / details</button>':'')+
    '<button type="button" class="qwb-delete" data-qwb-action="remove" data-qwb-key="'+esc(key)+'">Remove</button></div>'+
    '</div>';
}
function renderSelected(){
  const root=$(ROOT);if(!root||!docEnabled())return;
  const box=$('qwb-selected');if(!box)return;
  const lines=cartRows();
  $('qwb-selected-count').textContent=lines.length+' row'+(lines.length===1?'':'s');
  box.innerHTML=lines.length?lines.map((x,i)=>selectedRow(x,i,lines.length)).join(''):
    '<p class="qwb-empty">No items yet. Search the catalog, add a manual item, or add a service fee here.</p>';
  const note=$('qwb-order-note');
  if(note)note.textContent=groupMode()==='none'?
    'Drag the handle on mobile or desktop; arrows work too. The preview follows this order.':
    'The floor/room or discount grouping also controls the preview order. Drag to reorder rows within a group, or select No grouping for an exact custom sequence.';
}
function scheduleSelected(){
  if(renderScheduled)return;renderScheduled=true;
  const run=()=>{renderScheduled=false;if(isVisible())renderSelected()};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else Promise.resolve().then(run);
}
function refresh(){
  const root=$(ROOT);if(!root)return;
  root.hidden=!docEnabled();
  if(!active())return;
  refreshFilters();
  renderResults();
  renderSelected();
}
function mount(){
  if($(ROOT))return;
  const notes=$('quote-items-notes-form');
  const heading=notes?.previousElementSibling;
  if(!notes||!heading||!heading.parentElement)return;
  const section=document.createElement('section');
  section.id=ROOT;
  section.className='qwb';
  section.setAttribute('aria-label','Build quotation and Sales Order items');
  section.innerHTML=
   '<div class="qwb-heading"><div><b>Build Items Here</b><p>Add, edit, replace and arrange without leaving this document.</p></div></div>'+
   '<div class="qwb-action-bar"><button type="button" id="qwb-manual">+ Manual Item</button>'+
     '<button type="button" id="qwb-service">+ Service Fee</button></div>'+
   '<label class="qwb-search-label" for="qwb-search">Search existing products</label>'+
   '<input id="qwb-search" type="search" autocomplete="off" placeholder="Code, name, brand, material, description…">'+
   '<div class="qwb-filters"><select id="qwb-brand" aria-label="Filter by brand"><option value="">All brands</option></select>'+
     '<select id="qwb-category" aria-label="Filter by category"><option value="">All categories</option></select>'+
     '<select id="qwb-stock" aria-label="Filter by stock">'+
       '<option value="">All stock</option><option value="in">In stock</option>'+
       '<option value="preorder">Pre-order</option><option value="out">No stock</option></select>'+ 
     '<select id="qwb-sort" aria-label="Sort catalog products"><option value="suggested">Suggested order</option>'+ 
     '<option value="name">Name A–Z</option><option value="price-low">Price: low to high</option>'+ 
     '<option value="price-high">Price: high to low</option></select></div>'+
   '<div class="qwb-result-heading"><b>Catalog</b><small id="qwb-count">0 matches</small></div>'+
   '<div id="qwb-results" class="qwb-results" role="list" aria-label="Catalog search results"></div>'+
   '<button type="button" id="qwb-more" hidden>Show more</button>'+
   '<div class="qwb-result-heading qwb-selected-heading"><b>Items in this document</b><small id="qwb-selected-count">0 rows</small></div>'+
   '<p id="qwb-order-note" class="qwb-hint">Drag a row or use the arrow buttons to arrange it.</p>'+
   '<div id="qwb-selected" class="qwb-selected" role="list" aria-label="Quotation item order"></div>';
  heading.parentElement.insertBefore(section,heading);
  section.addEventListener('click',onClick);
  section.addEventListener('input',onInput);
  section.addEventListener('change',onChange);
  section.addEventListener('focusin',event=>{
    if(event.target.id==='qwb-search'){refreshFilters();renderResults()}
  });
  section.addEventListener('dragstart',onDragStart);
  section.addEventListener('dragover',onDragOver);
  section.addEventListener('dragleave',onDragLeave);
  section.addEventListener('drop',onDrop);
  section.addEventListener('dragend',clearDrag);
  section.addEventListener('pointerdown',onPointerDown);
  section.addEventListener('pointermove',onPointerMove);
  section.addEventListener('pointerup',onPointerUp);
  section.addEventListener('pointercancel',clearTouch);
}
function addProduct(index){
  const product=resultItems[Number(index)];
  if(!product)return;
  if(product.isSet){
    if(cartRows().some(c=>c.type==='set'&&String(c.setId||c.id)===String(product.setId||product.id)))
      return showNotification('This product set is already on the quotation. Adjust its quantity.', 'info');
    toggleCartSelection(product.id);
  }else{
    const actual=window.SeasonalPromos?.view?.(product)||product;
    cart.push(catalogCartEntry(actual));
    updateCartVisuals();
    renderProductGrid();
  }
  renderQuoteItemsNotesForm();
  updateQuotationPreview();
  refresh();
  window.ShowroomPhase1?.scheduleDraft?.();
}
function afterChange(visuals=true){
  // Stable cart row IDs keep the document's notes, codes, groups and revisions.
  renderQuoteItemsNotesForm();
  if(visuals){updateCartVisuals();renderProductGrid()}
  updateQuotationPreview();
  window.ShowroomPhase1?.scheduleDraft?.();
  refresh();
}
function moveTo(sourceKey,targetKey,after=false){
  const rows=cartRows();
  const from=rows.findIndex(x=>keyOf(x)===sourceKey);
  const target=rows.findIndex(x=>keyOf(x)===targetKey);
  if(from<0||target<0||from===target)return;
  const [row]=rows.splice(from,1);
  const newTarget=rows.findIndex(x=>keyOf(x)===targetKey);
  rows.splice(newTarget+(after?1:0),0,row);
  afterChange();
}
function moveBy(key,step){
  const rows=cartRows(),index=rows.findIndex(x=>keyOf(x)===key);
  if(index<0||index+step<0||index+step>=rows.length)return;
  [rows[index],rows[index+step]]=[rows[index+step],rows[index]];
  afterChange();
}
function copyRow(key){
  const rows=cartRows(),index=rows.findIndex(x=>keyOf(x)===key);
  if(index<0)return;
  const old=rows[index];
  if(old.type==='set')return;
  const id=newCartLineId();
  const copy={...old,id,item:old.item?{...old.item}:undefined,
    documentSections:old.documentSections?{...old.documentSections}:undefined,
    documentCodes:old.documentCodes?{...old.documentCodes}:undefined};
  if(old.item?.manualItem)copy.item.id='manual-'+id;
  if(old.type==='service'&&!old.item?.manualItem)copy.item.id=id;
  rows.splice(index+1,0,copy);
  afterChange();
}
function editField(key,field,raw){
  const line=cartRows().find(x=>keyOf(x)===key);
  if(!line)return;
  if(field==='name'&&line.type==='service'&&!line.item?.manualItem){
    const value=String(raw||'').trim().slice(0,160);
    if(!value)return showNotification('Enter a service fee name.','error');
    line.item.itemName=value;afterChange();return;
  }
  const n=Number(raw);
  if(!String(raw).trim()||!Number.isFinite(n)||n<0)return showNotification('Enter a valid number.','error');
  if(field==='quantity'){
    const qty=Math.floor(n);
    if(qty<1||qty>9999)return showNotification('Quantity must be 1–9999.','error');
    line.quantity=qty;
  }else if(field==='price'){
    if(line.type==='set')return;
    line.customPrice=Math.round(n*100)/100;
  }else if(field==='discount'){
    if(n>100)return showNotification('Discount cannot exceed 100%.','error');
    line.discount=Math.round(n*100)/100;
  }
  afterChange();
}
function onClick(event){
  const t=event.target;
  if(t.closest('#qwb-manual')){openManualInterestItem();return}
  if(t.closest('#qwb-service')){
    addServiceFee();renderQuoteItemsNotesForm();refresh();
    const key=keyOf(cartRows().at(-1)),input=[...$('qwb-selected').querySelectorAll('[data-qwb-field="name"]')].find(x=>x.dataset.qwbKey===key);
    input?.focus();input?.select();return;
  }
  if(t.closest('#qwb-more')){limit+=12;renderResults();return}
  const add=t.closest('[data-qwb-add]');
  if(add){addProduct(add.dataset.qwbAdd);return}
  const action=t.closest('[data-qwb-action]');
  if(!action)return;
  const key=action.dataset.qwbKey,operation=action.dataset.qwbAction;
  const row=cartRows().find(x=>keyOf(x)===key);
  if(!row)return;
  if(operation==='up'){moveBy(key,-1);return}
  if(operation==='down'){moveBy(key,1);return}
  if(operation==='replace'){openReplaceCartItem(key);return}
  if(operation==='manual'){openManualInterestItem(key);return}
  if(operation==='service'){const input=[...$('qwb-selected').querySelectorAll('[data-qwb-field="name"]')].find(x=>x.dataset.qwbKey===key);input?.focus();input?.select();return}
  if(operation==='duplicate'){copyRow(key);return}
  if(operation==='remove'){
    if(typeof confirm==='function'&&!confirm('Remove "'+label(row)+'" from this quotation?'))return;
    const idx=cartRows().findIndex(x=>keyOf(x)===key);
    if(idx>=0){cart.splice(idx,1);afterChange()}
  }
}
function onInput(event){
  const target=event.target;
  if(target.id==='qwb-search'){
    clearTimeout(searchTimer);
    limit=12;searchTimer=setTimeout(renderResults,85);
  }
}
function onChange(event){
  const target=event.target;
  if(['qwb-brand','qwb-category','qwb-stock','qwb-sort'].includes(target.id)){
    limit=12;renderResults();return;
  }
  const field=target.dataset.qwbField,key=target.dataset.qwbKey;
  if(field&&key)editField(key,field,target.value);
}
function clearDrag(){
  dragKey='';dragOver=null;
  $(ROOT)?.querySelectorAll('.qwb-drop-before,.qwb-drop-after,.qwb-dragging')
    .forEach(x=>x.classList.remove('qwb-drop-before','qwb-drop-after','qwb-dragging'));
}
function dragDestination(target,clientY){
  const row=target?.closest?.('[data-qwb-line]');
  if(!row||!$(ROOT)?.contains(row))return null;
  const key=row.dataset.qwbLine;
  if(!key||key===dragKey)return null;
  return {key,after:clientY>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2,row};
}
function highlightDrop(destination){
  $(ROOT)?.querySelectorAll('.qwb-drop-before,.qwb-drop-after')
    .forEach(x=>x.classList.remove('qwb-drop-before','qwb-drop-after'));
  if(destination)destination.row.classList.add(destination.after?'qwb-drop-after':'qwb-drop-before');
}
function onDragStart(e){
  const handle=e.target?.closest?.('[data-qwb-drag]');if(!handle)return;
  dragKey=handle.dataset.qwbDrag;
  if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragKey)}
  handle.closest('[data-qwb-line]')?.classList.add('qwb-dragging');
}
function onDragOver(e){
  if(!dragKey)return;
  const destination=dragDestination(e.target,e.clientY);
  if(!destination)return;
  e.preventDefault();
  if(e.dataTransfer)e.dataTransfer.dropEffect='move';
  dragOver=destination;highlightDrop(destination);
}
function onDragLeave(e){
  if(!e.relatedTarget||!$(ROOT)?.contains(e.relatedTarget))highlightDrop(null);
}
function onDrop(e){
  if(!dragKey)return;
  e.preventDefault();
  const destination=dragDestination(e.target,e.clientY)||dragOver;
  const from=dragKey;
  clearDrag();
  if(destination)moveTo(from,destination.key,destination.after);
}
function onPointerDown(e){
  if(e.pointerType==='mouse')return; // HTML drag-and-drop on desktop
  const handle=e.target?.closest?.('[data-qwb-drag]');
  if(!handle||e.isPrimary===false)return;
  const key=handle.dataset.qwbDrag;
  if(!key)return;
  e.preventDefault();
  touchDrag={key,pointerId:e.pointerId,startY:e.clientY,active:false,target:null,handle};
  dragKey=key;
  try{handle.setPointerCapture(e.pointerId)}catch(_){}
}
function onPointerMove(e){
  const d=touchDrag;
  if(!d||e.pointerId!==d.pointerId)return;
  if(!d.active&&Math.abs(e.clientY-d.startY)<7)return;
  d.active=true;
  d.handle.closest('[data-qwb-line]')?.classList.add('qwb-dragging');
  const hit=document.elementFromPoint?.(e.clientX,e.clientY);
  d.target=dragDestination(hit,e.clientY);
  highlightDrop(d.target);
  const list=$('qwb-selected');
  if(list&&list.getBoundingClientRect){
    const rect=list.getBoundingClientRect();
    if(e.clientY>rect.bottom-32)list.scrollTop+=12;
    if(e.clientY<rect.top+32)list.scrollTop-=12;
  }
}
function onPointerUp(e){
  const d=touchDrag;if(!d||d.pointerId!==e.pointerId)return;
  const destination=d.active?d.target:null;
  clearTouch();
  if(destination)moveTo(d.key,destination.key,destination.after);
}
function clearTouch(){
  const d=touchDrag;touchDrag=null;
  if(d?.handle?.hasPointerCapture?.(d.pointerId)){
    try{d.handle.releasePointerCapture(d.pointerId)}catch(_){}
  }
  clearDrag();
}
function install(){
  const before=window.openShareModal;
  if(typeof before==='function'){
    window.openShareModal=function(){const value=before.apply(this,arguments);mount();refresh();return value};
  }
  const switchType=window.setDocType;
  if(typeof switchType==='function'){
    window.setDocType=function(){const value=switchType.apply(this,arguments);mount();refresh();return value};
  }
  const updatePreview=window.updateQuotationPreview;
  if(typeof updatePreview==='function'){
    window.updateQuotationPreview=function(){const value=updatePreview.apply(this,arguments);scheduleSelected();return value};
  }
  window.addEventListener('showroom:cart-changed',()=>{
    if(isVisible()){renderSelected();renderResults();}
  });
  window.addEventListener('showroom:products-loaded',()=>{
    if(isVisible()){refreshFilters();renderResults()}
  });
  window.QuotationWorkspace={refresh,renderSelected,moveTo,moveBy,editField};
  mount();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();
