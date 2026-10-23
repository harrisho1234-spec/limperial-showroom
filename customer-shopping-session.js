/* Customer Shopping Session: local, recoverable sales workspace; no customer or inventory writes. */
(function(){
'use strict';
const KEY='limperial_customer_session_v1';
let session=null;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function persist(){try{if(session)localStorage.setItem(KEY,JSON.stringify(session));else localStorage.removeItem(KEY)}catch(e){console.warn('Session cannot be saved',e)}}
function restore(){try{const value=JSON.parse(localStorage.getItem(KEY)||'null');if(value&&value.id&&Date.now()-Number(value.updatedAt||value.createdAt)<7*86400000)session=value;}catch(_){}}
function cartRows(){try{return Array.isArray(cart)?cart.map(x=>({code:String(x.item?.code||x.setId||''),name:String(x.item?.itemName||x.item?.name||x.name||'Product'),qty:Number(x.quantity)||1})):[]}catch(_){return []}}
function sync(){if(!session)return;session.items=cartRows();session.updatedAt=Date.now();persist();renderBadge();}
function renderBadge(){const b=$('shopping-session-trigger');if(b)b.textContent=session?'Session · '+(session.customer||'Walk-in'):'Start Customer Session'}
function ensureSessionTheme(){
 if(document.getElementById('customer-session-theme'))return;
 const el=document.createElement('style');el.id='customer-session-theme';
 el.textContent=`
 #customer-session-dialog{--session-bg:#fffdf8;--session-text:#29241c;--session-input:#fff;--session-border:#c7b58e}
 body.theme-dark #customer-session-dialog{--session-bg:#171c24;--session-text:#f8f2e8;--session-input:#29303b;--session-border:#887149}
 #customer-session-dialog .session-panel{background:var(--session-bg)!important;color:var(--session-text)!important;opacity:1!important;backdrop-filter:none!important;box-shadow:0 20px 70px rgba(0,0,0,.4)}
 #customer-session-dialog input,#customer-session-dialog textarea{background:var(--session-input)!important;color:var(--session-text)!important;border-color:var(--session-border)!important;opacity:1!important}
 #customer-session-dialog input::placeholder,#customer-session-dialog textarea::placeholder{color:var(--session-text)!important;opacity:.55!important}
 #customer-session-dialog button:not(#session-save){color:var(--session-text)!important}
 `;
 document.head.appendChild(el);
}
function draw(){
 ensureSessionTheme();
 let overlay=$('customer-session-dialog');if(overlay)overlay.remove();
 overlay=document.createElement('div');overlay.id='customer-session-dialog';overlay.style.cssText='position:fixed;inset:0;z-index:99998;display:flex;justify-content:center;align-items:center;padding:12px;background:#0009';
 const products=cartRows();
 overlay.innerHTML='<div class="session-panel" style="background:var(--session-bg);color:var(--session-text);border:1px solid #bda273;border-radius:18px;padding:20px;width:min(100%,480px);max-height:90dvh;overflow:auto"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:19px;font-weight:bold">Customer Shopping Session</h3><button id="session-dismiss" aria-label="Close">✕</button></div>'+
 (session?'<p style="font-size:12px;margin:8px 0">Started '+new Date(session.createdAt).toLocaleString()+' · '+products.length+' selected products</p>':'<p style="font-size:12px;margin:8px 0">Begin a session while showing products to a customer. This does not create a customer record.</p>')+
 '<label style="display:block;margin-top:12px;font-size:12px">Customer name / reference<input id="session-customer" maxlength="120" placeholder="Walk-in customer or existing customer name" value="'+esc(session?.customer||'')+'" style="display:block;width:100%;padding:10px;border:1px solid #bda273;border-radius:8px;background:var(--session-input);color:inherit"></label>'+
 '<label style="display:block;margin-top:12px;font-size:12px">Existing Showroom Visit ID (optional)<input id="session-visit" maxlength="100" placeholder="Reference only — does not create a visit" value="'+esc(session?.visitId||'')+'" style="display:block;width:100%;padding:10px;border:1px solid #bda273;border-radius:8px;background:var(--session-input);color:inherit"></label>'+
 '<label style="display:block;margin-top:12px;font-size:12px">Follow-up notes<textarea id="session-notes" rows="3" placeholder="Next action, customer preferences..." style="display:block;width:100%;padding:10px;border:1px solid #bda273;border-radius:8px;background:var(--session-input);color:inherit">'+esc(session?.notes||'')+'</textarea></label>'+
 '<div style="margin:14px 0;font-size:12px"><b>Current interest list ('+products.length+')</b>'+products.slice(0,12).map(x=>'<div style="padding:5px 0;border-bottom:1px solid #aaa4">'+esc(x.code)+' · '+esc(x.name)+' ×'+x.qty+'</div>').join('')+'</div>'+
 '<div style="display:flex;flex-wrap:wrap;gap:8px"><button id="session-save" style="flex:1;background:#c5a56e;color:#191919;padding:12px;border-radius:9px;font-weight:bold">'+(session?'Save Session':'Start Session')+'</button>'+
 (session?'<button id="session-copy" style="padding:12px;border:1px solid #bda273;border-radius:9px">Copy Follow-up</button><button id="session-end" style="padding:12px;border:1px solid #bda273;border-radius:9px">End</button>':'')+'</div><p style="font-size:11px;margin-top:10px;opacity:.7">Saved on this device only. Use the existing Showroom Visit, Save List and quotation actions for official records.</p></div>';
 document.body.appendChild(overlay);
 $('session-dismiss').onclick=()=>overlay.remove();
 overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
 $('session-save').onclick=()=>{
  if(!session)session={id:'session-'+Date.now(),createdAt:Date.now(),items:[]};
  session.customer=$('session-customer').value.trim();session.visitId=$('session-visit').value.trim();session.notes=$('session-notes').value.trim();
  sync();overlay.remove();renderBadge();
 };
 if(session){
  $('session-copy').onclick=()=>{session.notes=$('session-notes').value;sync();const text=['Customer: '+(session.customer||'Walk-in'),'Visit reference: '+(session.visitId||'None'),'Follow-up: '+session.notes,'Products: '+products.map(p=>p.code+' x'+p.qty).join(', ')].join('\n');navigator.clipboard?.writeText(text).then(()=>{if(typeof showNotification==='function')showNotification('Follow-up copied for Sales To-Do','success')}).catch(()=>prompt('Copy follow-up',text));};
  $('session-end').onclick=()=>{if(!confirm('End this shopping session? The current cart will remain unchanged.'))return;session=null;persist();renderBadge();overlay.remove();};
 }
}
function install(){
 if($('shopping-session-trigger'))return;
 const trigger=document.createElement('button');trigger.type='button';trigger.id='shopping-session-trigger';trigger.className='rounded-xl px-3 py-2 border border-amber-600/40 text-xs font-bold bg-luxury-dark text-luxury-gold';trigger.onclick=draw;
 const scan=$('showroom-scan-trigger');
 if(scan?.parentElement)scan.parentElement.insertAdjacentElement('afterend',trigger);else document.querySelector('header')?.appendChild(trigger);
 renderBadge();
}
restore();document.addEventListener('DOMContentLoaded',install);if(document.readyState!=='loading')install();
window.addEventListener('showroom:cart-changed',sync);
window.CustomerShoppingSession={open:draw,sync};
})();
