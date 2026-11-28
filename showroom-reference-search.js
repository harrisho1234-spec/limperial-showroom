/* Read-only price reference discovery alongside the showroom stock search.
   NEVER adds reference items to inventory, quotations, cart or interest records. */
(function(root){
 'use strict';
 const doc=root.document;
 if(!doc)return;
 const ASFOUR='./assets/price-reference/asfour-actual-sales-2026-11-20.json';
 const DESCRIPTIONS='./assets/price-reference/asfour-supplier-descriptions.json';
 const ASFOUR_DIMENSIONS='./assets/price-reference/asfour-dimensions-by-code.json';
 const DELUXE='./assets/price-reference/deluxe-arte.json';
 const ARREDOLUCE='./assets/price-reference/arredoluce-actual-sales-2026-11-20.json';
 const ELITE='./assets/price-reference/elite-bohemia-catalog.json';
 let rows=[],loading=null,lastQuery='',requestId=0;
 const byId=id=>doc.getElementById(id);
 const text=v=>String(v==null?'':v);
 function safe(s){return text(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 function price(n){return '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
 async function load(){
   if(loading)return loading;
   loading=(async()=>{
     const [da,af,desc,arredo,asfourDimensions,elite]=await Promise.allSettled([
       root.LImperialShowroomAuth.getPriceReference('deluxe'),
       root.LImperialShowroomAuth.getPriceReference('asfour'),
       fetch(DESCRIPTIONS).then(r=>{if(!r.ok)throw Error('Descriptions unavailable');return r.json()}),
       root.LImperialShowroomAuth.getPriceReference('arredoluce'),
       fetch(ASFOUR_DIMENSIONS).then(r=>{if(!r.ok)throw Error('Asfour dimensions unavailable');return r.json()}),
       fetch(ELITE).then(r=>{if(!r.ok)throw Error('Elite Bohemia catalog unavailable');return r.json()})
     ]);
     const results=[];
     if(da.status==='fulfilled'&&da.value.kind==='reference_only'&&da.value.brand==='Deluxe Arte'&&Array.isArray(da.value.items)){
       for(const x of da.value.items){
         if(!x||!/^DA-REF-\d+$/.test(text(x.id))||!Number.isFinite(x.priceUsd)||x.priceUsd<=0)continue;
         results.push({brand:'Deluxe Arte',code:x.id,name:text(x.name),details:[x.collection,x.dimensions,x.designVariant].filter(Boolean).join(' '),price:x.priceUsd});
       }
     }
     if(af.status==='fulfilled'&&af.value.format==='gzip-json-price-map-v1'&&af.value.count===1363&&typeof DecompressionStream==='function'){
       try{
         const bin=Uint8Array.from(atob(af.value.data),c=>c.charCodeAt(0));
         const stream=new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
         const dictionary=JSON.parse(await new Response(stream).text());
         const descriptions=desc.status==='fulfilled'&&desc.value.kind==='asfour_supplier_descriptions'?desc.value.descriptions||{}:{};
         const sizes=asfourDimensions.status==='fulfilled'&&asfourDimensions.value.kind==='asfour_exact_code_dimensions'?asfourDimensions.value.dimensions||{}:{};
         const labels={'31111':'Maria Theresa Chandelier','31113':'Maria Theresa Linear / Ceiling','31114':'Maria Theresa Wall Lamp','31611':'Brass Chandelier','31614':'Brass Wall Lamp'};
         for(const [code,amount] of Object.entries(dictionary)){
           if(!/^\d{4,5}\/\d{1,4}\/\d{1,3}\/\d{1,3}$/.test(code)||!Number.isFinite(amount)||amount<=0)continue;
           const bits=code.split('/'),family=bits[0],fallback=(labels[family]||'Asfour Lighting')+' — Design '+bits[1];
           results.push({brand:'Asfour',code,name:text(descriptions[code]||fallback),details:['Series '+family,sizes[code]||''].filter(Boolean).join(' · '),price:amount});
         }
       }catch(err){console.warn('Read-only Asfour search unavailable',err)}
     }
     if(arredo.status==='fulfilled'&&arredo.value.brand==='Arredoluce'&&arredo.value.kind==='reference_only'&&arredo.value.currency==='USD'&&Array.isArray(arredo.value.items)){
       for(const x of arredo.value.items){
         if(!x||typeof x.code!=='string'||!Number.isFinite(x.priceUsd)||x.priceUsd<=0)continue;
         results.push({brand:'Arredoluce',code:x.code,name:x.name||'Arredoluce lighting',details:[x.variant,x.series,x.dimensions,x.type].filter(Boolean).join(' '),price:x.priceUsd});
       }
     }
     if(elite.status==='fulfilled'&&elite.value.brand==='Elite Bohemia'&&elite.value.kind==='catalog_reference_only'&&Array.isArray(elite.value.items)){
       for(const x of elite.value.items){
         if(!x||typeof x.code!=='string')continue;
         results.push({brand:'Elite Bohemia',code:x.code,name:x.code,details:[x.category,x.dimension,(x.catalogs||[]).join(' ')].filter(Boolean).join(' · '),price:null});
       }
     }
     rows=results;
     return results;
   })();
   return loading;
 }
 function render(){
   const section=byId('showroom-reference-search-results'),search=byId('search-input');
   if(!section||!search)return;
   const query=search.value.trim().toLowerCase();
   lastQuery=query;
   const sizeFilter=root.LImperialSizeFilter;
   const hasSize=!!sizeFilter?.configuration().active;
   if(query.length<2&&!hasSize){section.hidden=true;section.innerHTML='';return}
   section.hidden=false;
   if(!loading){section.innerHTML='<p class="reference-search-loading">Searching price references…</p>';load().then(()=>{if(lastQuery===query)render()});return}
   if(!rows.length){section.innerHTML='<p class="reference-search-loading">Price reference search is unavailable.</p>';return}
   const words=query.split(/\s+/).filter(Boolean);
   const matches=rows.filter(x=>words.every(w=>(x.code+' '+x.name+' '+x.details+' '+x.brand).toLowerCase().includes(w)) &&
     (!hasSize||sizeFilter.matchesFields(x.brand==='Deluxe Arte'?x.details:x.name+' '+x.details)));

   section.replaceChildren();
   if(!matches.length){section.hidden=true;return}
   const header=doc.createElement('div');header.className='reference-search-header';
   header.innerHTML='<strong>Price Reference</strong><span>'+matches.length+' match'+(matches.length===1?'':'es')+' · Reference only, not in Stock</span>';
   section.appendChild(header);
   const list=doc.createElement('div');list.className='reference-search-list';
   for(const item of matches.slice(0,8)){
     const button=doc.createElement('button');button.type='button';button.className='reference-search-item';
     button.innerHTML='<span class="reference-search-name">'+safe(item.name)+'</span><span class="reference-search-meta">'+safe(item.brand)+' · '+safe(item.code)+'</span><span class="reference-search-price">'+safe(item.price==null?'Price pending':price(item.price))+'</span><span class="reference-search-view">View reference ↗</span>';
     button.setAttribute('aria-label','View '+item.brand+' price reference '+item.code);
     button.addEventListener('click',()=>{
       const key=item.brand==='Asfour'?'asfour':item.brand==='Arredoluce'?'arredoluce':item.brand==='Elite Bohemia'?'elite':'deluxe';
       const api=root.LImperialUnifiedPriceReference;
       if(!api?.open)return;
       api.open(key);
       const input=byId(key==='asfour'?'asfour-ref-search':key==='arredoluce'?'arredo-ref-search':key==='elite'?'elite-ref-search':'da-ref-search');
       if(input){input.value=item.code;input.dispatchEvent(new Event('input',{bubbles:true}))}
     });
     list.appendChild(button);
   }
   section.appendChild(list);
   const emptyState=byId('empty-state');
   if(emptyState&&byId('product-grid')?.children.length===0)emptyState.classList.add('hidden');
   if(matches.length>8){
     const small=doc.createElement('p');small.className='reference-search-more';
     small.textContent='Showing first 8 references. Refine your search to see more.';
     section.appendChild(small);
   }
 }
 function init(){
   const search=byId('search-input'),grid=byId('product-grid');
   if(!search||!grid||byId('showroom-reference-search-results'))return;
   const section=doc.createElement('section');section.id='showroom-reference-search-results';
   section.className='reference-search-section';section.hidden=true;
   section.setAttribute('aria-label','Reference-only product search results');
   grid.before(section);
   doc.addEventListener('showroom:employee-authorized',()=>{
     // A search opened before sign-in must retry after staff permission is granted.
     loading=null;rows=[];render();
   });
   search.addEventListener('input',render);
   search.addEventListener('change',render);
   render();
 }
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});else init();
 root.LImperialReferenceSearch=Object.freeze({render});
})(typeof window!=='undefined'?window:globalThis);
