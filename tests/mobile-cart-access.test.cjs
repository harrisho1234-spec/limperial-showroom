const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../showroom-selling.js'),'utf8');
function fixture(){
  const nodes=new Map(), cart=[], calls=[];
  class Node {
    constructor(tag){this.tagName=tag;this.children=[];this.hidden=false;this.attributes={};this.classList={add(x){this.last=x},remove(){},toggle(){}};}
    set id(v){this._id=v;nodes.set(v,this)}
    get id(){return this._id}
    setAttribute(k,v){this.attributes[k]=v}
    append(...c){this.children.push(...c)}
    addEventListener(){}
  }
  const document={
    readyState:'loading',
    body:new Node('body'),
    createElement:tag=>new Node(tag),
    getElementById:id=>nodes.get(id)||null,
    addEventListener:(name,handler)=>{if(name==='DOMContentLoaded')document.mount=handler}
  };
  const ctx={
    window:{},document,cart,
    getCartFinalTotal:()=>cart.reduce((s,x)=>s+x.quantity*100,0),
    formatCurrency:n=>'$'+n,
    toggleMobileCart:open=>calls.push({open}),
    changeQty:(id,delta)=>{const line=cart.find(x=>x.item?.id===id);if(line)line.quantity=Math.max(1,line.quantity+delta)},
    setTimeout:fn=>fn(),clearTimeout(){},console
  };
  vm.runInNewContext(source,ctx);
  document.mount();
  return {api:ctx.window.ShowroomSelling,nodes,cart,calls,document};
}
test('empty interest list uses an always-visible bottom bar instead of covering products',()=>{
  const h=fixture(),bar=h.nodes.get('ss-mobile-bar');
  assert.ok(bar);
  assert.equal(bar.hidden,false);
  assert.equal(h.nodes.get('ss-cart-count').textContent,'Customer Interest List · 0 items');
  assert.equal(h.nodes.get('ss-cart-total').textContent,'Ready to select products');
  assert.equal(h.nodes.get('ss-quick-qty').hidden,true);
  assert.equal(bar.attributes['aria-label'],'Customer Interest List quick access');
  assert.equal(h.document.body.classList.last,'ss-has-mobile-cart');
});
test('bottom cart opens saved quotation drawer even with zero products',()=>{
  const h=fixture();
  const bar=h.nodes.get('ss-mobile-bar');
  const button=bar.children.find(x=>x.className==='ss-bar-cart');
  assert.ok(button);
  button.onclick();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].open,true);
});
test('quantity stepper is visible only when cart has products',()=>{
  const h=fixture();
  h.cart.push({item:{id:'LIGHT-1',itemName:'Chandelier'},quantity:1});
  h.api.refreshCart();
  assert.equal(h.nodes.get('ss-cart-count').textContent,'1 item');
  assert.equal(h.nodes.get('ss-cart-total').textContent,'$100');
  assert.equal(h.nodes.get('ss-quick-qty').hidden,false);
  assert.equal(h.nodes.get('ss-qty-minus').disabled,true);
  h.nodes.get('ss-qty-plus').onclick();
  h.api.refreshCart();
  assert.equal(h.nodes.get('ss-qty-number').textContent,'2');
  assert.equal(h.nodes.get('ss-cart-total').textContent,'$200');
  assert.equal(h.nodes.get('ss-qty-minus').disabled,false);
});
test('original floating cart markup is retired and CSS hides cached copies',()=>{
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  const css=fs.readFileSync(require.resolve('../showroom-selling.css'),'utf8');
  assert.equal(html.includes('id="mobile-cart-floating"'),false);
  assert.ok(html.includes('id="mobile-cart-drawer"'));
  assert.ok(css.includes('#mobile-cart-floating {display:none!important}'));
});
