const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({...(process.env.PHOTO_BROWSER_PATH?{executablePath:process.env.PHOTO_BROWSER_PATH}:{}),headless:true});
 try{
  const index=JSON.parse(fs.readFileSync('assets/photo-index.json','utf8'));
  for(const revision of [...(process.env.PHOTO_BASE_REF?['before']:[]),'fixed']){
   const page=await browser.newPage({viewport:{width:384,height:824},isMobile:true,hasTouch:true});
   await page.route('https://**/*',route=>route.abort());
   await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="showroom-photo-results" style="height:330px;overflow:auto"></div>');
   const source=revision==='before'?cp.execFileSync('git',['show',process.env.PHOTO_BASE_REF+':showroom-photo-scan.js'],{encoding:'utf8'}):fs.readFileSync('showroom-photo-scan.js','utf8');
   await page.addScriptTag({content:source.replace('window.ShowroomPhotoScan={attach};','window.ShowroomPhotoScan={attach,captureVariants,compare};')});
   const result=await page.evaluate(async index=>{
    const api=window.ShowroomPhotoScan,fixture=document.createElement('canvas');fixture.width=4000;fixture.height=3000;
    const ctx=fixture.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,4000,3000);ctx.fillStyle='#765320';ctx.fillRect(1000,500,2000,2000);ctx.fillStyle='#ad8840';ctx.fillRect(1500,700,300,1500);
    const file=new File([await new Promise(r=>fixture.toBlob(r,'image/png'))],'camera.png',{type:'image/png'});
    const sig=api.captureVariants(fixture)[0];
    index.items.push({code:'TIED-A',url:'',sig},{code:'TIED-B',url:'',sig});
    window.products=index.items.map((r,i)=>({id:i,code:r.code,itemName:r.code,imgLink:''}));
    window.fetch=async()=>({ok:true,json:async()=>index});
    const create=document.createElement.bind(document),canvases=[];
    document.createElement=(...args)=>{const el=create(...args);if(args[0]==='canvas')canvases.push(el);return el;};
    await api.compare(file);
    document.createElement=create;
    const output=document.getElementById('showroom-photo-results'),preview=output.querySelector('img');
    await preview.decode().catch(()=>{});
    const before=output.querySelectorAll('[data-photo-index]').length;
    const warning=output.textContent.includes('No confident identification');
    const previewWidth=preview.naturalWidth;
    const pixels=canvases.reduce((n,c)=>n+c.width*c.height,0);
    output.querySelector('#showroom-photo-load-more')?.click();
    const after=output.querySelectorAll('[data-photo-index]').length;
    const warningRetained=output.textContent.includes('No confident identification');
    return {pixels,approxCanvasBytes:pixels*4,previewWidth,before,after,warning,warningRetained};
   },index);
   console.log(JSON.stringify({revision,...result}));
   if(revision==='fixed'){
    assert.ok(result.pixels<=30000,'12MP photo must not allocate full-resolution crop canvases');
    assert.equal(result.previewWidth,160);assert.equal(result.before,10);assert.equal(result.after,20);
    assert.equal(result.warning,true);assert.equal(result.warningRetained,true);
   }
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
