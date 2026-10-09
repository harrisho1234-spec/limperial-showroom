/* Limperial Showroom — fast product search and mobile selling.
 * Existing filtering, quotations and quantity routines remain authoritative. */
(function(){
'use strict';
const core=window.ShowroomSearchCore;
const $=id=>document.getElementById(id);
const toStr=x=>String(x??'');
let suggestionTimer=null,activeIndex=-1,matched=[];
function catalog(){try{return Array.isArray(products)?products:[]}catch(_){return []}}
function parts(item){try{return getSetFilterComponents(item)}catch(_){return []}}
function imageSrc(item){
  try{
    const src=resolveGoogleDriveImg(item.imgLink||'');
    return /^https:\/\//i.test(src)||/^data:image\//i.test(src)?src:'';
  }catch(_){return ''}
}
function closeSuggestions(){
  const el=$('catalog-search-suggestions');
  if(el){el.replaceChildren();el.hidden=true;}
  matched=[];activeIndex=-1;
  $('search-input')?.setAttribute('aria-expanded','false');
}
function activate(index){
  const el=$('catalog-search-suggestions');
  if(!el||!matched.length)return;
  activeIndex=(index+matched.length)%matched.length;
  [...el.querySelectorAll('[role="option"]')].forEach((node,i)=>{
    node.setAttribute('aria-selected',String(i===activeIndex));
    node.classList.toggle('is-highlighted',i===activeIndex);
  });
}
function choose(item,mode='view'){
  closeSuggestions();
  $('search-input')?.blur();
  if(mode==='add'){toggleCartSelection(item.id);return;}
  openProductDetailModal(item.id);
}
function updateSuggestions(){
  const input=$('search-input'),box=$('catalog-search-suggestions');
  if(!input||!box||!core)return;
  const query=input.value.trim();
  if(query.length<2){closeSuggestions();return;}
  matched=core.results(catalog(),query,parts,7).map(x=>x.item);
  box.replaceChildren();
  activeIndex=-1;
  if(!matched.length){closeSuggestions();return;}
  matched.forEach((item,i)=>{
    const row=document.createElement('div');
    row.className='ss-suggestion';row.setAttribute('role','option');row.setAttribute('aria-selected','false');
    row.id='ss-option-'+i;
    const image=document.createElement('div');image.className='ss-suggestion-photo';
    const src=imageSrc(item);
    if(src){const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';img.onerror=()=>img.remove();image.append(img);}
    else image.innerHTML='<i class="fa-solid fa-crown"></i>';
    const info=document.createElement('div');info.className='ss-suggestion-info';
    const code=document.createElement('small');code.textContent=toStr(item.code||'SET');
    const name=document.createElement('strong');name.textContent=toStr(item.itemName||'Product');
    const cat=document.createElement('small');cat.textContent=[item.class,item.subclass,item.brand].filter(Boolean).join(' · ');
    info.append(code,name,cat);
    const add=document.createElement('button');add.type='button';add.className='ss-suggestion-add';
    add.textContent='Select';add.setAttribute('aria-label','Select '+toStr(item.itemName||item.code));
    add.addEventListener('click',e=>{e.stopPropagation();choose(item,'add')});
    row.append(image,info,add);
    row.addEventListener('click',()=>choose(item,'view'));
    row.addEventListener('mouseenter',()=>activate(i));
    box.append(row);
  });
  box.hidden=false;
  input.setAttribute('aria-expanded','true');
}
function initSearch(){
  const input=$('search-input');if(!input||$('catalog-search-suggestions'))return;
  const box=document.createElement('div');box.id='catalog-search-suggestions';
  box.className='ss-suggestions';box.setAttribute('role','listbox');
  box.setAttribute('aria-label','Product suggestions');box.hidden=true;
  input.parentElement?.append(box);
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');
  input.setAttribute('aria-controls',box.id);input.setAttribute('aria-expanded','false');
  input.addEventListener('input',()=>{clearTimeout(suggestionTimer);suggestionTimer=setTimeout(updateSuggestions,90);});
  input.addEventListener('focus',()=>{if(input.value.trim().length>=2)updateSuggestions();});
  input.addEventListener('keydown',e=>{
    if(box.hidden)return;
    if(e.key==='ArrowDown'){e.preventDefault();activate(activeIndex+1);}
    if(e.key==='ArrowUp'){e.preventDefault();activate(activeIndex-1);}
    if(e.key==='Escape'){e.preventDefault();closeSuggestions();}
    if(e.key==='Enter'&&matched.length){e.preventDefault();choose(matched[activeIndex>=0?activeIndex:0],'view');}
  });
  document.addEventListener('pointerdown',e=>{if(!input.parentElement?.contains(e.target))closeSuggestions();});
}
function ensureMobileBar(){
  if($('ss-mobile-bar'))return;
  const bar=document.createElement('div');
  bar.id='ss-mobile-bar';bar.className='ss-mobile-bar';bar.hidden=false;
  bar.setAttribute('role','region');
  bar.setAttribute('aria-label','Customer Interest List quick access');
  const title=document.createElement('div');title.className='ss-cart-main';
  const qty=document.createElement('span');qty.id='ss-cart-count';qty.className='ss-cart-count';
  const total=document.createElement('strong');total.id='ss-cart-total';
  title.append(qty,total);
  const step=document.createElement('div');step.id='ss-quick-qty';step.className='ss-quick-qty';
  const minus=document.createElement('button');minus.id='ss-qty-minus';minus.type='button';minus.textContent='−';minus.setAttribute('aria-label','Decrease last item quantity');
  const number=document.createElement('span');number.id='ss-qty-number';number.textContent='1';
  const plus=document.createElement('button');plus.id='ss-qty-plus';plus.type='button';plus.textContent='+';plus.setAttribute('aria-label','Increase last item quantity');
  step.append(minus,number,plus);
  const cartBtn=document.createElement('button');cartBtn.type='button';cartBtn.className='ss-bar-cart';cartBtn.innerHTML='<i class="fa-solid fa-receipt"></i> Open Cart';
  cartBtn.setAttribute('aria-label','Open Customer Interest List');
  cartBtn.onclick=()=>toggleMobileCart(true);
  // Tablet-only entry point: open saved quotations without first opening the cart.
  const quotationsBtn=document.createElement('button');
  quotationsBtn.id='ss-open-quotations';quotationsBtn.type='button';
  quotationsBtn.className='ss-bar-open-quotes';
  quotationsBtn.innerHTML='<i class="fa-solid fa-folder-open" aria-hidden="true"></i> Open Quotations';
  quotationsBtn.setAttribute('aria-label','Open saved quotations and customer lists');
  quotationsBtn.onclick=()=>openSavedListsModal('open');
  bar.append(title,step,quotationsBtn,cartBtn);
  document.body.append(bar);
  minus.onclick=()=>quickQty(-1);plus.onclick=()=>quickQty(1);
}
function lastLine(){
  try{return [...cart].reverse().find(x=>x.type!=='service'&&Number(x.quantity)>=1)||null;}
  catch(_){return null}
}
function lineId(line){return line?.type==='set'?(line.id||line.setId):line?.item?.id}
function quickQty(delta){
  const line=lastLine(),id=lineId(line);if(!line||!id)return;
  if(delta<0&&line.quantity<=1)return;
  changeQty(id,delta);
}
function refreshCart(){
  const bar=$('ss-mobile-bar');if(!bar)return;
  let lines=[];try{lines=Array.isArray(cart)?cart:[]}catch(_){}
  const qty=lines.reduce((n,c)=>n+(Number(c.quantity)||0),0);
  // Keep a single entry point even for an empty list, so saved
  // quotations remain accessible without an icon covering product buttons.
  bar.hidden=false;
  document.body.classList.add('ss-has-mobile-cart');
  $('ss-cart-count').textContent=qty ? qty+' item'+(qty!==1?'s':'') : 'Customer Interest List · 0 items';
  if(qty){
    try{$('ss-cart-total').textContent=formatCurrency(getCartFinalTotal());}
    catch(_){$('ss-cart-total').textContent='View selected products';}
  }else{
    $('ss-cart-total').textContent='Ready to select products';
  }
  const last=lastLine(),step=$('ss-quick-qty');
  step.hidden=!last;
  if(last){
    $('ss-qty-number').textContent=String(last.quantity);
    $('ss-qty-minus').disabled=Number(last.quantity)<=1;
    const name=toStr(last.type==='set'?last.setName:last.item?.itemName);
    step.title='Quick quantity · '+name;
  }
}
function init(){
  initSearch();ensureMobileBar();refreshCart();
}
window.ShowroomSelling=Object.freeze({init,refreshCart,closeSuggestions,updateSuggestions});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();