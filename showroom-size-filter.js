/* Flexible dimension search for showroom stock and reference-only products.
   Uses stated measurements only, never code fragments or supplier model numbers. */
(function(root){
'use strict';
const doc=root.document;
if(!doc)return;
const el=id=>doc.getElementById(id);
const value=s=>Number(String(s||'').replace(',','.'));
const toCm=(n,u)=>u==='mm'?n/10:u==='m'?n*100:n;
function dimensions(raw){
 const text=String(raw||'').replace(/[⌀φ]/gi,'Ø').replace(/[×]/g,'x');
 const matches=[], seen=new Set();
 const add=(kind,v,u)=>{
   const n=value(v);if(!Number.isFinite(n)||n<=0)return;
   const key=kind+'|'+n+'|'+(u||'');
   if(!seen.has(key)){matches.push({kind,value:n,unit:(u||'').toLowerCase()});seen.add(key);}
 };
 const diameter=/(?:Ø|diameter|diam\.?|dia\.?)\s*[:.=\-]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/gi;
 for(const m of text.matchAll(diameter))add('diameter',m[1],m[2]);
 const explicit=/(?:^|[^a-z\d])(?:width|height|length|depth|W|H|L|D)\s*[:.=\-]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/gi;
 for(const m of text.matchAll(explicit)){
   const k=m[0].match(/(?:width|height|length|depth|W|H|L|D)/i)?.[0]?.toLowerCase();
   const kind=({w:'width',h:'height',l:'length',d:'depth'})[k]||k;
   if(kind)add(kind,m[1],m[2]);
 }
 // Common unlabelled three-axis format: 120 x 60 x 75 cm
 const axes=/\b(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/g;
 for(const m of text.matchAll(axes)){
   add('length',m[1],m[4]);add('width',m[2],m[4]);add('height',m[3],m[4]);
 }
 return matches;
}
function configuration(){
 const kind=el('showroom-size-kind')?.value||'any';
 const unit=el('showroom-size-unit')?.value||'cm';
 const from=value(el('showroom-size-value')?.value);
 const to=value(el('showroom-size-to')?.value);
 const mode=el('showroom-size-mode')?.value||'around';
 const hasFrom=Number.isFinite(from)&&from>0,hasTo=Number.isFinite(to)&&to>0;
 return{kind,unit,from,to,mode,active:hasFrom||hasTo,hasFrom,hasTo};
}
function matchesFields(fields,conf=configuration()){
 if(!conf.active)return true;
 const source=dimensions(fields);
 return source.some(d=>{
  if(conf.kind!=='any'&&conf.kind!==d.kind)return false;
  const actual=toCm(d.value,d.unit||conf.unit);
  const from=toCm(conf.from,conf.unit),to=toCm(conf.to,conf.unit);
  if(conf.mode==='min')return conf.hasFrom&&actual>=from;
  if(conf.mode==='max')return conf.hasFrom&&actual<=from;
  if(conf.mode==='range')return conf.hasFrom&&conf.hasTo&&actual>=Math.min(from,to)&&actual<=Math.max(from,to);
  if(!conf.hasFrom)return false;
  if(conf.mode==='exact')return Math.abs(actual-from)<.01;
  // "Around": a practical ±10% band, at least 1 cm.
  return Math.abs(actual-from)<=Math.max(1,from*.1);
 });
}
function matchesProduct(item,components){
 const fields=[item?.description,item?.itemName,item?.size,item?.dimensions,item?.specifications,item?.dimension,
  ...(Array.isArray(components)?components.flatMap(x=>[x?.description,x?.size,x?.dimensions,x?.itemName]):[])];
 return matchesFields(fields.filter(Boolean).join(' '));
}
function init(){
 const panel=el('catalog-controls-panel'),search=el('search-input');
 if(!panel||!search||el('showroom-size-filter'))return;
 const wrap=doc.createElement('div');
 wrap.id='showroom-size-filter';wrap.className='showroom-size-filter';
 wrap.innerHTML='<details id="showroom-size-details"><summary class="showroom-size-summary"><span class="showroom-size-summary-title"><i class="fa-solid fa-ruler-combined" aria-hidden="true"></i> Size</span><span id="showroom-size-summary-value" class="showroom-size-summary-value">Any size</span><i class="fa-solid fa-chevron-down showroom-size-chevron" aria-hidden="true"></i></summary><div class="showroom-size-expanded"><div class="showroom-size-top"><label for="showroom-size-kind">Dimension</label>'+
  '<select id="showroom-size-kind" aria-label="Dimension type"><option value="any">Any size</option><option value="diameter">Diameter Ø</option><option value="width">Width</option><option value="length">Length</option><option value="height">Height</option><option value="depth">Depth</option></select>'+
  '<select id="showroom-size-mode" aria-label="Size matching mode"><option value="around">Around ±10%</option><option value="exact">Exact</option><option value="range">Between</option><option value="min">At least</option><option value="max">At most</option></select>'+
  '<input id="showroom-size-value" type="number" inputmode="decimal" min="0" step="any" placeholder="Size" aria-label="Size in selected unit">'+
  '<span id="showroom-size-between-label" hidden>to</span>'+
  '<input id="showroom-size-to" type="number" inputmode="decimal" min="0" step="any" placeholder="Max" aria-label="Maximum size" hidden>'+
  '<select id="showroom-size-unit" aria-label="Size unit"><option value="cm">cm</option><option value="mm">mm</option><option value="m">m</option></select>'+
  '<button type="button" id="showroom-size-clear">Clear</button></div>'+
  '<div class="showroom-size-quick" aria-label="Quick diameter sizes"><span>Quick Ø:</span>'+
  [10,20,30,40,60,80,100].map(n=>'<button type="button" data-cm="'+n+'">'+n+' cm</button>').join('')+
  '<span class="showroom-size-hint">Only documented dimensions are matched; unknown sizes are excluded.</span></div></div></details>';
 const row=search.parentElement;
 if(row?.parentElement===panel)row.after(wrap);else panel.prepend(wrap);
 const updateSummary=()=>{
  const c=configuration();
  const label=el('showroom-size-summary-value');
  const details=el('showroom-size-details');
  if(!label||!details)return;
  const names={any:'Any dimension',diameter:'Ø',width:'W',length:'L',height:'H',depth:'D'};
  const modes={around:'≈',exact:'=',range:'',min:'≥',max:'≤'};
  let summary='Any size';
  if(c.active){
    const number=c.mode==='range'&&c.hasTo?c.from+'–'+c.to:c.from;
    summary=(names[c.kind]||'Size')+' '+(modes[c.mode]||'')+number+' '+c.unit;
  }
  label.textContent=summary;
  details.classList.toggle('has-size',c.active);
  details.querySelector('summary')?.setAttribute('aria-label','Size filter: '+summary+'. Expand or collapse.');
 };
 const notify=()=>{
  updateSummary();
  if(typeof root.executeSearchFilter==='function')root.executeSearchFilter();
  root.LImperialReferenceSearch?.render?.();
 };
 const showRange=()=>{
  const isRange=el('showroom-size-mode').value==='range';
  el('showroom-size-to').hidden=!isRange;
  el('showroom-size-between-label').hidden=!isRange;
 };
 for(const key of ['showroom-size-kind','showroom-size-mode','showroom-size-value','showroom-size-to','showroom-size-unit']){
  el(key).addEventListener('input',()=>{showRange();notify()});
  el(key).addEventListener('change',()=>{showRange();notify()});
 }
 el('showroom-size-clear').addEventListener('click',()=>{
  el('showroom-size-value').value='';el('showroom-size-to').value='';notify();
 });
 wrap.querySelectorAll('[data-cm]').forEach(button=>button.addEventListener('click',()=>{
  el('showroom-size-kind').value='diameter';el('showroom-size-mode').value='around';
  el('showroom-size-value').value=button.dataset.cm;el('showroom-size-unit').value='cm';
  showRange();notify();
 }));
 showRange();updateSummary();
}
if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});else init();
root.LImperialSizeFilter=Object.freeze({dimensions,configuration,matchesFields,matchesProduct});
})(typeof window!=='undefined'?window:globalThis);
