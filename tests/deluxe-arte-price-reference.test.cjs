'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const snapshot = JSON.parse(fs.readFileSync('assets/price-reference/deluxe-arte.json', 'utf8'));
const moduleCode = fs.readFileSync('deluxe-arte-price-reference.js', 'utf8');
const photoMap = JSON.parse(fs.readFileSync('assets/price-reference/deluxe-arte-photo-map.json', 'utf8'));
const css = fs.readFileSync('deluxe-arte-price-reference.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const runtime = { window: { document: null } };
vm.runInNewContext(moduleCode, runtime, { filename: 'deluxe-arte-price-reference.js' });
const service = runtime.window.DeluxeArtePriceReference;

test('static snapshot contains only selling-price reference fields, never stock or costing', () => {
  assert.equal(snapshot.kind, 'reference_only');
  assert.equal(snapshot.brand, 'Deluxe Arte');
  assert.equal(snapshot.currency, 'USD');
  assert.equal(snapshot.items.length, 196);
  const permitted = new Set(['id','name','dimensions','collection','priceUsd','designVariant']);
  for (const item of snapshot.items) {
    assert.deepEqual(Object.keys(item).filter(k => !permitted.has(k)), []);
    assert.match(item.id, /^DA-REF-\d{3,}$/);
    assert.ok(item.priceUsd > 0);
    assert.ok(item.name.length);
  }
  assert.equal(new Set(snapshot.items.map(x => x.id)).size, snapshot.items.length);
  assert.doesNotMatch(JSON.stringify(snapshot), /"costing"|"euroCost"|"stock"|"inventory"|"shipping"|"margin"|"reservedQty"|"quotationPrice"/i);
  assert.equal(service.validateSnapshot(snapshot).length, snapshot.items.length);
});
test('same-size separate design rows stay distinct and keep their own prices', () => {
  const a = snapshot.items.find(x => x.id === 'DA-REF-020');
  const b = snapshot.items.find(x => x.id === 'DA-REF-025');
  assert.equal(a.name, b.name);
  assert.equal(a.dimensions, b.dimensions);
  assert.notEqual(a.id,b.id);
  assert.notEqual(a.priceUsd,b.priceUsd);
  assert.equal(a.designVariant,'Design 1 of 2');
  assert.equal(b.designVariant,'Design 2 of 2');
  const matches = service.filterItems(snapshot.items,'princess dining table','Princess Collection','collection');
  assert.ok(matches.some(x => x.id === a.id));
  assert.ok(matches.some(x => x.id === b.id));
});
test('search, filters, sorting do not modify reference records', () => {
  const before = JSON.stringify(snapshot);
  const selected = service.filterItems(snapshot.items,'Roslinda Seater','Roslinda Set','priceDesc');
  assert.ok(selected.length>=2);
  assert.ok(selected.every(x => x.collection === 'Roslinda Set'));
  assert.ok(selected.every((x,i) => i === 0 || selected[i-1].priceUsd >= x.priceUsd));
  assert.equal(JSON.stringify(snapshot),before);
});
test('reference is a separate module; honor price-visibility privacy switch', () => {
  assert.match(index,/deluxe-arte-price-reference\.js\?v=V4\.11\.07/);
  assert.match(index,/deluxe-arte-price-reference\.css\?v=V4\.11\.07/);
  assert.match(sw,/assets\/price-reference\/deluxe-arte\.json/);
  assert.match(sw,/assets\/price-reference\/deluxe-arte-photo-map\.json/);
  assert.match(sw,/assets\/price-reference\/deluxe-arte-row-photos\.json/);
  assert.match(css,/\.theme-dark \.da-ref-field select option/);
  assert.match(css,/\.da-ref-grid\.as-list/);
  assert.match(css,/\.showroom-hide-sales-prices \.da-price-ref-price\{display:none!important\}/);
  assert.doesNotMatch(moduleCode,/\b(?:products|cart|stockMovements|supplierPOs)\s*\.\s*(?:push|splice|unshift)\s*\(/);
  assert.doesNotMatch(index,/Deluxe Arte Price Reference 2025/);
});

test('gallery maps all collections to public Drive reference photos without touching stock', () => {
  const map = service.validatePhotoMap(photoMap);
  const photoResults = snapshot.items.map(item => service.resolvePhoto(item,map));
  assert.equal(photoResults.filter(Boolean).length,196);
  assert.equal(new Set(snapshot.items.map(x=>x.collection)).size,16);
  assert.ok(photoResults.every(p=>/^https:\/\/drive\.google\.com\/thumbnail\?id=[A-Za-z0-9_-]+&sz=w1200$/.test(p.url)));
  assert.ok(photoResults.some(p=>p.kind==='product'));
  assert.ok(photoResults.some(p=>p.kind==='collection'));
  assert.ok(snapshot.items.filter(x=>x.designVariant).every(x=>service.resolvePhoto(x,map).kind==='collection'));
});
test('new photo UI has readable search and real gallery/list toggle', () => {
  assert.match(moduleCode,/da-ref-view-gallery/);
  assert.match(moduleCode,/da-ref-view-list/);
  assert.match(moduleCode,/da-ref-collections/);
  assert.match(moduleCode,/da-ref-exact-only/);
  assert.match(css,/background:#fffdf9!important;color:#25221f!important/);
  assert.match(css,/\.da-ref-photo-img/);
});

test('verified Column B photos override gallery examples by exact source row, not by size', () => {
  const map = service.validatePhotoMap(photoMap);
  const first = snapshot.items.find(x => x.id === 'DA-REF-020');
  const second = snapshot.items.find(x => x.id === 'DA-REF-025');
  const rowMap = service.validateRowPhotos({
    kind:'deluxe_arte_row_photos', version:1, imageCount:2,
    images:{
      'DA-REF-020':'assets/price-reference/deluxe-arte-row-images/DA-REF-020.webp',
      'DA-REF-025':'assets/price-reference/deluxe-arte-row-images/DA-REF-025.webp'
    }
  });
  const photoA = service.resolvePhoto(first,map,rowMap);
  const photoB = service.resolvePhoto(second,map,rowMap);
  assert.equal(photoA.kind,'row');
  assert.equal(photoB.kind,'row');
  assert.notEqual(photoA.url,photoB.url);
  assert.match(photoA.url,/DA-REF-020\.webp$/);
  assert.match(photoB.url,/DA-REF-025\.webp$/);
  // Once the exact-row manifest is present, unmatched rows never get a wrong collection picture.
  assert.equal(service.resolvePhoto(snapshot.items.find(x=>x.id==='DA-REF-019'),map,rowMap),null);
});
test('Column B photo manifest rejects external URLs, traversal and mismatched reference codes', () => {
  assert.throws(()=>service.validateRowPhotos({
    kind:'deluxe_arte_row_photos',imageCount:1,
    images:{'DA-REF-004':'https://example.com/photo.png'}
  }));
  assert.throws(()=>service.validateRowPhotos({
    kind:'deluxe_arte_row_photos',imageCount:1,
    images:{'DA-REF-004':'assets/price-reference/deluxe-arte-row-images/../foo.webp'}
  }));
  assert.throws(()=>service.validateRowPhotos({
    kind:'deluxe_arte_row_photos',imageCount:2,
    images:{'DA-REF-004':'assets/price-reference/deluxe-arte-row-images/DA-REF-004.webp'}
  }));
});

test('verified product photos show no Column B badge in list or preview', () => {
  assert.doesNotMatch(moduleCode, /Photo from Column B/);
  assert.match(moduleCode, /photo && photo\.kind!=='row'/);
  assert.match(moduleCode, /photo\.kind==='row'\?'':'<span class/);
  assert.match(moduleCode, /This photo matches the individual product reference/);
  assert.match(moduleCode, /Product example/); // non-exact fallback remains labeled
});
