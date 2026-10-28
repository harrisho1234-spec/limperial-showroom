/* Free local photo matching. Images are processed in-browser; no paid vision API. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let generation=0,cache=new Map();
function catalog(){try{return typeof products!=='undefined'&&Array.isArray(products)?products:[];}catch{return [];}}
function photoUrl(p){
 const raw=p.imgLink||p.image_url||p.photo||'';
 try{return typeof resolveGoogleDriveImg==='function'?(resolveGoogleDriveImg(raw)||raw):raw;}catch{return raw;}
}
function imageFrom(src){
 return new Promise((resolve,reject)=>{
  const im=new Image();im.crossOrigin='anonymous';
  const timeout=setTimeout(()=>{im.src='';reject(Error('Image timed out'));},9000);
  im.onload=()=>{clearTimeout(timeout);resolve(im);};
  im.onerror=()=>{clearTimeout(timeout);reject(Error('Image unavailable or cross-origin restricted'));};
  im.src=src;
 });
}
function signature(im){
 const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,16,16);
 const ratio=Math.min(16/im.naturalWidth,16/im.naturalHeight);
 const w=Math.round(im.naturalWidth*ratio),h=Math.round(im.naturalHeight*ratio);
 ctx.drawImage(im,Math.floor((16-w)/2),Math.floor((16-h)/2),w,h);
 const px=ctx.getImageData(0,0,16,16).data,out=[];
 for(let y=0;y<16;y+=2)for(let x=0;x<16;x+=2){
  let rgb=[0,0,0];
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   const k=((y+dy)*16+x+dx)*4;rgb[0]+=px[k];rgb[1]+=px[k+1];rgb[2]+=px[k+2];
  }
  out.push(...rgb.map(v=>v/1020));
 }
 return out;
}
function similarity(a,b){
 let diff=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];diff+=d*d;}
 return 1-Math.sqrt(diff/a.length);
}
let visibleMatches=10;
function render(items,unread,total,reset=false){
 if(reset)visibleMatches=10;
 const el=$('showroom-photo-results');if(!el)return;
 if(!items.length){el.textContent=total?'No readable image matches. Catalog photo hosting may block browser image analysis.':'No catalog products with photos were found.';return;}
 el.innerHTML='<div style="font-size:12px;margin:10px 0;color:#ae9875">Possible matches (appearance only). Verify the correct product. Compared '+(total-unread)+' of '+total+' photos.</div>'+
 items.slice(0,visibleMatches).map((r,i)=>'<div style="display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid #816f4a55">'+
 '<img crossorigin="anonymous" src="'+esc(r.url)+'" alt="" style="width:56px;height:56px;object-fit:contain;border-radius:7px;background:white" onerror="this.style.display=\'none\'">'+
 '<div style="flex:1;min-width:0;font-size:12px"><b>'+esc(r.product.itemName||r.product.code||'Product')+'</b><div>'+esc(r.product.code||'')+' · $'+Number(r.product.price||0).toLocaleString()+'</div><div>Stock: '+esc(r.product.qty??'Unknown')+'</div></div>'+
 '<button type="button" data-photo-index="'+i+'" style="border:1px solid #b38e50;border-radius:8px;padding:8px">View</button></div>').join('');
 el.querySelector('#showroom-photo-load-more')?.addEventListener('click',()=>{visibleMatches+=10;render(items,unread,total);});
 el.querySelectorAll('[data-photo-index]').forEach(btn=>btn.onclick=()=>{
  const product=items[Number(btn.dataset.photoIndex)]?.product;if(!product)return;
  $('showroom-scanner-close')?.click();
  if(typeof openProductDetailModal==='function')openProductDetailModal(product.id);
 });
}
let modelPromise=null;
const EMBED_KEY='limperial_photo_clip_embeddings_v1';
const MODEL='Xenova/clip-vit-base-patch32';
let embedCache=new Map();
try{const raw=JSON.parse(localStorage.getItem(EMBED_KEY)||'[]');if(Array.isArray(raw))embedCache=new Map(raw.slice(0,300));}catch{}
function saveEmbeddings(){
 try{localStorage.setItem(EMBED_KEY,JSON.stringify([...embedCache].slice(-300)));}catch{}
}
function unit(v){const a=Array.from(v);const mag=Math.hypot(...a)||1;return a.map(x=>x/mag);}
function cosine(a,b){let sum=0;for(let i=0;i<a.length;i++)sum+=a[i]*b[i];return sum;}
async function model(){
 if(!modelPromise)modelPromise=(async()=>{
  // Transformers.js v2 uses the stable CLIP feature-extraction API on browsers.
  // Some mobile browsers throw a minified ReferenceError while initializing v3.
  const sources=[
   'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js',
   'https://esm.sh/@xenova/transformers@2.17.2?bundle'
  ];
  const failures=[];
  for(const url of sources){
   try{
    const lib=await import(url);
    const pipeline=lib.pipeline||lib.default?.pipeline;
    if(typeof pipeline!=='function')throw new Error('No image feature extraction export');
    const extractor=await pipeline('image-feature-extraction',MODEL,{quantized:true});
    return extractor;
   }catch(error){
    failures.push((error?.message||String(error)));
    console.warn('[Showroom visual scan] Model source failed',url,error);
   }
  }
  throw new Error('Local vision model failed to initialize: '+failures.join(' / '));
 })().catch(error=>{modelPromise=null;throw error;});
 return modelPromise;
}
async function aiCompare(file,token,output){
 output.textContent='Loading free recognition model (first scan downloads model files)…';
 const extract=await model();if(token!==generation)return;
 const blob=URL.createObjectURL(file);
 let input;
 try{const t=await extract(blob);input=unit(t.data);}finally{URL.revokeObjectURL(blob);}
 const collection=catalog().map(product=>({product,url:photoUrl(product)})).filter(r=>/^https?:|^data:image\\//i.test(r.url)).slice(0,250);
 const results=[];let unread=0,dirty=0,computed=0;
 const ready=collection.filter(entry=>embedCache.has(entry.url));
 const missing=collection.filter(entry=>!embedCache.has(entry.url));
 for(const entry of ready)results.push({...entry,score:cosine(input,embedCache.get(entry.url))});
 results.sort((x,y)=>y.score-x.score);
 if(ready.length&&token===generation)render(results.slice(0,5),0,ready.length);
 // Limit expensive phone-side catalog encoding per scan; reuse saved results next time.
 const batch=missing.slice(0,20);
 for(let i=0;i<batch.length;i++){
  if(token!==generation)return;
  const entry=batch[i];
  try{
   const t=await extract(entry.url),vec=unit(t.data);
   embedCache.set(entry.url,vec);dirty++;computed++;
   results.push({...entry,score:cosine(input,vec)});
  }catch{unread++;}
  if(i%3===0&&token===generation){
   results.sort((x,y)=>y.score-x.score);
   if(results.length)render(results.slice(0,5),unread,ready.length+i+1);
  }
  if(dirty>=5){saveEmbeddings();dirty=0;}
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(dirty)saveEmbeddings();
 results.sort((x,y)=>y.score-x.score);
 if(token!==generation)return;
 render(results.slice(0,5),unread,ready.length+batch.length);
 if(missing.length>batch.length){
  const label=document.createElement('p');
  label.style.cssText='font-size:11px;color:var(--scan-soft);margin-top:8px';
  label.textContent='Fast scan: '+results.length+' indexed photos checked. Additional catalog photos will be indexed over future scans.';
  output.append(label);
 }
}
// Reliable browser-native matcher: avoids mobile model runtime crashes.
// Uses image layout/color plus edge structure; never labels a result as an exact match.
function visualSignature(im){
 const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.fillStyle='#fff';ctx.fillRect(0,0,32,32);
 const scale=Math.min(32/im.naturalWidth,32/im.naturalHeight);
 const w=Math.max(1,Math.round(im.naturalWidth*scale)),h=Math.max(1,Math.round(im.naturalHeight*scale));
 ctx.drawImage(im,Math.floor((32-w)/2),Math.floor((32-h)/2),w,h);
 const px=ctx.getImageData(0,0,32,32).data;
 const gray=new Float32Array(1024), rgb=[];
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const p=(y*32+x)*4,r=px[p]/255,g=px[p+1]/255,b=px[p+2]/255;
  gray[y*32+x]=(r*.299+g*.587+b*.114);
 }
 for(let by=0;by<8;by++)for(let bx=0;bx<8;bx++){
  let rs=0,gs=0,bs=0,edges=0;
  for(let y=by*4;y<by*4+4;y++)for(let x=bx*4;x<bx*4+4;x++){
   const p=(y*32+x)*4;rs+=px[p];gs+=px[p+1];bs+=px[p+2];
   const c=gray[y*32+x],left=gray[y*32+Math.max(0,x-1)],up=gray[Math.max(0,y-1)*32+x];
   edges+=Math.min(1,Math.abs(c-left)+Math.abs(c-up));
  }
  rgb.push(rs/4080,gs/4080,bs/4080,edges/16);
 }
 return rgb;
}
function captureVariants(im){
 const views=[visualSignature(im)];
 const w=im.naturalWidth,h=im.naturalHeight;
 // The product often occupies only part of a phone photo of a screen/showroom.
 // Test centered crops while keeping comparison on the same signature model.
 for(const factor of [.85,.68,.52]){
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*factor));c.height=Math.max(1,Math.round(h*factor));
  c.getContext('2d').drawImage(im,(w-c.width)/2,(h-c.height)/2,c.width,c.height,0,0,c.width,c.height);
  views.push(visualSignature(c));
 }
 return views;
}
function bestScore(views,sig){return Math.max(...views.map(v=>visualScore(v,sig)));}
function visualScore(a,b){
 // Background-heavy photos made different scans rank the same bright chandeliers.
 // Emphasize foreground/colored regions and compare their position & silhouette.
 let weightedDistance=0,weightSum=0,foregroundA=0,foregroundB=0;
 for(let i=0;i<a.length;i+=4){
  const ar=a[i],ag=a[i+1],ab=a[i+2],br=b[i],bg=b[i+1],bb=b[i+2];
  const brightA=(ar+ag+ab)/3,brightB=(br+bg+bb)/3;
  const saturA=Math.max(ar,ag,ab)-Math.min(ar,ag,ab);
  const saturB=Math.max(br,bg,bb)-Math.min(br,bg,bb);
  const edgeA=a[i+3],edgeB=b[i+3];
  const interestA=Math.min(1,Math.max(0,(.89-brightA)*1.6)+saturA*1.1+edgeA*2);
  const interestB=Math.min(1,Math.max(0,(.89-brightB)*1.6)+saturB*1.1+edgeB*2);
  foregroundA+=interestA;foregroundB+=interestB;
  const w=.12+Math.max(interestA,interestB)*2.8;
  const dr=ar-br,dg=ag-bg,db=ab-bb,de=edgeA-edgeB;
  const difference=(dr*dr+dg*dg+db*db)/3*.70+de*de*.30;
  weightedDistance+=w*difference;
  weightSum+=w;
 }
 // Avoid treating mostly empty/white signatures as close visual matches.
 const coveragePenalty=Math.abs(foregroundA-foregroundB)/64*.12;
 return 1-Math.sqrt(weightedDistance/Math.max(weightSum,.001))-coveragePenalty;
}
let photoIndexPromise=null;
async function loadPhotoIndex(){
 if(!photoIndexPromise)photoIndexPromise=fetch('./assets/photo-index.json',{cache:'no-cache'}).then(async response=>{
  if(!response.ok)throw Error('index not published yet');
  const index=await response.json();
  if(index.version!==1||!Array.isArray(index.items)||!index.items.length)throw Error('index empty');
  const valid=index.items.filter(row=>typeof row.code==='string'&&Array.isArray(row.sig)&&row.sig.length===256&&row.sig.every(Number.isFinite));
  if(valid.length<10)throw Error('Insufficient valid product image signatures');
  return valid;
 }).catch(error=>{photoIndexPromise=null;throw error;});
 return photoIndexPromise;
}
function indexQuality(index){
 const samples=index.slice(0,Math.min(250,index.length));
 const signatures=new Set(samples.map(row=>row.sig.map(x=>Math.round(x*50)).join(',')));
 let spread=0;
 for(let i=0;i<samples.length;i++){
  const row=samples[i],reference=samples[(i+Math.floor(samples.length/2))%samples.length];
  spread+=1-visualScore(row.sig,reference.sig);
 }
 return {unique:signatures.size,total:samples.length,spread:spread/Math.max(1,samples.length)};
}
function photoFingerprint(views){
 const signature=views[0];
 let h=2166136261;
 for(let i=0;i<signature.length;i+=4){
  const v=Math.round((signature[i]+signature[i+1]+signature[i+2])*85);
  h=Math.imul(h^v,16777619);
 }
 return (h>>>0).toString(16).padStart(8,'0');
}
function compareIndex(input,index,products){
 const byCode=new Map(products.map(p=>[String(p.code||'').trim().toLowerCase(),p]));
 const results=[];
 for(const entry of index){
  const product=byCode.get(entry.code.toLowerCase());
  if(product)results.push({product,url:photoUrl(product),score:bestScore(input,entry.sig)});
 }
 return results.sort((a,b)=>b.score-a.score);
}
async function compare(file){
 const output=$('showroom-photo-results');if(!file||!output)return;
 if(!file.type.startsWith('image/')){output.textContent='Choose an image file.';return;}
 if(file.size>15000000){output.textContent='Choose a photo smaller than 15 MB.';return;}
 const token=++generation;visibleMatches=10;output.replaceChildren();output.textContent='Matching new photo…';
 const blob=URL.createObjectURL(file);let input;
 try{input=captureVariants(await imageFrom(blob));}
 catch(error){if(token===generation)output.textContent='Unable to read photo: '+(error?.message||error);return;}
 finally{URL.revokeObjectURL(blob);}
 const products=catalog();
 try{
  if(token!==generation)return;
  output.textContent='Searching the compact catalog index…';
  const index=await loadPhotoIndex();
  if(token!==generation)return;
  const quality=indexQuality(index);
  const fingerprint=photoFingerprint(input);
  if(quality.unique<quality.total*.25 || quality.spread<.015){
   output.textContent='Catalog photo index quality problem: many product signatures are too similar. Rebuild and verify the photo index. Scan reference: '+fingerprint;
   return;
  }
  const matches=compareIndex(input,index,products);
  if(matches.length){
   render(matches,0,matches.length,true);
   const note=document.createElement('p');note.style.cssText='font-size:11px;color:var(--scan-soft);margin:8px 0';
   note.textContent='Scan '+fingerprint+' · Searched '+matches.length+' indexed products. Appearance matches are suggestions; verify product code before selecting.';
   output.prepend(note);return;
  }
 }catch(e){if(token!==generation)return;console.warn('[Showroom photo index]',e.message);}
 // Index is not yet available: use a small temporary local fallback.
 output.textContent='Catalog photo index not ready; checking a smaller photo sample…';
 const collection=products.map(product=>({product,url:photoUrl(product)})).filter(r=>/^https?:|^data:image\\//i.test(r.url)).slice(0,30);
 const results=[];let unread=0,index=0;
 const worker=async()=>{
  while(index<collection.length&&token===generation){
   const entry=collection[index++];
   try{
    let sig=cache.get(entry.url);
    if(!sig||sig.length!==256){sig=visualSignature(await imageFrom(entry.url));cache.set(entry.url,sig);}
    results.push({...entry,score:bestScore(input,sig)});
   }catch{unread++;}
   if(index%30===0&&token===generation)output.textContent='Matching '+index+' / '+collection.length+' photos…';
  }
 };
 await Promise.all(Array.from({length:6},()=>worker()));
 if(token!==generation)return;
 results.sort((a,b)=>b.score-a.score);
 render(results,unread,collection.length,true);
}
function attach(modal){
 if(!modal||modal.querySelector('#showroom-scan-photo'))return;
 const multi=modal.querySelector('#showroom-scan-multi');if(!multi)return;
 const photo=document.createElement('button');photo.type='button';photo.id='showroom-scan-photo';
 photo.textContent='Scan by Photo';photo.style.cssText='flex:1;border-radius:9px;padding:10px;background:#28313b;color:#f3e9d7;font-weight:700';
 multi.parentElement.append(photo);
 const shell=modal.querySelector('.scanner-shell'),form=modal.querySelector('#showroom-scanner-manual');
 const box=document.createElement('section');box.id='showroom-photo-panel';box.hidden=true;
 box.innerHTML='<p style="font-size:12px;margin:10px 0">Photograph a product or choose a photo. Matches are calculated directly on this phone using shape and image patterns. Confirm the correct product before selecting.</p>'+
 '<div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap">'+
 '<button id="showroom-photo-take" type="button" style="flex:1;min-width:125px;padding:12px;border-radius:9px;background:#c5a56e;color:#171b22;font-weight:bold">📷 Take Photo</button>'+
 '<button id="showroom-photo-upload" type="button" style="flex:1;min-width:125px;padding:12px;border-radius:9px;border:1px solid #a89264;color:var(--scan-text);font-weight:bold">Upload Photo</button></div>'+
 '<input id="showroom-photo-camera-input" type="file" accept="image/*" capture="environment" style="display:none">'+
 '<input id="showroom-photo-input" type="file" accept="image/*" style="display:none">'+
 '<div id="showroom-photo-results" style="max-height:330px;overflow:auto;font-size:12px"></div>';
 form?.after(box);
 const video=modal.querySelector('#showroom-scanner-video');
 const code=modal.querySelector('#showroom-scanner-results');
 const status=modal.querySelector('#showroom-scanner-status');
 const show=()=>{
  modal.dataset.photoMode='1';
  if(box.hidden&&typeof window.ShowroomScannerStop==='function')window.ShowroomScannerStop();
  box.hidden=false;if(video)video.style.display='none';if(code)code.style.display='none';if(status)status.style.display='none';if(form)form.style.display='none';
  modal.querySelector('#showroom-scan-quick').textContent='Barcode / QR';
  photo.style.background='#c5a56e';photo.style.color='#171b22';
 };
 photo.onclick=show;
 const beginNewPhoto=()=>{
  generation++;visibleMatches=10;
  const results=$('showroom-photo-results');
  if(results){results.replaceChildren();results.textContent='Select a new photo to search…';results.scrollTop=0;}
 };
 $('showroom-photo-take').onclick=()=>{beginNewPhoto();$('showroom-photo-camera-input').click();};
 $('showroom-photo-upload').onclick=()=>{beginNewPhoto();$('showroom-photo-input').click();};
 for(const id of ['showroom-photo-camera-input','showroom-photo-input'])$(id).onchange=e=>{const file=e.target.files?.[0];if(file)compare(file);e.target.value='';};
 for(const id of ['showroom-scan-quick','showroom-scan-multi']){
  modal.querySelector('#'+id)?.addEventListener('click',()=>{
   const wasPhoto=modal.dataset.photoMode==='1';generation++;modal.dataset.photoMode='0';box.hidden=true;if(video)video.style.display='';if(code)code.style.display='';if(status)status.style.display='';if(form)form.style.display='';
   photo.style.background='#28313b';photo.style.color='#f3e9d7';
   if(wasPhoto) setTimeout(()=>window.openShowroomScanner?.(),0);
  });
 }
}
window.ShowroomPhotoScan={attach};
})();