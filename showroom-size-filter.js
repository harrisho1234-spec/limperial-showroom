/* Size filtering for stock-backed and reference-only search results.
   Match labeled dimensions, never product codes or unlabeled model numbers. */
(function(root){
 'use strict';
 const doc=root.document;
 if(!doc)return;
 const id=name=>doc.getElementById(name);
 const escape=s=>String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const num=s=>Number(String(s).replace(',','.'));
 const normalizeUnit=(v,unit)=>unit==='mm'?v/10:unit==='m'?v*100:v;
 function dimensions(raw){
   const str=String(raw||'').replace(/⌀|φ/gi,'Ø').replace(/\u00d7/g,'x');
   const found=[];
   // A diameter is only inferred when a diameter symbol or word exists.
   const diameter=/(?:Ø|diam(?:eter)?\.?|dia\.?)[\s:=-]*\.?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\b?/gi;
   for(const m of str.matchAll(diameter))found.push({kind:'diameter',value:num(m[1]),unit:m[2]||''});
   const explicit=/(?:^|[^a-z\d])(?:width|height|length|depth|W|H|L|D)\s*[.:= -]*\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/gi;
   for(const m of str.matchAll(explicit)){
     const prefix=m[0].match(/(?:width|height|length|depth|W|H|L|D)/i)?.[0].toLowerCase();
     const type={w:'width',h:'height',l:'length',d:'depth'}[prefix]||prefix;
     if(type)found.push({kind:type,value:num(m[1]),unit:m[2]||''});
   }
   return found;
 }
 function configuration(){
   const value=num(id('showroom-size-value')?.value||'');
   const kind=id('showroom-size-kind')?.value||'diameter';
   const unit=id('showroom-size-unit')?.value||'cm';
   return{value,kind,unit,active:Number.isFinite(value)&&value>0};
 }
 function matchesFields(fields,conf=configuration()){
   if(!conf.active)return true;
   const records=dimensions(fields);
   return records.some(d=>{
     if(conf.kind!=='any'&&d.kind!==conf.kind)return false;
     // Unspecified source units are only compared as printed, not converted.
     const target=d.unit?normalizeUnit(conf.value,conf.unit):conf.value;
     const actual=d.unit?normalizeUnit(d.value,d.unit):d.value;
     return Math.abs(actual-target)<0.001;
   });
 }
 function matchesProduct(item,components){
   const fields=[item?.description,item?.itemName,item?.size,item?.dimensions,item?.specifications,item?.dimension,
     ...(Array.isArray(components)?components.flatMap(x=>[x?.description,x?.size,x?.dimensions,x?.itemName]):[])];
   return matchesFields(fields.filter(Boolean).join(' '));
 }
 function init(){
   const panel=id('catalog-controls-panel');
   if(!panel||id('showroom-size-filter'))return;
   const wrap=doc.createElement('div');
   wrap.id='showroom-size-filter';wrap.className='showroom-size-filter';
   wrap.innerHTML='<label for="showroom-size-kind">Size filter</label>'+
     '<select id="showroom-size-kind" aria-label="Dimension type"><option value="diameter">Diameter Ø</option><option value="width">Width W</option><option value="length">Length L</option><option value="height">Height H</option><option value="depth">Depth D</option><option value="any">Any dimension</option></select>'+
     '<input id="showroom-size-value" type="number" inputmode="decimal" min="0" step="any" placeholder="e.g. 10" aria-label="Dimension value">'+
     '<select id="showroom-size-unit" aria-label="Dimension unit"><option value="cm">cm</option><option value="mm">mm</option><option value="m">m</option></select>'+
     '<button type="button" id="showroom-size-clear" aria-label="Clear size filter">Clear</button>'+
     '<span class="showroom-size-hint">Matches labeled dimensions only</span>';
   const search=id('search-input');
   const searchRow=search?.parentElement;
   if(searchRow&&searchRow.parentElement===panel)searchRow.after(wrap);
   else panel.prepend(wrap);
   const notify=()=>{if(typeof root.executeSearchFilter==='function')root.executeSearchFilter();root.LImperialReferenceSearch?.render?.()};
   for(const field of ['showroom-size-kind','showroom-size-value','showroom-size-unit']){
     id(field).addEventListener('input',notify);
     id(field).addEventListener('change',notify);
   }
   id('showroom-size-clear').addEventListener('click',()=>{id('showroom-size-value').value='';notify()});
 }
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});else init();
 root.LImperialSizeFilter=Object.freeze({dimensions,configuration,matchesFields,matchesProduct});
})(typeof window!=='undefined'?window:globalThis);
