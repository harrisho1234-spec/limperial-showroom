const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({...(process.env.PHOTO_BROWSER_PATH?{executablePath:process.env.PHOTO_BROWSER_PATH}:{}),headless:true});
 try{
  for(const revision of [...(process.env.PHOTO_BASE_REF?['before']:[]),'fixed']){
   const page=await browser.newPage({viewport:{width:393,height:825},isMobile:true,hasTouch:true});
   await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial}button,input{font:inherit}h3,p{margin:0}</style><body style="position:relative!important"><div style="height:3000px;background:linear-gradient(white,tan)">Catalog</div></body>');
   await page.evaluate(()=>{window.fetch=async()=>({ok:true,text:async()=>''});window.ZXing={BrowserMultiFormatReader:class{async listVideoInputDevices(){return [];}async decodeFromVideoDevice(){}reset(){}}};window.scrollTo(0,700);});
   const state=()=>page.evaluate(()=>({scroll:scrollY,style:document.body.style.cssText,rootStyle:document.documentElement.style.cssText}));
   const original=await state();
   for(const file of ['showroom-photo-scan.js','showroom-scanner.js'])await page.addScriptTag({content:revision==='before'?cp.execFileSync('git',['show',process.env.PHOTO_BASE_REF+':'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8')});
   await page.evaluate(()=>window.openShowroomScanner());
   await page.locator('#showroom-scan-photo').click();
   const rect=()=>page.locator('.scanner-shell').evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
   const resize=async(width,height)=>{await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
   const opening=await rect(),ys=[];
   for(const height of [500,610,825,870,825]){
    await resize(393,height);const current=await rect();ys.push(current[1]);
    if(revision==='fixed')assert.deepEqual(current,opening,'Camera-return viewport changes must not move or resize the dialog');
   }
   if(revision==='fixed'){
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body).position),'fixed');
    await resize(825,393);const rotated=await rect();
    assert.ok(rotated[1]>=0&&rotated[1]+rotated[3]<=393,'Rotation must fit the new viewport');
    await page.locator('#showroom-scanner-close').click();
    assert.deepEqual(await state(),original,'Closing restores page position and existing styles');
    await resize(393,825);await page.evaluate(()=>window.openShowroomScanner());
    await page.locator('#showroom-scanner-code').focus();await resize(393,400);
    const keyboard=await rect();assert.ok(keyboard[1]>=0&&keyboard[1]+keyboard[3]<=400,'Manual entry fits keyboard viewport');
    await page.locator('#showroom-scanner-close').click();
    assert.equal((await state()).style,original.style);
   }
   console.log(JSON.stringify({revision,cameraReturnMovement:Math.max(...ys)-Math.min(...ys),checks:revision==='fixed'?'stationary photo panel, scroll lock/restoration, rotation, keyboard, reopen':'baseline'}));
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
