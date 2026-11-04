const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','showroom-responsive-workspace.css'),'utf8');
const compact=fs.readFileSync(path.join(__dirname,'..','showroom-mobile-compact.css'),'utf8');
const selling=fs.readFileSync(path.join(__dirname,'..','showroom-selling.css'),'utf8');
const sellingJS=fs.readFileSync(path.join(__dirname,'..','showroom-selling.js'),'utf8');
const sw=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');

test('responsive workspace is loaded after existing mobile/selling CSS',()=>{
 const cssIndex=html.indexOf('showroom-responsive-workspace.css?v=');
 const sellingIndex=html.indexOf('showroom-selling.css?v=');
 assert.ok(cssIndex>sellingIndex&&sellingIndex>0);
 assert.match(html,/id="product-scroll-container"/);
 assert.match(html,/id="catalog-controls-panel"/);
 assert.match(html,/id="mobile-filter-trigger"/);
 assert.match(html,/id="mobile-advanced-filters"/);
 assert.match(html,/id="mobile-cart-drawer"/);
 assert.match(html,/id="mobile-cart-content"/);
 assert.match(html,/Customer Interest List/);
});
test('tablet and compact laptop media breakpoints preserve full desktop',()=>{
 assert.match(css,/@media \(min-width:768px\) and \(max-width:1535px\)/);
 assert.match(css,/\(min-width:1024px\) and \(max-width:1800px\) and \(max-height:820px\)/);
 assert.match(css,/#main-app > main > aside\s*\{\s*display:none !important;/);
 assert.match(css,/#main-app > main\s*\{[\s\S]*?max-width:none !important;/);
 assert.match(css,/#product-scroll-container\s*\{[\s\S]*?overflow-y:auto !important;/);
 assert.match(compact,/@media \(max-width: 767px\)/);
});
test('search and filter toggle share a row, full filters accessible on demand',()=>{
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(145px,180px\)/);
 assert.match(css,/#catalog-controls-panel #mobile-filter-trigger\s*\{[\s\S]*?display:flex !important;/);
 assert.match(css,/#catalog-controls-panel #mobile-advanced-filters\s*\{[\s\S]*?display:none !important;/);
 assert.match(css,/body\.mobile-filters-open #catalog-controls-panel #mobile-advanced-filters\s*\{[\s\S]*?display:block !important;/);
 assert.match(html,/onclick="toggleMobileFilters\(\)"/);
 assert.match(html,/onclick="toggleMobileFilters\(false\)/);
 assert.match(html,/id="class-select"/);assert.match(html,/id="subclass-select"/);
 assert.match(html,/id="brand-select"/);assert.match(html,/id="key-material-select"/);
 assert.match(html,/id="location-select"/);
});
test('Interest List drawer and open quotations are reachable at laptop width',()=>{
 assert.match(css,/#mobile-cart-drawer\s*\{\s*display:flex !important;/);
 assert.match(css,/#ss-mobile-bar:not\(\[hidden\]\)\s*\{[\s\S]*?display:flex !important;/);
 assert.match(css,/#ss-mobile-bar \.ss-bar-open-quotes\s*\{[\s\S]*?display:inline-flex !important;/);
 assert.match(sellingJS,/function ensureMobileBar\(\)/);
 assert.match(sellingJS,/cartBtn\.onclick=\(\)=>toggleMobileCart\(true\)/);
 assert.match(sellingJS,/quotationsBtn\.onclick=\(\)=>openSavedListsModal\('open'\)/);
 assert.match(html,/function toggleMobileCart\(open\)/);
 assert.match(css,/body\.ss-has-mobile-cart #main-app\s*\{\s*padding-bottom:/);
});
test('existing product data, filters and quotation workflows are not replaced',()=>{
 assert.match(html,/function renderProductGrid\(\)/);
 assert.match(html,/function updateCartVisuals\(\)/);
 assert.match(html,/function openShareModal\(\)/);
 assert.match(html,/function toggleMobileFilters\(force\)/);
 assert.match(css,/#showroom-phase1-tools/);
 assert.match(css,/overflow-x:auto !important;/);
 assert.match(selling,/#ss-mobile-bar:not\(\[hidden\]\)/);
});

test('PWA gets the new responsive style after service-worker update',()=>{
 assert.match(sw,/tablet-laptop-catalog-first-20261104/);
 assert.match(sw,/showroom-responsive-workspace\.css\?v=20261104-tablet-catalog1/);
 assert.match(html,/showroom-responsive-workspace\.css\?v=20261104-tablet-catalog1/);
});
