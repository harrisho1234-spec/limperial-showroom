/* Elite Bohemia catalog and future selling-price reference. NEVER inventory.
   Item source is the 5 uploaded supplier PDF catalogs; prices are deliberately blank. */
(function(root){
'use strict';
const d=root.document;if(!d)return;
const PATH='./assets/price-reference/elite-bohemia-catalog.json';
const $=id=>d.getElementById(id);
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={items:[],filtered:[],query:'',category:'',source:'',shown:48,open:false,loaded:false,loading:null,error:'',lastFocus:null,pricedCount:0};
const catalogLabels={'2014 catalog':'2014 Chandeliers','2016 catalog':'2016 Chandeliers','2017 catalog':'2017 Chandeliers','2017 lamps':'2017 Lamps','Storybook':'Crystal Chandelier Storybook'};
const catalogSlug={'2014 catalog':'2014_catalog','2016 catalog':'2016_catalog','2017 catalog':'2017_catalog','2017 lamps':'2017_lamps','Storybook':'storybook'};
const PAGE_PREVIEWS_ROOT='./assets/price-reference/elite-bohemia-pages-';
const pagePreviewCache=new Map(),pagePreviewLoads=new Map();
const previewKey=(source,page)=>source+'|'+page;
function previewFile(source,page){
 const slug=catalogSlug[source];
 if(!slug||!Number.isInteger(page)||page<1)return '';
 const part=slug==='2014_catalog'?'_part'+Math.ceil(page/80):'';
 return PAGE_PREVIEWS_ROOT+slug+part+'.json';
}
function ensurePagePreview(source,page){
 const file=previewFile(source,page);
 if(!file||pagePreviewLoads.has(file))return;
 const load=fetch(file,{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('Preview unavailable');return r.json()})
  .then(data=>{
    if(data.kind!=='elite-bohemia-catalog-source-page-previews'||data.source!==source)return;
    for(const [number,src] of Object.entries(data.pages||{})){
      if(typeof src==='string'&&src.startsWith('data:image/jpeg;base64,'))pagePreviewCache.set(previewKey(source,Number(number)),src);
    }
  }).catch(e=>console.warn('Elite Bohemia page preview missing',source,page,e))
  .finally(()=>{if(state.open&&state.loaded)render()});
 pagePreviewLoads.set(file,load);
}
const PHOTO_CANDIDATES='./assets/price-reference/elite-bohemia-photo-candidates.json';
function mount(){
 if($('elite-ref-overlay'))return;
 const overlay=d.createElement('section');overlay.id='elite-ref-overlay';overlay.className='elite-ref-overlay';overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Elite Bohemia Catalog Reference');
 overlay.innerHTML='<div class="elite-ref-dialog"><header class="da-ref-header"><div class="da-ref-heading"><span class="da-ref-kicker">CATALOG & PRICE REFERENCE</span><h2>Elite Bohemia</h2><p>Bohemian crystal lighting · 2025 selling-price reference · Not stock inventory</p></div><button type="button" id="elite-ref-close" class="da-ref-close" aria-label="Close Elite Bohemia">×</button></header>'+
 '<div class="elite-ref-tools"><input id="elite-ref-search" type="search" placeholder="Search supplier model code, dimension, catalog…" aria-label="Search Elite Bohemia models"><select id="elite-ref-category" aria-label="Product category"><option value="">All types</option></select><select id="elite-ref-catalog" aria-label="Source catalog"><option value="">All catalogs</option></select></div>'+
 '<div class="elite-ref-summary" id="elite-ref-summary"></div><div class="elite-ref-scroll"><div class="elite-ref-cards" id="elite-ref-cards"></div><div class="elite-ref-empty" id="elite-ref-empty" hidden></div><button class="elite-ref-more" id="elite-ref-more" type="button">Load more products</button></div>'+
 '<footer class="elite-ref-footer">2025 selling prices on selected items · Reference-only (no inventory, stock quantity or cost) · Confirm finish and dimensions with original supplier catalog before ordering.</footer></div>';
 d.body.appendChild(overlay);
 $('elite-ref-close').addEventListener('click',close);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 $('elite-ref-search').addEventListener('input',e=>{state.query=e.target.value.trim().toLowerCase();state.shown=48;render()});
 $('elite-ref-category').addEventListener('change',e=>{state.category=e.target.value;state.shown=48;render()});
 $('elite-ref-catalog').addEventListener('change',e=>{state.source=e.target.value;state.shown=48;render()});
 $('elite-ref-more').addEventListener('click',()=>{state.shown+=48;render()});
 d.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.open)close()});
}
async function load(){
 if(state.loading)return state.loading;
 state.loading=(async()=>{
  try{
   const r=await fetch(PATH,{cache:'no-cache'});if(!r.ok)throw Error('Elite Bohemia catalog index unavailable');
   const x=await r.json();if(x.kind!=='catalog_reference_only'||x.brand!=='Elite Bohemia'||!Array.isArray(x.items)||x.items.length<100)throw Error('Unexpected catalog index');
   const catalog=x.items.filter(y=>y&&typeof y.code==='string'&&Array.isArray(y.sources));
   // Source-page images are candidates, not verified model/finish photographs.
   let photos={};
   try{
     const photoResp=await fetch(PHOTO_CANDIDATES,{cache:'no-cache'});
     if(photoResp.ok){
       const photoJson=await photoResp.json();
       if(photoJson.kind==='elite-bohemia-single-model-page-photo-candidates'&&photoJson.photos&&typeof photoJson.photos==='object')photos=photoJson.photos;
     }
   }catch(err){console.warn('Elite Bohemia catalog photo candidates unavailable',err)}
   const photoKey=v=>String(v||'').trim().toUpperCase().replace(/\s+/g,' ');
   const photoByCode=new Map(Object.entries(photos).map(([code,photo])=>[photoKey(code),photo]));
   for(const item of catalog){
     const photo=photoByCode.get(photoKey(item.code));
     if(photo?.src?.startsWith('data:image/jpeg;base64,')){
       item.photoCandidate=photo.src;item.photoCandidatePage=photo.page;
       item.photoMatchStatus='candidate_single_model_page';
     }
   }
   let pricing=[];
   try{
     const p=await root.LImperialShowroomAuth.getPriceReference('elite');
     if(p.brand!=='Elite Bohemia'||p.kind!=='reference_only'||p.currency!=='USD'||!Array.isArray(p.items))throw Error('Invalid reference');
     pricing=p.items.filter(v=>v&&typeof v.code==='string'&&Number.isFinite(v.priceUsd)&&v.priceUsd>0);
   }catch(err){console.warn('Elite Bohemia selling prices unavailable',err);}
   const normalize=code=>String(code).trim().toUpperCase().split(' ').filter(Boolean).join(' ');
   const byCode=new Map(catalog.map(item=>[normalize(item.code),item]));
   const mapped=new Map();
   for(const p of pricing){
     const key=normalize(p.code),base=byCode.get(key);
     const item={...(base||{}),code:p.code,variant:p.variant||'',collection:p.collection||'',priceUsd:p.priceUsd,
       category:base?.category||p.collection||'Crystal lighting',catalogs:base?.catalogs||[],sources:base?.sources||[],dimension:base?.dimension||''};
     if(!mapped.has(key))mapped.set(key,[]);mapped.get(key).push(item);
   }
   state.items=[];
   for(const item of catalog){
      const key=normalize(item.code),priced=mapped.get(key);
      if(priced?.length){state.items.push(...priced);mapped.delete(key)}
      else state.items.push({...item,priceUsd:null,variant:'',collection:''});
   }
   for(const list of mapped.values())state.items.push(...list);
   state.pricedCount=pricing.length;
   const categories=[...new Set(state.items.map(y=>y.category).filter(Boolean))].sort();
   const selector=$('elite-ref-category');categories.forEach(cat=>{const o=d.createElement('option');o.value=cat;o.textContent=cat;selector.appendChild(o)});
   const sourceSelector=$('elite-ref-catalog');
   (x.catalogs||[]).forEach(cat=>{const o=d.createElement('option');o.value=cat.name;o.textContent=catalogLabels[cat.name]||cat.name;sourceSelector.appendChild(o)});
   state.loaded=true;
  }catch(e){state.error=e.message||'Could not read Elite Bohemia catalog'}
  finally{render()}
 })();
 return state.loading;
}
function render(){
 if(!$('elite-ref-cards'))return;
 if(!state.loaded){
  $('elite-ref-summary').textContent=state.error?'Catalog unavailable':'Loading Elite Bohemia catalog…';
  $('elite-ref-empty').hidden=!state.error;
  $('elite-ref-empty').textContent=state.error;
  $('elite-ref-more').hidden=true;return;
 }
 const words=state.query.split(/\s+/).filter(Boolean);
 state.filtered=state.items.filter(row=>(!state.category||row.category===state.category)&&(!state.source||row.catalogs.includes(state.source))&&words.every(word=>(row.code+' '+row.variant+' '+row.collection+' '+row.category+' '+row.dimension+' '+row.catalogs.join(' ')).toLowerCase().includes(word)));
 $('elite-ref-summary').textContent=state.filtered.length+' options shown · '+state.pricedCount+' priced combinations · remaining models Pending';
 const holder=$('elite-ref-cards');holder.replaceChildren();
 const frag=d.createDocumentFragment();
 for(const item of state.filtered.slice(0,state.shown)){
  const card=d.createElement('article');card.className='elite-ref-card';
  const main=item.sources?.[0]||{},cat=catalogLabels[main.catalog]||main.catalog||'Supplier catalog';
  const sourceLinks=item.sources.slice(0,4).map(s=>'<span class="elite-ref-source">'+h(catalogLabels[s.catalog]||s.catalog)+' · PDF p. '+h(s.page)+'</span>').join('')+
   (item.sources.length?'':(item.priceListReferences||[]).slice(0,2).map(r=>'<span class="elite-ref-source">2025 supplement · '+h(r.collection)+' · sheet row '+h(r.row)+'</span>').join(''));
  const pageNumber=Number(main.page);
  const pagePreview=pagePreviewCache.get(previewKey(main.catalog,pageNumber));
  if(!item.imageUrl&&!item.photoCandidate&&!pagePreview)ensurePagePreview(main.catalog,pageNumber);
  const fallback='<div class="elite-ref-image-placeholder"><span>Elite<br>Bohemia</span><small>Source photo unavailable</small></div>';
  const thumb=item.imageUrl?'<img src="'+h(item.imageUrl)+'" loading="lazy" alt="Supplier image for '+h(item.code)+'">':
    item.photoCandidate?'<img src="'+h(item.photoCandidate)+'" loading="lazy" alt="Source-page photo candidate for '+h(item.code)+'; verify finish before quoting">':
    pagePreview?'<img src="'+h(pagePreview)+'" loading="lazy" alt="Source catalog page '+h(pageNumber)+'; may contain multiple models, not exact product photo">':fallback;
  card.innerHTML='<div class="elite-ref-image">'+thumb+'</div><div class="elite-ref-data"><div class="elite-ref-type">'+h(item.category||'Crystal lighting')+'</div>'+
   '<h3>'+h(item.code)+'</h3>'+(item.variant?'<div class="elite-ref-variant">Finish: '+h(item.variant)+'</div>':'')+
   '<div class="elite-ref-dimension">'+(item.dimension?'Catalog dimensions (verify): '+h(item.dimension):'Dimensions: see supplier PDF')+'</div>'+
   '<div class="elite-ref-sources">'+sourceLinks+'</div>'+
   '<div class="elite-ref-source">'+(item.photoCandidate?'Single-model catalog page candidate · finish unverified':pagePreview?'Catalog page preview · multiple models may be shown':'Exact photo not yet matched')+'</div>'+
   '<div class="elite-ref-price">Price pending</div>'+
   '<small class="elite-ref-caution">Catalog reference only · No stock · Check original PDF before ordering</small></div>';
  if(Number.isFinite(item.priceUsd)&&item.priceUsd>0){const el=card.querySelector('.elite-ref-price');const show=d.createElement('span');show.className='da-price-ref-price';show.textContent=String.fromCharCode(36)+item.priceUsd.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});const hidden=d.createElement('span');hidden.className='da-price-ref-price-hidden';hidden.textContent='Price hidden';el.replaceChildren(show,hidden);}
  if(item.collection==='Flame'||item.collection==='Water' || item.collection==='Seashell'){
    const foot=d.createElement('small');foot.className='elite-ref-caution';
    foot.textContent='Verify LED ceiling-light inclusion and exact finish with supplier before quoting.';
    card.querySelector('.elite-ref-data')?.appendChild(foot);
  }
  if(['Light of Diamond','The Majesty of Brilliance','Dancing Light','Golden Glow'].includes(item.collection)){
    const foot=d.createElement('small');foot.className='elite-ref-caution';
    foot.textContent='Base gold design. Nickel/silver finish has a supplier surcharge of 5%; confirm before quoting.';
    card.querySelector('.elite-ref-data')?.appendChild(foot);
  }
  card.dataset.priceUsd=String(item.priceUsd||'');
  frag.appendChild(card);
 }
 holder.appendChild(frag);
 $('elite-ref-more').hidden=state.filtered.length<=state.shown;
 $('elite-ref-empty').hidden=state.filtered.length>0;
 $('elite-ref-empty').textContent=state.filtered.length?'':'No matching Elite Bohemia model code.';
}
function close(){state.open=false;const x=$('elite-ref-overlay');if(x)x.hidden=true;d.body.classList.remove('elite-ref-active');state.lastFocus?.focus?.()}
function open(){mount();state.lastFocus=d.activeElement;state.open=true;$('elite-ref-overlay').hidden=false;d.body.classList.add('elite-ref-active');load();$('elite-ref-search').focus()}
root.EliteBohemiaPriceReference=Object.freeze({open,close,get loadedCount(){return state.items.length},get priced(){return state.pricedCount>0}});
})(typeof window!=='undefined'?window:globalThis);
