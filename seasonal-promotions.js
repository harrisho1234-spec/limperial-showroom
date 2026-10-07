// Shared seasonal campaigns for the public Limperial Showroom.
// Campaigns live in Supabase; only authenticated Sales Tracking managers can edit.
// Public visitors can only read currently active campaigns through database RLS.
(function(){
  'use strict';
  const TABLE='showroom_promotion_campaigns';
  const ROLES=['super_admin','admin','manager'];
  const api=window.APP_CONFIG||{};
  const client=window.supabase?.createClient && api.SUPABASE_URL && api.SUPABASE_PUBLISHABLE_KEY
    ? window.supabase.createClient(api.SUPABASE_URL,api.SUPABASE_PUBLISHABLE_KEY,{
        auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'limperial-showroom-seasonal'}
      })
    : null;
  let campaigns=[],authorized=false,editId=null,chosen=new Map(),searchQuery='',showingAll=false;
  let loading=false, managerVisible=false, lastRefresh=0, ticker=null;
  const ui=id=>document.getElementById(id);
  const escapeHtml=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const codeOf=v=>String(v||'').trim().toUpperCase();
  function today(){
    const p=Intl.DateTimeFormat('en-US',{timeZone:'Asia/Phnom_Penh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=x=>p.find(i=>i.type===x)?.value||'';
    return get('year')+'-'+get('month')+'-'+get('day');
  }
  const round2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
  const price=n=>'$'+Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:0});
  const rawProducts=()=>typeof products!=='undefined'&&Array.isArray(products)?products:[];
  const active=c=>!!c.is_enabled&&c.start_date<=today()&&c.end_date>=today();
  const campaignItems=c=>Array.isArray(c.items)?c.items:[];
  const campaignState=c=>!c.is_enabled?'Disabled':c.start_date>today()?'Scheduled':c.end_date<today()?'Ended':'Active';
  const current=()=>campaigns.filter(active).sort((a,b)=>b.start_date.localeCompare(a.start_date)||b.created_at.localeCompare(a.created_at));
  function notify(msg,type){if(typeof showNotification==='function')showNotification(msg,type||'info');}
  function featuredMap(){
    const found=new Map();
    current().forEach(c=>{
      campaignItems(c).forEach(item=>{
        const code=codeOf(item.code);
        if(code&&!found.has(code))found.set(code,{campaign:c,item});
      });
    });
    return found;
  }
  function applyProductPromos(){
    const live=featuredMap();
    rawProducts().forEach(item=>{
      if(item.isSet)return;
      if(!item._seasonalBaseline){
        item._seasonalBaseline={price:item.price,promotion:item.promotion,pricePromotion:item.pricePromotion};
      }
      const original=item._seasonalBaseline;
      item.price=original.price;
      item.promotion=original.promotion;
      item.pricePromotion=original.pricePromotion;
      delete item._seasonalCampaign;
      const match=live.get(codeOf(item.code));
      if(!match)return;
      const base=Number(item.actualSalesPrice)||Number(original.price)||0;
      const fixed=match.item.promo_price==null||match.item.promo_price===''?null:Number(match.item.promo_price);
      const pct=Number(match.campaign.discount_percent)||0;
      let target=null;
      if(fixed!=null&&Number.isFinite(fixed)&&fixed>=0&&fixed<base){
        target=round2(fixed);
        item.promotion='SPECIAL PRICE';
        item.pricePromotion=String(target);
      }else if(pct>0){
        target=round2(base*(1-pct/100));
        item.promotion=pct+'% OFF';
        item.pricePromotion='';
      }
      if(target!==null)item.price=target;
      else item.promotion=String(match.campaign.badge||'SEASONAL OFFER');
      item._seasonalCampaign={id:match.campaign.id,title:match.campaign.name,badge:match.campaign.badge,
        percent:pct,fixedPrice:fixed,actualPromoPrice:target};
    });
  }
  function isFeatured(product){return !!featuredMap().get(codeOf(product?.code));}
  function cards(){
    const matches=featuredMap();
    return rawProducts().filter(p=>!p.isSet&&matches.has(codeOf(p.code)));
  }
  function renderBanner(){
    const box=ui('seasonal-promotions-section');
    if(!box)return;
    const list=cards();
    if(!list.length){box.classList.add('hidden');box.innerHTML='';return;}
    box.classList.remove('hidden');
    const names=[...new Set(current().map(c=>c.name))];
    const featured=showingAll?[]:list.slice(0,8);
    box.innerHTML='<div class="flex flex-wrap justify-between gap-3 items-center mb-3"><div>'+
      '<div class="text-[10px] tracking-[.16em] uppercase font-bold text-luxury-gold"><i class="fa-solid fa-star mr-1"></i> Seasonal Promotion</div>'+
      '<h3 class="font-serif font-semibold text-luxury-text text-lg sm:text-xl">'+escapeHtml(names.join(' · '))+'</h3>'+
      '<p class="text-xs text-luxury-muted mt-1">'+list.length+' featured products · Promotions end automatically on their campaign dates</p></div>'+
      '<button type="button" id="seasonal-view-all" class="px-3 py-2 rounded-xl text-xs font-bold border border-luxury-gold/30 bg-luxury-accent/40 text-luxury-gold hover:bg-luxury-accent">'+(showingAll?'Show Normal Catalog':'View All Promotions')+' <i class="fa-solid fa-arrow-right ml-1"></i></button></div>'+
      (showingAll?'<p class="text-xs text-luxury-muted">Showing seasonal promotion items in the catalog below. Other search filters still work.</p>':
        '<div class="flex gap-3 overflow-x-auto pb-2">'+featured.map(p=>{
          const prom=p._seasonalCampaign||{};
          const direct=typeof resolveGoogleDriveImg==='function'?resolveGoogleDriveImg(p.imgLink):p.imgLink;
          const url=escapeHtml(direct||'');
          return '<div class="border border-luxury-gold/20 rounded-xl overflow-hidden bg-luxury-card shrink-0 w-40 sm:w-44">'+
            '<button type="button" data-promo-open="'+escapeHtml(p.id)+'" class="w-full text-left">'+
            '<div class="relative h-28 sm:h-32 bg-white flex items-center justify-center overflow-hidden">'+
              (url?'<img class="max-h-full max-w-full object-contain" loading="lazy" src="'+url+'" alt="">':'<i class="fa-solid fa-gem text-luxury-gold/40 text-3xl"></i>')+
              '<span class="absolute top-1 left-1 bg-amber-100 text-amber-800 px-2 py-0.5 text-[9px] rounded-md font-bold uppercase">'+escapeHtml(prom.badge||'Offer')+'</span>'+
            '</div><div class="p-2"><div class="text-[9px] text-luxury-muted truncate">'+escapeHtml(p.code)+'</div>'+
            '<div class="text-xs text-luxury-text font-semibold truncate">'+escapeHtml(p.itemName)+'</div>'+
            '<div class="mt-1 text-sm font-bold text-luxury-gold">'+price(p.price)+'</div></div></button>'+
            '<button type="button" data-promo-select="'+escapeHtml(p.id)+'" class="block w-full py-2 border-t border-luxury-gold/15 text-[10px] uppercase font-bold tracking-wide text-luxury-gold hover:bg-luxury-accent/40"><i class="fa-solid fa-plus mr-1"></i>Select</button></div>';
        }).join('')+'</div>');
    ui('seasonal-view-all')?.addEventListener('click',toggleAll);
    box.querySelectorAll('[data-promo-open]').forEach(el=>el.addEventListener('click',()=>openProductDetailModal(el.dataset.promoOpen)));
    box.querySelectorAll('[data-promo-select]').forEach(el=>el.addEventListener('click',()=>toggleCartSelection(el.dataset.promoSelect)));
  }
  function toggleAll(){
    showingAll=!showingAll;
    if(showingAll&&typeof resetFilters==='function')resetFilters();
    if(typeof executeSearchFilter==='function')executeSearchFilter();
    renderBanner();
    const target=showingAll?ui('product-grid'):ui('seasonal-promotions-section');
    target?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function refresh(){
    if(!client||loading)return;
    loading=true;
    try{
      const {data,error}=await client.from(TABLE).select('id,name,badge,start_date,end_date,is_enabled,discount_percent,items,created_at,updated_at').order('start_date',{ascending:false});
      if(error)throw error;
      campaigns=data||[];
      lastRefresh=Date.now();
      applyProductPromos();renderBanner();
      if(typeof executeSearchFilter==='function')executeSearchFilter();
      if(authorized)renderManager();
    }catch(e){console.warn('[Seasonal promotions] Load failed',e);if(authorized)notify('Could not refresh promotion campaigns: '+e.message,'error');}
    finally{loading=false;}
  }
  function afterAddToCart(id){
    const p=rawProducts().find(x=>String(x.id)===String(id));
    const promo=p?._seasonalCampaign;if(!promo)return;
    const line=typeof cart!=='undefined'&&Array.isArray(cart)?cart.find(c=>c.item?.id===id):null;
    if(!line)return;
    if(promo.fixedPrice!=null&&promo.actualPromoPrice!=null&&Number.isFinite(promo.actualPromoPrice)){
      line.customPrice=promo.actualPromoPrice;
      line.discount=0;
    }else if(promo.percent>0){line.customPrice=null;line.discount=promo.percent;}
  }
  function setManagerMode(on){
    managerVisible=!!on;
    const btn=ui('seasonal-promotions-manage-button');
    if(btn)btn.classList.toggle('hidden',!managerVisible);
    if(!managerVisible){
      closeManager();
      authorized=false;editId=null;chosen.clear();
      client?.auth.signOut().catch(()=>{});
    }
  }
  function modalHtml(){
    return '<div id="seasonal-promo-modal" class="hidden fixed inset-0 bg-black/75 backdrop-blur-sm z-[95] p-3 sm:p-6 overflow-y-auto">'+
      '<div class="relative max-w-4xl rounded-2xl border border-luxury-gold/25 bg-luxury-card shadow-2xl mx-auto my-4">'+
      '<div class="flex items-center justify-between border-b border-luxury-gold/15 p-4"><div><div class="font-serif text-luxury-gold font-bold text-lg">Seasonal Promotion Manager</div><div class="text-[10px] text-luxury-muted mt-1">Shared campaigns · Sales Tracking management accounts only</div></div>'+
      '<button type="button" id="sp-close" class="p-2 text-luxury-muted hover:text-luxury-gold"><i class="fa-solid fa-xmark"></i></button></div>'+
      '<div class="p-4 sm:p-5 space-y-4" id="seasonal-promo-modal-content"></div></div></div>';
  }
  function closeManager(){ui('seasonal-promo-modal')?.classList.add('hidden');}
  async function openManager(){
    if(!managerVisible){notify('Unlock Management Mode first.','error');return;}
    if(!client){notify('Promotion database service is not available.','error');return;}
    ui('seasonal-promo-modal')?.classList.remove('hidden');
    const existing=await client.auth.getUser();
    if(existing.data?.user) {
      const permitted=await checkRole();
      if(permitted){authorized=true;await refresh();renderManager();return;}
    }
    renderLogin();
  }
  function renderLogin(error=''){
    const el=ui('seasonal-promo-modal-content');if(!el)return;
    el.innerHTML='<div class="max-w-md mx-auto py-4 space-y-3"><h4 class="font-semibold text-luxury-text text-sm">Sign in with your Sales Tracking account</h4>'+
      '<p class="text-xs text-luxury-muted">A showroom Management Mode passcode alone cannot authorize shared campaign changes.</p>'+
      (error?'<div class="p-3 rounded-lg bg-red-500/10 text-red-600 text-xs">'+escapeHtml(error)+'</div>':'')+
      '<form id="sp-login" class="space-y-3"><label class="block text-xs text-luxury-muted">Email<input id="sp-email" type="email" autocomplete="username" required class="block mt-1 w-full border border-luxury-gold/20 bg-luxury-dark text-luxury-text rounded-lg p-3"></label>'+
      '<label class="block text-xs text-luxury-muted">Password<input id="sp-password" type="password" autocomplete="current-password" required class="block mt-1 w-full border border-luxury-gold/20 bg-luxury-dark text-luxury-text rounded-lg p-3"></label>'+
      '<button id="sp-sign-in" type="submit" class="w-full bg-luxury-gold text-slate-950 rounded-lg py-3 text-xs font-bold uppercase">Sign In & Manage</button></form></div>';
    ui('sp-login')?.addEventListener('submit',login);
  }
  async function checkRole(){
    const {data,error}=await client.rpc('current_app_role');
    return !error&&ROLES.includes(String(data||''));
  }
  async function login(event){
    event.preventDefault();
    const btn=ui('sp-sign-in');if(btn)btn.disabled=true;
    const {error}=await client.auth.signInWithPassword({email:ui('sp-email')?.value||'',password:ui('sp-password')?.value||''});
    if(error){renderLogin(error.message);return;}
    if(!(await checkRole())){await client.auth.signOut();renderLogin('This account does not have Super Admin, Admin, or Manager access.');return;}
    authorized=true;await refresh();renderManager();
  }
  function campaignRow(c){
    const status=campaignState(c);
    return '<div class="flex flex-wrap justify-between items-center gap-3 rounded-xl border border-luxury-gold/20 bg-luxury-dark/50 px-3 py-3">'+
      '<div><div class="text-sm font-semibold text-luxury-text">'+escapeHtml(c.name)+' <span class="ml-1 text-[10px] px-2 py-1 bg-luxury-accent rounded text-luxury-muted">'+escapeHtml(status)+'</span></div>'+
      '<div class="mt-1 text-[10px] text-luxury-muted">'+escapeHtml(c.start_date)+' to '+escapeHtml(c.end_date)+' · '+campaignItems(c).length+' items'+(c.discount_percent?' · '+Number(c.discount_percent)+'% off':'')+'</div></div>'+
      '<div class="flex gap-2"><button type="button" data-sp-edit="'+escapeHtml(c.id)+'" class="text-xs rounded-lg border border-luxury-gold/20 p-2 text-luxury-gold">Edit</button>'+
      '<button type="button" data-sp-toggle="'+escapeHtml(c.id)+'" class="text-xs rounded-lg border border-luxury-gold/20 p-2 text-luxury-muted">'+(c.is_enabled?'Disable':'Enable')+'</button></div></div>';
  }
  function renderManager(){
    if(!authorized)return;
    const el=ui('seasonal-promo-modal-content');if(!el)return;
    el.innerHTML='<div class="flex justify-between items-center"><span class="text-xs text-luxury-muted">'+campaigns.length+' campaigns (including history)</span>'+
      '<div class="flex gap-2"><button id="sp-create" class="px-3 py-2 bg-luxury-gold text-slate-950 rounded-lg text-xs font-bold"><i class="fa-solid fa-plus mr-1"></i>New Campaign</button>'+
      '<button id="sp-logout" class="px-3 py-2 border border-luxury-gold/20 rounded-lg text-xs text-luxury-muted">Sign Out</button></div></div>'+
      '<div class="space-y-2 max-h-64 overflow-y-auto">'+(campaigns.length?campaigns.map(campaignRow).join(''):'<p class="text-xs text-luxury-muted text-center p-8">No seasonal promotions yet. Create the first campaign.</p>')+'</div>'+
      '<div id="sp-editor"></div>';
    ui('sp-create')?.addEventListener('click',()=>editCampaign(null));
    ui('sp-logout')?.addEventListener('click',async()=>{authorized=false;await client.auth.signOut();renderLogin();});
    el.querySelectorAll('[data-sp-edit]').forEach(x=>x.addEventListener('click',()=>editCampaign(campaigns.find(c=>c.id===x.dataset.spEdit))));
    el.querySelectorAll('[data-sp-toggle]').forEach(x=>x.addEventListener('click',()=>toggleCampaign(x.dataset.spToggle)));
    if(editId){const currentCampaign=campaigns.find(c=>c.id===editId);if(currentCampaign)drawEditor(currentCampaign);}
  }
  async function toggleCampaign(id){
    if(!authorized)return;
    const existing=campaigns.find(x=>x.id===id);if(!existing)return;
    const result=await client.from(TABLE).update({is_enabled:!existing.is_enabled,updated_at:new Date().toISOString()}).eq('id',id).select('id');
    if(result.error||!result.data?.length){notify('Could not update campaign: '+(result.error?.message||'Access denied'),'error');return;}
    notify('Campaign '+(!existing.is_enabled?'enabled':'disabled')+'.','success');
    await refresh();
  }
  function editCampaign(c){
    editId=c?.id||null;chosen=new Map(campaignItems(c||{}).map(item=>[codeOf(item.code),{code:codeOf(item.code),promo_price:item.promo_price??null}]));
    searchQuery='';drawEditor(c||null);
  }
  function drawEditor(c){
    const el=ui('sp-editor');if(!el)return;
    const start=c?.start_date||today();const end=c?.end_date||today();
    el.innerHTML='<div class="border-t border-luxury-gold/15 pt-4 mt-4 space-y-4"><h4 class="font-serif text-luxury-gold text-lg">'+(c?'Edit Campaign':'Create Campaign')+'</h4>'+
      '<form id="sp-editor-form" class="space-y-4">'+
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">'+
      field('Campaign Name','sp-title',c?.name||'','text','e.g. Chinese New Year 2027')+
      field('Badge / Label','sp-badge',c?.badge||'SEASONAL OFFER','text','e.g. Lighting Week')+
      field('Start Date','sp-start',start,'date')+field('End Date','sp-end',end,'date')+
      field('Discount % (optional)','sp-percent',c?.discount_percent??'','number','e.g. 20')+
      '<label class="flex gap-2 items-center text-sm text-luxury-text"><input type="checkbox" id="sp-enabled" '+(c&&!c.is_enabled?'':'checked')+'> Enabled / Published</label></div>'+
      '<div class="rounded-xl border border-luxury-gold/15 p-3 space-y-3">'+
      '<div class="flex flex-wrap justify-between items-end gap-2"><label class="text-xs font-bold text-luxury-text">Select Products <span id="sp-count" class="text-luxury-gold"></span></label><span class="text-[10px] text-luxury-muted">Optional item-specific promotion prices</span></div>'+
      '<input id="sp-product-search" class="w-full border border-luxury-gold/20 bg-luxury-dark rounded-xl px-3 py-2.5 text-xs outline-none text-luxury-text" placeholder="Search by product code or name" value="'+escapeHtml(searchQuery)+'">'+
      '<div id="sp-selected" class="max-h-48 overflow-y-auto space-y-1"></div>'+
      '<div id="sp-product-results" class="max-h-52 overflow-y-auto space-y-1"></div></div>'+
      '<div class="flex flex-wrap gap-2 justify-end"><button type="button" id="sp-cancel-edit" class="px-4 py-2.5 border border-luxury-gold/20 rounded-lg text-xs font-bold text-luxury-muted">Cancel</button>'+
      '<button type="submit" id="sp-save" class="px-5 py-2.5 bg-luxury-gold text-slate-950 rounded-lg text-xs font-bold">Save Campaign</button></div>'+
      '</form></div>';
    ui('sp-product-search')?.addEventListener('input',e=>{searchQuery=e.target.value;renderPicker();});
    ui('sp-cancel-edit')?.addEventListener('click',()=>{editId=null;chosen.clear();renderManager();});
    ui('sp-editor-form')?.addEventListener('submit',saveCampaign);
    renderPicker();
  }
  function field(label,id,value,type,placeholder){
    return '<label class="text-[11px] font-bold text-luxury-muted block">'+escapeHtml(label)+'<input '+(id==='sp-percent'?'':'required ')+'id="'+id+'" type="'+type+'" '+(type==='number'?'min="0" max="100" step="0.01"':'')+
      ' value="'+escapeHtml(value)+'" placeholder="'+escapeHtml(placeholder||'')+'" class="w-full mt-1 border border-luxury-gold/20 bg-luxury-dark rounded-lg px-3 py-2.5 text-xs text-luxury-text outline-none"></label>';
  }
  function renderPicker(){
    const selected=ui('sp-selected');const results=ui('sp-product-results');
    if(!selected||!results)return;
    ui('sp-count').textContent=chosen.size+' selected';
    const known=new Map(rawProducts().filter(p=>p.code&&!p.isSet).map(p=>[codeOf(p.code),p]));
    selected.innerHTML=chosen.size?
      '<div class="text-[10px] uppercase font-bold text-luxury-muted mb-1">Selected products · promo price optional</div>'+
      [...chosen.values()].map(item=>{
        const prod=known.get(item.code);
        return '<div class="flex gap-2 items-center justify-between bg-luxury-accent/40 rounded-lg py-1.5 px-2">'+
        '<div class="min-w-0 flex-1"><div class="text-xs text-luxury-text truncate">'+escapeHtml(item.code)+' · '+escapeHtml(prod?.itemName||'Saved product')+'</div></div>'+
        '<input type="number" min="0" step="0.01" aria-label="Promotional price for '+escapeHtml(item.code)+'" data-sp-price="'+escapeHtml(item.code)+'" value="'+escapeHtml(item.promo_price??'')+'" placeholder="Promo $" class="w-24 shrink-0 bg-luxury-card border border-luxury-gold/20 text-luxury-text text-xs rounded-lg px-2 py-1.5">'+
        '<button type="button" data-sp-remove="'+escapeHtml(item.code)+'" class="text-red-500 text-xs px-1" aria-label="Remove '+escapeHtml(item.code)+'"><i class="fa-solid fa-xmark"></i></button></div>';
      }).join(''):'<div class="text-[10px] text-luxury-muted">No products selected yet.</div>';
    selected.querySelectorAll('[data-sp-price]').forEach(el=>el.addEventListener('change',()=>{
      const v=el.value.trim();
      const item=chosen.get(el.dataset.spPrice);
      if(item)item.promo_price=v===''?null:Number(v);
    }));
    selected.querySelectorAll('[data-sp-remove]').forEach(el=>el.addEventListener('click',()=>{chosen.delete(el.dataset.spRemove);renderPicker();}));
    const term=searchQuery.trim().toLowerCase();
    const candidates=rawProducts().filter(p=>p.code&&!p.isSet&&!chosen.has(codeOf(p.code))&&(
      !term||String(p.code).toLowerCase().includes(term)||String(p.itemName||'').toLowerCase().includes(term)
    )).slice(0,50);
    results.innerHTML='<div class="text-[10px] font-bold uppercase text-luxury-muted mb-1">Add Products'+(term?' · Search matches':' · First 50')+'</div>'+
      (candidates.map(p=>'<button type="button" data-sp-add="'+escapeHtml(p.code)+'" class="text-left w-full px-2 py-2 rounded-md border-b border-luxury-gold/10 text-xs hover:bg-luxury-accent/40 flex gap-2">'+
        '<i class="fa-regular fa-square-plus text-luxury-gold"></i><span class="truncate">'+escapeHtml(p.code)+' · '+escapeHtml(p.itemName)+'</span></button>').join('')||
        '<p class="p-3 text-xs text-luxury-muted">No additional matching products.</p>');
    results.querySelectorAll('[data-sp-add]').forEach(el=>el.addEventListener('click',()=>{
      if(chosen.size>=300){notify('Maximum 300 items per campaign.','error');return;}
      const k=codeOf(el.dataset.spAdd);chosen.set(k,{code:k,promo_price:null});renderPicker();
    }));
  }
  async function saveCampaign(e){
    e.preventDefault();if(!authorized)return;
    const name=ui('sp-title')?.value.trim()||'';
    const badge=ui('sp-badge')?.value.trim()||'SEASONAL OFFER';
    const start=ui('sp-start')?.value||'',end=ui('sp-end')?.value||'';
    const pv=ui('sp-percent')?.value.trim()||'';
    const pct=pv===''?null:Number(pv);
    if(name.length<2||name.length>120||badge.length>40){notify('Enter a campaign name and a badge of at most 40 characters.','error');return;}
    if(!start||!end||end<start){notify('Choose valid start and end dates.','error');return;}
    if(pct!=null&&(!Number.isFinite(pct)||pct<0||pct>100)){notify('Discount must be between 0 and 100%.','error');return;}
    if(!chosen.size){notify('Select at least one product.','error');return;}
    const items=[...chosen.values()].map(item=>({code:codeOf(item.code),promo_price:item.promo_price==null?null:Number(item.promo_price)}));
    if(items.some(i=>i.promo_price!=null&&(!Number.isFinite(i.promo_price)||i.promo_price<0))){
      notify('Promotional prices cannot be negative.','error');return;
    }
    const payload={name,badge,start_date:start,end_date:end,is_enabled:!!ui('sp-enabled')?.checked,discount_percent:pct,items,updated_at:new Date().toISOString()};
    const btn=ui('sp-save');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    const req=editId?client.from(TABLE).update(payload).eq('id',editId).select('id'):client.from(TABLE).insert(payload).select('id');
    const {data,error}=await req;
    if(error||!data?.length){notify('Campaign was not saved: '+(error?.message||'No permission'),'error');if(btn){btn.disabled=false;btn.textContent='Save Campaign';}return;}
    editId=null;chosen.clear();notify('Campaign saved and shared.','success');await refresh();
  }
  function bind(){
    const btn=ui('seasonal-promotions-manage-button');if(btn)btn.addEventListener('click',openManager);
    document.body.insertAdjacentHTML('beforeend',modalHtml());
    ui('sp-close')?.addEventListener('click',closeManager);
    ui('seasonal-promo-modal')?.addEventListener('click',e=>{if(e.target.id==='seasonal-promo-modal')closeManager();});
    if(!client){console.warn('[Seasonal promotions] Shared client unavailable');return;}
    refresh();
    // Refresh at least every five minutes; date changes are checked in Cambodia time.
    ticker=setInterval(()=>{if(Date.now()-lastRefresh>270000)refresh();},300000);
  }
  window.SeasonalPromos={refresh,catalogUpdated:()=>{applyProductPromos();renderBanner();},setManagerMode,
    afterAddToCart,isFeatured, get showingAll(){return showingAll;},openManager};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();
