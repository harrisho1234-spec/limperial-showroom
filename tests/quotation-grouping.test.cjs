const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function loadDocumentFunctions() {
    const names = [
        'documentSectionName', 'documentDiscountPct',
        'formatDocumentDiscountPct', 'planDocumentGroups',
        'documentDiscountCellHtml', 'documentGroupSubtotalsEnabled'
    ];
    const source = names.map(name => {
        const result = html.match(new RegExp('function ' + name + '\\([^]*?\\n        \\}'));
        assert.ok(result, 'Missing source function: ' + name);
        return result[0];
    }).join('\n');
    const context = vm.createContext({
        documentType: 'quotation',
        document: { getElementById: () => ({ checked: true }) },
        formatCurrency: value => '$' + Number(value).toFixed(0)
    });
    vm.runInContext(source, context);
    return context;
}
const asNames = groups => JSON.parse(JSON.stringify(
    groups.map(group => [group.title, group.items.map(item => item.id)])
));
const rows = () => [
    { id:'A', discount:50, documentSections:{ quotation:'Ground Floor' } },
    { id:'B', discount:20, documentSections:{ quotation:'First Floor' } },
    { id:'C', discount:10, documentSections:{ quotation:'Ground Floor' } },
    { id:'D', discount:50, documentSections:{ quotation:'First Floor' } },
    { id:'E', discount:0, documentSections:{ quotation:'' } }
];

test('floor / room grouping combines named locations while preserving mixed discounts', () => {
    const f = loadDocumentFunctions();
    const input = rows();
    const original = JSON.stringify(input);
    assert.deepEqual(asNames(f.planDocumentGroups(input, 'floor', 0)), [
        ['Ground Floor', ['A','C']],
        ['First Floor', ['B','D']],
        ['Unassigned Items', ['E']]
    ]);
    assert.equal(JSON.stringify(input), original, 'grouping must not modify any source item');
    assert.equal(f.documentDiscountPct(input[0], 0), 50);
    assert.ok(Math.abs(f.documentDiscountPct(input[2], 0) - 10) < 1e-9, 'floating-point math is unchanged');
    assert.deepEqual(asNames(f.planDocumentGroups([{ id:'blank', discount:20 }], 'floor', 0)), [['', ['blank']]]);
});
test('discount grouping uses existing effective discounts without applying new ones', () => {
    const f = loadDocumentFunctions();
    const input = rows();
    const before = JSON.stringify(input);
    assert.deepEqual(asNames(f.planDocumentGroups(input, 'discount', 0)), [
        ['50% Discount',['A','D']],
        ['20% Discount',['B']],
        ['10% Discount',['C']],
        ['', ['E']]
    ]);
    assert.deepEqual(asNames(f.planDocumentGroups([
        {id:'base10',discount:10},
        {id:'base50',discount:50}
    ], 'discount', 5)), [
        ['52.5% Discount',['base50']],
        ['14.5% Discount',['base10']]
    ]);
    assert.equal(JSON.stringify(input), before);
});
test('no grouping retains original cart item order and no headings', () => {
    const f=loadDocumentFunctions();
    assert.deepEqual(asNames(f.planDocumentGroups(rows(), 'none', 0)), [
        ['', ['A','B','C','D','E']]
    ]);
});
test('group subtotals can be disabled without losing grouping or discounts', () => {
    const f=loadDocumentFunctions();
    f.document={getElementById:()=>({checked:false})};
    assert.equal(f.documentGroupSubtotalsEnabled(),false);
    assert.deepEqual(asNames(f.planDocumentGroups(rows(),'discount',0))[0],['50% Discount',['A','D']]);
});
test('zero discount cell is blank rather than minus zero, without changing nonzero values', () => {
    const f=loadDocumentFunctions();
    assert.doesNotMatch(f.documentDiscountCellHtml(0,0), /-0%|\$0/);
    assert.match(f.documentDiscountCellHtml(0,0), /—/);
    assert.match(f.documentDiscountCellHtml(9.999999999999998,299), /-10%/);
    assert.match(f.documentDiscountCellHtml(50,1290), /-50%/);
});
test('preview, copy, image and print share grouping and correct row-resize references', () => {
    assert.match(html, /id="doc-group-mode"/);
    assert.match(html, /id="doc-group-subtotals"/);
    assert.match(html, /const displayedRows=groupPlan\.flatMap/);
    assert.match(html, /if\(groupPlan\[groupIndex\]\?\.title && showGroupSubtotals\)/);
    assert.match(html, /initRowResize\(event, \$\{cartIndex\}\)/);
    assert.match(html, /exportPaper = previewPaper\.cloneNode\(true\)/);
    assert.match(html, /const previewContent = \(window\.QuotationTableEditor\?\.cleanClone\(previewPaper\.cloneNode\(true\)\) \|\| previewPaper\)\.innerHTML/);
    assert.match(html, /const textQuoteArea = document\.getElementById\('quote-textarea'\)/);
});

