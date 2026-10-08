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
    const {data,error}=await requireClient().rpc('register_showroom_quotation_v2',{
      p_source_record_id:recordId,
      p_source_name:String(input.name||'').trim()||null,
      p_issue_date:input.issueDate||null,
      p_saved_at:input.savedAt||new Date().toISOString(),
      p_source_payload:input.state||{},
      p_customer_name:String(input.customerName||'').trim()||null,
      p_customer_phone:String(input.customerPhone||'').trim()||null,
      p_salesperson:String(input.salesperson||'').trim()||null,
      p_amount:Number.isFinite(Number(input.amount))?Number(input.amount):null,
      p_quote_prefix:['S','P'].includes(String(input.quotePrefix||'S').trim().toUpperCase())
        ? String(input.quotePrefix||'S').trim().toUpperCase()
        : 'S'
    });
    if(error)throw error;
    const row=Array.isArray(data)?data[0]:data;
    if(!row?.quote_no)throw new Error('Quotation number was not returned.');
    return {id:row.id,quoteNo:String(row.quote_no)};
  }

  async function listSalespeople(){
    const {data,error}=await requireClient().rpc('list_showroom_salespeople');
    if(error)throw error;
    return (Array.isArray(data)?data:[])
      .map(row=>({
        displayName:String(row?.display_name||'').trim(),
        role:String(row?.role||'').trim()
      }))
      .filter(row=>row.displayName);
  }

  async function confirm(input={}){
    const {data,error}=await requireClient().rpc('confirm_showroom_quotation_v2',{
      p_source_record_id:String(input.recordId||'').trim(),
      p_quote_no:String(input.quoteNo||'').trim(),
      p_source_payload:input.state||{},
      p_source_name:String(input.name||'').trim()||null,
      p_saved_at:input.savedAt||new Date().toISOString(),
      p_amount:Number.isFinite(Number(input.amount))?Number(input.amount):null
    });
    if(error)throw error;
    if(data!==true)throw new Error('Quotation history could not be confirmed.');
    return true;
  }

  // Revisions are read with the Sales & Order Management user session (RLS);
  // public quotation-numbering RPCs continue to use the existing anonymous client.
  const historyClient=window.supabase?.createClient && api.SUPABASE_URL && api.SUPABASE_PUBLISHABLE_KEY
    ? window.supabase.createClient(api.SUPABASE_URL,api.SUPABASE_PUBLISHABLE_KEY,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
      })
    : null;

  async function listRevisions(recordId){
    const sourceId=String(recordId||'').trim();
    if(!sourceId||!historyClient)return [];
    const {data:sessionData,error:sessionError}=await historyClient.auth.getUser();
    if(sessionError||!sessionData?.user)return [];
    const {data,error}=await historyClient.from('showroom_quotation_revisions')
      .select('revision_no,source_name,saved_at,source_payload,quote_no')
      .eq('source_record_id',sourceId)
      .order('revision_no',{ascending:true});
    if(error)throw error;
    return Array.isArray(data)?data:[];
  }

  window.QuotationRegistry=Object.freeze({register,confirm,listSalespeople,listRevisions});
})();