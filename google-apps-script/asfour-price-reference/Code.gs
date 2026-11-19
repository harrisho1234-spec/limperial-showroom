/**
 * ASFOUR PRICE REFERENCE · Google Apps Script Web App
 * Keep the source Google Sheet private. This endpoint emits ONLY approved,
 * positive USD selling prices; draft rows and internal notes are excluded.
 * The showroom app reads this endpoint; it never writes to stock or quotes.
 * Deployment: execute as the sheet owner, access "Anyone" only if the
 * showroom price reference is intended to be accessible without sign-in.
 */
const ASFOUR_SHEET_ID='1n1aAO0V6lmz9z6dWVX33Tnn0OGxMzJDODywJ-YhUmQo';
const ASFOUR_TAB='Asfour Retail Prices';
function doGet(e){
  try{
    const sh=SpreadsheetApp.openById(ASFOUR_SHEET_ID).getSheetByName(ASFOUR_TAB);
    if(!sh)throw new Error('Asfour Retail Prices tab is missing');
    const rows=sh.getDataRange().getValues();
    const output=[];
    const seen=new Set();
    for(let i=1;i<rows.length;i++){
      const r=rows[i]||[];
      const code=String(r[0]||'').trim();
      const price=Number(r[7]);
      if(String(r[9]||'').trim()!=='Approved'||!/^\d{4,5}\/\d{1,4}\/\d{1,3}\/\d{1,3}$/.test(code)||
         !Number.isFinite(price)||price<=0||price>100000000||seen.has(code))continue;
      seen.add(code);
      const photo=String(r[8]||'').trim();
      // Restrict image URL scheme. No supplier costs or internal approval
      // metadata are returned in this public-facing projection.
      output.push({
        code,name:String(r[1]||'').slice(0,160),family:String(r[2]||'').slice(0,90),
        type:String(r[3]||'').slice(0,80),size:String(r[4]||'').slice(0,100),
        finish:String(r[5]||'').slice(0,80),crystal:String(r[6]||'').slice(0,80),
        priceUsd:price,photoUrl:/^https:\/\//i.test(photo)?photo:''
      });
    }
    // Apps Script ContentService redirects commonly prevent CORS fetches.
    // JSONP is intentionally fixed to one callback and only approved rows.
    const json=JSON.stringify({version:1,items:output,updatedAt:new Date().toISOString()});
    if(String(e&&e.parameter&&e.parameter.callback||'')==='__LimperialAsfourPriceReceive')
      return ContentService.createTextOutput('window.__LimperialAsfourPriceReceive('+json+');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({version:1,items:[],error:'Reference unavailable'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
