/* Read-only Phase 1 helpers: quotation comparison and customer-safe product values.
 * No database writes, sensitive costing, or catalog mutations occur here. */
(function(root) {
  'use strict';
  const num=(v, fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
  const money=v=>'$'+num(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const round=v=>Math.round((num(v)+Number.EPSILON)*100)/100;
  function line(cartItem, index=0){
    const c=cartItem||{}, item=c.item||{};
    const isSet=c.type==='set';
    const service=c.type==='service';
    const key=isSet?'set:'+String(c.setId||c.id||c.setName||index)
      :service?'service:'+String(c.id||item.itemName||index)
        :'product:'+String(item.code||item.id||index);
    const title=isSet?String(c.setName||item.itemName||'Set')
      :String(item.itemName||item.name||item.code||'Item');
    const code=isSet?'SET':service?'SERVICE':String(item.code||item.id||'');
    const quantity=Math.max(0,num(c.quantity,1));
    const discount=Math.max(0,Math.min(100,num(c.discount)));
    let base;
    if(c.customPrice!==null&&c.customPrice!==undefined&&c.customPrice!=='')base=num(c.customPrice);
    else if(isSet){
      if(c.setPrice!==undefined&&c.setPrice!==null)base=num(c.setPrice);
      else base=(c.items||[]).reduce((sum,sub)=>sum+num(sub?.item?.actualSalesPrice??sub?.item?.price)*num(sub.quantity,1),0);
    }else base=num(item.actualSalesPrice??item.salesPrice??item.price);
    return {key,title,code,quantity,unitPrice:round(base),discount,net:round(quantity*base*(1-discount/100))};
  }
  function lines(state){
    const result=new Map();
    const list=Array.isArray(state?.cart)?state.cart:[];
    list.forEach((item,i)=>{
      const next=line(item,i), prior=result.get(next.key);
      if(prior && prior.unitPrice===next.unitPrice&&prior.discount===next.discount){
        prior.quantity+=next.quantity;prior.net=round(prior.net+next.net);
      }else if(prior){result.set(next.key+'#'+i,next);}else result.set(next.key,next);
    });
    return result;
  }
  const equal=(a,b)=>Math.abs(num(a)-num(b))<0.005;
  function compare(before,after){
    const oldLines=lines(before),newLines=lines(after),ids=new Set([...oldLines.keys(),...newLines.keys()]);
    const changes=[];
    for(const id of ids){
      const oldLine=oldLines.get(id)||null,newLine=newLines.get(id)||null;
      if(!oldLine){changes.push({kind:'added',oldLine:null,newLine});continue;}
      if(!newLine){changes.push({kind:'removed',oldLine,newLine:null});continue;}
      const fields=[];
      if(oldLine.title!==newLine.title)fields.push('Description');
      if(!equal(oldLine.quantity,newLine.quantity))fields.push('Quantity');
      if(!equal(oldLine.unitPrice,newLine.unitPrice))fields.push('Unit price');
      if(!equal(oldLine.discount,newLine.discount))fields.push('Item discount');
      if(fields.length)changes.push({kind:'changed',fields,oldLine,newLine});
    }
    const oldSubtotal=round([...oldLines.values()].reduce((n,l)=>n+l.net,0));
    const newSubtotal=round([...newLines.values()].reduce((n,l)=>n+l.net,0));
    const oldPct=num(before?.discountPctValue),newPct=num(after?.discountPctValue);
    const oldFlat=num(before?.discountFlatValue),newFlat=num(after?.discountFlatValue);
    const oldTotal=round(Math.max(0,oldSubtotal*(1-oldPct/100)-oldFlat));
    const newTotal=round(Math.max(0,newSubtotal*(1-newPct/100)-newFlat));
    return {
      changes, oldSubtotal,newSubtotal, oldTotal,newTotal,
      discountChanged:!equal(oldPct,newPct)||!equal(oldFlat,newFlat),
      oldPct,newPct,oldFlat,newFlat
    };
  }
  function presentationLine(cartItem,index=0){
    const raw=line(cartItem,index);
    const c=cartItem||{}, item=c.item||{};
    const isSet=c.type==='set';
    // Created sets use setPhoto in the cart, not photoUrl/setPhotoUrl.
    // Also support older sets and ad-hoc bundles that have component photos only.
    const componentPhotos=(Array.isArray(c.items)?c.items:[])
      .map(part=>String(part?.item?.imgLink||part?.item?.imageUrl||'').trim())
      .filter(Boolean);
    const photo=String(isSet
      ? (c.setPhoto||c.photoUrl||c.setPhotoUrl||item.imgLink||c.imgLink||componentPhotos[0]||'')
      : (item.imgLink||item.imageUrl||'')).trim();
    const fallbackPhoto=isSet?(componentPhotos.find(url=>url!==photo)||''):'';
    const components=isSet?(Array.isArray(c.items)?c.items:[])
      .map(part=>part?.item?.itemName||part?.item?.name||'')
      .filter(Boolean).join(' · '):'';
    const description=String(isSet?(c.setDescription||components||''):(item.description||'')).trim();
    return {key:raw.key,title:raw.title,code:raw.code,
      quantity:raw.quantity,unitPrice:raw.unitPrice,discount:raw.discount,net:raw.net,
      description,photo,fallbackPhoto,stock:isSet?null:(Number.isFinite(Number(item.qty))?Number(item.qty):null)};
  }
  const DRAFT_RETENTION_MS=7*24*60*60*1000;
  // An autosave updates savedAt; expired means no edits for seven full days.
  // This operates only on unsaved local snapshots, never official quotations.
  function freshDrafts(rows,now=Date.now()){
    if(!Array.isArray(rows))return [];
    return rows.filter(x=>{
      if(!x||x.version!==1||typeof x.id!=='string'||!x.id.trim()||!x.data||
         typeof x.data!=='object'||typeof x.savedAt!=='string')return false;
      const lastEdit=Date.parse(x.savedAt);
      return Number.isFinite(lastEdit)&&now-lastEdit<DRAFT_RETENTION_MS;
    });
  }
  root.ShowroomPhase1Core=Object.freeze({line,lines,compare,presentationLine,money,round,freshDrafts,DRAFT_RETENTION_MS});
})(window);
