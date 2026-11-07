const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('header shows V4.10.1 and the actual last release date, not the viewing date',()=>{
 const page=read('index.html');
 const script=read('app-version.js');
 assert.match(page,/<header[\s\S]*id="showroom-version-indicator"[\s\S]*<\/header>/);
 assert.match(page,/app-version\.js\?v=V4\.10\.1/);
 const dom=new JSDOM('<html><head><title>Limperial V4</title></head><body><div id="showroom-version-indicator"><span id="showroom-app-version"></span><span id="showroom-last-updated"></span></div></body></html>',{
  url:'https://showroom.test/',runScripts:'outside-only'
 });
 try{
  dom.window.eval(script);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  assert.equal(dom.window.LImperialAppVersion.version,'V4.10.1');
  assert.equal(dom.window.LImperialAppVersion.lastUpdated,'2026-11-07');
  assert.equal(dom.window.document.getElementById('showroom-app-version').textContent,'V4.10.1');
  assert.equal(dom.window.document.getElementById('showroom-last-updated').textContent,'Last updated 07 Nov 2026');
  assert.match(dom.window.document.title,/V4\.10\.1/);
  assert.match(dom.window.document.getElementById('showroom-version-indicator').title,/07 Nov 2026/);
 }finally{dom.window.close()}
});

test('the version remains fixed on refresh, and offline app assets match the declared release',()=>{
 const source=read('app-version.js');
 const sw=read('sw.js');
 const html=read('index.html');
 assert.match(source,/major:\s*4/);
 assert.match(source,/monthly:\s*10/);
 assert.match(source,/update:\s*1/);
 assert.match(source,/lastUpdated:\s*'2026-11-07'/);
 assert.match(sw,/\.\/app-version\.js\?v=V4\.10\.1/);
 assert.match(sw,/const CACHE_NAME = 'limperial-v4-app-4-10-1';/);
 assert.match(html,/app-version\.js\?v=V4\.10\.1/);
 assert.doesNotMatch(source,/setInterval|Date\.now\(\).*update/);
});

test('release command previews correct update and monthly versions without changing files',()=>{
 const watched=['app-version.js','index.html','sw.js'];
 const originals=watched.map(read);
 const run=kind=>execFileSync(process.execPath,['scripts/bump-app-version.cjs',kind,'--date','2026-11-08','--dry-run'],{cwd:root,encoding:'utf8'});
 assert.match(run('update'),/V4\.10\.1 → V4\.10\.2 \| Last updated 2026-11-08 \| dry run/);
 assert.match(run('monthly'),/V4\.10\.1 → V4\.11\.1 \| Last updated 2026-11-08 \| dry run/);
 assert.deepEqual(watched.map(read),originals,'dry-run must not write any file');
});
