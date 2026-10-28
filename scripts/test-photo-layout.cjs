const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({...(process.env.PHOTO_BROWSER_PATH?{executablePath:process.env.PHOTO_BROWSER_PATH}:{}),headless:true});
 try{
  const current=fs.readFileSync('showroom-photo-scan.js','utf8');
  const baseline=process.env.PHOTO_BASE_REF?cp.execFileSync('git',['show',process.env.PHOTO_BASE_REF+':showroom-photo-scan.js'],{encoding:'utf8'}):null;
  for(const viewport of [{width:320,height:640},{width:393,height:825},{width:825,height:393},{width:1280,height:800}]){
   for(const dark of [false,true])for(const [revision,source] of [['before',baseline],['fixed',current]]){
    if(!source)continue;
    const page=await browser.newPage({viewport});
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>*,::before,::after{box-sizing:border-box}body{margin:0;font-family:Arial}button,input{font:inherit}h3,p{margin:0}button{border:0}</style>');
    await page.evaluate(dark=>{document.body.classList.toggle('theme-dark',dark);window.fetch=async()=>({ok:true,text:async()=>''});window.ZXing={BrowserMultiFormatReader:class{async listVideoInputDevices(){return [];}async decodeFromVideoDevice(){}reset(){}}};},dark);
    await page.addScriptTag({content:source});
    await page.addScriptTag({content:fs.readFileSync('showroom-scanner.js','utf8')});
    await page.evaluate(()=>window.openShowroomScanner());
    await page.locator('#showroom-scan-photo').click();
    const sizes=await page.evaluate(()=>{
     const output=document.getElementById('showroom-photo-results');
     const rect=()=>{const r=document.querySelector('.scanner-shell').getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
     const result=[rect()];
     output.textContent='Matching new photo…';result.push(rect());
     output.innerHTML='<img alt="Preview" style="width:76px;height:76px;display:block;margin:8px 0"><p>No reliable product match found. Try photographing the product by itself or use barcode/product-code search.</p><p>Scan reference · Best similarity: 85%</p>';result.push(rect());
     output.innerHTML=Array.from({length:20},(_,i)=>'<div style="height:75px">Product '+i+'</div>').join('');result.push(rect());
     output.scrollTop=200;
     result.push(rect());
     return {rects:result,scrollable:output.scrollHeight>output.clientHeight};
    });
    const movement=Math.max(...sizes.rects.map(r=>r[1]))-Math.min(...sizes.rects.map(r=>r[1]));
    console.log(JSON.stringify({revision,viewport,dark,movement,scrollable:sizes.scrollable}));
    if(revision==='fixed'){
     for(const rect of sizes.rects)assert.deepEqual(rect,sizes.rects[0],'Dialog must remain stationary across photo states');
     assert.equal(sizes.scrollable,true,'Long results must still scroll');
     assert.ok(sizes.rects[0][1]>=0,'Dialog stays within viewport');
    }
    await page.close();
   }
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
