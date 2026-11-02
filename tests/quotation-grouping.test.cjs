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
        ['No Discount',['E']]
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
    assert.match(html, /const previewContent = previewPaper\.innerHTML/);
    assert.match(html, /const textQuoteArea = document\.getElementById\('quote-textarea'\)/);
});
