/* Show/hide customer-facing sales prices without changing product or order data. */
(function(){
 'use strict';
 const KEY='limperial-showroom-hide-sales-price-v1';
 let hidden=false;
 try{hidden=window.localStorage.getItem(KEY)==='1'}catch(_){}
 function apply(){
  document.documentElement.classList.toggle('showroom-hide-sales-prices',hidden);
  const button=document.getElementById('showroom-price-toggle');
  if(button){
   button.setAttribute('aria-pressed',String(hidden));
   button.setAttribute('aria-label',hidden?'Show sales prices':'Hide sales prices');
   button.title=hidden?'Show sales prices':'Hide sales prices';
   const icon=button.querySelector('i');
   if(icon)icon.className=hidden?'fa-solid fa-eye-slash text-xs':'fa-solid fa-eye text-xs';
  }
 }
 function setHidden(value){
  hidden=!!value;
  try{window.localStorage.setItem(KEY,hidden?'1':'0')}catch(_){}
  apply();
  return hidden;
 }
 window.ShowroomPriceVisibility=Object.freeze({
  get hidden(){return hidden},
  setHidden,
  toggle:()=>setHidden(!hidden)
 });
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});
 else apply();
})();
