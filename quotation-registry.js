(() => {
  'use strict';

  const api=window.APP_CONFIG||{};
  const client=window.supabase?.createClient && api.SUPABASE_URL && api.SUPABASE_PUBLISHABLE_KEY
    ? window.supabase.createClient(api.SUPABASE_URL,api.SUPABASE_PUBLISHABLE_KEY,{
        auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'limperial-showroom-quote-registry'}
      })
    : null;

  function requireClient(){
    if(!client)throw new Error('Quotation numbering service is unavailable.');
    return client;
  }

  async function register(input={}){
    const recordId=String(input.recordId||'').trim();
    if(!recordId)throw new Error('Missing saved quotation record ID.');
    const {data,error}=await requireClient().rpc('register_showroom_quotation',{
      p_source_record_id:recordId,
      p_source_name:String(input.name||'').trim()||null,
      p_issue_date:input.issueDate||null,
      p_saved_at:input.savedAt||new Date().toISOString(),
      p_source_payload:input.state||{},
      p_customer_name:String(input.customerName||'').trim()||null,
      p_customer_phone:String(input.customerPhone||'').trim()||null,
      p_salesperson:String(input.salesperson||'').trim()||null,
      p_amount:Number.isFinite(Number(input.amount))?Number(input.amount):null
    });
    if(error)throw error;
    const row=Array.isArray(data)?data[0]:data;
    if(!row?.quote_no)throw new Error('Quotation number was not returned.');
    return {id:row.id,quoteNo:String(row.quote_no)};
  }

  async function confirm(input={}){
    const {data,error}=await requireClient().rpc('confirm_showroom_quotation',{
      p_source_record_id:String(input.recordId||'').trim(),
      p_quote_no:String(input.quoteNo||'').trim(),
      p_source_payload:input.state||{}
    });
    if(error)throw error;
    if(data!==true)throw new Error('Quotation history could not be confirmed.');
    return true;
  }

  window.QuotationRegistry=Object.freeze({register,confirm});
})();