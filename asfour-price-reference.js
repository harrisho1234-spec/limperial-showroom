/* Asfour retail-price reference. Does not modify showroom products, cart, stock,
   quotations, procurement or product-selection family decisions. */
(function(root){
 'use strict';
 const doc=root.document;
 // Set after the separate Google Apps Script price publisher is deployed.
 const ENDPOINT=String(root.LImperialAsfourPriceFeedUrl||'').trim();
 const SNAPSHOT_URL='./assets/price-reference/asfour-actual-sales-2026-11-20.json';
 const PHOTO_MANIFEST_URL='./assets/price-reference/asfour-photo-manifest.json';
 const PHOTO_BASE='./assets/price-reference/asfour-photos/';
 const PHOTO_ZIP_URL='./assets/price-reference/asfour_photo_assets_only.zip';
 const PHOTO_PACK_BASE='./assets/price-reference/asfour-photo-pack/';
 const PAGE_SIZE=24;
 const state={items:[],open:false,loading:false,error:'',query:'',family:'',type:'',sort:'default',view:'gallery',visible:PAGE_SIZE,sourceUpdated:'',lastFocus:null,photoReady:false,photoZip:null,photoUrls:new Map()};
 const el=id=>doc.getElementById(id);
 const h=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
 const clean=x=>String(x||'').trim();
 const p=x=>'$'+Number(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const safeUrl=value=>{
   const raw=clean(value);
   if(!/^https:\/\/[^\s<>"']+$/i.test(raw))return '';
   // Convert exact-item Google Drive links to usable thumbnails.
   const match=raw.match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/i);
   const query=raw.match(/^https:\/\/drive\.google\.com\/(?:open|uc)\?[^#]*[?&]id=([A-Za-z0-9_-]{10,})/i);
   const fileId=match?.[1]||query?.[1];
   return fileId?'https://drive.google.com/thumbnail?id='+encodeURIComponent(fileId)+'&sz=w1200':raw;
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
 async function snapshotFeed(){
   const response=await fetch(SNAPSHOT_URL,{cache:'no-store'});
   if(!response.ok)throw Error('Asfour selling-price snapshot is unavailable');
   const snapshot=await response.json();
   if(snapshot.format!=='gzip-json-price-map-v1'||snapshot.count!==1363||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(snapshot.data||''))
       throw Error('Invalid Asfour selling-price snapshot');
   if(typeof DecompressionStream!=='function')
     throw Error('This browser cannot load the compressed price reference. Update Chrome.');
   const binary=Uint8Array.from(atob(snapshot.data),c=>c.charCodeAt(0));
   const decompressed=new Blob([binary]).stream().pipeThrough(new DecompressionStream('gzip'));
   const records=JSON.parse(await new Response(decompressed).text());
   const entries=Object.entries(records);
   if(entries.length!==snapshot.count)throw Error('Asfour price count mismatch');
   const names={31111:'Maria Theresa Chandelier',31113:'Maria Theresa Linear / Ceiling',
                31114:'Maria Theresa Wall Lamp',31611:'Brass Chandelier',31614:'Brass Wall Lamp'};
   const finishNames={'119':'Gold','121':'Chrome','110':'Gold Oxidized'};
   const crystalNames={'105':'Pendeloque','106':'Honey Pendeloque','215':'Golden Shadow Pendeloque'};
   const items=entries.map(([code,value])=>{
     const parts=code.split('/'),series=parts[0]||'',model=parts[1]||'';
     const type=names[series]||(/14$/.test(series)?'Wall Lamp':/11$/.test(series)?'Chandelier':'Asfour Lighting');
     return{code,name:type+' — Design '+model,family:series,type,
       finish:finishNames[parts[2]]||'',crystal:crystalNames[parts[3]]||'',
       priceUsd:value,photoUrl:''};
   });
   return{version:1,items,updatedAt:snapshot.date,retailSnapshot:true};
 }
 function feed(){
   if(!ENDPOINT)return snapshotFeed();
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
   try{
     const photoManifest=await fetch(PHOTO_MANIFEST_URL,{cache:'no-store'});
     if(photoManifest.ok){
       const data=await photoManifest.json();
       state.photoReady=data.version===1&&data.count===1368;
     }else state.photoReady=false;
   }catch(_){state.photoReady=false;}
   if(!state.photoReady && !state.photoZip && root.JSZip){
     try{
       let archive;
       const direct=await fetch(PHOTO_ZIP_URL,{cache:'force-cache'});
       if(direct.ok){
         archive=await direct.blob();
       }else{
         // GitHub Pages photo assets are split into small binary parts. This
         // package contains reference images only (no supplier or sale prices).
         const response=await fetch(PHOTO_PACK_BASE+'manifest.json',{cache:'force-cache'});
         if(!response.ok)throw Error('Asfour photo pack missing');
         const manifest=await response.json();
         if(manifest.version!==1||manifest.parts!==10||manifest.photoCount!==1368||
            manifest.bytes!==3656956||!manifest.assetOnly)
           throw Error('Asfour photo manifest mismatch');
         const segments=await Promise.all(Array.from({length:manifest.parts},async(_,i)=>{
           const filename='part'+String(i+1).padStart(2,'0')+'.bin';
           const r=await fetch(PHOTO_PACK_BASE+filename,{cache:'force-cache'});
           if(!r.ok)throw Error('Missing Asfour photo part: '+filename);
           return new Uint8Array(await r.arrayBuffer());
         }));
         const bytes=new Uint8Array(manifest.bytes);
         let offset=0;
         for(const segment of segments){
           if(offset+segment.byteLength>bytes.length)throw Error('Asfour photo pack overflow');
           bytes.set(segment,offset);offset+=segment.byteLength;
         }
         if(offset!==manifest.bytes)throw Error('Asfour photo pack size mismatch');
         if(root.crypto?.subtle){
           const digest=await root.crypto.subtle.digest('SHA-256',bytes);
           const hex=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
           if(hex!==manifest.sha256)throw Error('Asfour photo checksum mismatch');
         }
         archive=new Blob([bytes],{type:'application/zip'});
       }
       const zip=await root.JSZip.loadAsync(archive);
       const manifest=JSON.parse(await zip.file('photo-manifest.json').async('string'));
       if(manifest.version===1 && manifest.count===1368)state.photoZip=zip;
     }catch(error){
       console.warn('Asfour photo package could not be loaded',error);
       state.photoZip=null;
     }
   }
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
   if(count)count.textContent=rows.length+' actual sale price'+(rows.length===1?'':'s');
   const view=state.view==='list';
   el('asfour-ref-overlay')?.querySelectorAll('[data-view]').forEach(button=>{
     button.setAttribute('aria-pressed',String(button.dataset.view===state.view));
   });
   target.className='asfour-ref-grid'+(view?' is-list':'');
   if(state.loading){status.hidden=false;status.textContent='Loading Asfour actual USD selling prices…';more.hidden=true;return}
   if(state.error){status.hidden=false;status.textContent=state.error;more.hidden=true;return}
   if(!rows.length){status.hidden=false;status.textContent='No Asfour actual selling prices match these filters. Five items without an actual USD selling price are excluded.';more.hidden=true;return}
   status.hidden=true;
   const fragment=doc.createDocumentFragment();
   for(const item of rows.slice(0,state.visible)){
     const card=doc.createElement('article');card.className='asfour-ref-item';
     const exactPhoto=item.photo||safeUrl(root.LImperialAsfourExactPhotos?.[item.code]);
     const bundledPhoto=state.photoReady?PHOTO_BASE+item.code.replaceAll('/','_')+'.jpg':'';
     const matchingPhoto=exactPhoto||bundledPhoto;
     const zipFile=!matchingPhoto&&state.photoZip?.file('photos/'+item.code.replaceAll('/','_')+'.jpg');
     const image=matchingPhoto?'<img src="'+h(matchingPhoto)+'" loading="lazy" alt="Asfour '+h(item.code)+' photo" referrerpolicy="no-referrer">':
       zipFile?'<img class="asfour-zip-photo" alt="Asfour '+h(item.code)+' design reference" loading="lazy">':
       '<div class="asfour-ref-missing"><i class="fa-solid fa-image" aria-hidden="true"></i><span>No verified item photo</span></div>';
     card.innerHTML='<div class="asfour-ref-image">'+image+'</div><div class="asfour-ref-info">'+
       '<div class="asfour-ref-family">'+h(item.family)+(item.type?' · '+h(item.type):'')+'</div>'+
       '<div class="asfour-ref-name">'+h(item.name)+'</div><div class="asfour-ref-code">'+h(item.code)+'</div>'+
       '<div class="asfour-ref-spec">'+[item.size,item.finish,item.crystal].filter(Boolean).map(h).join(' · ')+'</div>'+ 
       ((bundledPhoto||zipFile)&&!exactPhoto?'<div class="asfour-ref-photo-warning">Design reference photo · finish may vary</div>':'')+
       '<div class="asfour-ref-price"><strong class="asfour-sales-price">'+h(p(item.priceUsd))+'</strong><span class="asfour-hidden-price">Hidden</span></div>'+
       '</div>';
     if(matchingPhoto){card.querySelector('img')?.addEventListener('click',()=>showPhoto({...item,photo:matchingPhoto},exactPhoto?'exact':'reference'))}
     if(zipFile){
       const img=card.querySelector('img');
       const cached=state.photoUrls.get(item.code);
       if(cached){img.src=cached;img.addEventListener('click',()=>showPhoto({...item,photo:cached},'reference'))}
       else zipFile.async('blob').then(blob=>{
         const url=root.URL.createObjectURL(blob);state.photoUrls.set(item.code,url);
         if(img.isConnected){img.src=url;img.addEventListener('click',()=>showPhoto({...item,photo:url},'reference'))}
       }).catch(()=>{img.replaceWith(doc.createTextNode('Photo could not be loaded'))});
     }
     card.querySelector('img')?.addEventListener('error',e=>{
       const fallback=doc.createElement('div');fallback.className='asfour-ref-missing';
       fallback.textContent='Photo unavailable';e.target.replaceWith(fallback);
     });
     fragment.appendChild(card);
   }
   target.appendChild(fragment);
   more.hidden=rows.length<=state.visible;
   if(!more.hidden)more.textContent='Show '+Math.min(PAGE_SIZE,rows.length-state.visible)+' more';
 }
 function closePhoto(){
   const zoom=el('asfour-ref-photo-preview');
   if(!zoom||zoom.hidden)return;
   zoom.hidden=true;
   const img=zoom.querySelector('img');
   if(img)img.removeAttribute('src');
   if(state.previewFocus?.isConnected)state.previewFocus.focus();
   state.previewFocus=null;
 }
 function showPhoto(item,photoKind){
   const zoom=el('asfour-ref-photo-preview');
   if(!zoom||!item.photo)return;
   state.previewFocus=doc.activeElement;
   const img=zoom.querySelector('img');
   img.src=item.photo;
   img.alt='Reference photo of '+item.name+' · '+item.code;
   zoom.querySelector('.asfour-preview-family').textContent=[item.family,item.type].filter(Boolean).join(' · ');
   zoom.querySelector('.asfour-preview-name').textContent=item.name;
   zoom.querySelector('.asfour-preview-code').textContent=item.code;
   const specs=[item.size,item.finish,item.crystal].filter(Boolean);
   const details=zoom.querySelector('.asfour-preview-specs');
   details.textContent=specs.join(' · ');
   details.hidden=!specs.length;
   zoom.querySelector('.asfour-preview-price').textContent=p(item.priceUsd);
   zoom.querySelector('.asfour-preview-disclaimer').textContent=photoKind==='exact'
     ?'This photo matches the individual product reference. Selling prices are for reference only.'
     :'Design reference photo · Finish or crystal may vary. Confirm the exact product before offering it to a customer.';
   zoom.hidden=false;
   el('asfour-ref-preview-close')?.focus();
 }
 function close(){
   closePhoto();
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
     '<h2>Asfour</h2><p>Actual USD selling prices · Separate from Stock and quotations</p></div>'+
     '<button type="button" id="asfour-ref-close" class="da-ref-close" aria-label="Close reference">×</button></header>'+
     '<div class="asfour-ref-controls">'+
       '<div class="da-ref-search-box"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="asfour-ref-search" type="search" placeholder="Search code, design, finish, crystal or size…" aria-label="Search Asfour"></div>'+
       '<label class="da-ref-field"><span>Family</span><select id="asfour-ref-family" aria-label="Family"></select></label>'+
       '<label class="da-ref-field"><span>Product type</span><select id="asfour-ref-type" aria-label="Type"></select></label>'+
       '<label class="da-ref-field"><span>Sort</span><select id="asfour-ref-sort" aria-label="Sort"><option value="default">Original order</option><option value="code">Product code</option>'+
       '<option value="priceAsc">Price low to high</option><option value="priceDesc">Price high to low</option></select></label></div>'+
     '<div class="asfour-ref-counter da-ref-results-bar"><b id="asfour-ref-count">0 approved prices</b>'+
       '<div class="asfour-ref-results-actions"><button type="button" id="asfour-ref-refresh"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Refresh prices</button>'+
       '<div class="asfour-ref-view da-ref-view-switch" role="group" aria-label="Display layout"><button type="button" data-view="gallery"><i class="fa-solid fa-grip" aria-hidden="true"></i> Photos</button><button type="button" data-view="list"><i class="fa-solid fa-list" aria-hidden="true"></i> List</button></div></div></div>'+
     '<div class="asfour-ref-scroll"><div id="asfour-ref-status" class="asfour-ref-status"></div>'+
     '<div id="asfour-ref-results" class="asfour-ref-grid"></div><button type="button" id="asfour-ref-more" class="da-ref-more" hidden>Load more</button></div>'+
     '<footer class="da-ref-bottom"><span>Actual retail prices from the uploaded workbook (20 Nov 2026). Exact photos only when available. No supplier costs or stock quantities.</span>'+
     '<span class="da-ref-bottom-secondary">Not in Stock · No automatic quotation changes</span></footer>'+
     '<div id="asfour-ref-photo-preview" class="asfour-ref-photo-preview da-ref-preview" hidden role="dialog" aria-modal="true" aria-label="Asfour product preview">'+
       '<div class="da-ref-preview-dialog asfour-preview-dialog">'+
         '<button type="button" id="asfour-ref-preview-close" class="da-ref-preview-close" aria-label="Close photo preview"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>'+
         '<div class="da-ref-preview-content">'+
           '<div class="da-ref-preview-stage asfour-preview-stage"><img alt="Asfour product reference"></div>'+
           '<div class="da-ref-preview-info">'+
             '<span class="da-ref-collection-label asfour-preview-family"></span>'+
             '<h3 class="asfour-preview-name"></h3>'+
             '<p class="asfour-preview-code"></p>'+
             '<p class="asfour-preview-specs"></p>'+
             '<div class="da-ref-preview-price"><b class="da-price-ref-price asfour-sales-price asfour-preview-price"></b><span class="da-price-ref-price-hidden asfour-hidden-price">Price hidden</span><small>USD · Reference only · Not part of Stock</small></div>'+
             '<p class="da-ref-preview-disclaimer asfour-preview-disclaimer"></p>'+
           '</div></div></div></div></div>';
   doc.body.appendChild(modal);
   modal.addEventListener('pointerdown',e=>{if(e.target===modal)close()});
   modal.addEventListener('keydown',e=>{if(e.key==='Escape'){const preview=el('asfour-ref-photo-preview');if(preview&&!preview.hidden)closePhoto();else close();e.stopPropagation()}});
   el('asfour-ref-close').onclick=close;
   el('asfour-ref-search').oninput=e=>{state.query=e.target.value.trim();state.visible=PAGE_SIZE;render()};
   el('asfour-ref-family').onchange=e=>{state.family=e.target.value;state.visible=PAGE_SIZE;render()};
   el('asfour-ref-type').onchange=e=>{state.type=e.target.value;state.visible=PAGE_SIZE;render()};
   el('asfour-ref-sort').onchange=e=>{state.sort=e.target.value;render()};
   el('asfour-ref-more').onclick=()=>{state.visible+=PAGE_SIZE;render()};
   el('asfour-ref-refresh').onclick=load;
   el('asfour-ref-preview-close').onclick=closePhoto;
   el('asfour-ref-photo-preview').addEventListener('pointerdown',e=>{if(e.target===el('asfour-ref-photo-preview'))closePhoto()});
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
   button.title='Asfour actual USD selling price reference — separate from stock';
   button.innerHTML='<i class="fa-solid fa-gem" aria-hidden="true"></i><span>Asfour Prices</span>';
   button.addEventListener('click',open);
   anchor.after(button);
 }
 root.AsfourPriceReference=Object.freeze({open,close,validate,normalize,get loadedCount(){return state.items.length}});
 if(root.addEventListener)root.addEventListener('showroom:products-loaded',()=>{if(state.open)render()});
 if(doc){if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',install,{once:true});else install();}
})(typeof window!=='undefined'?window:globalThis);
