/* Shared aggregate Showroom interest. No customer details, staff names,
 * phone numbers, quotation amounts or private pricing are collected. */
(function(){
'use strict';
const api=window.APP_CONFIG||{};
const client=window.supabase?.createClient&&api.SUPABASE_URL&&api.SUPABASE_PUBLISHABLE_KEY
  ?window.supabase.createClient(api.SUPABASE_URL,api.SUPABASE_PUBLISHABLE_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
  }):null;
const $=id=>document.getElementById(id);
const lastView=new Map();
const VIEW_DELAY=15*60*1000;
const allowed=new Set(['view','favorite','compare','quotation']);
const label={views:'Views',favorites:'Favorites',compares:'Comparisons',quotations:'Quotations'};
let analyticsOpen=false,days=30,sort='interest',entries=[];
const n=v=>Number(v)||0;
function codeFor(item){
  return String(item?.code||item?.item?.code||((item?.type==='set'||item?.isSet)?'SET-'+(item.setId||item.id||''):'')).trim().slice(0,100);
}
async function record(product,event,quoteRef=null){
  if(!client||!allowed.has(event)||!navigator.onLine)return false;
  const code=typeof product==='string'?product.trim():codeFor(product);
  if(!code||code.length>100)return false;
  if(event==='view'){
    const now=Date.now();
    if(now-(lastView.get(code)||0)<VIEW_DELAY)return false;
    lastView.set(code,now);
  }
  const args={p_product_code:code,p_event:event};
  if(event==='quotation'){
    if(!quoteRef)return false;
    args.p_quotation_ref=String(quoteRef).slice(0,160);
  }
  try{
    const {error}=await client.rpc('record_showroom_interest',args);
    if(error)throw error;
    return true;
  }catch(e){
    if(event==='view')lastView.delete(code);
    console.debug('[Showroom analytics] Event not recorded:',e?.message||e);
    return false;
  }
}
function recordQuote(quote){
  const items=Array.isArray(quote?.state?.cart)?quote.state.cart:[];
  if(!quote?.id||!items.length)return;
  const seen=new Set();
  items.forEach(entry=>{
    const code=codeFor(entry);
    if(code&&!seen.has(code)){seen.add(code);record(code,'quotation',quote.id);}
  });
}
function findProduct(code){
  try{return Array.isArray(products)?products.find(p=>String(p.code||'').toLowerCase()===String(code).toLowerCase()):null}
  catch(_){return null}
}
function close(){
  const modal=$('showroom-analytics-modal');
  modal?.remove();analyticsOpen=false;
  $('showroom-analytics-button')?.focus();
}
function element(tag,cls,value){
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(value!==undefined)el.textContent=String(value);
  return el;
}
function metric(row,name){
  if(name==='interest')return n(row.views)+3*n(row.favorites)+3*n(row.compares)+5*n(row.quotations);
  return n(row[name]);
}
function renderResults(){
  const list=$('sa-result-list'),summary=$('sa-summary');
  if(!list)return;
  list.replaceChildren();
  const rows=[...entries].sort((a,b)=>metric(b,sort)-metric(a,sort)||String(a.product_code).localeCompare(String(b.product_code))).slice(0,30);
  if(summary)summary.textContent='Last '+days+' days · '+entries.length+' products recorded · Views and selections are events, not unique customers';
  if(!rows.length){
    list.append(element('p','sa-empty','No product interactions have been recorded for this period yet. Tracking begins after this update and requires an internet connection.'));
    return;
  }
  const max=Math.max(...rows.map(r=>metric(r,sort)),1);
  rows.forEach((entry,index)=>{
    const item=findProduct(entry.product_code);
    const row=element('div','sa-entry');
    const rank=element('div','sa-rank',index+1);
    const info=element('div','sa-product');
    info.append(element('strong','',item?.itemName||entry.product_code));
    info.append(element('small','',entry.product_code));
    const numbers=element('div','sa-numbers');
    numbers.append(element('strong','',metric(entry,sort)));
    numbers.append(element('small','',sort==='interest'?'Interest score':label[sort]));
    const bar=element('div','sa-meter');
    const fill=element('div','sa-meter-fill');fill.style.width=Math.max(2,Math.round(metric(entry,sort)/max*100))+'%';bar.append(fill);
    const meta=element('div','sa-metrics','Views '+n(entry.views)+' · Favorites '+n(entry.favorites)+' · Compares '+n(entry.compares)+' · Quotes '+n(entry.quotations));
    row.append(rank,info,numbers);
    const details=element('div','sa-entry-details');details.append(bar,meta);
    row.append(details);
    list.append(row);
  });
}
async function load(){
  const list=$('sa-result-list');if(!list)return;
  list.replaceChildren(element('p','sa-empty','Loading showroom interest…'));
  try{
    const {data,error}=await client.rpc('showroom_interest_leaderboard',{p_days:days});
    if(error)throw error;
    entries=Array.isArray(data)?data:[];
    if(analyticsOpen)renderResults();
  }catch(e){
    list.replaceChildren(element('p','sa-empty','Could not load analytics. Confirm Management Mode permission and try again.'));
    console.warn('[Showroom analytics] Leaderboard unavailable:',e);
  }
}
async function open(){
  if(analyticsOpen||!client)return;
  try{
    const [user,access]=await Promise.all([
      client.auth.getUser(),client.rpc('current_user_has_permission',{p_permission:'showroom.management_mode'})
    ]);
    if(user.error||!user.data?.user||access.error||access.data!==true){
      alert('Sign in to Sales & Order Management with Showroom Management permission to view analytics.');
      return;
    }
  }catch(_){alert('Could not verify management permission.');return;}
  analyticsOpen=true;
  const modal=element('div','sa-backdrop');modal.id='showroom-analytics-modal';
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Showroom Product Interest');
  const panel=element('section','sa-panel');
  const top=element('header','sa-top');
  const heading=element('div');heading.append(element('h2','sa-heading','Product Interest Analytics'));
  heading.append(element('p','sa-caption','Management-only · aggregate product interactions'));
  const closeButton=element('button','sa-close','✕');closeButton.type='button';closeButton.setAttribute('aria-label','Close analytics');closeButton.onclick=close;
  top.append(heading,closeButton);
  const content=element('div','sa-content');
  const controls=element('div','sa-controls');
  const daysSelect=element('select','sa-select');daysSelect.setAttribute('aria-label','Time range');
  [7,30,90].forEach(v=>{const o=element('option','','Last '+v+' days');o.value=v;daysSelect.append(o);});
  daysSelect.value=String(days);daysSelect.onchange=()=>{days=Number(daysSelect.value);load();};
  const metricSelect=element('select','sa-select');metricSelect.setAttribute('aria-label','Ranking metric');
  ['interest','views','favorites','compares','quotations'].forEach(v=>{
    const o=element('option','',v==='interest'?'Overall interest':label[v]);o.value=v;metricSelect.append(o);
  });
  metricSelect.value=sort;metricSelect.onchange=()=>{sort=metricSelect.value;renderResults();};
  const reload=element('button','sa-reload','Refresh');reload.type='button';reload.onclick=load;
  controls.append(daysSelect,metricSelect,reload);
  const summary=element('p','sa-caption','');summary.id='sa-summary';
  const list=element('div','sa-list');list.id='sa-result-list';
  const note=element('p','sa-note','These are product interest signals, not confirmed sales. One quotation counts each included product once per saved quotation, even across revisions. No customer information is collected.');
  content.append(controls,summary,list,note);
  panel.append(top,content);modal.append(panel);document.body.append(modal);
  modal.addEventListener('pointerdown',e=>{if(e.target===modal)close();});
  load();
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&analyticsOpen)close()});
window.ShowroomAnalytics=Object.freeze({record,recordQuote,open,close});
})();