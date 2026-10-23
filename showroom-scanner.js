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


 const scannerStyles=`
 #showroom-scanner-modal{--scan-bg:#fffdf8;--scan-text:#28241e;--scan-soft:#665a4a;--scan-card:#f7f2e8;--scan-border:#d8c7aa;--scan-input:#fff;--scan-muted:#f0e6d6;--scan-fresh:#e4f4e6;--scan-fresh-border:#72a682}
 body.theme-dark #showroom-scanner-modal{--scan-bg:#151a22;--scan-text:#f5f0e8;--scan-soft:#d0c1a9;--scan-card:#1c242f;--scan-border:#66583e;--scan-input:#252d39;--scan-muted:#28313b;--scan-fresh:#303e35;--scan-fresh-border:#7ba887}
 #showroom-scanner-modal .scanner-shell{background:var(--scan-bg)!important;color:var(--scan-text)!important;border-color:var(--scan-border)!important}
 #showroom-scanner-modal .scanner-shell button:not(.scanner-gold){color:var(--scan-text)}
 #showroom-scanner-modal #showroom-scan-quick:not(.scan-active),#showroom-scanner-modal #showroom-scan-multi:not(.scan-active){background:var(--scan-muted)!important;color:var(--scan-text)!important}
 #showroom-scanner-modal #showroom-scanner-code{background:var(--scan-input)!important;color:var(--scan-text)!important;border-color:var(--scan-border)!important}
 #showroom-scanner-modal #showroom-scanner-status{color:var(--scan-soft)!important}
 #showroom-scanner-modal .scanner-item{background:var(--scan-card)!important;border-color:var(--scan-border)!important;color:var(--scan-text)!important}
 #showroom-scanner-modal .scanner-item.scanner-fresh{background:var(--scan-fresh)!important;border-color:var(--scan-fresh-border)!important}
 #showroom-scanner-modal .scanner-item .scanner-item-name{color:var(--scan-soft)!important}
 #showroom-scanner-modal .scanner-item button{border-color:var(--scan-border)!important}
 `;
 function ensureScannerStyles(){if(document.getElementById('showroom-scanner-theme-styles'))return;const e=document.createElement('style');e.id='showroom-scanner-theme-styles';e.textContent=scannerStyles;document.head.appendChild(e)}
 let multiMode=false,scanned=new Map(),lastRead='',lastReadAt=0,seenCodes=new Set();
 const SCAN_DRAFT_KEY='limperial_scanner_selection_v1';
 function saveScanDraft(){
  try{const rows=[...scanned.values()].map(x=>({code:x.code,quantity:x.quantity}));if(rows.length)localStorage.setItem(SCAN_DRAFT_KEY,JSON.stringify({savedAt:Date.now(),rows}));else localStorage.removeItem(SCAN_DRAFT_KEY);}catch(_){}
 }
 function restoreScanDraft(){
  if(scanned.size)return;
  try{
   const d=JSON.parse(localStorage.getItem(SCAN_DRAFT_KEY)||'null');
   if(!d||!Array.isArray(d.rows))return;
   if(Date.now()-d.savedAt>7*86400000){localStorage.removeItem(SCAN_DRAFT_KEY);return;}
   for(const row of d.rows.slice(0,50)){const p=ownCodeMatches(row.code)[0];if(!p)continue;
    const key=String(p.id);scanned.set(key,{code:p.code,name:p.itemName||p.name||p.code,product:p,quantity:Math.min(999,Math.max(1,Math.floor(Number(row.quantity)||1)))});seenCodes.add(key);
   }
  }catch(_){}
 }

 function inCart(id){try{return Array.isArray(cart)&&cart.some(c=>c.type!=='set'&&String(c.item?.id)===String(id));}catch(_){return false;}}
 function quickAdd(product,quantity){
  if(!product||typeof window.toggleCartSelection!=='function')return false;
  const count=Math.max(1,Math.floor(Number(quantity)||1));
  const existed=inCart(product.id);
  if(!existed)window.toggleCartSelection(product.id);
  try{
   const line=cart.find(c=>c.type!=='set'&&String(c.item?.id)===String(product.id));
   if(!line)return false;
   line.quantity=Math.max(1,Number(line.quantity)||1)+(existed?count:count-1);
   if(typeof window.updateCartVisuals==='function')window.updateCartVisuals();
   return true;
  }catch(_){return false;}
 }
 function scanStockText(product){
  const location=product.location||product.locations||product.stockLocation||'';
  const quantity=product.qty??product.quantity??product.stockQty??product.stock??'';
  return 'Catalog stock: '+(String(quantity||'Not provided'))+(location?' · '+String(location):'')+' · Verify with official inventory before confirming availability';
 }
 let newestScanId='';
 function productPhoto(p){const raw=p.imgLink||p.imageUrl||p.photoUrl||p.image||p.photo||'';try{return typeof resolveGoogleDriveImg==='function'?resolveGoogleDriveImg(raw):raw;}catch(_){return raw;}}
 function updateMultiList(){
  const panel=find('showroom-scanner-results');if(!panel)return;
  saveScanDraft();
  const entries=[...scanned.values()].reverse();
  const total=entries.reduce((n,x)=>n+x.quantity,0);
  panel.style.maxHeight='none';panel.style.overflow='visible';
  panel.innerHTML='<div style="padding-top:8px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:13px">Scanned ('+scanned.size+' products · '+total+' items)</b><button id="showroom-scanner-clear-selected" style="font-size:12px;color:var(--scan-soft,#d3bd86)">Clear all</button></div>'+
   '<div style="max-height:185px;overflow-y:auto;overscroll-behavior:contain;margin-top:5px">'+entries.map(x=>{
    const fresh=String(x.product.id)===newestScanId;
    const pic=productPhoto(x.product);
    return '<div class="scanner-item'+(fresh?' scanner-fresh':'')+'" style="display:flex;gap:8px;align-items:center;padding:7px;border-radius:10px;margin:4px 0;background:'+(fresh?'#303e35':'#1c242f')+';border:1px solid '+(fresh?'#7ba887':'#303b4a')+'">'+
      (pic?'<img src="'+escapeHtml(pic)+'" alt="" loading="lazy" style="width:48px;height:48px;flex-shrink:0;object-fit:cover;border-radius:7px" onerror="this.style.opacity=\'.25\';this.alt=\'No photo\'">':'<span style="width:48px;height:48px;display:grid;place-items:center;background:#303743;border-radius:7px">▧</span>')+
      '<div style="min-width:0;flex:1"><b style="display:block;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escapeHtml(x.code)+'</b><span class="scanner-item-name" style="font-size:11px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escapeHtml(x.name)+'</span>'+(fresh?'<small style="color:#a6e1b4">✓ Just scanned</small>':'')+'</div>'+
      '<div style="display:flex;align-items:center;gap:5px"><button data-minus="'+escapeHtml(x.product.id)+'" aria-label="Decrease quantity" style="width:28px;height:32px;border:1px solid #675c4c;border-radius:7px">−</button><strong style="min-width:17px;text-align:center">'+x.quantity+'</strong><button data-plus="'+escapeHtml(x.product.id)+'" aria-label="Increase quantity" style="width:28px;height:32px;border:1px solid #675c4c;border-radius:7px">+</button><button data-remove="'+escapeHtml(x.product.id)+'" aria-label="Remove item" style="width:25px;color:#c9a59c">×</button></div></div>';
   }).join('')+'</div>'+
   '<button id="showroom-scanner-add-selected" '+(entries.length?'':'disabled')+' style="width:100%;margin-top:8px;background:#c5a56e;color:#161a21;padding:11px;border-radius:9px;font-weight:700">Add Selected to Cart · '+total+' items</button></div>';
  panel.querySelectorAll('[data-plus],[data-minus],[data-remove]').forEach(btn=>btn.onclick=()=>{
   const id=btn.dataset.plus||btn.dataset.minus||btn.dataset.remove,entry=scanned.get(id);if(!entry)return;
   if(btn.hasAttribute('data-remove'))scanned.delete(id);
   else {entry.quantity+=btn.hasAttribute('data-plus')?1:-1;if(entry.quantity<1)scanned.delete(id);}
   if(newestScanId===id&&!scanned.has(id))newestScanId='';
   updateMultiList();
  });
  find('showroom-scanner-add-selected').onclick=()=>{
   let added=0;for(const x of scanned.values())if(quickAdd(x.product,x.quantity))added++;
   scanned.clear();seenCodes.clear();saveScanDraft();close();if(typeof window.showNotification==='function')window.showNotification(added+' products added to Interest List.','success');
  };
  find('showroom-scanner-clear-selected').onclick=()=>{scanned.clear();seenCodes.clear();newestScanId='';updateMultiList();};
 }
 function setMode(next){
  multiMode=next;
  // Switching modes must never discard products collected in this scan session.
  lastRead='';lastReadAt=0;
  const quick=find('showroom-scan-quick'),multi=find('showroom-scan-multi');
  for(const [el,on] of [[quick,!next],[multi,next]])if(el){el.classList.toggle('scan-active',on);el.style.background=on?'#c5a56e':'';el.style.color=on?'#151923':'';}
  const panel=find('showroom-scanner-results');
  if(next){restoreScanDraft();updateMultiList();}else if(panel)panel.innerHTML=scanned.size?'<p style="font-size:12px;padding-top:8px;color:var(--scan-soft)">'+scanned.size+' scanned products saved. Return to Multi-Scan to review.</p>':'';
  status(next?'Scan products continuously; tap Add Selected when finished.':'Scan one product to open its details.');
 }
 function find(id){return document.getElementById(id);}
 function status(message){const e=find('showroom-scanner-status');if(e)e.textContent=message;}
 function stop(){active=false;if(reader){try{reader.reset();}catch(_){ }reader=null;}const v=find('showroom-scanner-video');if(v?.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null;}}
 function close(){stop();find('showroom-scanner-modal')?.remove();}
 function apply(code){
  const val=String(code||'').trim();if(!val)return;
  const now=Date.now();if(normalize(lastRead)===normalize(val)&&now-lastReadAt<1400)return;lastRead=val;lastReadAt=now;
  const match=ownCodeMatches(val)[0];
  if(multiMode){
   if(match){
    const key=String(match.id);
    if(seenCodes.has(key))return;
    seenCodes.add(key);
    scanned.set(key,{code:match.code,name:match.itemName||match.name||val,product:match,quantity:1});
    newestScanId=key;
    updateMultiList();status('Product added. Use + / − to adjust quantity.');
   }else{status('Code '+val+' is not in Showroom catalog. Cannot add to quotation.');}
   return;
  }
  const field=find('search-input');if(!field)return;
  field.value=val;field.dispatchEvent(new Event('input',{bubbles:true}));
  if(typeof window.executeSearchFilter==='function')window.executeSearchFilter();
  if(match&&typeof window.openProductDetailModal==='function'){
   clearTimeout(searchTimer);find('showroom-dual-lookup')?.remove();document.activeElement?.blur?.();field.blur();close();
   window.openProductDetailModal(match.id);
   return;
  }
  stop();const video=find('showroom-scanner-video');if(video)video.style.display='none';
  lookup(val);document.activeElement?.blur?.();
 }
 let searchTimer=null;
 function installUnifiedSearch(search){
  search.addEventListener('input',()=>{
   clearTimeout(searchTimer);
   const query=search.value.trim();
   if(query.length<3){find('showroom-dual-lookup')?.remove();return;}
   searchTimer=setTimeout(async()=>{
    await loadExternal();
    if(search.value.trim()!==query)return;
    const records=external.filter(r=>normalize(r.code)===normalize(query));
    const old=find('showroom-dual-lookup');
    if(!records.length||ownCodeMatches(query).length){old?.remove();return;}
    const node=old||document.createElement('div');node.id='showroom-dual-lookup';
    node.style.cssText='padding:8px 12px;font-size:12px;background:#1b2330;color:#f2e8d6;border:1px solid #9b8256;border-radius:10px;margin-top:4px';
    const matched=ownCodeMatches(query).length>0;
    node.textContent=matched?'Scanner-V4: matching product code also found. Showing one Showroom product.':'Scanner-V4 only: '+records[0].name+' ('+records[0].code+'). Available in scanner reference, not yet in Showroom quotation catalog.';
    if(!old)search.parentElement.insertAdjacentElement('afterend',node);
   },300);
  });
 }
 function install(){
  if(find('showroom-scan-trigger')||!find('search-input'))return;
  const search=find('search-input'),wrap=search.parentElement;
  const btn=document.createElement('button');btn.id='showroom-scan-trigger';btn.type='button';btn.title='Scan barcode or QR code';btn.setAttribute('aria-label','Scan barcode or QR code');
  btn.innerHTML='<i class="fa-solid fa-barcode" aria-hidden="true"></i><span>Scan</span>';
  btn.className='absolute right-10 top-1/2 -translate-y-1/2 h-9 px-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#c5a56e] text-[#171b22] text-xs font-bold shadow-sm border border-[#d8c193] hover:bg-[#e0bf82] active:scale-95 transition-all';
  btn.style.zIndex='2';
  search.classList.remove('pr-10','pr-20');
  search.style.paddingRight='120px';
  wrap.appendChild(btn);
  installUnifiedSearch(search);
  btn.addEventListener('click',open);
  btn.addEventListener('contextmenu',e=>{e.preventDefault();open().then(()=>setMode(true));});
  loadExternal();
 }
 function loadLibrary(){
  if(window.ZXing?.BrowserMultiFormatReader)return Promise.resolve();
  return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('Scanner library could not load'));document.head.appendChild(script);});
 }
 async function open(){
  close();ensureScannerStyles();
  const overlay=document.createElement('div');overlay.id='showroom-scanner-modal';overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.87);display:flex;justify-content:center;align-items:center;padding:16px';
  overlay.innerHTML='<div class="scanner-shell" style="max-width:520px;width:100%;background:#151a22;color:#f5f0e8;border:1px solid #9b8256;border-radius:20px;padding:18px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:19px;font-weight:700">Scan product code</h3><button id="showroom-scanner-close" style="padding:8px" aria-label="Close scanner">✕</button></div><div style="display:flex;gap:8px;margin-top:12px"><button id="showroom-scan-quick" style="flex:1;border-radius:9px;padding:10px;background:#c5a56e;color:#151923;font-weight:700">Quick Scan</button><button id="showroom-scan-multi" style="flex:1;border-radius:9px;padding:10px;background:#28313b;color:#f3e9d7;font-weight:700">Multi-Scan</button></div><video id="showroom-scanner-video" muted playsinline style="margin-top:12px;width:100%;aspect-ratio:4/3;object-fit:cover;background:#080b10;border-radius:12px"></video><div id="showroom-scanner-results" style="max-height:200px;overflow:auto"></div><p id="showroom-scanner-status" style="font-size:12px;margin:9px 0;color:#d9c49b">Starting camera…</p><form id="showroom-scanner-manual" style="display:flex;gap:7px"><input id="showroom-scanner-code" autocomplete="off" placeholder="Or enter / scan product code" style="min-width:0;flex:1;background:#252d39;border:1px solid #786844;border-radius:8px;color:white;padding:11px"><button type="submit" style="background:#a89264;color:#121417;border-radius:8px;padding:10px 14px">Find</button></form></div>';
  document.body.appendChild(overlay);
  restoreScanDraft();
  find('showroom-scanner-close').onclick=close;
  find('showroom-scan-quick').onclick=()=>setMode(false);
  find('showroom-scan-multi').onclick=()=>setMode(true);
  setMode(false);
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
