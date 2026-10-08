const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../seasonal-promotions.js'),'utf8');
function sourceBetween(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert.ok(a!==-1&&b>a,'Seasonal theme code remains available');
  return source.slice(a,b);
}
const handlers=sourceBetween('  function backgroundForCampaign(c){','  // Inspect a tiny in-memory sample')
  +'\n'+sourceBetween('  function applyTheme(){','  const redraw=()=>');
class Classes{
  constructor(){this.values=new Set()}
  add(x){this.values.add(x)}
  remove(x){this.values.delete(x)}
  contains(x){return this.values.has(x)}
}
class ImageStub{
  constructor(){this.classList=new Classes();this.url='';this.complete=false;this.naturalWidth=0;this.onload=null;this.onerror=null}
  get src(){return this.url}
  set src(v){this.url=v;this.complete=false;this.naturalWidth=0}
  removeAttribute(a){if(a==='src')this.src=''}
  finish(){this.complete=true;this.naturalWidth=1920;this.onload?.()}
}
function setup({campaigns=[],defaultBackground=null,presets={}}={}){
  const body={classList:new Classes(),dataset:{}},layer={classList:new Classes()};
  const images=[new ImageStub(),new ImageStub()];
  const ids={
    'seasonal-theme-background':layer,
    'seasonal-theme-background-image':images[0],
    'seasonal-theme-background-image-alt':images[1]
  };
  const doc={body,documentElement:{style:{setProperty(){},removeProperty(){}}},baseURI:'https://showroom.example/'};
  const code=[
    "let campaigns=state.campaigns,defaultBackground=state.defaultBackground,activeThemeKey='',backdropProbeKey='',backdropProbeSerial=0,backgroundSwitchToken=0;",
    'const themePresets=()=>state.presets;',
    'const current=()=>campaigns;',
    "const storagePublicUrl=p=>p?'https://cdn.example/'+p:'';",
    'const sampleBackdropTone=()=>{};',
    handlers,
    'return {applyTheme,backgroundForDefault,setState:x=>{campaigns=x.campaigns;defaultBackground=x.defaultBackground;}};'
  ].join('\n');
  const w={innerWidth:1440},factory=new Function('state','document','window','ui','URL',code);
  const api=factory({campaigns,defaultBackground,presets},doc,w,id=>ids[id]||null,URL);
  const active=()=>images.find(img=>img.classList.contains('is-current'));
  const requested=url=>images.find(img=>img.src==='https://cdn.example/'+url);
  return {body,images,api,active,requested,finish:url=>requested(url)?.finish()};
}
test('existing light-only artwork remains visible in both modes',()=>{
  const h=setup({defaultBackground:{custom_background_path:'original.webp'}});
  h.api.applyTheme();h.finish('original.webp');
  assert.equal(h.active().src,'https://cdn.example/original.webp');
  h.body.classList.add('theme-dark');h.api.applyTheme();
  assert.equal(h.active().src,'https://cdn.example/original.webp');
});
test('light and dark backgrounds crossfade on demand',()=>{
  const h=setup({defaultBackground:{custom_background_path:'light.webp',custom_background_dark_path:'dark.webp'}});
  h.api.applyTheme();
  assert.ok(h.requested('light.webp'));
  h.finish('light.webp');
  assert.equal(h.active().src,'https://cdn.example/light.webp');
  h.body.classList.add('theme-dark');h.api.applyTheme();
  assert.ok(h.requested('dark.webp'));
  h.finish('dark.webp');
  assert.equal(h.active().src,'https://cdn.example/dark.webp');
});
test('rapid theme toggles cannot show the older in-flight image',()=>{
  const h=setup({defaultBackground:{custom_background_path:'light.webp',custom_background_dark_path:'dark.webp'}});
  h.api.applyTheme();h.finish('light.webp');
  h.body.classList.add('theme-dark');h.api.applyTheme();
  h.body.classList.remove('theme-dark');h.api.applyTheme();
  h.finish('dark.webp');
  assert.equal(h.active().src,'https://cdn.example/light.webp');
});
test('seasonal art overrides both default background variants',()=>{
  const h=setup({
    defaultBackground:{custom_background_path:'default-light.webp',custom_background_dark_path:'default-dark.webp'},
    campaigns:[{name:'Pchum Ben',custom_background_path:'season-light.webp',custom_background_dark_path:'season-dark.webp'}]
  });
  h.body.classList.add('theme-dark');h.api.applyTheme();h.finish('season-dark.webp');
  assert.equal(h.active().src,'https://cdn.example/season-dark.webp');
  assert.equal(h.body.dataset.seasonalCampaign,'Pchum Ben');
});
