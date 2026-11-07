const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

// Test the source handlers, not a duplicate calculation.
function depositFunctions(contextValues={}){
  const names=['calculateSalesOrderDeposit','syncDepositAmountFromPct','updateDepositFromPct','updateDepositFromAmount'];
  const source=names.map(name=>{
    const result=html.match(new RegExp('function '+name+'\\([^]*?\\n        \\}'));
    assert.ok(result,'Missing handler: '+name);
    return result[0];
  }).join('\n');
  const ctx=vm.createContext(contextValues);
  vm.runInContext('let salesOrderDepositMode = "pct";\n'+source,ctx);
  return ctx;
}
const calculator=()=>depositFunctions().calculateSalesOrderDeposit;

test('typed $5,000 is exact although the displayed percentage rounds to 8.4%',()=>{
  const result=calculator()(59494.50,'amount',8.4,5000);
  assert.equal(result.percentage,8.4);
  assert.equal(result.amount,5000);
  assert.equal(result.remaining,54494.50);
  assert.notEqual(result.amount,4997.54);
});
test('percentage edit remains percentage-driven',()=>{
  const result=calculator()(59494.50,'pct',8.4,5000);
  assert.equal(result.amount,4997.54);
  assert.equal(result.remaining,54496.96);
  assert.equal(result.percentage,8.4);
});
test('zero, decimal, negative and over-total deposits are safe',()=>{
  const calc=calculator();
  assert.equal(calc(1000,'amount',0,250.75).amount,250.75);
  assert.equal(calc(1000,'amount',0,-20).amount,0);
  assert.equal(calc(1000,'amount',0,2000).amount,1000);
  assert.equal(calc(1000,'pct',150,0).amount,1000);
  assert.equal(calc(1000,'pct',-25,0).amount,0);
  assert.equal(calc(0,'amount',8.4,5000).amount,0);
  assert.equal(calc(0,'amount',8.4,5000).remaining,0);
  assert.equal(calc(0,'amount',8.4,5000).percentage,0);
  assert.equal(calc(99.99,'amount',0,33.333).amount,33.33);
});
test('amount then percentage edits switch which field is authoritative',()=>{
  const pct={value:'50'},amount={value:'5000'};
  const doc={getElementById:id=>({'so-deposit-pct':pct,'so-deposit-amount':amount})[id]||null};
  let previews=0;
  const ctx=depositFunctions({document:doc,getCartFinalTotal:()=>59494.50,updateQuotationPreview:()=>previews++});
  ctx.updateDepositFromAmount();
  assert.equal(vm.runInContext('salesOrderDepositMode',ctx),'amount');
  assert.equal(Number(amount.value),5000);
  assert.equal(Number(pct.value),8.4);
  pct.value='10';ctx.updateDepositFromPct();
  assert.equal(vm.runInContext('salesOrderDepositMode',ctx),'pct');
  assert.equal(Number(amount.value),5949.45);
  assert.equal(previews,2);
});
function executePreview(mode,pct,amount,total=59494.50){
  const start=html.indexOf("                if (documentType === 'sales_order') {\n                    const depositInput");
  assert.ok(start>0,'Deposit preview must use actual calculator');
  const end=html.indexOf('\n                }\n            }\n\n            plainText +=',start);
  assert.ok(end>start,'Deposit preview block not found');
  const body=html.slice(start,end+18);
  const percentageInput={value:String(pct)},amountInput={value:String(amount)};
  const doc={activeElement:amountInput,getElementById:id=>
    id==='so-deposit-pct'?percentageInput:id==='so-deposit-amount'?amountInput:null};
  const ctx=depositFunctions({
    document:doc,documentType:'sales_order',finalOverallPayout:total,
    formatDocumentDiscountPct:n=>String(n),
    formatCurrency:n=>'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),
    plainText:'',subtotalRowHtml:''
  });
  vm.runInContext('salesOrderDepositMode='+JSON.stringify(mode)+';\n'+body,ctx);
  return {text:ctx.plainText,rows:ctx.subtotalRowHtml,pctInput:percentageInput,amountInput};
}
test('Sales Order preview and copied text show $5,000 and correct balance',()=>{
  const x=executePreview('amount',8.4,5000);
  assert.match(x.text,/Deposit Paid \(≈8\.4%\):\s+\$5,000\.00/);
  assert.match(x.text,/Remaining Balance:\s+\$54,494\.50/);
  assert.match(x.rows,/Deposit Paid \(≈8\.4%\):/);
  assert.match(x.rows,/\$5,000\.00/);
  assert.match(x.rows,/\$54,494\.50/);
  assert.equal(Number(x.amountInput.value),5000);
});
test('Sales Order percentage-driven preview stays correct',()=>{
  const x=executePreview('pct',8.4,5000);
  assert.match(x.text,/Deposit Paid \(8\.4%\):\s+\$4,997\.54/);
  assert.match(x.text,/Remaining Balance:\s+\$54,496\.96/);
  assert.equal(Number(x.amountInput.value),4997.54);
});
test('Sales Order saves and restores last edited deposit field',()=>{
  assert.match(html,/if \(type === 'sales_order'\) state\.depositMode = salesOrderDepositMode/);
  assert.match(html,/if \(type === 'sales_order'\) salesOrderDepositMode = state\.depositMode === 'amount' \? 'amount' : 'pct'/);
  assert.match(html,/if \(type === 'sales_order' && !restored\) \{[\s\S]*?salesOrderDepositMode = 'pct'/);
  assert.match(html,/plainText \+= .*Deposit Paid/);
});
