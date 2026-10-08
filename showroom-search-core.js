/* Ranked multi-word catalog search. No private costing fields used. */
(function(root){
'use strict';
const clean=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const tokens=s=>clean(s).split(/\s+/).filter(Boolean).slice(0,9);
function fields(product,components=[]){
  const all=[product,...(Array.isArray(components)?components:[])].filter(Boolean);
  return all.map(p=>({
    code:clean(p.code||p.setId||''),name:clean(p.itemName||p.name||p.setName||''),
    category:clean([p.class,p.category,p.subclass,p.subcategory].join(' ')),
    details:clean([p.description,p.keyMaterial,p.material,p.brand,p.location].join(' '))
  }));
}
function score(product,query,components=[]){
  const terms=tokens(query);if(!terms.length)return 0;
  const items=fields(product,components);
  if(!items.length)return -1;
  let score=0;
  for(const term of terms){
    let best=-1;
    for(const f of items){
      let weight=-1;
      if(f.code===term)weight=100;
      else if(f.code.startsWith(term))weight=66;
      else if(f.code.includes(term))weight=54;
      else if(f.name.includes(term))weight=f.name.startsWith(term)?55:47;
      else if(f.category.includes(term))weight=38;
      else if(f.details.includes(term))weight=17;
      best=Math.max(best,weight);
    }
    if(best<0)return -1;
    score+=best;
  }
  const phrase=clean(query);
  if(items[0].name.includes(phrase))score+=85;
  if(items[0].code===phrase)score+=140;
  if(items[0].category.includes(phrase))score+=40;
  return score;
}
function results(items,query,componentResolver,limit=7){
  return (Array.isArray(items)?items:[]).map((item,i)=>({
    item,score:score(item,query,componentResolver?.(item)||[]),index:i
  })).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit);
}
root.ShowroomSearchCore=Object.freeze({clean,tokens,score,results});
})(window);
