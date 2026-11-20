/* Unified brand picker for read-only selling-price references.
   Keeps each brand's existing validated source, search, photos and filters intact. */
(function(root){
  'use strict';
  const doc=root.document;
  if(!doc)return;
  const brands=[
    {id:'deluxe',label:'Deluxe Arte',api:'DeluxeArtePriceReference',overlay:'da-ref-overlay'},
    {id:'asfour',label:'Asfour',api:'AsfourPriceReference',overlay:'asfour-ref-overlay'}
  ];
  function switchBrand(id){
    const selected=brands.find(x=>x.id===id);
    if(!selected||!root[selected.api])return;
    for(const brand of brands){
      if(brand.id!==id)root[brand.api]?.close();
    }
    root[selected.api].open();
    addTabs(selected);
  }
  function addTabs(brand){
    const overlay=doc.getElementById(brand.overlay);
    const header=overlay?.querySelector('.da-ref-header');
    if(!header||overlay.querySelector('.unified-price-brands'))return;
    const tabs=doc.createElement('nav');
    tabs.className='unified-price-brands';
    tabs.setAttribute('aria-label','Select price reference brand');
    for(const entry of brands){
      const button=doc.createElement('button');
      button.type='button';
      button.textContent=entry.label;
      button.className='unified-price-brand'+(entry.id===brand.id?' is-selected':'');
      button.setAttribute('aria-current',entry.id===brand.id?'page':'false');
      button.addEventListener('click',()=>switchBrand(entry.id));
      tabs.appendChild(button);
    }
    header.after(tabs);
  }
  function install(){
    const original=doc.getElementById('da-price-reference-button');
    const asfour=doc.getElementById('asfour-price-reference-button');
    if(!original||!asfour||doc.getElementById('unified-price-reference-button'))return;
    const button=doc.createElement('button');
    button.type='button';
    button.id='unified-price-reference-button';
    button.className=original.className;
    button.title='Browse selling prices by brand — separate from stock';
    button.setAttribute('aria-label','Open Price Reference and choose brand');
    button.innerHTML='<i class="fa-solid fa-images" aria-hidden="true"></i><span>Price Reference</span>';
    button.addEventListener('click',()=>switchBrand('deluxe'));
    original.before(button);
    original.hidden=true;
    asfour.hidden=true;
    // The legacy triggers remain attached for compatibility, but are not displayed.
    original.style.setProperty('display','none','important');
    asfour.style.setProperty('display','none','important');
  }
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
  root.LImperialUnifiedPriceReference=Object.freeze({open:switchBrand,install});
})(typeof window!=='undefined'?window:globalThis);
