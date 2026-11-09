const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function releaseMetadata(){
 const s=read('app-version.js');
 const readField=(name,regex)=>{
  const match=s.match(regex);
  assert.ok(match,'Missing release field '+name);
  return match[1];
 };
 const major=Number(readField('major',/\bmajor:\s*(\d+)/));
 const monthly=Number(readField('monthly',/\bmonthly:\s*(\d+)/));
 const update=Number(readField('update',/\bupdate:\s*(\d+)/));
 const lastUpdated=readField('lastUpdated',/\blastUpdated:\s*'(\d{4}-\d{2}-\d{2})'/);
 return {major,monthly,update,lastUpdated,version:'V'+major+'.'+monthly+'.'+String(update).padStart(2,'0')};
}

test('sticky header displays version and last release date, not the date someone visits',()=>{
 const page=read('index.html');
 const script=read('app-version.js');
 const meta=releaseMetadata();
 assert.match(page,/<header[\s\S]*id="showroom-version-indicator"[\s\S]*<\/header>/);
 assert.ok(page.includes('app-version.js?v='+meta.version));
 const dom=new JSDOM('<html><head><title>Limperial V4</title></head><body><div id="showroom-version-indicator"><span id="showroom-app-version"></span><span id="showroom-last-updated"></span></div></body></html>',{
  url:'https://showroom.test/',runScripts:'outside-only'
 });
 try{
  dom.window.eval(script);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  const v=dom.window.LImperialAppVersion;
  const expectedDate=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(meta.lastUpdated+'T12:00:00Z'));
  assert.equal(v.version,meta.version);
  assert.equal(v.lastUpdated,meta.lastUpdated);
  assert.equal(dom.window.document.getElementById('showroom-app-version').textContent,meta.version);
  assert.equal(dom.window.document.getElementById('showroom-last-updated').textContent,'Last updated '+expectedDate);
  assert.ok(dom.window.document.title.includes(meta.version));
  assert.ok(dom.window.document.getElementById('showroom-version-indicator').title.includes(expectedDate));
 }finally{dom.window.close()}
});

test('V4 remains fixed and offline asset versions match the central release',()=>{
 const meta=releaseMetadata();
 const source=read('app-version.js');
 const sw=read('sw.js');
 const html=read('index.html');
 assert.equal(meta.major,4);
 assert.ok(meta.monthly>=10&&meta.update>=1);
 assert.match(meta.lastUpdated,/^\d{4}-\d{2}-\d{2}$/);
 assert.ok(sw.includes('./app-version.js?v='+meta.version));
 assert.ok(sw.includes("const CACHE_NAME = 'limperial-v4-app-4-"+meta.monthly+'-'+String(meta.update).padStart(2,'0')+"';"));
 assert.ok(html.includes('app-version.js?v='+meta.version));
 assert.doesNotMatch(source,/setInterval|Date\.now\(\).*update/);
});

test('update and monthly release previews increment correctly without modifying files',()=>{
 const meta=releaseMetadata();
 const watched=['app-version.js','index.html','sw.js'];
 const originals=watched.map(read);
 const date=meta.lastUpdated>='2026-11-08'?meta.lastUpdated:'2026-11-08';
 const run=kind=>execFileSync(process.execPath,['scripts/bump-app-version.cjs',kind,'--date',date,'--dry-run'],{cwd:root,encoding:'utf8'});
 const nextUpdate='V4.'+meta.monthly+'.'+String(meta.update+1).padStart(2,'0');
 const nextMonthly='V4.'+(meta.monthly+1)+'.01';
 assert.ok(run('update').includes(meta.version+' → '+nextUpdate+' | Last updated '+date+' | dry run'));
 assert.ok(run('monthly').includes(meta.version+' → '+nextMonthly+' | Last updated '+date+' | dry run'));
 assert.deepEqual(watched.map(read),originals,'dry run never writes app files');
});
