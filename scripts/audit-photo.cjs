const fs=require('node:fs');
const {chromium}=require('playwright');
const sharp=require('sharp');
const assert=require('node:assert/strict');
const cp=require('node:child_process');
(async()=>{
 const index=JSON.parse(fs.readFileSync('assets/photo-index.json'));
 const counts=new Map();for(const r of index.items){const key=JSON.stringify(r.sig);counts.set(key,(counts.get(key)||0)+1);}
 console.log(JSON.stringify({items:index.items.length,unique:counts.size,largestDuplicate:Math.max(...counts.values()),invalid:index.items.filter(r=>r.sig.length!==256||!r.sig.every(Number.isFinite)).length}));
 const browser=await chromium.launch({...(process.env.PHOTO_BROWSER_PATH?{executablePath:process.env.PHOTO_BROWSER_PATH}:{}),headless:true});
 try{
 const page=await browser.newPage();
 const expose=s=>s.replace('window.ShowroomPhotoScan={attach};','window.ShowroomPhotoScan={attach,visualSignature,captureVariants,bestScore,compareIndex,visualScore,render,compare};');
 const source=expose(fs.readFileSync('showroom-photo-scan.js','utf8'));
 const before=process.env.PHOTO_BASE_REF?expose(cp.execFileSync('git',['show',process.env.PHOTO_BASE_REF+':showroom-photo-scan.js'],{encoding:'utf8'})):null;
 await page.addScriptTag({content:source});
 const guards=await page.evaluate(()=>{
  const api=window.ShowroomPhotoScan;
  let dimensions=false,values=false;
  try{api.visualSignature({naturalWidth:0,naturalHeight:0});}catch{dimensions=true;}
  try{api.bestScore([Array(256).fill(NaN)],Array(256).fill(0));}catch{values=true;}
  return {dimensions,values};
 });
 assert.deepEqual(guards,{dimensions:true,values:true});
 fs.mkdirSync('../photo-fixtures',{recursive:true});
 for(const code of ['WAL-AL-853/A2','CHL-31511/618/193/137','CHL0513-3','FUR0344']){
  const row=index.items.find(r=>r.code===code);assert.ok(row,'Catalog fixture missing: '+code);
  const path='../photo-fixtures/'+code.replace(/[^a-z0-9]/gi,'_')+'.jpg';
  if(!fs.existsSync(path)){const res=await fetch(row.url);if(!res.ok)throw Error(res.status);fs.writeFileSync(path,Buffer.from(await res.arrayBuffer()));}
  const bytes=fs.readFileSync(path);
  const raw=await sharp(bytes).rotate().resize(32,32,{fit:'contain',background:'#ffffff'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const metadata=await sharp(bytes).metadata();
  const padX=Math.round(metadata.width*.46),padY=Math.round(metadata.height*.46);
  const framed=await sharp(bytes).extend({left:padX,right:padX,top:padY,bottom:padY,background:'#282828'}).jpeg().toBuffer();
  for(const [label,query] of [['original',bytes],['framed',framed]]){
   for(const [revision,script] of [['before',before],['fixed',source]]){
    if(!script)continue;
    await page.addScriptTag({content:script});
    const result=await page.evaluate(async({data,index,code})=>{
   const im=new Image();im.src=data;await im.decode();
   const api=window.ShowroomPhotoScan,views=api.captureVariants(im);
   const white=Array.from({length:256},(_,i)=>i%4===3?0:1);
   const ranks=api.compareIndex(views,index,index.map(r=>({code:r.code,imgLink:r.url})));
   const stored=index.find(r=>r.code===code).sig;
   return {code,cropWhite:views.map(v=>v.every((x,i)=>x===white[i])),maxIndexDifference:Math.max(...stored.map((v,i)=>Math.abs(v-views[0][i]))),top:ranks.slice(0,3).map(r=>[r.product.code,r.score])};
  },{data:'data:image/jpeg;base64,'+query.toString('base64'),index:index.items,code:row.code});
    console.log(JSON.stringify({revision,label,channels:raw.info.channels,...result}));
    if(revision==='fixed'){
     assert.ok(result.cropWhite.every(x=>!x),'Crop must contain actual pixels');
     assert.equal(result.top[0][0],row.code,'Query should rank its own catalog product first');
    }
   }
  }
 }
 await page.addScriptTag({content:source});
 const ui=await page.evaluate(async()=>{
  document.body.innerHTML='<div id="showroom-photo-results"></div>';
  const api=window.ShowroomPhotoScan,output=document.getElementById('showroom-photo-results');
  api.render(Array.from({length:25},(_,i)=>({product:{code:'P'+i},url:'',score:1})),0,25,true);
  const first=output.querySelectorAll('[data-photo-index]').length;
  document.getElementById('showroom-photo-load-more').click();
  const more=output.querySelectorAll('[data-photo-index]').length;
  window.fetch=async()=>{throw Error('offline');};
  const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;
  canvas.getContext('2d').fillRect(0,0,50,50);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve));
  await api.compare(new File([blob],'test.png',{type:'image/png'}));
  return {first,more,unavailable:output.textContent.includes('unavailable'),remaining:output.querySelectorAll('[data-photo-index]').length};
 });
 assert.deepEqual(ui,{first:10,more:20,unavailable:true,remaining:0});
 console.log(JSON.stringify({ui,guards}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
