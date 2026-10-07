const {test}=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../seasonal-core.js');
const fs=require('node:fs');
const vm=require('node:vm');
const base={id:'A',code:' A ',price:80,actualSalesPrice:100,costing:30,margin:50,promotion:'20% OFF',pricePromotion:''};
const campaign={id:'c',name:'Season',badge:'Summer',start_date:'2026-10-01',end_date:'2026-10-31',is_enabled:true,discount_percent:null,items:[{code:'a',promo_price:null}],created_at:'2026-09-01'};
const match=c=>({campaign:c,item:c.items[0]});
test('date boundaries use Cambodia day and include the last day',()=>{
 assert.equal(rules.today(new Date('2026-10-01T17:00:00Z')),'2026-10-02');
 assert.equal(rules.state(campaign,'2026-10-01'),'Active');
 assert.equal(rules.state(campaign,'2026-10-31'),'Active');
 assert.equal(rules.state(campaign,'2026-11-01'),'Ended');
 assert.equal(rules.state(campaign,'2026-09-30'),'Scheduled');
 assert.equal(rules.state({...campaign,is_enabled:false},'2026-10-01'),'Disabled');
});
test('feature-only badge never changes price or existing promotion, even if badge contains a percent',()=>{
 const p=rules.project(base,match({...campaign,badge:'90% OFF'}));
 assert.equal(p.price,80);assert.equal(p.promotion,'20% OFF');assert.equal(p._seasonalCampaign.actualPromoPrice,null);
 assert.equal(base._seasonalCampaign,undefined);assert.equal(base.costing,30);
});
test('fixed price overrides percent, including zero; decimal percent stays exact',()=>{
 for(const fixed of [0,53.27,100]){
  const c={...campaign,discount_percent:50,items:[{code:'a',promo_price:fixed}]};
  const p=rules.project(base,match(c));assert.equal(p.price,fixed);assert.equal(p.pricePromotion,String(fixed));
 }
 const p=rules.project(base,match({...campaign,discount_percent:12.5}));
 assert.equal(p.price,87.5);assert.equal(p.actualSalesPrice,100);assert.equal(p.costing,30);assert.equal(p.margin,57.5);assert.equal(base.margin,50);
 assert.equal(rules.project(base,match({...campaign,discount_percent:100})).price,0);
});
test('invalid prices never raise prices or fall through into another discount',()=>{
 for(const fixed of [-1,101,Infinity,'invalid']) {
  assert.equal(rules.project(base,match({...campaign,discount_percent:50,items:[{code:'a',promo_price:fixed}]})).price,80);
 }
 assert.equal(rules.project({...base,isSet:true},match(campaign)).price,80);
});
test('overlaps are deterministic, expired campaigns disappear, normalized SKU matches',()=>{
 const newer={...campaign,id:'new',start_date:'2026-10-02',discount_percent:10};
 assert.equal(rules.index([campaign,newer],'2026-10-10').get('A').campaign.id,'new');
 assert.equal(rules.index([campaign],'2026-11-01').size,0);
});
test('validation rejects invalid dates, discounts, selection and above-base prices',()=>{
 assert.equal(rules.validate(campaign,[base]),'');
 for(const change of [{start_date:'2026-02-30'}, {discount_percent:101}, {items:[]}, {items:[{code:'A',promo_price:101}]}, {items:[{code:'A',promo_price:NaN}]}]) assert.ok(rules.validate({...campaign,...change},[base]));
});
test('every inline and standalone browser script parses',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
 for(const file of ['seasonal-core.js','seasonal-promotions.js','promotion-config.js','sw.js']) new vm.Script(fs.readFileSync(require.resolve('../'+file),'utf8'));
});
