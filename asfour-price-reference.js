/* Asfour retail-price reference. Does not modify showroom products, cart, stock,
   quotations, procurement or product-selection family decisions. */
(function(root){
 'use strict';
 const doc=root.document;
 // Set after the separate Google Apps Script price publisher is deployed.
 const ENDPOINT=clean(root.LImperialAsfourPriceFeedUrl||'');
 const PAGE_SIZE=24;
 const state={items:[],open:false,loading:false,error:'',query:'',family:'',type:'',sort:'default',view:'gallery',visible:PAGE_SIZE,sourceUpdated:'',lastFocus:null};
 const el=id=>doc.getElementById(id);
 const h=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
 const clean=x=>String(x||'').trim();
 const p=x=>'$'+Number(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const safeUrl=value=>{
   const raw=clean(value);
   if(!/^https:\/\//i.test(raw))return '';
   try{const u=new URL(raw);return u.protocol==='https:'?u.href:''}catch(_){return ''}
 };
 function normalize(input){
   if(!input||typeof input!=='object')return null;
   const code=clean(input.code),usd=Number(input.priceUsd);
   if(!/^\d{4,5}\/\d{1,4}\/\d{1,3}\/\d{1,3}$/.test(code)||!Number.isFinite(usd)||usd<=0)return null;
   return{code,priceUsd:usd,name:clean(input.name).slice(0,160)||'Asfour '+code,
     family:clean(input.family).slice(0,90)||code.split('/')[0],
     type:clean(input.type).slice(0,80),size:clean(input.size).slice(0,100),
     finish:clean(input.finish).slice(0,80),crystal:clean(input.crystal).slice(0,80),
     photo:safeUrl(input.photoUrl)};
 }
 function validate(payload){
   if(!payload||payload.version!==1||!Array.isArray(payload.items)||payload.items.length>5000)throw Error('Invalid approved price feed');
   if(payload.error)throw Error('The Asfour price publisher is unavailable');
   const seen=new Set();
   return payload.items.map(normalize).filter(x=>{
     if(!x||seen.has(x.code))return false;
     seen.add(x.code);return true;
   });
 }
 let resolver=null;
 root.__LimperialAsfourPriceReceive=function(data){
   if(resolver){const cb=resolver;resolver=null;cb(data)}
 };
 function feed(){
   return new Promise((resolve,reject)=>{
     const url=safeUrl(ENDPOINT);
     if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)){
       reject(Error('Asfour price publisher is not connected yet. Configure its Apps Script /exec URL.'));return;
     }
     if(resolver){reject(Error('An Asfour reference update is already running'));return}
     const script=doc.createElement('script');
     const timer=setTimeout(()=>{if(resolver){resolver=null;cleanup();reject(Error('Asfour prices timed out. Retry.'))}},17000);
     function cleanup(){clearTimeout(timer);script.remove()}
     resolver=data=>{cleanup();resolve(data)};
     script.onerror=()=>{resolver=null;cleanup();reject(Error('Cannot load the Asfour retail-price publisher'))};
     script.src=url+'?callback=__LimperialAsfourPriceReceive&_='+Date.now();
     doc.head.appendChild(script);
   });
 }
 async function load(){
   if(state.loading)return;
   state.loading=true;state.error='';render();
   try{
     const data=await feed();
     state.items=validate(data);
     state.sourceUpdated=data.updatedAt||'';
   }catch(e){state.error=e.message||'Unable to load Asfour prices';state.items=[]}
   finally{state.loading=false;render()}
 }
 function filtered(){
   const q=state.query.toLowerCase();
   const list=state.items.filter(x=>(!state.family||x.family===state.family)&&(!state.type||x.type===state.type)&&
     (!q||[x.code,x.name,x.family,x.type,x.size,x.finish,x.crystal].join(' ').toLowerCase().includes(q)));
   if(state.sort==='priceAsc')list.sort((a,b)=>a.priceUsd-b.priceUsd);
   if(state.sort==='priceDesc')list.sort((a,b)=>b.priceUsd-a.priceUsd);
   if(state.sort==='code')list.sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
   return list;
 }
 function options(node,values,current,label){
   if(!node)return;
   node.replaceChildren();
   const base=doc.createElement('option');base.value='';base.textContent=label;node.appendChild(base);
   values.forEach(value=>{const o=doc.createElement('option');o.value=value;o.textContent=value;node.appendChild(o)});
   node.value=current;
 }
 function refreshFilters(){
   options(el('asfour-ref-family'),[...new Set(state.items.map(x=>x.family))].sort(),state.family,'All families');
   options(el('asfour-ref-type'),[...new Set(state.items.map(x=>x.type).filter(Boolean))].sort(),state.type,'All product types');
 }
 function render(){
   if(!state.open)return;
   const target=el('asfour-ref-results'),status=el('asfour-ref-status'),more=el('asfour-ref-more');
   if(!target||!status||!more)return;
   refreshFilters();
   target.replaceChildren();
   const rows=filtered(),count=el('asfour-ref-count');
   if(count)count.textContent=rows.length+' approved price'+(rows.length===1?'':'s');
   const view=state.view==='list';
   target.className='asfour-ref-grid'+(view?' is-list':'');
   if(state.loading){status.hidden=false;status.textContent='Loading approved Asfour USD prices…';more.hidden=true;return}
   if(state.error){status.hidden=false;status.textContent=state.error;more.hidden=true;return}
   if(!rows.length){status.hidden=false;status.textContent='No approved Asfour selling prices match these filters. Only rows with Status = Approved and a valid USD price are displayed.';more.hidden=true;return}
   status.hidden=true;
   const fragment=doc.createDocumentFragment();
   for(const item of rows.slice(0,state.visible)){
     const card=doc.createElement('article');card.className='asfour-ref-item';
     const image=item.photo?'<img src="'+h(item.photo)+'" loading="lazy" alt="Asfour '+h(item.code)+' photo" referrerpolicy="no-referrer">':
       '<div class="asfour-ref-missing"><i class="fa-solid fa-image" aria-hidden="true"></i><span>No verified item photo</span></div>';
     card.innerHTML='<div class="asfour-ref-image">'+image+'</div><div class="asfour-ref-info">'+
       '<div class="asfour-ref-family">'+h(item.family)+(item.type?' · '+h(item.type):'')+'</div>'+
       '<div class="asfour-ref-name">'+h(item.name)+'</div><div class="asfour-ref-code">'+h(item.code)+'</div>'+
       '<div class="asfour-ref-spec">'+[item.size,item.finish,item.crystal].filter(Boolean).map(h).join(' · ')+'</div>'+
       '<div class="asfour-ref-price"><strong class="asfour-sales-price">'+h(p(item.priceUsd))+'</strong><span class="asfour-hidden-price">Hidden</span></div>'+
       '</div>';
     if(item.photo){card.querySelector('img')?.addEventListener('click',()=>showPhoto(item))}
     fragment.appendChild(card);
   }
   target.appendChild(fragment);
   more.hidden=rows.length<=state.visible;
   if(!more.hidden)more.textContent='Show '+Math.min(PAGE_SIZE,rows.length-state.visible)+' more';
 }
 function showPhoto(item){
   const zoom=el('asfour-ref-photo-preview');
   if(!zoom||!item.photo)return;
   zoom.querySelector('img').src=item.photo;
   zoom.querySelector('.asfour-ref-photo-label').textContent=item.name+' · '+item.code;
   zoom.hidden=false;
 }
 function close(){
   state.open=false;
   const modal=el('asfour-ref-overlay');if(modal)modal.hidden=true;
   doc.body.classList.remove('asfour-reference-open');
   if(state.lastFocus?.focus)state.lastFocus.focus();
 }
 function build(){
   if(el('asfour-ref-overlay'))return;
   const modal=doc.createElement('div');
   modal.id='asfour-ref-overlay';modal.className='da-ref-overlay asfour-ref-overlay';modal.hidden=true;
   modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Asfour Price Reference');
   modal.innerHTML='<div class="da-ref-panel asfour-ref-panel">'+
     '<header class="da-ref-header"><div class="da-ref-heading"><span class="da-ref-kicker"><i class="fa-solid fa-gem"></i> GENERAL PRICE REFERENCE</span>'+
     '<h2>Asfour</h2><p>Approved USD selling prices only · Separate from Stock and quotations</p></div>'+
     '<button type="button" id="asfour-ref-close" class="da-ref-close" aria-label="Close reference">×</button></header>'+
     '<div class="asfour-ref-controls"><input id="asfour-ref-search" type="search" placeholder="Search code, design, finish, crystal or size…" aria-label="Search Asfour">'+
     '<select id="asfour-ref-family" aria-label="Family"></select><select id="asfour-ref-type" aria-label="Type"></select>'+
     '<select id="asfour-ref-sort" aria-label="Sort"><option value="default">Original order</option><option value="code">Product code</option>'+
     '<option value="priceAsc">Price low to high</option><option value="priceDesc">Price high to low</option></select>'+
     '<div class="asfour-ref-view"><button type="button" data-view="gallery">Photos</button><button type="button" data-view="list">List</button></div></div>'+
     '<div class="asfour-ref-counter"><b id="asfour-ref-count">0 approved prices</b><button type="button" id="asfour-ref-refresh">Refresh prices</button></div>'+
     '<div class="asfour-ref-scroll"><div id="asfour-ref-status" class="asfour-ref-status"></div>'+
     '<div id="asfour-ref-results" class="asfour-ref-grid"></div><button type="button" id="asfour-ref-more" class="da-ref-more" hidden>Load more</button></div>'+
     '<footer class="da-ref-bottom"><span>Approved selling-price reference only. Exact photos required for visual matching. No supplier cost or stock quantity.</span>'+
     '<span class="da-ref-bottom-secondary">Not in Stock · No automatic quotation changes</span></footer>'+
     '<div id="asfour-ref-photo-preview" class="asfour-ref-photo-preview" hidden><button type="button" aria-label="Close photo">×</button><img alt="Asfour reference">'+
     '<div class="asfour-ref-photo-label"></div></div></div>';
   doc.body.appendChild(modal);
   modal.addEventListener('pointerdown',e=>{if(e.target===modal)close()});
   modal.addEventListener('keydown',e=>{if(e.key==='Escape'){const preview=el('asfour-ref-photo-preview');if(preview&&!preview.hidden)preview.hidden=true;else close()}});
   el('asfour-ref-close').onclick=close;
   el('asfour-ref-search').oninput=e=>{state.query=e.target.value.trim();state.visible=PAGE_SIZE;render()};
   el('asfour-ref-family').onchange=e=>{state.family=e.target.value;state.visible=PAGE_SIZE;render()};
   el('asfour-ref-type').onchange=e=>{state.type=e.target.value;state.visible=PAGE_SIZE;render()};
   el('asfour-ref-sort').onchange=e=>{state.sort=e.target.value;render()};
   el('asfour-ref-more').onclick=()=>{state.visible+=PAGE_SIZE;render()};
   el('asfour-ref-refresh').onclick=load;
   el('asfour-ref-photo-preview').querySelector('button').onclick=()=>el('asfour-ref-photo-preview').hidden=true;
   modal.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{state.view=button.dataset.view;render()});
 }
 function open(){
   build();
   if(state.open)return;
   state.lastFocus=doc.activeElement;
   state.open=true;el('asfour-ref-overlay').hidden=false;doc.body.classList.add('asfour-reference-open');
   render();el('asfour-ref-search').focus();
   if(!state.items.length)load();
 }
 function install(){
   const anchor=el('da-price-reference-button')||el('showroom-price-toggle');
   if(!anchor||el('asfour-price-reference-button'))return;
   const button=doc.createElement('button');
   button.id='asfour-price-reference-button';button.type='button';button.className='da-ref-trigger';
   button.title='Asfour approved USD selling price reference — separate from stock';
   button.innerHTML='<i class="fa-solid fa-gem" aria-hidden="true"></i><span>Asfour Prices</span>';
   button.addEventListener('click',open);
   anchor.after(button);
 }
 root.AsfourPriceReference=Object.freeze({open,close,validate,normalize,get loadedCount(){return state.items.length}});
 if(doc){if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',install,{once:true});else install();}
})(typeof window!=='undefined'?window:globalThis);
