const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.PHOTO_BROWSER_PATH,headless:true});
 try{
  const page=await b.newPage({viewport:{width:393,height:825},isMobile:true,hasTouch:true});
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="showroom-photo-results" style="width:350px"></div>');
  const source=fs.readFileSync('showroom-photo-scan.js','utf8').replace('window.ShowroomPhotoScan={attach};','window.ShowroomPhotoScan={attach,preparePhoto};').replace('async function compare(file){','async function compare(file){window.croppedFile=file;return;');
  await page.addScriptTag({content:source});
  await page.evaluate(async()=>{
   const c=document.createElement('canvas');c.width=600;c.height=1200;
   const ctx=c.getContext('2d');ctx.fillStyle='blue';ctx.fillRect(0,0,600,1200);ctx.fillStyle='red';ctx.fillRect(150,300,300,600);
   await ShowroomPhotoScan.preparePhoto(new File([await new Promise(r=>c.toBlob(r))],'photo.png',{type:'image/png'}));
  });
  const box=await page.locator('[data-crop-stage] canvas').boundingBox();
  const client=await page.context().newCDPSession(page);
  const touch=async(type,x,y)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
  await touch('touchStart',box.x+box.width*.26,box.y+box.height*.26);
  await touch('touchMove',box.x+box.width*.74,box.y+box.height*.74);
  await touch('touchEnd');
  await page.locator('[data-crop-search]').click();
  const selected=await page.evaluate(async()=>{const im=await createImageBitmap(croppedFile);const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return {width:im.width,height:im.height,pixel:[...ctx.getImageData(1,1,1,1).data]};});
  assert.deepEqual(selected.pixel,[255,0,0,255],'Selection must use clean source pixels, without crop overlays');
  assert.ok(selected.width>=244&&selected.width<=247&&selected.height>=490&&selected.height<=493);
  await page.locator('[data-crop-reset]').click();
  // The test intercepts compare, so reset remains available in the editor.
  await page.locator('[data-crop-search]').evaluate(el=>el.disabled=false);
  await page.locator('[data-crop-search]').click();
  const full=await page.evaluate(async()=>{const im=await createImageBitmap(croppedFile);return [im.width,im.height];});
  assert.deepEqual(full,[512,1024]);
  console.log(JSON.stringify({touchCrop:selected,wholePhoto:full}));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