function loadEditableDiscountHandlers(mode='floor',type='quotation') {
    const names=['documentSectionName','documentGroupingMode','formatDocumentDiscountPct',
        'documentItemDiscountInput','applyDocumentItemDiscount',
        'finishDocumentItemDiscount','applyDocumentSectionDiscount'];
    const handlers=names.map(name=>{
        const match=html.match(new RegExp('function '+name+'\\([^]*?\\n        \\}'));
        assert.ok(match,'Missing actual handler '+name);
        return match[0];
    }).join('\n');
    const cart=[
        {id:'A',discount:30,documentSections:{quotation:'First Floor',sales_order:'First Floor'}},
        {id:'B',discount:20,documentSections:{quotation:'First Floor',sales_order:'First Floor'}},
        {id:'C',discount:10,documentSections:{quotation:'First Floor',sales_order:'First Floor'}},
        {id:'D',discount:40,documentSections:{quotation:'Second Floor',sales_order:'Second Floor'}}
    ];
    const inputs=Object.fromEntries(cart.map(c=>[c.id,{dataset:{itemId:c.id},value:String(c.discount)}]));
    let allowed=false,confirmCount=0;
    const calls={updated:[],previews:0,renders:0,recalcs:0,notifications:[]};
    const context=vm.createContext({
        cart,documentType:type,
        document:{
            querySelectorAll:selector=>selector==='.quote-section-discount-input'?Object.values(inputs):[],
            getElementById:id=>id==='doc-group-mode'?{value:mode}:null
        },
        findCartLine:id=>cart.find(c=>c.id===id),
        changeItemDiscount:(id,pct)=>{cart.find(c=>c.id===id).discount=pct;calls.updated.push(id);},
        updateQuotationPreview:()=>{calls.previews++;},
        renderQuoteItemsNotesForm:()=>{calls.renders++;},
        updateCartVisuals:()=>{calls.recalcs++;},
        showNotification:message=>{calls.notifications.push(message);},
        window:{
            confirm:()=>{confirmCount++;return allowed;},
            ShowroomPhase1:{scheduleDraft:()=>{}}
        }
    });
    vm.runInContext(handlers,context);
    return {context,cart,inputs,calls,allowBulk:()=>{allowed=true;},confirmations:()=>confirmCount};
}
test('changing a discount inside a floor only updates the chosen item, including Sales Orders',()=>{
    for(const type of ['quotation','sales_order']){
        const t=loadEditableDiscountHandlers('floor',type);
        t.inputs.B.value='50';
        assert.equal(t.context.applyDocumentItemDiscount('B',t.inputs.B),true);
        assert.deepEqual(t.cart.map(row=>row.discount),[30,50,10,40]);
        assert.deepEqual(t.calls.updated,['B']);
        assert.equal(t.confirmations(),0,'individual editing must never prompt for a bulk edit');
        assert.equal(t.calls.previews,1,'the quotation should preview the new rate');
    }
});
test('bulk floor changes require confirmation and never affect a different floor',()=>{
    const t=loadEditableDiscountHandlers();
    t.inputs.B.value='50';
    t.context.applyDocumentItemDiscount('B',t.inputs.B);
    t.context.applyDocumentSectionDiscount('B');
    assert.deepEqual(t.cart.map(row=>row.discount),[30,50,10,40],
        'canceling the confirmation must retain mixed percentages');
    t.allowBulk();
    t.context.applyDocumentSectionDiscount('B');
    assert.deepEqual(t.cart.map(row=>row.discount),[50,50,50,40],
        'only an approved whole-section action may replace floor discounts');
    assert.equal(t.confirmations(),2);
    assert.equal(t.calls.recalcs,1);
});
test('invalid per-item rates do not change a floor and revert the field',()=>{
    const t=loadEditableDiscountHandlers();
    t.inputs.B.value='150';
    assert.equal(t.context.applyDocumentItemDiscount('B',t.inputs.B),false);
    t.context.finishDocumentItemDiscount('B',t.inputs.B);
    assert.equal(t.inputs.B.value,'20');
    assert.deepEqual(t.cart.map(row=>row.discount),[30,20,10,40]);
    assert.match(t.calls.notifications[0],/0% to 100%/);
});
test('discount groups re-render only after discount entry is completed',()=>{
    const t=loadEditableDiscountHandlers('discount');
    t.inputs.C.value='50';
    t.context.applyDocumentItemDiscount('C',t.inputs.C);
    assert.equal(t.calls.renders,0,'typing must preserve focus');
    t.context.finishDocumentItemDiscount('C',t.inputs.C);
    assert.equal(t.calls.renders,1,'completed edits regroup the editor');
    assert.deepEqual(t.cart.map(row=>row.discount),[30,20,50,40]);
});
test('discount editor exposes distinct item and confirmed section actions',()=>{
    assert.match(html,/oninput="applyDocumentItemDiscount\(this\.dataset\.itemId,this\)"/);
    assert.match(html,/Apply to Item<\/button>/);
    assert.match(html,/Apply to Entire Section\.\.\.<\/button>/);
    assert.match(html,/window\.confirm\('Apply '/);
});

test('full-price item display can be plain, Regular Price, or legacy No Discount',()=>{
    const f=loadDocumentFunctions();
    const input=rows(),before=JSON.stringify(input);
    const plain=asNames(f.planDocumentGroups(input,'discount',0,'plain'));
    const regular=asNames(f.planDocumentGroups(input,'discount',0,'regular'));
    const legacy=asNames(f.planDocumentGroups(input,'discount',0,'no-discount'));
    assert.deepEqual(plain[plain.length-1],['',['E']]);
    assert.deepEqual(regular[regular.length-1],['Regular Price',['E']]);
    assert.deepEqual(legacy[legacy.length-1],['No Discount',['E']]);
    assert.equal(JSON.stringify(input),before,'changing the heading must not change item data');
    assert.equal(f.planDocumentGroups(input,'discount',0,'plain').length,4,
        'all full-price items must remain in the document');
});
test('the full-price presentation setting is shown only for discount grouping',()=>{
    assert.match(html,/id="doc-no-discount-options"/);
    assert.match(html,/id="doc-no-discount-style"/);
    assert.match(html,/value="plain" selected>List normally/);
    assert.match(html,/value="regular">Group as Regular Price/);
    assert.match(html,/value="no-discount">Group as No Discount/);
    assert.match(html,/classList\.toggle\('hidden',mode!=='discount'\)/);
    assert.match(html,/planDocumentGroups\(cart,documentGroupingMode\(\),activeBatchPct,documentNoDiscountStyle\(\)\)/);
    assert.match(html,/planDocumentGroups\(cart,groupingMode,discountPctValue,documentNoDiscountStyle\(\)\)/);
});
test('unheaded regular-price lines do not introduce a redundant group subtotal',()=>{
    assert.match(html,/const title=groupPlan\[activeGroupIndex\]\?\.title;/);
    assert.match(html,/if\(!title\|\|!showGroupSubtotals\)return;/);
    assert.match(html,/if\(title\) \{/);
    assert.match(html,/const displayedRows=groupPlan\.flatMap/);
    assert.match(html,/const textQuoteArea = document\.getElementById\('quote-textarea'\)/);
});


test('new quotations and Sales Orders default to original order without changing saved choices',()=>{
    const f=loadDocumentFunctions();
    const input=rows();
    assert.deepEqual(asNames(f.planDocumentGroups(input)), [
        ['', ['A','B','C','D','E']]
    ]);
    assert.match(html, /<option value="none" selected>No grouping \(Original Order\)<\/option>/);
    assert.doesNotMatch(html, /<option value="floor" selected>/);
    assert.equal((html.match(/groupModeSelect\.value='none'/g)||[]).length, 2);
    assert.match(html, /return \['floor','discount','none'\]\.includes\(mode\) \? mode : 'none'/);
    // The type switch resets the choice only when !restored.
    assert.match(html, /if \(!restored\) \{\s*const groupModeSelect=/);
});
