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
function visualScore(a,b){
 let color=0,shape=0;
 for(let i=0;i<a.length;i+=4){
  for(let j=0;j<3;j++){const d=a[i+j]-b[i+j];color+=d*d;}
  const d=a[i+3]-b[i+3];shape+=d*d;
 }
 return 1-(Math.sqrt(color/192)*.45+Math.sqrt(shape/64)*.55);
}
async function compare(file){
 const output=$('showroom-photo-results');if(!file||!output)return;
 if(!file.type.startsWith('image/')){output.textContent='Choose an image file.';return;}
 if(file.size>15000000){output.textContent='Choose a photo smaller than 15 MB.';return;}
 const token=++generation;output.textContent='Matching product appearance locally…';
 const blob=URL.createObjectURL(file);let input;
 try{input=visualSignature(await imageFrom(blob));}
 catch(error){output.textContent='Unable to read photo: '+(error?.message||error);return;}
 finally{URL.revokeObjectURL(blob);}
 const collection=catalog().map(product=>({product,url:photoUrl(product)})).filter(r=>/^https?:|^data:image\\//i.test(r.url)).slice(0,500);
 const results=[];let unread=0,index=0;
 const worker=async()=>{
  while(index<collection.length&&token===generation){
   const entry=collection[index++];
   try{
    let sig=cache.get(entry.url);
    if(!sig||sig.length!==256){sig=visualSignature(await imageFrom(entry.url));cache.set(entry.url,sig);}
    results.push({...entry,score:visualScore(input,sig)});
   }catch{unread++;}
   if(index%30===0&&token===generation)output.textContent='Matching '+index+' / '+collection.length+' photos…';
  }
 };
 await Promise.all(Array.from({length:6},()=>worker()));
 if(token!==generation)return;
 results.sort((a,b)=>b.score-a.score);
 render(results.slice(0,5),unread,collection.length);
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