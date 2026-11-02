const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Exercise the actual inline functions, rather than duplicating their logic.
function loadDiscountFunctions() {
    const source = ['documentDiscountPct', 'formatDocumentDiscountPct'].map(name => {
        const match = html.match(new RegExp(
            'function ' + name + '\\([^]*?\\n        \\}'
        ));
        assert.ok(match, name + ' must exist in the showroom document');
        return match[0];
    }).join('\n');
    const context = vm.createContext({});
    vm.runInContext(source, context);
    return context;
}

test('quotation discounts display clean percentages without changing the calculation', () => {
    const { documentDiscountPct: calculate, formatDocumentDiscountPct: format } = loadDiscountFunctions();
    for (const [line, batch, expected] of [
        [0, 0, '0'], [10, 0, '10'], [40, 0, '40'],
        [12.5, 0, '12.5'], [100, 0, '100'],
        [10, 5, '14.5'], [50, 50, '75']
    ]) {
        assert.equal(format(calculate({ discount: line }, batch)), expected);
    }
    assert.equal(format(9.999999999999998), '10');
    assert.equal(format(12.345), '12.35');
    assert.equal(format(Number.NaN), '0');

    const rawDiscount = calculate({ discount: 10 });
    const originalPrice = 2990;
    assert.ok(Math.abs(originalPrice * (1 - rawDiscount / 100) - 2691) < 1e-7);
    assert.ok(Math.abs(originalPrice * (rawDiscount / 100) - 299) < 1e-7);
});

test('quotation, Sales Order and copied text share formatted percentages', () => {
    // Image export clones the preview and printing reads preview.innerHTML.
    for (const [expression, count] of [
        ['formatDocumentDiscountPct(setDiscount)', 1],
        ['formatDocumentDiscountPct(itemDiscount)', 1],
        ['documentDiscountCellHtml(setDiscount,discountValueAmount)', 1],
        ['documentDiscountCellHtml(itemDiscount,discountValueAmount)', 1],
        ['formatDocumentDiscountPct(discountPctValue)', 4],
        ['formatDocumentDiscountPct(depositPct)', 2]
    ]) {
        assert.equal(html.split(expression).length - 1, count, expression);
    }
    for (const name of ['setDiscount', 'itemDiscount', 'discountPctValue', 'depositPct']) {
        assert.equal(html.includes('${' + name + '}%'), false, name + ' should not display raw');
    }
});
