const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('photo index uses network first and cached data only when offline',async()=>{
 const handlers={},cached={version:'cached'},fresh={status:200,clone(){return this;}};
 let offline=false,lookups=0;
 const scope={URL,console,self:{location:{origin:'https://showroom.test'},addEventListener:(name,fn)=>handlers[name]=fn},
  fetch:async()=>{if(offline)throw Error('offline');return fresh;},
  caches:{open:async()=>({put:async()=>{}}),match:async()=>{lookups++;return cached;}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../sw.js'),'utf8'),scope);
 const request={method:'GET',url:'https://showroom.test/assets/photo-index.json?v=20261028-canvas-fix1',mode:'cors',destination:''};
 let response;
 handlers.fetch({request,respondWith:p=>response=p});
 assert.equal(await response,fresh);assert.equal(lookups,0);
 offline=true;handlers.fetch({request,respondWith:p=>response=p});
 assert.equal(await response,cached);assert.equal(lookups,1);
});
