/* Elite Bohemia catalog and future selling-price reference. NEVER inventory.
   Item source is the 5 uploaded supplier PDF catalogs; prices are deliberately blank. */
(function(root){
'use strict';
const d=root.document;if(!d)return;
const PATH='./assets/price-reference/elite-bohemia-catalog.json';
const $=id=>d.getElementById(id);
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={items:[],filtered:[],query:'',category:'',source:'',shown:48,open:false,loaded:false,loading:null,error:'',lastFocus:null};
const catalogLabels={'2014 catalog':'2014 Chandeliers','2016 catalog':'2016 Chandeliers','2017 catalog':'2017 Chandeliers','2017 lamps':'2017 Lamps','Storybook':'Crystal Chandelier Storybook'};
function mount(){
 if($('elite-ref-overlay'))return;
 const overlay=d.createElement('section');overlay.id='elite-ref-overlay';overlay.className='elite-ref-overlay';overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Elite Bohemia Catalog Reference');
 overlay.innerHTML='<div class="elite-ref-dialog"><header class="da-ref-header"><div class="da-ref-heading"><span class="da-ref-kicker">CATALOG & PRICE REFERENCE</span><h2>Elite Bohemia</h2><p>Bohemian crystal lighting · Unpriced catalog · Not stock inventory</p></div><button type="button" id="elite-ref-close" class="da-ref-close" aria-label="Close Elite Bohemia">×</button></header>'+
 '<div class="elite-ref-tools"><input id="elite-ref-search" type="search" placeholder="Search supplier model code, dimension, catalog…" aria-label="Search Elite Bohemia models"><select id="elite-ref-category" aria-label="Product category"><option value="">All types</option></select><select id="elite-ref-catalog" aria-label="Source catalog"><option value="">All catalogs</option></select></div>'+
 '<div class="elite-ref-summary" id="elite-ref-summary"></div><div class="elite-ref-scroll"><div class="elite-ref-cards" id="elite-ref-cards"></div><div class="elite-ref-empty" id="elite-ref-empty" hidden></div><button class="elite-ref-more" id="elite-ref-more" type="button">Load more products</button></div>'+
 '<footer class="elite-ref-footer">Price: awaiting supplier price list · Reference-only (no inventory, stock quantity or cost) · Confirm finish and dimensions with original supplier catalog before ordering.</footer></div>';
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
   state.items=x.items.filter(y=>y&&typeof y.code==='string'&&Array.isArray(y.sources));
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
 state.filtered=state.items.filter(row=>(!state.category||row.category===state.category)&&(!state.source||row.catalogs.includes(state.source))&&words.every(word=>(row.code+' '+row.category+' '+row.dimension+' '+row.catalogs.join(' ')).toLowerCase().includes(word)));
 $('elite-ref-summary').textContent=state.filtered.length+' model codes · '+state.items.length+' total indexed · 5 supplier catalogs · Prices pending';
 const holder=$('elite-ref-cards');holder.replaceChildren();
 const frag=d.createDocumentFragment();
 for(const item of state.filtered.slice(0,state.shown)){
  const card=d.createElement('article');card.className='elite-ref-card';
  const main=item.sources?.[0]||{},cat=catalogLabels[main.catalog]||main.catalog||'Supplier catalog';
  const sourceLinks=item.sources.slice(0,4).map(s=>'<span class="elite-ref-source">'+h(catalogLabels[s.catalog]||s.catalog)+' · PDF p. '+h(s.page)+'</span>').join('');
  const thumb=item.imageUrl?'<img src="'+h(item.imageUrl)+'" loading="lazy" alt="Elite Bohemia '+h(item.code)+' supplier reference photo">':'<div class="elite-ref-image-placeholder"><span>Elite<br>Bohemia</span><small>Catalog image pending</small></div>';
  card.innerHTML='<div class="elite-ref-image">'+thumb+'</div><div class="elite-ref-data"><div class="elite-ref-type">'+h(item.category||'Crystal lighting')+'</div>'+
   '<h3>'+h(item.code)+'</h3>'+
   '<div class="elite-ref-dimension">'+(item.dimension?'Catalog dimensions (verify): '+h(item.dimension):'Dimensions: see supplier PDF')+'</div>'+
   '<div class="elite-ref-sources">'+sourceLinks+'</div>'+
   '<div class="elite-ref-price">Price not supplied</div>'+
   '<small class="elite-ref-caution">Catalog reference only · No stock · Check original PDF before ordering</small></div>';
  frag.appendChild(card);
 }
 holder.appendChild(frag);
 $('elite-ref-more').hidden=state.filtered.length<=state.shown;
 $('elite-ref-empty').hidden=state.filtered.length>0;
 $('elite-ref-empty').textContent=state.filtered.length?'':'No matching Elite Bohemia model code.';
}
function close(){state.open=false;const x=$('elite-ref-overlay');if(x)x.hidden=true;d.body.classList.remove('elite-ref-active');state.lastFocus?.focus?.()}
function open(){mount();state.lastFocus=d.activeElement;state.open=true;$('elite-ref-overlay').hidden=false;d.body.classList.add('elite-ref-active');load();$('elite-ref-search').focus()}
root.EliteBohemiaPriceReference=Object.freeze({open,close,get loadedCount(){return state.items.length},get priced(){return false}});
})(typeof window!=='undefined'?window:globalThis);
