const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const script=read('showroom-price-visibility.js');
const css=read('showroom-price-visibility.css');
function build(){
 const markup='<!doctype html><html><head><style>'+css+'</style></head><body>'+
  '<button id="showroom-price-toggle" aria-pressed="false"><i class="fa-solid fa-eye"></i></button>'+
  '<div id="product-grid"><div class="showroom-sales-price" id="price">$2,000</div><span id="code">SKU-001</span></div>'+
  '<div id="detail-modal-price">$2,000</div>'+
  '<button data-showroom-share-price>Share with price</button>'+
  '<div class="sp1-presentation-price">$2,000</div>'+
  '<div class="sp1-presentation-price-note">Prices before discount</div>'+
  '<div id="quotation-live-paper"><span id="quote-total">$2,000</span></div>'+
  '</body></html>';
 const dom=new JSDOM(markup,{runScripts:'outside-only',url:'https://showroom.test/'});
 dom.window.eval(script);
 dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
 return dom;
}
test('tiny header eye toggle hides display prices only and preserves quotations',()=>{
 const dom=build();const {window:w}=dom,doc=w.document;
 try{
  const button=doc.getElementById('showroom-price-toggle');
  assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.equal(w.ShowroomPriceVisibility.hidden,false);
  assert.equal(w.getComputedStyle(doc.getElementById('price')).display,'block');
  assert.equal(w.getComputedStyle(doc.getElementById('detail-modal-price')).display,'block');
  assert.equal(w.ShowroomPriceVisibility.toggle(),true);
  assert.equal(doc.documentElement.classList.contains('showroom-hide-sales-prices'),true);
  assert.equal(button.getAttribute('aria-label'),'Show sales prices');
  assert.equal(button.getAttribute('aria-pressed'),'true');
  assert.equal(w.getComputedStyle(doc.getElementById('price')).display,'none');
  assert.equal(w.getComputedStyle(doc.getElementById('detail-modal-price')).display,'none');
  assert.equal(w.getComputedStyle(doc.querySelector('[data-showroom-share-price]')).display,'none');
  assert.equal(w.getComputedStyle(doc.querySelector('.sp1-presentation-price')).display,'none');
  assert.equal(w.getComputedStyle(doc.querySelector('.sp1-presentation-price-note')).display,'none');
  assert.notEqual(w.getComputedStyle(doc.getElementById('quote-total')).display,'none','quotation totals remain visible');
  assert.equal(doc.getElementById('price').textContent,'$2,000','price data must not change');
  assert.equal(doc.getElementById('code').textContent,'SKU-001');
  assert.equal(w.localStorage.getItem('limperial-showroom-hide-sales-price-v1'),'1');
  assert.equal(w.ShowroomPriceVisibility.toggle(),false);
  assert.equal(w.getComputedStyle(doc.getElementById('price')).display,'block');
  assert.equal(w.localStorage.getItem('limperial-showroom-hide-sales-price-v1'),'0');
 }finally{dom.window.close()}
});
test('saved visibility preference is restored on reopening the device',()=>{
 const dom=build();
 try{
  dom.window.localStorage.setItem('limperial-showroom-hide-sales-price-v1','1');
  dom.window.eval(script);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  assert.equal(dom.window.ShowroomPriceVisibility.hidden,true);
  assert.equal(dom.window.document.getElementById('showroom-price-toggle').getAttribute('aria-pressed'),'true');
  assert.equal(dom.window.getComputedStyle(dom.window.document.getElementById('price')).display,'none');
 }finally{dom.window.close()}
});
test('catalog grid/list, detail, replacement picker, favorites and compare have price markers',()=>{
 const index=read('index.html'),phase1=read('showroom-phase1.js');
 assert.match(index,/id="showroom-price-toggle"/);
 assert.match(index,/showroom-price-visibility\.js\?v=V4\.11\.03/);
 assert.match(index,/showroom-price-visibility\.css\?v=V4\.11\.03/);
 assert.match(index,/\$\{priceHtml\}<\/div>/);
 assert.ok((index.match(/showroom-sales-price/g)||[]).length>=3);
 assert.match(index,/data-showroom-share-price/);
 assert.match(index,/id="detail-modal-price"/);
 assert.match(phase1,/price\.className='showroom-sales-price'/);
 assert.match(phase1,/if\(k==='Price'\).*showroom-sales-price/);
 assert.match(phase1,/sp1-presentation-price showroom-sales-price/);
 assert.equal(css.includes('#quotation-live-paper'),false,'quotation paper totals intentionally stay visible');
});



test('Water Festival promotion cards follow the eye toggle, including after carousel re-render',()=>{
 const dom=build(),w=dom.window,doc=w.document;
 try{
  const banner=doc.createElement('section');
  banner.id='seasonal-promotions-section';
  doc.body.append(banner);
  w.SeasonalCore={
   today:()=> '2026-11-09',
   index:()=>new Map([['SB12',{}]]),
   active:()=>[{name:'Water Festival Promotion'}],
   project:p=>({...p,_seasonalCampaign:{badge:'Special Offer'}})
  };
  w.products=[{id:'promo-1',code:'SB12',itemName:'Sofa promotion',price:553,brand:'DELUXE ART',imgLink:''}];
  w.eval(read('seasonal-promotions.js'));
  doc.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.SeasonalPromos.catalogUpdated();
  const priceEl=()=>banner.querySelector('.showroom-sales-price');
  assert.ok(priceEl(),'promotion carousel price has the shared visibility class');
  assert.match(priceEl().textContent,/\$553/);
  assert.notEqual(w.getComputedStyle(priceEl()).display,'none');
  w.ShowroomPriceVisibility.setHidden(true);
  assert.equal(w.getComputedStyle(priceEl()).display,'none','hide price works on existing promo card');
  w.SeasonalPromos.catalogUpdated();
  assert.ok(priceEl(),'promotion cards can be refreshed');
  assert.equal(w.getComputedStyle(priceEl()).display,'none','newly rendered promo cards stay hidden');
  assert.match(priceEl().textContent,/\$553/,'underlying promotional selling price is unchanged');
  assert.ok(banner.textContent.includes('Sofa promotion'),'product identity stays visible');
  assert.ok(banner.textContent.includes('Special Offer'),'promo badge stays visible');
  w.ShowroomPriceVisibility.setHidden(false);
  assert.notEqual(w.getComputedStyle(priceEl()).display,'none','prices reappear on Show Price');
 }finally{dom.window.close()}
});
