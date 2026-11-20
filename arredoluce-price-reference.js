/* Arredoluce USD selling-price reference, not inventory or supplier costing. */
(function(root){
'use strict';
const doc=root.document;if(!doc)return;
const DATA='./assets/price-reference/arredoluce-actual-sales-2026-11-20.json';
const PHOTOS='./assets/price-reference/arredoluce-catalog-page-previews.json';
const PAGE_SIZE=24;
const $=id=>doc.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=n=>'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const state={items:[],photos:{},photoIndex:null,query:'',series:'',type:'',view:'list',sort:'source',shown:PAGE_SIZE,open:false,loading:null,error:'',lastFocus:null};
/* Resolve reference images only from product/catalog information. Never describe a
   borrowed series image as an exact photograph of the product or finish. */
function buildPhotoIndex(){
 const byCode=new Map(),bySeriesType=new Map(),bySeries=new Map();
 let first=null;
 for(const item of state.items){
  const page=Number(item.catalogPage);
  if(!Number.isInteger(page)||!state.photos[String(page)])continue;
  if(!first)first=page;
  if(!byCode.has(item.code))byCode.set(item.code,page);
  const series=(item.series||'').trim().toLowerCase();
  const type=(item.type||'').trim().toLowerCase();
  if(series&&!bySeries.has(series))bySeries.set(series,page);
  if(series&&type&&!bySeriesType.has(series+'|'+type))bySeriesType.set(series+'|'+type,page);
 }
 state.photoIndex={byCode,bySeriesType,bySeries,first};
}
function resolvePhoto(item){
 if(!state.photoIndex)buildPhotoIndex();
 const index=state.photoIndex;
 const page=Number(item.catalogPage);
 const own=Number.isInteger(page)?state.photos[String(page)]:null;
 if(own)return{src:own,page,kind:'catalog',label:'CATALOG PREVIEW',detail:'Catalog page reference, not an exact individual product photograph. Finish and model must be verified.'};
 const code=index.byCode.get(item.code);
 if(code)return{src:state.photos[String(code)],page:code,kind:'code',label:'SAME MODEL REFERENCE',detail:'Shared from another price option for this supplier code. Verify the exact finish and product before quoting.'};
 const series=(item.series||'').trim().toLowerCase();
 const type=(item.type||'').trim().toLowerCase();
 const st=index.bySeriesType.get(series+'|'+type);
 if(st)return{src:state.photos[String(st)],page:st,kind:'type',label:'SERIES REFERENCE',detail:'Reference photo from the same series and product type. It may show another model or finish.'};
 const family=index.bySeries.get(series);
 if(family)return{src:state.photos[String(family)],page:family,kind:'series',label:'SERIES REFERENCE',detail:'Reference photo from the same series; this is not a confirmed photo of this item.'};
 const generic=index.first;
 if(generic)return{src:state.photos[String(generic)],page:generic,kind:'generic',label:'GENERAL REFERENCE',detail:'General Arredoluce catalog illustration only; not matched to this item, series or finish.'};
 return null;
}
function filtered(){
 const q=state.query.toLowerCase().split(/\s+/).filter(Boolean);
 let rows=state.items.filter(x=>(!state.series||x.series===state.series)&&(!state.type||x.type===state.type)&&q.every(w=>[x.code,x.name,x.series,x.type,x.dimensions,x.variant].join(' ').toLowerCase().includes(w)));
 if(state.sort==='priceAsc')rows.sort((a,b)=>a.priceUsd-b.priceUsd);
 if(state.sort==='priceDesc')rows.sort((a,b)=>b.priceUsd-a.priceUsd);
 if(state.sort==='code')rows.sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
 return rows;
}
async function load(){
 if(state.loading)return state.loading;
 state.loading=(async()=>{
  try{
   const response=await fetch(DATA,{cache:'no-store'});
   if(!response.ok)throw Error('Arredoluce selling-price feed could not be loaded.');
   const data=await response.json();
   if(data.kind!=='reference_only'||data.brand!=='Arredoluce'||data.currency!=='USD'||!Array.isArray(data.items)||data.items.length!==1143)throw Error('Invalid Arredoluce price reference.');
   const rows=data.items.filter(x=>typeof x.code==='string'&&typeof x.variant==='string'&&Number.isFinite(x.priceUsd)&&x.priceUsd>0);
   if(rows.length!==1143)throw Error('Incomplete Arredoluce prices.');
   state.items=rows;
   state.photoIndex=null;
   try{
    const rr=await fetch(PHOTOS);
    if(rr.ok){const v=await rr.json();if(v.kind==='catalog_page_previews_only'&&v.pages)state.photos=v.pages}
    buildPhotoIndex();
   }catch(e){console.warn('Arredoluce catalog page previews unavailable',e)}
  }catch(e){state.error=e.message||'Arredoluce reference unavailable'}
  finally{render()}
 })();
 return state.loading;
}
function closePreview(){const x=$('arredo-ref-preview');if(x)x.hidden=true}
function close(){
 closePreview();state.open=false;const overlay=$('arredo-ref-overlay');if(overlay)overlay.hidden=true;
 doc.body.classList.remove('da-price-reference-open');state.lastFocus?.focus?.();
}
function openPreview(item){
 const p=$('arredo-ref-preview');if(!p)return;
 const photo=resolvePhoto(item);
 const stage=p.querySelector('.arredo-preview-stage');
 stage.replaceChildren();
 if(photo){const img=doc.createElement('img');img.src=photo.src;img.alt=photo.label+' · Arredoluce catalog page '+photo.page+' · not a verified individual item image';stage.appendChild(img)}
 else stage.innerHTML='<span class="arredo-preview-empty">No catalog preview matched</span>';
 const info=p.querySelector('.arredo-preview-info');info.replaceChildren();
 const label=doc.createElement('span');label.className='da-ref-collection-label';label.textContent=item.series||'Arredoluce';
 const name=doc.createElement('h3');name.textContent=item.name;
 const code=doc.createElement('p');code.textContent='Code '+item.code+' · '+item.variant;
 const dim=doc.createElement('p');dim.textContent=item.dimensions||'Dimensions not provided';
 const price=doc.createElement('div');price.className='da-ref-preview-price';
 const sale=doc.createElement('b');sale.className='da-price-ref-price';sale.textContent=usd(item.priceUsd);
 const hidden=doc.createElement('span');hidden.className='da-price-ref-price-hidden';hidden.textContent='Price hidden';
 const note=doc.createElement('small');note.textContent='USD · Actual selling price · Reference only';
 price.append(sale,hidden,note);
 const warning=doc.createElement('p');warning.className='da-ref-preview-disclaimer';warning.textContent=photo
   ?photo.detail+' · Source catalog page '+photo.page+'.'
   :'No verified product photograph is available for this variant. Confirm before quoting or ordering.';
 info.append(label,name,code,dim,price,warning);
 p.hidden=false;$('arredo-ref-preview-close')?.focus();
}
/* Compact one-row-per-code list: variant choices are revealed only when needed. */
function renderGroupedList(rows,holder,more,counter){
 const groups=new Map();
 for(const item of rows){
  if(!groups.has(item.code))groups.set(item.code,[]);
  groups.get(item.code).push(item);
 }
 const entries=[...groups.entries()];
 counter.textContent=entries.length+' products · '+rows.length+' price options';
 holder.className='arredo-ref-group-list';
 const frag=doc.createDocumentFragment();
 for(const [code,options] of entries.slice(0,state.shown)){
  const item=options[0],photo=resolvePhoto(item);
  const group=doc.createElement('details');group.className='arredo-group';
  const summary=doc.createElement('summary');summary.className='arredo-group-summary';
  const thumb=doc.createElement('span');thumb.className='arredo-group-image';
  if(photo){const img=doc.createElement('img');img.src=photo.src;img.loading='lazy';img.alt=photo.label+' for '+code;thumb.appendChild(img)}
  else thumb.textContent='No photo';
  const info=doc.createElement('span');info.className='arredo-group-info';
  const title=doc.createElement('strong');title.textContent=item.name;
  const sub=doc.createElement('small');sub.textContent=[code,item.series,item.dimensions].filter(Boolean).join(' · ');
  info.append(title,sub);
  const right=doc.createElement('span');right.className='arredo-group-right';
  const amounts=options.map(x=>x.priceUsd),minimum=Math.min(...amounts),maximum=Math.max(...amounts);
  const amount=doc.createElement('strong');amount.className='da-price-ref-price';amount.textContent=minimum===maximum?usd(minimum):usd(minimum)+' – '+usd(maximum);
  const hidden=doc.createElement('span');hidden.className='da-ref-price-hidden arredo-group-price-hidden';hidden.textContent='Price hidden';
  const count=doc.createElement('small');count.textContent=options.length+' option'+(options.length===1?'':'s')+' · View details';
  right.append(amount,hidden,count);
  summary.append(thumb,info,right);group.appendChild(summary);
  const variants=doc.createElement('div');variants.className='arredo-group-variants';
  for(const variant of options){
   const row=doc.createElement('button');row.type='button';row.className='arredo-group-variant';
   const name=doc.createElement('span');name.textContent=variant.variant||'Standard finish';
   const price=doc.createElement('strong');price.className='da-price-ref-price';price.textContent=usd(variant.priceUsd);
   const hidden=doc.createElement('span');hidden.className='da-ref-price-hidden arredo-group-price-hidden';hidden.textContent='Price hidden';
   const detail=doc.createElement('span');detail.className='arredo-group-action';detail.textContent='View photo & details';
   row.append(name,price,hidden,detail);
   row.addEventListener('click',()=>openPreview(variant));
   variants.appendChild(row);
  }
  if(photo){
    const note=doc.createElement('div');note.className='arredo-group-warning';note.textContent='Reference photo · finish or exact model may vary';
    variants.appendChild(note);
  }
  group.appendChild(variants);frag.appendChild(group);
 }
 holder.appendChild(frag);
 const remain=entries.length-state.shown;more.hidden=remain<=0;
 if(remain>0)more.textContent='Show '+Math.min(PAGE_SIZE,remain)+' more products';
}
function render(){
 if(!state.open)return;
 const holder=$('arredo-ref-results'),counter=$('arredo-ref-count'),more=$('arredo-ref-more'),status=$('arredo-ref-status');
 if(!holder)return;
 const rows=filtered();counter.textContent=rows.length+' selling price option'+(rows.length===1?'':'s');
 holder.replaceChildren();holder.className='da-ref-grid arredo-ref-grid'+(state.view==='list'?' as-list':'');
 $('arredo-ref-gallery').setAttribute('aria-pressed',String(state.view==='gallery'));
 $('arredo-ref-list').setAttribute('aria-pressed',String(state.view==='list'));
 if(state.error){status.hidden=false;status.textContent=state.error;more.hidden=true;return}
 if(!state.items.length){status.hidden=false;status.textContent='Loading actual Arredoluce selling prices…';more.hidden=true;return}
 if(!rows.length){status.hidden=false;status.textContent='No results for these filters.';more.hidden=true;return}
 status.hidden=true;
 if(state.view==='list'){
  renderGroupedList(rows,holder,more,counter);
  return;
 }
 const frag=doc.createDocumentFragment();
 for(const x of rows.slice(0,state.shown)){
  const card=doc.createElement('article');card.className='da-ref-card arredo-ref-card';
  const photo=resolvePhoto(x);
  const photoButton=doc.createElement('button');photoButton.type='button';photoButton.className='da-ref-photo arredo-ref-photo';
  photoButton.title=photo?'View '+photo.label.toLowerCase()+' · Catalog page '+photo.page+' (not exact product photo)':'View selling price details';
  if(photo){const img=doc.createElement('img');img.src=photo.src;img.loading='lazy';img.alt=photo.label+' · catalog page '+photo.page+' · not an exact photo';img.className='arredo-ref-image';photoButton.appendChild(img)}
  else photoButton.innerHTML='<span class="arredo-no-photo"><i class="fa-solid fa-image"></i> No verified photo</span>';
  const tag=doc.createElement('span');tag.className='arredo-photo-tag';tag.textContent=photo?photo.label:'PHOTO UNAVAILABLE';photoButton.appendChild(tag);
  photoButton.addEventListener('click',()=>openPreview(x));
  const info=doc.createElement('div');info.className='arredo-ref-info';
  const series=doc.createElement('div');series.className='arredo-ref-series';series.textContent=(x.series||'Arredoluce')+' · '+(x.type||'Lighting');
  const name=doc.createElement('div');name.className='arredo-ref-name';name.textContent=x.name;
  const code=doc.createElement('div');code.className='arredo-ref-code';code.textContent=x.code+' · '+x.variant;
  const dims=doc.createElement('div');dims.className='arredo-ref-dims';dims.textContent=x.dimensions||'Size not specified';
  const sale=doc.createElement('strong');sale.className='da-price-ref-price arredo-ref-price';sale.textContent=usd(x.priceUsd);
  const hidden=doc.createElement('span');hidden.className='da-price-ref-price-hidden';hidden.textContent='Price hidden';
  const caution=doc.createElement('div');caution.className='arredo-ref-photo-note';caution.textContent=photo?(photo.kind==='catalog'?'Catalog page · check model/finish':photo.kind==='code'?'Shared code photo · finish may vary':photo.kind==='generic'?'General reference · not matched':'Series photo · model may vary'):'No matched catalog photo';
  info.append(series,name,code,dims,caution,sale,hidden);card.append(photoButton,info);frag.appendChild(card);
 }
 holder.appendChild(frag);
 const remain=rows.length-state.shown;more.hidden=remain<=0;
 if(remain>0)more.textContent='Load more · '+remain+' remaining';
}
function build(){
 if($('arredo-ref-overlay'))return;
 const overlay=doc.createElement('div');overlay.id='arredo-ref-overlay';overlay.className='da-ref-overlay arredo-ref-overlay';overlay.hidden=true;
 overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Arredoluce Price Reference');
 overlay.innerHTML='<div class="da-ref-panel arredo-ref-panel">'+
 '<header class="da-ref-header"><div class="da-ref-heading"><span class="da-ref-kicker"><i class="fa-solid fa-gem"></i> GENERAL PRICE REFERENCE</span><h2>Arredoluce</h2><p>Actual USD selling prices · Separate from Stock and quotations</p></div><button type="button" id="arredo-ref-close" class="da-ref-close" aria-label="Close Arredoluce">×</button></header>'+
 '<div class="arredo-ref-toolbar"><div class="da-ref-search-box"><i class="fa-solid fa-magnifying-glass"></i><input id="arredo-ref-search" type="search" placeholder="Search code, series, description, dimensions or finish…" aria-label="Search Arredoluce"></div><label class="da-ref-field"><span>Series</span><select id="arredo-ref-series"><option value="">All series</option></select></label><label class="da-ref-field"><span>Product type</span><select id="arredo-ref-type"><option value="">All types</option></select></label><label class="da-ref-field"><span>Sort</span><select id="arredo-ref-sort"><option value="source">Original order</option><option value="code">Code</option><option value="priceAsc">Lowest price</option><option value="priceDesc">Highest price</option></select></label></div>'+
 '<div class="da-ref-results-bar"><strong id="arredo-ref-count">Loading…</strong><div class="arredo-view"><button type="button" id="arredo-ref-gallery">Photos</button><button type="button" id="arredo-ref-list">List</button></div></div>'+
 '<div class="arredo-ref-scroll"><p id="arredo-ref-status"></p><div id="arredo-ref-results" class="da-ref-grid arredo-ref-grid"></div><button id="arredo-ref-more" type="button" class="da-ref-more" hidden>Load more</button></div>'+
 '<footer class="da-ref-bottom"><span>Actual selling prices only. Shared catalog/series images are visual references, not exact-product photos.</span><span class="da-ref-bottom-secondary">Reference only · Not in Stock · No supplier costs</span></footer>'+
 '<div id="arredo-ref-preview" class="da-ref-preview" hidden><div class="da-ref-preview-dialog"><button type="button" id="arredo-ref-preview-close" class="da-ref-preview-close" aria-label="Close preview">×</button><div class="da-ref-preview-content"><div class="da-ref-preview-stage arredo-preview-stage"></div><div class="da-ref-preview-info arredo-preview-info"></div></div></div></div>'+
 '</div>';
 doc.body.appendChild(overlay);
 overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)close();if(e.target===$('arredo-ref-preview'))closePreview()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('arredo-ref-preview').hidden)closePreview();else close();e.stopPropagation()}});
 $('arredo-ref-close').onclick=close;$('arredo-ref-preview-close').onclick=closePreview;
 $('arredo-ref-search').oninput=e=>{state.query=e.target.value.trim();state.shown=PAGE_SIZE;render()};
 $('arredo-ref-series').onchange=e=>{state.series=e.target.value;state.shown=PAGE_SIZE;render()};
 $('arredo-ref-type').onchange=e=>{state.type=e.target.value;state.shown=PAGE_SIZE;render()};
 $('arredo-ref-sort').onchange=e=>{state.sort=e.target.value;render()};
 $('arredo-ref-gallery').onclick=()=>{state.view='gallery';render()};
 $('arredo-ref-list').onclick=()=>{state.view='list';render()};
 $('arredo-ref-more').onclick=()=>{state.shown+=PAGE_SIZE;render()};
}
function filters(){
 for(const [selector,key,label] of [['arredo-ref-series','series','All series'],['arredo-ref-type','type','All types']]){
  const node=$(selector);node.replaceChildren();const base=doc.createElement('option');base.value='';base.textContent=label;node.appendChild(base);
  for(const v of [...new Set(state.items.map(x=>x[key]).filter(Boolean))].sort()){const o=doc.createElement('option');o.value=v;o.textContent=v;node.appendChild(o)}
  node.value=state[key];
 }
}
async function open(){
 build();if(state.open)return;
 state.lastFocus=doc.activeElement;state.open=true;$('arredo-ref-overlay').hidden=false;
 doc.body.classList.add('da-price-reference-open');render();$('arredo-ref-search').focus();
 await load();if(state.open){filters();render()}
}
root.ArredolucePriceReference=Object.freeze({open,close,get loadedCount(){return state.items.length}});
})(typeof window!=='undefined'?window:globalThis);
