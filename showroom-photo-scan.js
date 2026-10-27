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
function render(items,unread,total){
 const el=$('showroom-photo-results');if(!el)return;
 if(!items.length){el.textContent=total?'No readable image matches. Catalog photo hosting may block browser image analysis.':'No catalog products with photos were found.';return;}
 el.innerHTML='<div style="font-size:12px;margin:10px 0;color:#ae9875">Possible matches (appearance only). Verify the correct product. Compared '+(total-unread)+' of '+total+' photos.</div>'+
 items.map((r,i)=>'<div style="display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid #816f4a55">'+
 '<img crossorigin="anonymous" src="'+esc(r.url)+'" alt="" style="width:56px;height:56px;object-fit:contain;border-radius:7px;background:white" onerror="this.style.display=\'none\'">'+
 '<div style="flex:1;min-width:0;font-size:12px"><b>'+esc(r.product.itemName||r.product.code||'Product')+'</b><div>'+esc(r.product.code||'')+' · $'+Number(r.product.price||0).toLocaleString()+'</div><div>Stock: '+esc(r.product.qty??'Unknown')+'</div></div>'+
 '<button type="button" data-photo-index="'+i+'" style="border:1px solid #b38e50;border-radius:8px;padding:8px">View</button></div>').join('');
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
  let firstError;
  for(const url of [
   'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6',
   'https://esm.sh/@huggingface/transformers@3.7.6?bundle'
  ]){
   try{
    const m=await import(url);
    const pipe=await m.pipeline('image-feature-extraction',MODEL,{dtype:'q8',device:'wasm'});
    return pipe;
   }catch(e){firstError=e;console.warn('[Photo scanner] Model source failed:',url,e);}
  }
  throw firstError||new Error('Could not load image recognition');
 })().catch(e=>{modelPromise=null;throw e;});
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
async function compare(file){
 const output=$('showroom-photo-results');if(!file||!output)return;
 if(!file.type.startsWith('image/')){output.textContent='Choose an image file.';return;}
 if(file.size>15000000){output.textContent='Choose a photo smaller than 15 MB.';return;}
 const token=++generation;
 try{await aiCompare(file,token,output);}
 catch(e){
  if(token!==generation)return;
  output.textContent='AI model unavailable ('+e.message+'). Using basic photo matching…';
  const blob=URL.createObjectURL(file);let input;
  try{input=signature(await imageFrom(blob));}catch(err){output.textContent='Unable to read photo: '+err.message;return;}finally{URL.revokeObjectURL(blob);}
  const collection=catalog().map(product=>({product,url:photoUrl(product)})).filter(r=>/^https?:|^data:image\\//i.test(r.url)).slice(0,250);
  let unread=0;const results=[];
  for(const entry of collection){
   if(token!==generation)return;
   try{let sig=cache.get(entry.url);if(!sig){sig=signature(await imageFrom(entry.url));cache.set(entry.url,sig);}results.push({...entry,score:similarity(input,sig)});}catch{unread++;}
  }
  results.sort((a,b)=>b.score-a.score);render(results.slice(0,5),unread,collection.length);
 }
}
function attach(modal){
 if(!modal||modal.querySelector('#showroom-scan-photo'))return;
 const multi=modal.querySelector('#showroom-scan-multi');if(!multi)return;
 const photo=document.createElement('button');photo.type='button';photo.id='showroom-scan-photo';
 photo.textContent='Scan by Photo';photo.style.cssText='flex:1;border-radius:9px;padding:10px;background:#28313b;color:#f3e9d7;font-weight:700';
 multi.parentElement.append(photo);
 const shell=modal.querySelector('.scanner-shell'),form=modal.querySelector('#showroom-scanner-manual');
 const box=document.createElement('section');box.id='showroom-photo-panel';box.hidden=true;
 box.innerHTML='<p style="font-size:12px;margin:10px 0">Photograph a product or choose a photo. The free matcher compares available catalog pictures locally; results are suggestions, not exact identification.</p>'+
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
 $('showroom-photo-take').onclick=()=>$('showroom-photo-camera-input').click();
 $('showroom-photo-upload').onclick=()=>$('showroom-photo-input').click();
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