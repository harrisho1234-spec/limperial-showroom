// Build a public, image-only visual search index from the Showroom published catalog.
// Usage: npm install --no-save sharp papaparse && node scripts/build-photo-index.mjs
import fs from 'node:fs/promises';
import sharp from 'sharp';
import Papa from 'papaparse';
const csvUrl='https://docs.google.com/spreadsheets/d/e/2PACX-1vQQ9iODZxEeRN48tF7tF6pTZvKTN5l0fA3_d34cQFqo1ckz1G5ojitqeoCtPunAAkkLLLsx0ivt7Zl1/pub?gid=828283876&single=true&output=csv';
const text=await (await fetch(csvUrl)).text();
const rows=Papa.parse(text,{header:true,skipEmptyLines:true}).data;
const keys=Object.keys(rows[0]||{});
console.log('Catalog columns:',keys.join(', '));
function field(row,exp){const key=keys.find(k=>exp.test(k.toLowerCase().replace(/[^a-z0-9]/g,'')));return key?String(row[key]??'').trim():'';}
function source(raw){
 const v=String(raw||'').trim();
 const drive=v.match(/(?:\/d\/|[?&]id=)([-\w]{15,})/);
 if(drive)return 'https://drive.google.com/thumbnail?id='+drive[1]+'&sz=w320';
 return /^https?:\/\//.test(v)?v:'';
}
function signature(bytes){
 const rgb=new Float64Array(256),gray=new Float64Array(1024);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const k=(y*32+x)*3;
  gray[y*32+x]=(bytes[k]*.299+bytes[k+1]*.587+bytes[k+2]*.114)/255;
 }
 for(let by=0;by<8;by++)for(let bx=0;bx<8;bx++){
  let rs=0,gs=0,bs=0,edge=0;
  for(let y=by*4;y<by*4+4;y++)for(let x=bx*4;x<bx*4+4;x++){
   const k=(y*32+x)*3;rs+=bytes[k];gs+=bytes[k+1];bs+=bytes[k+2];
   const c=gray[y*32+x],l=gray[y*32+Math.max(0,x-1)],u=gray[Math.max(0,y-1)*32+x];
   edge+=Math.min(1,Math.abs(c-l)+Math.abs(c-u));
  }
  const p=(by*8+bx)*4;rgb[p]=rs/4080;rgb[p+1]=gs/4080;rgb[p+2]=bs/4080;rgb[p+3]=edge/16;
 }
 return Array.from(rgb,x=>Math.round(x*1000)/1000);
}
async function make(row){
 const code=field(row,/^(productcode|itemcode|code|sku)$/);
 const url=source(field(row,/(imglink|imagelink|imageurl|photo|picture)/));
 if(!code||!url)return null;
 try{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8500);
  let buffer;try{const res=await fetch(url,{signal:controller.signal});if(!res.ok)throw Error('HTTP '+res.status);buffer=Buffer.from(await res.arrayBuffer());}finally{clearTimeout(timeout);}
  if(buffer.length>9000000)throw Error('oversize');
  const {data}=await sharp(buffer).rotate().resize(32,32,{fit:'contain',background:'#ffffff'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  return {code,url,sig:signature(data)};
 }catch(e){console.warn('Skipped',code,String(e.message).slice(0,90));return null;}
}
const input=rows.slice(0,10000),items=[];let next=0;
await Promise.all(Array.from({length:8},async()=>{while(next<input.length){const index=next++,item=await make(input[index]);if(item)items.push(item);}}));
await fs.mkdir('assets',{recursive:true});
await fs.writeFile('assets/photo-index.json',JSON.stringify({version:1,source:'published-catalog',generatedAt:new Date().toISOString(),totalRows:rows.length,items}));
console.log('Visual index:',items.length,'of',rows.length,'rows');
if(!items.length)process.exitCode=1;
