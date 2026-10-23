/* Scanner-V4 camera and barcode workflow, integrated with Showroom's existing product search. */
(function(){
 'use strict';
 let reader=null,active=false;
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
  close();field.focus();
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
 }
 function loadLibrary(){
  if(window.ZXing?.BrowserMultiFormatReader)return Promise.resolve();
  return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('Scanner library could not load'));document.head.appendChild(script);});
 }
 async function open(){
  close();
  const overlay=document.createElement('div');overlay.id='showroom-scanner-modal';overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.87);display:flex;justify-content:center;align-items:center;padding:16px';
  overlay.innerHTML='<div style="max-width:520px;width:100%;background:#151a22;color:#f5f0e8;border:1px solid #9b8256;border-radius:20px;padding:18px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:19px;font-weight:700">Scan product code</h3><button id="showroom-scanner-close" style="padding:8px" aria-label="Close scanner">✕</button></div><video id="showroom-scanner-video" muted playsinline style="margin-top:12px;width:100%;aspect-ratio:4/3;object-fit:cover;background:#080b10;border-radius:12px"></video><p id="showroom-scanner-status" style="font-size:12px;margin:9px 0;color:#d9c49b">Starting camera…</p><form id="showroom-scanner-manual" style="display:flex;gap:7px"><input id="showroom-scanner-code" autocomplete="off" placeholder="Or enter / scan product code" style="min-width:0;flex:1;background:#252d39;border:1px solid #786844;border-radius:8px;color:white;padding:11px"><button type="submit" style="background:#a89264;color:#121417;border-radius:8px;padding:10px 14px">Find</button></form></div>';
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
