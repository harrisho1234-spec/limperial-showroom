/* Scanner-V4 camera and barcode workflow, integrated with Showroom's existing product search. */
(function(){
 'use strict';
 let reader=null,active=false;

 const scannerSheet='https://docs.google.com/spreadsheets/d/1FkScQir2QCWaTrzMuJ_pUcdziM1uDCQ_MrW33nLoxlI/gviz/tq?tqx=out:csv&gid=657899447';
 let external=[],loaded=false,loading=null,loadError='';
 const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const normalize=x=>String(x||'').trim().toLowerCase().replace(/\s+/g,'');
 function parseCSV(csv){
  const rows=[];let line=[],part='',quoted=false;
  for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){part+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){line.push(part);part='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&csv[i+1]==='\n')i++;line.push(part);if(line.some(v=>v.trim()))rows.push(line);line=[];part='';}else part+=c;}
  line.push(part);if(line.some(v=>v.trim()))rows.push(line);
  const head=(rows.shift()||[]).map(x=>x.trim().toLowerCase());
  const col=(pattern,fallback)=>{const n=head.findIndex(x=>pattern.test(x));return n>=0?n:fallback;};
  const code=col(/code/,2),name=col(/name|item/,3),brand=col(/brand/,0),desc=col(/desc|detail/,5),price=9,qty=12;
  return rows.filter(r=>r[code]&&r[name]).map(r=>({code:r[code].trim(),name:r[name].trim(),brand:r[brand]||'',description:r[desc]||'',price:r[price]||'',qty:r[qty]||''}));
 }
 async function loadExternal(){
  if(loaded)return external;if(loading)return loading;
  loading=(async()=>{try{const response=await fetch(scannerSheet);if(!response.ok)throw Error('Google Sheet returned '+response.status);const records=parseCSV(await response.text());if(!records.length)throw Error('Scanner-V4 sheet contains no readable products');external=records;loaded=true;loadError='';return external;}catch(e){loadError=e.message;return [];}finally{loading=null;}})();return loading;
 }
 function ownCodeMatches(query){
  const normalized=normalize(query);if(!normalized)return [];
  try{return (typeof products!=='undefined'&&Array.isArray(products)?products:[]).filter(p=>normalize(p.code||p.Code||p.productCode||p.sku)===normalized);}catch(_){return [];}
 }
 function renderLookup(query){
  const panel=find('showroom-scanner-results');if(!panel)return;
  const q=normalize(query);
  if(!q){panel.innerHTML='';return;}
  const showroom=ownCodeMatches(query);
  const matched=external.filter(x=>normalize(x.code)===q);
  const duplicates=matched.length&&showroom.length;
  panel.innerHTML='<div style="margin-top:12px;border-top:1px solid #665438;padding-top:10px;font-size:12px">'+
   '<div><b>Product lookup</b> · '+escapeHtml(query)+'</div>'+
   (showroom.length?'<div style="margin-top:7px;color:#a7e6b0">✓ Matched Showroom product ('+showroom.length+')</div>':'<div style="margin-top:7px">No matching Showroom product</div>')+
   (matched.length?'<div style="margin-top:9px;color:#e6cd8f"><b>Scanner-V4 Sheet</b>'+(duplicates?' · Same code found in both sources; displayed once in Showroom catalog':' · Scanner-only reference (not added to Showroom catalog)')+'</div>'+matched.slice(0,8).map(x=>'<div style="padding:7px 0;border-bottom:1px solid #343b45"><b>'+escapeHtml(x.code)+' — '+escapeHtml(x.name)+'</b><div>'+escapeHtml(x.brand)+' · Qty: '+escapeHtml(x.qty)+' · Price: '+escapeHtml(x.price)+'</div><div>'+escapeHtml(x.description)+'</div></div>').join(''):'<div style="margin-top:7px">No match in Scanner-V4 Sheet'+(loadError?' ('+escapeHtml(loadError)+')':'')+'</div>')+
   '</div>';
 }
 async function lookup(code){status('Checking both product catalogs…');await loadExternal();if(find('showroom-scanner-modal')){renderLookup(code);status('Lookup complete. Showroom products remain the only items available for quotations.');}}

 function find(id){return document.getElementById(id);}
 function status(message){const e=find('showroom-scanner-status');if(e)e.textContent=message;}
 function stop(){active=false;if(reader){try{reader.reset();}catch(_){ }reader=null;}const v=find('showroom-scanner-video');if(v?.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null;}}
 function close(){stop();find('showroom-scanner-modal')?.remove();}
 function apply(code){
  const val=String(code||'').trim();if(!val)return;
  const field=find('search-input');if(!field){status('The Showroom product search is not available.');return;}
  field.value=val;
  field.dispatchEvent(new Event('input',{bubbles:true}));
  if(typeof window.handleSearchFilter==='function')window.handleSearchFilter();
  else if(typeof window.executeSearchFilter==='function')window.executeSearchFilter();
  stop();find('showroom-scanner-video').style.display='none';lookup(val);field.focus();
  if(typeof window.showNotification==='function')window.showNotification('Scanned code: '+val,'info');
 }
 function install(){
  if(find('showroom-scan-trigger')||!find('search-input'))return;
  const search=find('search-input'),wrap=search.parentElement;
  const btn=document.createElement('button');btn.id='showroom-scan-trigger';btn.type='button';btn.title='Scan barcode or QR code';btn.setAttribute('aria-label','Scan barcode or QR code');
  btn.innerHTML='<i class="fa-solid fa-barcode"></i><span class="hidden sm:inline"> Scan</span>';
  btn.className='ml-2 h-11 shrink-0 rounded-xl border border-luxury-gold/30 bg-luxury-dark px-3 text-sm text-luxury-text hover:border-luxury-gold';
  wrap.parentNode.insertBefore(btn,wrap.nextSibling);
  wrap.parentElement?.classList.add('flex','items-center');wrap.classList.add('flex-1');
  btn.addEventListener('click',open);
  loadExternal();
 }
 function loadLibrary(){
  if(window.ZXing?.BrowserMultiFormatReader)return Promise.resolve();
  return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('Scanner library could not load'));document.head.appendChild(script);});
 }
 async function open(){
  close();
  const overlay=document.createElement('div');overlay.id='showroom-scanner-modal';overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.87);display:flex;justify-content:center;align-items:center;padding:16px';
  overlay.innerHTML='<div style="max-width:520px;width:100%;background:#151a22;color:#f5f0e8;border:1px solid #9b8256;border-radius:20px;padding:18px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:19px;font-weight:700">Scan product code</h3><button id="showroom-scanner-close" style="padding:8px" aria-label="Close scanner">✕</button></div><video id="showroom-scanner-video" muted playsinline style="margin-top:12px;width:100%;aspect-ratio:4/3;object-fit:cover;background:#080b10;border-radius:12px"></video><div id="showroom-scanner-results" style="max-height:200px;overflow:auto"></div><p id="showroom-scanner-status" style="font-size:12px;margin:9px 0;color:#d9c49b">Starting camera…</p><form id="showroom-scanner-manual" style="display:flex;gap:7px"><input id="showroom-scanner-code" autocomplete="off" placeholder="Or enter / scan product code" style="min-width:0;flex:1;background:#252d39;border:1px solid #786844;border-radius:8px;color:white;padding:11px"><button type="submit" style="background:#a89264;color:#121417;border-radius:8px;padding:10px 14px">Find</button></form></div>';
  document.body.appendChild(overlay);
  find('showroom-scanner-close').onclick=close;
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  find('showroom-scanner-manual').onsubmit=e=>{e.preventDefault();apply(find('showroom-scanner-code').value);};
  try{
   await loadLibrary();if(!find('showroom-scanner-modal'))return;
   reader=new ZXing.BrowserMultiFormatReader();active=true;
   const devices=await reader.listVideoInputDevices();
   const rear=devices.find(d=>/back|rear|environment/i.test(d.label));
   status('Point the camera at a barcode or QR code.');
   await reader.decodeFromVideoDevice(rear?.deviceId||undefined,find('showroom-scanner-video'),(result,error)=>{if(!active)return;if(result?.text)apply(result.text);});
  }catch(e){status('Camera unavailable: '+e.message+'. You can still enter or use a USB/Bluetooth scanner below.');stop();}
 }
 window.openShowroomScanner=open;
 document.addEventListener('DOMContentLoaded',install);
 if(document.readyState!=='loading')install();
})();
