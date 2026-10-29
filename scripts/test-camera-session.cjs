const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PHOTO_BROWSER_PATH,headless:true});
 try{
  for(const stage of ['devices','decode','error']){
   const page=await browser.newPage();
   await page.setContent('<body><input id="search-input"></body>');
   await page.evaluate(stage=>{
    window.stage=stage;window.requests=[];window.fetch=async()=>({ok:true,text:async()=>''});
    window.ZXing={BrowserMultiFormatReader:class{
     constructor(){this.resets=0;this.starts=0;requests.push(this);}
     listVideoInputDevices(){return stage==='devices'?new Promise(r=>this.devices=r):Promise.resolve([]);}
     decodeFromVideoDevice(id,video,callback){this.starts++;this.video=video;this.callback=callback;return new Promise((resolve,reject)=>{this.finish=()=>{this.streaming=true;resolve();};this.fail=reject;});}
     reset(){this.resets++;this.streaming=false;}
    }};
   },stage);
   await page.addScriptTag({content:fs.readFileSync('showroom-photo-scan.js','utf8')});
   await page.addScriptTag({content:process.env.PHOTO_BASE_REF?cp.execFileSync('git',['show',process.env.PHOTO_BASE_REF+':showroom-scanner.js'],{encoding:'utf8'}):fs.readFileSync('showroom-scanner.js','utf8')});
   await page.evaluate(()=>{window.firstOpen=openShowroomScanner();});
   await page.waitForFunction(()=>requests.length===1&&(stage==='devices'||requests[0].starts===1));
   if(stage==='devices'){
    await page.evaluate(()=>{window.secondOpen=openShowroomScanner();});
    await page.waitForFunction(()=>requests.length===2);
    await page.evaluate(()=>requests[0].devices([]));
    await page.evaluate(()=>Promise.resolve());
    assert.equal(await page.evaluate(()=>requests[1].starts),0,'Old enumeration must not start the new reader');
   }else if(stage==='decode'){
    await page.locator('#showroom-scan-photo').click();
    await page.evaluate(()=>requests[0].finish());await page.evaluate(()=>firstOpen);
    assert.equal(await page.evaluate(()=>requests[0].streaming),false,'Late camera startup must be released in photo mode');
   }else{
    await page.evaluate(()=>{window.secondOpen=openShowroomScanner();});
    await page.waitForFunction(()=>requests.length===2&&requests[1].starts===1);
    await page.evaluate(()=>requests[0].fail(Error('old camera failed')));await page.evaluate(()=>firstOpen);
    assert.equal(await page.evaluate(()=>requests[1].resets),0,'Old failure must not stop the current reader');
    assert.ok(!(await page.locator('#showroom-scanner-status').textContent()).includes('old camera failed'));
   }
   console.log('PASS delayed '+stage);await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
