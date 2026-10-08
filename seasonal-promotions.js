// Shared seasonal campaigns for the public Limperial Showroom.
// Campaigns live in Supabase; authenticated Sales & Order Management users can edit only when their Users & Access permission allows Showroom Management Mode.
// Public visitors can only read currently active campaigns through database RLS.
(function(){
  'use strict';
  const TABLE='showroom_promotion_campaigns';
  const DEFAULT_BG_TABLE='showroom_background_settings';
  const BUCKET='showroom-seasonal-backgrounds';
  const MANAGEMENT_PERMISSION='showroom.management_mode';
  const MAX_BACKGROUND_BYTES=8*1024*1024;
  const MIN_BACKGROUND_WIDTH=1920;
  const MIN_BACKGROUND_HEIGHT=1080;
  const BACKGROUND_TYPES=new Set(['image/jpeg','image/png','image/webp','image/gif']);
  const api=window.APP_CONFIG||{};
  const client=window.supabase?.createClient && api.SUPABASE_URL && api.SUPABASE_PUBLISHABLE_KEY
    ? window.supabase.createClient(api.SUPABASE_URL,api.SUPABASE_PUBLISHABLE_KEY,{
        // Use the default Supabase auth storage so a Sales & Order Management login on the same GitHub Pages origin is reused here.
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
      })
    : null;
  let campaigns=[],authorized=false,editId=null,chosen=new Map(),searchQuery='',showingAll=false;
  let loading=false, managerVisible=false, managerSection='campaigns', lastRefresh=0, ticker=null, editing=false, editVersion=null, loadError='', pendingManagerEnable=false;
  let pendingBackgroundFile=null, pendingBackgroundPreviewUrl='', pendingBackgroundMeta='', removeBackground=false;
  let editorBackgroundPath='', editorBackgroundName='', editorBackgroundUpdatedAt=null;
  let defaultBackground=null;
  let defaultBackgroundFile=null, defaultBackgroundPreviewUrl='', defaultBackgroundMeta='', removeDefaultBackground=false;
  const rules=window.SeasonalCore;
  const themePresets=()=>window.SEASONAL_THEME_PRESETS||{};
  let live=new Map(), liveDay='', activeThemeKey='', resizeTimer=null;
  function featuredMap(){
    if(liveDay!==today()){liveDay=today();live=rules.index(campaigns,liveDay);}
    return live;
  }
  const view=p=>rules.project(p,featuredMap().get(codeOf(p?.code)));
  function storagePublicUrl(path){
    if(!client||!path)return '';
    const {data}=client.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl||'';
  }
  function backgroundForCampaign(c){
    if(!c)return null;
    if(c.custom_background_path){
      const url=storagePublicUrl(c.custom_background_path);
      if(url)return {
        label:c.custom_background_name||'Custom Background',
        backgroundDesktop:url,
        backgroundMobile:url,
        overlay:'rgba(28,20,12,0.08)',
        custom:true
      };
    }
    const preset=themePresets()[c.theme_preset];
    return preset?{...preset,custom:false}:null;
  }
  function backgroundForDefault(){
    if(!defaultBackground?.custom_background_path)return null;
    const url=storagePublicUrl(defaultBackground.custom_background_path);
    if(!url)return null;
    return {
      label:defaultBackground.custom_background_name||'Default Showroom Background',
      backgroundDesktop:url,
      backgroundMobile:url,
      overlay:'rgba(28,20,12,0.08)',
      custom:true,
      isDefault:true
    };
  }
  function themedCampaign(){
    return current().find(c=>c.custom_background_path||(c.theme_preset&&themePresets()[c.theme_preset]))||null;
  }
  function ensureThemeLayer(){
    let layer=ui('seasonal-theme-background');
    if(layer)return layer;
    layer=document.createElement('div');
    layer.id='seasonal-theme-background';
    layer.setAttribute('aria-hidden','true');
    layer.innerHTML='<img id="seasonal-theme-background-image" alt="" decoding="async"><div class="seasonal-theme-overlay"></div>';
    document.body.prepend(layer);
    return layer;
  }
  function applyTheme(){
    const campaign=themedCampaign();
    const campaignPreset=backgroundForCampaign(campaign);
    const preset=campaignPreset||backgroundForDefault();
    const root=document.documentElement,body=document.body;
    if(!root||!body)return;
    const layer=ensureThemeLayer();
    const image=ui('seasonal-theme-background-image');
    if(!preset){
      root.style.removeProperty('--seasonal-overlay');
      body.classList.remove('seasonal-theme-active');
      layer.classList.remove('is-active');
      if(image)image.removeAttribute('src');
      delete body.dataset.seasonalTheme;
      delete body.dataset.seasonalCampaign;
      activeThemeKey='';
      return;
    }
    const mobile=window.innerWidth<768;
    const asset=(mobile&&preset.backgroundMobile)||preset.backgroundDesktop||preset.backgroundMobile;
    if(!asset||!image)return;
    const resolved=String(asset).startsWith('data:')?String(asset):new URL(asset,document.baseURI).href;
    root.style.setProperty('--seasonal-overlay',preset.overlay||'rgba(12,18,24,0.30)');
    if(image.src!==resolved){
      image.onload=()=>layer.classList.add('is-active');
      image.onerror=()=>{layer.classList.remove('is-active');console.warn('[Seasonal promotions] Theme artwork failed to load:',resolved);};
      image.src=resolved;
    }else if(image.complete&&image.naturalWidth){
      layer.classList.add('is-active');
    }
    body.classList.add('seasonal-theme-active');
    if(campaign){
      body.dataset.seasonalTheme=campaign.custom_background_path?'custom':(campaign.theme_preset||'');
      body.dataset.seasonalCampaign=campaign.name||'';
      activeThemeKey=campaign.custom_background_path||campaign.theme_preset||'';
    }else{
      body.dataset.seasonalTheme='default-custom';
      body.dataset.seasonalCampaign='';
      activeThemeKey=defaultBackground?.custom_background_path||'';
    }
  }
  const redraw=()=>{applyTheme();renderBanner();if(typeof executeSearchFilter==='function')executeSearchFilter();};
  const ui=id=>document.getElementById(id);
  const escapeHtml=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const codeOf=v=>String(v||'').trim().toUpperCase();
  const today=()=>rules.today();
  const price=n=>'$'+Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:0});
  const rawProducts=()=>typeof products!=='undefined'&&Array.isArray(products)?products:[];
  const campaignItems=c=>Array.isArray(c.items)?c.items:[];
  const campaignState=c=>rules.state(c);
  const current=()=>rules.active(campaigns);
  function notify(msg,type){if(typeof showNotification==='function')showNotification(msg,type||'info');}
  function isFeatured(product){return !!featuredMap().get(codeOf(product?.code));}
  function cards(){
    const matches=featuredMap();
    return rawProducts().filter(p=>!p.isSet&&matches.has(codeOf(p.code))).map(view);
  }
  function renderBanner(){
    const box=ui('seasonal-promotions-section');
    if(!box)return;
    const list=cards();
    if(!list.length&&!showingAll){box.classList.add('hidden');box.innerHTML='';return;}
    box.classList.remove('hidden');
    const names=[...new Set(current().map(c=>c.name))];
    const featured=showingAll?[]:list.slice(0,8);
    box.innerHTML='<div class="flex flex-wrap justify-between gap-3 items-center mb-3"><div>'+
      '<div class="text-[10px] tracking-[.16em] uppercase font-bold text-luxury-gold"><i class="fa-solid fa-star mr-1"></i> Seasonal Promotion</div>'+
      '<h3 class="font-serif font-semibold text-luxury-text text-lg sm:text-xl">'+escapeHtml(names.join(' · ')||'Seasonal Promotions')+'</h3>'+
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
    box.querySelectorAll('[data-promo-select]').forEach(el=>{
      const selected=typeof cart!=='undefined'&&cart.some(line=>line.type!=='set'&&String(line.item?.id)===el.dataset.promoSelect);
      el.textContent=selected?'Remove from List':'Select';
      el.setAttribute('aria-pressed',String(selected));
      el.addEventListener('click',()=>{toggleCartSelection(el.dataset.promoSelect);renderBanner();});
    });
  }
  function toggleAll(){
    showingAll=!showingAll;
    // Keep the customer's search, category, brand, location and sort selections.
    if(typeof executeSearchFilter==='function')executeSearchFilter();
    renderBanner();
    const target=showingAll?ui('product-grid'):ui('seasonal-promotions-section');
    target?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function refresh(){
    if(!client||loading)return;
    loading=true;
    try{
      const [campaignResult,defaultResult]=await Promise.all([
        client.from(TABLE).select('id,name,badge,start_date,end_date,is_enabled,discount_percent,theme_preset,custom_background_path,custom_background_name,custom_background_updated_at,items,created_at,updated_at').order('start_date',{ascending:false}),
        client.from(DEFAULT_BG_TABLE).select('id,custom_background_path,custom_background_name,custom_background_updated_at,updated_at').eq('id','default').maybeSingle()
      ]);
      if(campaignResult.error)throw campaignResult.error;
      if(defaultResult.error)throw defaultResult.error;
      campaigns=campaignResult.data||[];
      defaultBackground=defaultResult.data||null;
      liveDay='';loadError='';
      lastRefresh=Date.now();
      redraw();
      if(authorized&&!editing)renderManager();
    }catch(e){loadError='The shared promotion service is unavailable. Please retry or contact your administrator.';console.warn('[Seasonal promotions] Load failed',e);if(authorized&&!editing)renderManager();}
    finally{loading=false;}
  }
  function afterAddToCart(id){
    const p=view(rawProducts().find(x=>String(x.id)===String(id)));
    const promo=p?._seasonalCampaign;if(!promo)return;
    const line=typeof cart!=='undefined'&&Array.isArray(cart)?cart.find(c=>c.item?.id===id):null;
    if(!line)return;
    if(promo.actualPromoPrice!=null&&Number.isFinite(promo.actualPromoPrice)){
      line.customPrice=promo.actualPromoPrice;line.discount=0;
    }
  }
  function setManagerMode(on){
    managerVisible=!!on;
    const actions=ui('showroom-management-actions');
    if(actions){
      actions.classList.toggle('hidden',!managerVisible);
      actions.classList.toggle('flex',managerVisible);
    }
    if(!managerVisible){
      closeManager();
      resetBackgroundEditor(null);
      resetDefaultBackgroundDraft();
      editId=null;editing=false;chosen.clear();
    }
  }
  async function checkManagementPermission(){
    if(!client)return false;
    const {data,error}=await client.rpc('current_user_has_permission',{p_permission:MANAGEMENT_PERMISSION});
    return !error&&data===true;
  }
  async function syncManagementControlVisibility(){
    const control=ui('management-mode-control');
    const toggle=ui('manager-toggle');
    if(!control)return false;

    let allowed=false;
    if(client){
      try{
        const {data,error}=await client.auth.getUser();
        if(!error&&data?.user)allowed=await checkManagementPermission();
      }catch(e){
        allowed=false;
      }
    }

    control.classList.toggle('hidden',!allowed);
    control.classList.toggle('flex',allowed);

    if(!allowed){
      const wasActive=!!showCostMode||!!managerVisible;
      showCostMode=false;
      setManagerMode(false);
      authorized=false;
      if(toggle)toggle.checked=false;
      if(wasActive)refreshManagementVisuals();
    }
    return allowed;
  }
  function refreshManagementVisuals(){
    currentBrandFilter='';
    if(typeof handlePartnerToggle==='function'&&!showCostMode)handlePartnerToggle(false);
    if(typeof renderBrandFilters==='function')renderBrandFilters();
    if(typeof renderLocationFilters==='function')renderLocationFilters();
    if(typeof executeSearchFilter==='function')executeSearchFilter();
    if(typeof updateCartVisuals==='function')updateCartVisuals();
    if(typeof renderProductGrid==='function')renderProductGrid();
    if(typeof updateQuotationPreview==='function')updateQuotationPreview();
  }
  function enableManagementMode(){
    showCostMode=true;
    setManagerMode(true);
    const checkbox=ui('manager-toggle');if(checkbox)checkbox.checked=true;
    refreshManagementVisuals();
    notify('Management Mode unlocked for your Sales & Order Management account.','info');
  }
  function disableManagementMode(){
    showCostMode=false;
    setManagerMode(false);
    const checkbox=ui('manager-toggle');if(checkbox)checkbox.checked=false;
    refreshManagementVisuals();
    notify('Management Mode locked.','success');
  }
  async function requestManagementAccess(){
    const checkbox=ui('manager-toggle');if(checkbox)checkbox.checked=false;
    if(!client){notify('Showroom management service is not available.','error');return false;}
    try{
      const existing=await client.auth.getUser();
      if(existing.data?.user&&await checkManagementPermission()){
        authorized=true;
        enableManagementMode();
        return true;
      }
      pendingManagerEnable=true;
      managerSection='access';
      editing=false;editId=null;chosen.clear();
      ui('seasonal-promo-modal')?.classList.remove('hidden');
      updateManagerHeading();
      renderLogin(existing.data?.user?'This signed-in account does not have Showroom Management Mode permission. Sign in with an allowed Sales & Order Management account.':'');
      return false;
    }catch(e){
      notify('Could not verify your Sales & Order Management access.','error');
      return false;
    }
  }
  async function handleManagementToggle(){
    const checkbox=ui('manager-toggle');if(!checkbox)return;
    if(checkbox.checked){
      checkbox.checked=false;
      await requestManagementAccess();
    }else{
      disableManagementMode();
    }
  }
  function modalHtml(){
    return '<div role="dialog" aria-modal="true" aria-label="Showroom Management" id="seasonal-promo-modal" class="hidden fixed inset-0 bg-black/75 backdrop-blur-sm z-[95] p-3 sm:p-6 overflow-y-auto">'+
      '<div class="relative max-w-4xl rounded-2xl border border-luxury-gold/25 bg-luxury-card shadow-2xl mx-auto my-4">'+
      '<div class="flex items-center justify-between border-b border-luxury-gold/15 p-4"><div><div id="sp-modal-title" class="font-serif text-luxury-gold font-bold text-lg">Seasonal Promotions</div><div id="sp-modal-subtitle" class="text-[10px] text-luxury-muted mt-1">Manage seasonal promotion campaigns</div></div>'+
      '<button type="button" id="sp-close" aria-label="Close showroom management" class="p-2 text-luxury-muted hover:text-luxury-gold"><i class="fa-solid fa-xmark"></i></button></div>'+
      '<div class="p-4 sm:p-5 space-y-4" id="seasonal-promo-modal-content"></div></div></div>';
  }
  function updateManagerHeading(){
    const title=ui('sp-modal-title'),subtitle=ui('sp-modal-subtitle');
    if(managerSection==='background'){
      if(title)title.textContent='Showroom Background';
      if(subtitle)subtitle.textContent='Manage the normal background used outside seasonal promotions';
    }else if(managerSection==='access'){
      if(title)title.textContent='Management Mode Access';
      if(subtitle)subtitle.textContent='Authorized through Sales & Order Management Users & Access';
    }else{
      if(title)title.textContent='Seasonal Promotions';
      if(subtitle)subtitle.textContent='Manage promotional campaigns, seasonal themes and campaign backgrounds';
    }
  }
  function closeManager(){
    ui('seasonal-promo-modal')?.classList.add('hidden');
    if(managerSection==='access'){
      pendingManagerEnable=false;
      const toggle=ui('manager-toggle');if(toggle)toggle.checked=showCostMode;
      toggle?.focus();
    }else{
      ui(managerSection==='background'?'showroom-background-manage-button':'seasonal-promotions-manage-button')?.focus();
    }
  }
  async function openManager(section='campaigns'){
    managerSection=section==='background'?'background':'campaigns';
    editing=false;editId=null;chosen.clear();resetBackgroundEditor(null);
    if(!managerVisible){notify('Unlock Management Mode first.','error');return;}
    if(!client){notify('Showroom management service is not available.','error');return;}
    ui('seasonal-promo-modal')?.classList.remove('hidden');
    updateManagerHeading();

    const content=ui('seasonal-promo-modal-content');
    if(content){
      content.innerHTML='<div class="py-12 text-center text-luxury-muted"><i class="fa-solid fa-circle-notch fa-spin text-luxury-gold text-xl"></i><div class="mt-3 text-xs">Checking your Management Mode access…</div></div>';
    }

    try{
      const existing=await client.auth.getUser();
      if(existing.error||!existing.data?.user){
        authorized=false;
        renderLogin();
        return;
      }

      const permitted=await checkManagementPermission();
      if(!permitted){
        authorized=false;
        renderLogin('This account does not have Showroom Management Mode permission. Ask a Super Admin to enable Showroom → Use Management Mode in Users & Access.');
        return;
      }

      // The Management Mode toggle already established the user's access.
      // Re-check silently for security, then open the requested manager directly.
      authorized=false;
      await refresh();
      authorized=true;
      renderManager();
      ui('sp-close')?.focus();
    }catch(e){
      authorized=false;
      renderLogin('Your Sales & Order Management session could not be verified. Please sign in again.');
    }
  }
  function renderLogin(error=''){
    const el=ui('seasonal-promo-modal-content');if(!el)return;
    updateManagerHeading();
    const purpose=managerSection==='access'?'Management Mode':(managerSection==='background'?'showroom background settings':'shared campaign changes');
    el.innerHTML='<div class="max-w-md mx-auto py-4 space-y-3"><h4 class="font-semibold text-luxury-text text-sm">Sign in with your L\'Imperial Sales & Order Management account</h4>'+
      '<p class="text-xs text-luxury-muted">Access to '+purpose+' is controlled by the <b>Showroom → Use Management Mode</b> permission in Users & Access. There is no separate showroom passcode.</p>'+
      (error?'<div class="p-3 rounded-lg bg-red-500/10 text-red-600 text-xs">'+escapeHtml(error)+'</div>':'')+
      '<form id="sp-login" class="space-y-3"><label class="block text-xs text-luxury-muted">Email<input id="sp-email" type="email" autocomplete="username" required class="block mt-1 w-full border border-luxury-gold/20 bg-luxury-dark text-luxury-text rounded-lg p-3"></label>'+
      '<label class="block text-xs text-luxury-muted">Password<input id="sp-password" type="password" autocomplete="current-password" required class="block mt-1 w-full border border-luxury-gold/20 bg-luxury-dark text-luxury-text rounded-lg p-3"></label>'+
      '<button id="sp-sign-in" type="submit" class="w-full bg-luxury-gold text-slate-950 rounded-lg py-3 text-xs font-bold uppercase">Sign In & Continue</button></form></div>';
    ui('sp-login')?.addEventListener('submit',login);
  }
  async function login(event){
    event.preventDefault();
    const btn=ui('sp-sign-in');if(btn)btn.disabled=true;
    try{
      const email=(ui('sp-email')?.value||'').trim();
      const password=ui('sp-password')?.value||'';
      const {error}=await client.auth.signInWithPassword({email,password});
      if(error){
        renderLogin(error.code==='invalid_credentials'?'Incorrect Sales & Order Management email or password.':error.message);
        return;
      }
      if(!(await checkManagementPermission())){
        renderLogin('This account does not have Showroom Management Mode permission. Ask a Super Admin to enable Showroom → Use Management Mode in Users & Access.');
        return;
      }
      const shouldEnable=pendingManagerEnable;
      authorized=false;
      await refresh();
      authorized=true;
      if(shouldEnable){
        pendingManagerEnable=false;
        enableManagementMode();
        closeManager();
        return;
      }
      renderManager();
    }catch(e){renderLogin('Sign-in could not complete. Please try again.');}
  }
  function revokeDefaultBackgroundPreview(){
    if(defaultBackgroundPreviewUrl){URL.revokeObjectURL(defaultBackgroundPreviewUrl);defaultBackgroundPreviewUrl='';}
  }
  function resetDefaultBackgroundDraft(){
    revokeDefaultBackgroundPreview();
    defaultBackgroundFile=null;
    defaultBackgroundMeta='';
    removeDefaultBackground=false;
  }
  function currentDefaultBackgroundPreview(){
    if(defaultBackgroundPreviewUrl)return defaultBackgroundPreviewUrl;
    if(!removeDefaultBackground&&defaultBackground?.custom_background_path)return storagePublicUrl(defaultBackground.custom_background_path);
    return '';
  }
  function defaultBackgroundCard(){
    return '<div class="rounded-xl border border-luxury-gold/25 bg-luxury-accent/20 p-4 space-y-3">'+
      '<div class="flex flex-wrap items-start justify-between gap-3"><div><div class="font-serif text-luxury-gold font-bold text-base">Default Showroom Background</div>'+
      '<div class="text-[10px] text-luxury-muted mt-1">Used whenever no active seasonal campaign has its own background. Seasonal campaign artwork temporarily overrides this image.</div></div>'+
      '<button type="button" id="sp-default-background-remove" class="hidden px-3 py-2 rounded-lg border border-red-400/30 text-red-500 text-[10px] font-bold">Remove Background</button></div>'+
      '<div id="sp-default-background-preview"></div>'+
      '<div class="rounded-lg border border-luxury-gold/15 bg-luxury-card/60 p-3 space-y-2">'+
      '<input id="sp-default-background-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="block w-full text-xs text-luxury-muted file:mr-3 file:rounded-lg file:border-0 file:bg-luxury-gold file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-950 cursor-pointer">'+
      '<div class="text-[10px] text-luxury-muted">Recommended: 2560 × 1440 (16:9). Minimum: 1920 × 1080. JPG, PNG, WebP or animated GIF, maximum 8 MB.</div>'+
      '<div id="sp-default-background-status" class="text-[10px] text-luxury-muted"></div>'+
      '<div class="flex justify-end"><button type="button" id="sp-default-background-save" class="px-4 py-2.5 bg-luxury-gold text-slate-950 rounded-lg text-xs font-bold">Save Default Background</button></div></div></div>';
  }
  function updateDefaultBackgroundUI(){
    const preview=ui('sp-default-background-preview');
    const status=ui('sp-default-background-status');
    const removeBtn=ui('sp-default-background-remove');
    const saveBtn=ui('sp-default-background-save');
    const image=currentDefaultBackgroundPreview();
    if(preview){
      preview.innerHTML=image
        ? '<div class="relative h-32 sm:h-44 overflow-hidden rounded-xl border border-luxury-gold/25 bg-luxury-dark"><img src="'+escapeHtml(image)+'" alt="" class="absolute inset-0 w-full h-full object-cover object-center"><div class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent text-white"><div class="text-[10px] uppercase tracking-widest font-bold">Default Showroom Background</div><div class="text-[9px] opacity-85 mt-0.5">'+escapeHtml(defaultBackgroundFile?.name||defaultBackground?.custom_background_name||'Uploaded background')+'</div></div></div>'
        : '<div class="rounded-xl border border-luxury-gold/10 bg-luxury-dark/30 px-4 py-6 text-center text-[10px] text-luxury-muted">No custom default background. The normal L\'Imperial showroom background will be used when there is no seasonal override.</div>';
    }
    if(status){
      if(defaultBackgroundFile)status.innerHTML='<span class="text-luxury-gold font-semibold">Ready to upload:</span> '+escapeHtml(defaultBackgroundFile.name)+(defaultBackgroundMeta?' · '+escapeHtml(defaultBackgroundMeta):'');
      else if(removeDefaultBackground)status.innerHTML='<span class="text-red-500 font-semibold">Background will be removed when you save.</span>';
      else if(defaultBackground?.custom_background_path)status.innerHTML='<span class="text-luxury-gold font-semibold">Current default image:</span> '+escapeHtml(defaultBackground.custom_background_name||'Uploaded background');
      else status.textContent='No custom default image saved yet.';
    }
    if(removeBtn)removeBtn.classList.toggle('hidden',!image&&!defaultBackground?.custom_background_path);
    if(saveBtn)saveBtn.disabled=!defaultBackgroundFile&&!removeDefaultBackground;
  }
  async function handleDefaultBackgroundFile(event){
    const input=event.currentTarget,file=input?.files?.[0];
    if(!file)return;
    if(!BACKGROUND_TYPES.has(file.type)){
      notify('Use a JPG, PNG, WebP or GIF background image.','error');input.value='';return;
    }
    if(file.size>MAX_BACKGROUND_BYTES){
      notify('Background image is larger than 8 MB. Please export a smaller file.','error');input.value='';return;
    }
    let dims;
    try{dims=await imageDimensions(file);}catch(e){notify('The selected image could not be opened.','error');input.value='';return;}
    if(dims.width<MIN_BACKGROUND_WIDTH||dims.height<MIN_BACKGROUND_HEIGHT){
      notify('Background is '+dims.width+' × '+dims.height+'. Please use at least 1920 × 1080 to avoid pixelation.','error');input.value='';return;
    }
    revokeDefaultBackgroundPreview();
    defaultBackgroundFile=file;
    defaultBackgroundMeta=dims.width+' × '+dims.height+' · '+(file.size/1048576).toFixed(1)+' MB';
    removeDefaultBackground=false;
    defaultBackgroundPreviewUrl=URL.createObjectURL(file);
    updateDefaultBackgroundUI();
  }
  function removeDefaultBackgroundImage(){
    revokeDefaultBackgroundPreview();
    defaultBackgroundFile=null;
    defaultBackgroundMeta='';
    removeDefaultBackground=true;
    const input=ui('sp-default-background-file');if(input)input.value='';
    updateDefaultBackgroundUI();
  }
  async function uploadDefaultBackgroundFile(file){
    const {data:userData,error:userError}=await client.auth.getUser();
    const user=userData?.user;
    if(userError||!user)throw new Error(userError?.message||'Please sign in again before uploading.');
    const token=globalThis.crypto?.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36);
    const path='defaults/'+user.id+'/'+Date.now()+'-showroom-default-'+token+'.'+backgroundExtension(file);
    const {error}=await client.storage.from(BUCKET).upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
    if(error)throw error;
    return path;
  }
  async function saveDefaultBackground(){
    if(!authorized)return;
    if(!defaultBackgroundFile&&!removeDefaultBackground)return;
    const btn=ui('sp-default-background-save');
    if(btn){btn.disabled=true;btn.textContent=defaultBackgroundFile?'Uploading…':'Saving…';}
    const oldPath=defaultBackground?.custom_background_path||'';
    let uploadedPath='';
    try{
      let nextPath=removeDefaultBackground?null:(defaultBackground?.custom_background_path||null);
      let nextName=removeDefaultBackground?null:(defaultBackground?.custom_background_name||null);
      let nextUpdated=removeDefaultBackground?null:(defaultBackground?.custom_background_updated_at||null);
      if(defaultBackgroundFile){
        uploadedPath=await uploadDefaultBackgroundFile(defaultBackgroundFile);
        nextPath=uploadedPath;
        nextName=defaultBackgroundFile.name.slice(0,255);
        nextUpdated=new Date().toISOString();
      }
      const {data:userData}=await client.auth.getUser();
      const payload={
        custom_background_path:nextPath,
        custom_background_name:nextName,
        custom_background_updated_at:nextUpdated,
        updated_at:new Date().toISOString(),
        updated_by:userData?.user?.id||null
      };
      const {data,error}=await client.from(DEFAULT_BG_TABLE).update(payload).eq('id','default').select('id,custom_background_path,custom_background_name,custom_background_updated_at,updated_at').single();
      if(error)throw error;
      defaultBackground=data||{id:'default',...payload};
      if(oldPath&&oldPath!==nextPath)await deleteBackgroundFile(oldPath);
      resetDefaultBackgroundDraft();
      applyTheme();
      updateDefaultBackgroundUI();
      notify(nextPath?'Default showroom background saved.':'Default showroom background removed.','success');
    }catch(error){
      if(uploadedPath)await deleteBackgroundFile(uploadedPath);
      notify('Default background was not saved: '+(error?.message||'Unknown error.'),'error');
      updateDefaultBackgroundUI();
    }finally{
      if(btn){btn.textContent='Save Default Background';btn.disabled=!defaultBackgroundFile&&!removeDefaultBackground;}
    }
  }

  function campaignRow(c){
    const status=campaignState(c);
    const theme=themePresets()[c.theme_preset];
    const backgroundLabel=c.custom_background_path?' · Custom background':(theme?' · Theme: '+escapeHtml(theme.label):'');
    return '<div class="flex flex-wrap justify-between items-center gap-3 rounded-xl border border-luxury-gold/20 bg-luxury-dark/50 px-3 py-3">'+
      '<div><div class="text-sm font-semibold text-luxury-text">'+escapeHtml(c.name)+' <span class="ml-1 text-[10px] px-2 py-1 bg-luxury-accent rounded text-luxury-muted">'+escapeHtml(status)+'</span></div>'+
      '<div class="mt-1 text-[10px] text-luxury-muted">'+escapeHtml(c.start_date)+' to '+escapeHtml(c.end_date)+' · '+campaignItems(c).length+' items'+(c.discount_percent?' · '+Number(c.discount_percent)+'% off':'')+backgroundLabel+'</div></div>'+
      '<div class="flex gap-2"><button type="button" data-sp-edit="'+escapeHtml(c.id)+'" class="text-xs rounded-lg border border-luxury-gold/20 p-2 text-luxury-gold">Edit</button>'+
      '<button type="button" data-sp-toggle="'+escapeHtml(c.id)+'" class="text-xs rounded-lg border border-luxury-gold/20 p-2 text-luxury-muted">'+(c.is_enabled?'Disable':'Enable')+'</button></div></div>';
  }
  function renderManager(){
    if(!authorized)return;
    const el=ui('seasonal-promo-modal-content');if(!el)return;
    updateManagerHeading();
    const errorHtml=loadError?'<div role="alert" class="p-3 text-sm text-red-600">'+escapeHtml(loadError)+' <button type="button" id="sp-retry" class="underline">Retry</button></div>':'';
    if(managerSection==='background'){
      el.innerHTML=errorHtml+
        '<div class="flex justify-between items-center"><div><div class="text-sm font-semibold text-luxury-text">Normal Showroom Appearance</div><div class="text-[10px] text-luxury-muted mt-1">This background is used whenever no seasonal campaign overrides it.</div></div>'+
        '<button id="sp-logout" class="px-3 py-2 border border-luxury-gold/20 rounded-lg text-xs text-luxury-muted">Sign Out</button></div>'+
        defaultBackgroundCard();
      ui('sp-retry')?.addEventListener('click',refresh);
      ui('sp-default-background-file')?.addEventListener('change',handleDefaultBackgroundFile);
      ui('sp-default-background-remove')?.addEventListener('click',removeDefaultBackgroundImage);
      ui('sp-default-background-save')?.addEventListener('click',saveDefaultBackground);
      updateDefaultBackgroundUI();
    }else{
      el.innerHTML=errorHtml+
        '<div class="flex justify-between items-center"><span class="text-xs text-luxury-muted">'+campaigns.length+' campaigns (including history)</span>'+
        '<div class="flex gap-2"><button id="sp-create" class="px-3 py-2 bg-luxury-gold text-slate-950 rounded-lg text-xs font-bold"><i class="fa-solid fa-plus mr-1"></i>New Campaign</button>'+
        '<button id="sp-logout" class="px-3 py-2 border border-luxury-gold/20 rounded-lg text-xs text-luxury-muted">Sign Out</button></div></div>'+
        '<div class="space-y-2 max-h-64 overflow-y-auto">'+(campaigns.length?campaigns.map(campaignRow).join(''):'<p class="text-xs text-luxury-muted text-center p-8">No seasonal promotions yet. Create the first campaign.</p>')+'</div>'+
        '<div id="sp-editor"></div>';
      ui('sp-create')?.addEventListener('click',()=>editCampaign(null));
      ui('sp-retry')?.addEventListener('click',refresh);
      el.querySelectorAll('[data-sp-edit]').forEach(x=>x.addEventListener('click',()=>editCampaign(campaigns.find(c=>c.id===x.dataset.spEdit))));
      el.querySelectorAll('[data-sp-toggle]').forEach(x=>x.addEventListener('click',()=>toggleCampaign(x.dataset.spToggle)));
      if(editing&&editId){const currentCampaign=campaigns.find(c=>c.id===editId);if(currentCampaign)drawEditor(currentCampaign);}
    }
    ui('sp-logout')?.addEventListener('click',async()=>{resetBackgroundEditor(null);resetDefaultBackgroundDraft();authorized=false;editing=false;editId=null;chosen.clear();await client.auth.signOut();campaigns=campaigns.filter(c=>campaignState(c)==='Active');liveDay='';renderLogin();refresh();});
  }
  async function toggleCampaign(id){
    if(!authorized)return;
    const existing=campaigns.find(x=>x.id===id);if(!existing)return;
    let result;
    try{result=await client.from(TABLE).update({is_enabled:!existing.is_enabled,updated_at:new Date().toISOString()}).eq('id',id).eq('updated_at',existing.updated_at).select('id');}
    catch(e){result={error:e};}
    if(result.error||!result.data?.length){notify('Could not update campaign: '+(result.error?.message||'Campaign changed on another device. Reopen it before editing.'),'error');return;}
    notify('Campaign '+(!existing.is_enabled?'enabled':'disabled')+'.','success');
    await refresh();
  }
  function revokeBackgroundPreview(){
    if(pendingBackgroundPreviewUrl){URL.revokeObjectURL(pendingBackgroundPreviewUrl);pendingBackgroundPreviewUrl='';}
  }
  function resetBackgroundEditor(c){
    revokeBackgroundPreview();
    pendingBackgroundFile=null;
    pendingBackgroundMeta='';
    removeBackground=false;
    editorBackgroundPath=c?.custom_background_path||'';
    editorBackgroundName=c?.custom_background_name||'';
    editorBackgroundUpdatedAt=c?.custom_background_updated_at||null;
  }
  function editCampaign(c){
    editing=true;editVersion=c?.updated_at||null;editId=c?.id||null;chosen=new Map(campaignItems(c||{}).map(item=>[codeOf(item.code),{code:codeOf(item.code),promo_price:item.promo_price??null}]));
    resetBackgroundEditor(c||null);
    if(!c&&typeof cart!=='undefined'){cart.filter(line=>line.type!=='set'&&line.item?.code).slice(0,300).forEach(line=>{const key=codeOf(line.item.code);chosen.set(key,{code:key,promo_price:null});});}
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
      '<label class="flex gap-2 items-center text-sm text-luxury-text"><input type="checkbox" id="sp-enabled" '+(c&&!c.is_enabled?'':'checked')+'> Enabled / Published</label>'+
      themeSelect(c?.theme_preset||'')+
      backgroundUploadControl()+'</div>'+
      '<p class="text-xs text-luxury-muted">Dates include the full day in Cambodia time. A blank discount and blank item prices only feature products. Item prices override the campaign discount; discounts do not stack. Existing quotes keep their selected prices. Selected Interest List products are included in new campaigns.</p>'+
      '<p class="text-[10px] text-luxury-muted">The selected seasonal background appears only while this campaign is active. If multiple themed campaigns overlap, the active campaign with the latest start date controls the showroom background.</p>'+
      '<div class="rounded-xl border border-luxury-gold/15 p-3 space-y-3">'+
      '<div class="flex flex-wrap justify-between items-end gap-2"><label class="text-xs font-bold text-luxury-text">Select Products <span id="sp-count" class="text-luxury-gold"></span></label><span class="text-[10px] text-luxury-muted">Optional item-specific promotion prices</span></div>'+
      '<input id="sp-product-search" class="w-full border border-luxury-gold/20 bg-luxury-dark rounded-xl px-3 py-2.5 text-xs outline-none text-luxury-text" placeholder="Search by product code or name" value="'+escapeHtml(searchQuery)+'">'+
      '<div id="sp-selected" class="max-h-48 overflow-y-auto space-y-1"></div>'+
      '<div id="sp-product-results" class="max-h-52 overflow-y-auto space-y-1"></div></div>'+
      '<div class="flex flex-wrap gap-2 justify-end"><button type="button" id="sp-cancel-edit" class="px-4 py-2.5 border border-luxury-gold/20 rounded-lg text-xs font-bold text-luxury-muted">Cancel</button>'+
      '<button type="submit" id="sp-save" class="px-5 py-2.5 bg-luxury-gold text-slate-950 rounded-lg text-xs font-bold">Save Campaign</button></div>'+
      '</form></div>';
    ui('sp-product-search')?.addEventListener('input',e=>{searchQuery=e.target.value;renderPicker();});
    ui('sp-theme')?.addEventListener('change',renderThemePreview);
    ui('sp-background-file')?.addEventListener('change',handleBackgroundFile);
    ui('sp-background-remove')?.addEventListener('click',removeCustomBackground);
    renderBackgroundStatus();
    renderThemePreview();
    ui('sp-cancel-edit')?.addEventListener('click',()=>{resetBackgroundEditor(null);editId=null;editing=false;chosen.clear();renderManager();});
    ui('sp-editor-form')?.addEventListener('submit',saveCampaign);
    renderPicker();
  }
  function themeSelect(selected){
    const options=Object.entries(themePresets()).map(([key,p])=>'<option value="'+escapeHtml(key)+'" '+(key===selected?'selected':'')+'>'+escapeHtml(p.label)+'</option>').join('');
    return '<label class="text-[11px] font-bold text-luxury-muted block sm:col-span-2">Seasonal Theme'+
      '<select id="sp-theme" class="w-full mt-1 border border-luxury-gold/20 bg-luxury-dark rounded-lg px-3 py-2.5 text-xs text-luxury-text outline-none">'+
      '<option value="">Default L\'Imperial background</option>'+options+'</select><div id="sp-theme-preview" class="mt-2"></div></label>';
  }
  function backgroundUploadControl(){
    return '<div class="sm:col-span-2 rounded-xl border border-luxury-gold/20 bg-luxury-accent/20 p-3 space-y-2">'+
      '<div class="flex flex-wrap items-center justify-between gap-2"><div><div class="text-[11px] font-bold text-luxury-text">Custom Background Upload</div>'+
      '<div class="text-[10px] text-luxury-muted mt-0.5">Overrides the selected built-in theme for this campaign.</div></div>'+
      '<button type="button" id="sp-background-remove" class="hidden px-3 py-1.5 rounded-lg border border-red-400/30 text-red-500 text-[10px] font-bold">Remove Custom Image</button></div>'+
      '<input id="sp-background-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="block w-full text-xs text-luxury-muted file:mr-3 file:rounded-lg file:border-0 file:bg-luxury-gold file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-950 cursor-pointer">'+
      '<div class="text-[10px] text-luxury-muted">Recommended: 2560 × 1440 (16:9). Minimum: 1920 × 1080. JPG, PNG, WebP or animated GIF, maximum 8 MB.</div>'+
      '<div id="sp-background-status" class="text-[10px] text-luxury-muted"></div></div>';
  }
  function currentCustomPreview(){
    if(pendingBackgroundPreviewUrl)return pendingBackgroundPreviewUrl;
    if(!removeBackground&&editorBackgroundPath)return storagePublicUrl(editorBackgroundPath);
    return '';
  }
  function renderBackgroundStatus(){
    const status=ui('sp-background-status'),removeBtn=ui('sp-background-remove');
    if(!status)return;
    const hasCustom=!!currentCustomPreview();
    if(pendingBackgroundFile){
      status.innerHTML='<span class="text-luxury-gold font-semibold">Ready to upload:</span> '+escapeHtml(pendingBackgroundFile.name)+(pendingBackgroundMeta?' · '+escapeHtml(pendingBackgroundMeta):'');
    }else if(!removeBackground&&editorBackgroundPath){
      status.innerHTML='<span class="text-luxury-gold font-semibold">Current custom image:</span> '+escapeHtml(editorBackgroundName||'Uploaded seasonal background');
    }else{
      status.textContent='No custom background selected. The built-in theme will be used.';
    }
    if(removeBtn)removeBtn.classList.toggle('hidden',!hasCustom);
  }
  function imageDimensions(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),img=new Image();
      img.onload=()=>{const dims={width:img.naturalWidth,height:img.naturalHeight};URL.revokeObjectURL(url);resolve(dims);};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Image could not be read.'));};
      img.src=url;
    });
  }
  async function handleBackgroundFile(event){
    const input=event.currentTarget,file=input?.files?.[0];
    if(!file)return;
    if(!BACKGROUND_TYPES.has(file.type)){
      notify('Use a JPG, PNG, WebP or GIF background image.','error');input.value='';return;
    }
    if(file.size>MAX_BACKGROUND_BYTES){
      notify('Background image is larger than 8 MB. Please export a smaller file.','error');input.value='';return;
    }
    let dims;
    try{dims=await imageDimensions(file);}catch(e){notify('The selected image could not be opened.','error');input.value='';return;}
    if(dims.width<MIN_BACKGROUND_WIDTH||dims.height<MIN_BACKGROUND_HEIGHT){
      notify('Background is '+dims.width+' × '+dims.height+'. Please use at least 1920 × 1080 to avoid pixelation.','error');input.value='';return;
    }
    revokeBackgroundPreview();
    pendingBackgroundFile=file;
    pendingBackgroundMeta=dims.width+' × '+dims.height+' · '+(file.size/1048576).toFixed(1)+' MB';
    removeBackground=false;
    pendingBackgroundPreviewUrl=URL.createObjectURL(file);
    renderBackgroundStatus();
    renderThemePreview();
  }
  function removeCustomBackground(){
    revokeBackgroundPreview();
    pendingBackgroundFile=null;pendingBackgroundMeta='';removeBackground=true;
    const input=ui('sp-background-file');if(input)input.value='';
    renderBackgroundStatus();renderThemePreview();
  }
  function renderThemePreview(){
    const wrap=ui('sp-theme-preview');if(!wrap)return;
    const custom=currentCustomPreview();
    if(custom){
      const label=pendingBackgroundFile?pendingBackgroundFile.name:(editorBackgroundName||'Custom Background');
      wrap.innerHTML='<div class="relative h-32 sm:h-44 overflow-hidden rounded-xl border border-luxury-gold/25 bg-luxury-dark">'+
        '<img src="'+escapeHtml(custom)+'" alt="" class="absolute inset-0 w-full h-full object-cover object-center">'+
        '<div class="absolute inset-0 bg-black/5"></div>'+
        '<div class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent text-white"><div class="text-[10px] uppercase tracking-widest font-bold">Custom Background</div><div class="text-[9px] opacity-85 mt-0.5">'+escapeHtml(label)+' · overrides built-in theme</div></div></div>';
      return;
    }
    const key=ui('sp-theme')?.value||'',preset=themePresets()[key];
    if(!preset){wrap.innerHTML='<div class="rounded-xl border border-luxury-gold/10 bg-luxury-accent/25 px-3 py-3 text-[10px] text-luxury-muted">No seasonal artwork. The normal showroom background will remain.</div>';return;}
    const image=preset.backgroundDesktop||preset.backgroundMobile||'';
    wrap.innerHTML='<div class="relative h-32 sm:h-44 overflow-hidden rounded-xl border border-luxury-gold/20 bg-luxury-dark">'+
      '<img src="'+escapeHtml(image)+'" alt="" class="absolute inset-0 w-full h-full object-cover object-center">'+
      '<div class="absolute inset-0" style="background:'+escapeHtml(preset.overlay||'rgba(12,18,24,.30)')+'"></div>'+
      '<div class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/65 to-transparent text-white"><div class="text-[10px] uppercase tracking-widest font-bold">'+escapeHtml(preset.label)+'</div><div class="text-[9px] opacity-80 mt-0.5">Built-in theme preview · upload a custom image above to override it</div></div></div>';
  }
  function field(label,id,value,type,placeholder){
    return '<label class="text-[11px] font-bold text-luxury-muted block">'+escapeHtml(label)+'<input '+(id==='sp-percent'||id==='sp-badge'?'':'required ')+'id="'+id+'" type="'+type+'" '+(type==='number'?'min="0" max="100" step="0.01"':'')+
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
  function backgroundExtension(file){
    if(file?.type==='image/png')return 'png';
    if(file?.type==='image/webp')return 'webp';
    if(file?.type==='image/gif')return 'gif';
    return 'jpg';
  }
  function safePathPart(value){
    return String(value||'campaign').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'campaign';
  }
  async function uploadBackgroundFile(file,campaignName){
    const {data:userData,error:userError}=await client.auth.getUser();
    const user=userData?.user;
    if(userError||!user)throw new Error(userError?.message||'Please sign in again before uploading.');
    const token=globalThis.crypto?.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36);
    const path='campaigns/'+user.id+'/'+Date.now()+'-'+safePathPart(campaignName)+'-'+token+'.'+backgroundExtension(file);
    const {error}=await client.storage.from(BUCKET).upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
    if(error)throw error;
    return path;
  }
  async function deleteBackgroundFile(path){
    if(!path)return;
    const {error}=await client.storage.from(BUCKET).remove([path]);
    if(error)console.warn('[Seasonal promotions] Old background cleanup failed',error);
  }
  async function saveCampaign(e){
    e.preventDefault();if(!authorized)return;
    const name=ui('sp-title')?.value.trim()||'';
    const badge=ui('sp-badge')?.value.trim()||'SEASONAL OFFER';
    const start=ui('sp-start')?.value||'',end=ui('sp-end')?.value||'';
    const pv=ui('sp-percent')?.value.trim()||'';
    const pct=pv===''?null:Number(pv);
    const theme=ui('sp-theme')?.value||null;
    if(name.length<2||name.length>120||badge.length>40){notify('Enter a campaign name and a badge of at most 40 characters.','error');return;}
    if(!start||!end||end<start){notify('Choose valid start and end dates.','error');return;}
    if(pct!=null&&(!Number.isFinite(pct)||pct<0||pct>100)){notify('Discount must be between 0 and 100%.','error');return;}
    if(!chosen.size){notify('Select at least one product.','error');return;}
    const items=[...chosen.values()].map(item=>({code:codeOf(item.code),promo_price:item.promo_price==null?null:Number(item.promo_price)}));
    if(items.some(i=>i.promo_price!=null&&(!Number.isFinite(i.promo_price)||i.promo_price<0))){
      notify('Promotional prices cannot be negative.','error');return;
    }
    const basePayload={name,badge,start_date:start,end_date:end,is_enabled:!!ui('sp-enabled')?.checked,discount_percent:pct,theme_preset:theme,items,updated_at:new Date().toISOString()};
    const validation=rules.validate(basePayload,rawProducts());if(validation){notify(validation,'error');return;}

    const btn=ui('sp-save');if(btn){btn.disabled=true;btn.textContent=pendingBackgroundFile?'Uploading background…':'Saving…';}
    const oldPath=editorBackgroundPath||'';
    let uploadedPath='',nextPath=removeBackground?null:(editorBackgroundPath||null);
    let nextName=removeBackground?null:(editorBackgroundName||null);
    let nextUpdated=removeBackground?null:editorBackgroundUpdatedAt;

    try{
      if(pendingBackgroundFile){
        uploadedPath=await uploadBackgroundFile(pendingBackgroundFile,name);
        nextPath=uploadedPath;
        nextName=pendingBackgroundFile.name.slice(0,255);
        nextUpdated=new Date().toISOString();
        if(btn)btn.textContent='Saving campaign…';
      }

      const payload={
        ...basePayload,
        custom_background_path:nextPath,
        custom_background_name:nextName,
        custom_background_updated_at:nextUpdated
      };
      const req=editId
        ?client.from(TABLE).update(payload).eq('id',editId).eq('updated_at',editVersion).select('id')
        :client.from(TABLE).insert(payload).select('id');
      const {data,error}=await req;
      if(error||!data?.length)throw error||new Error('Campaign changed on another device or access was denied. Cancel and reopen it to load the latest version.');

      if(oldPath&&oldPath!==nextPath)await deleteBackgroundFile(oldPath);
      revokeBackgroundPreview();
      pendingBackgroundFile=null;pendingBackgroundMeta='';removeBackground=false;
      editorBackgroundPath='';editorBackgroundName='';editorBackgroundUpdatedAt=null;
      editId=null;editing=false;chosen.clear();
      notify(nextPath?'Campaign saved with custom background.':'Campaign saved and shared.','success');
      await refresh();
    }catch(error){
      if(uploadedPath)await deleteBackgroundFile(uploadedPath);
      notify('Campaign was not saved: '+(error?.message||'Unknown error.'),'error');
      if(btn){btn.disabled=false;btn.textContent='Save Campaign';}
    }
  }
  function bind(){
    const promoBtn=ui('seasonal-promotions-manage-button');
    const backgroundBtn=ui('showroom-background-manage-button');
    if(promoBtn)promoBtn.addEventListener('click',()=>openManager('campaigns'));
    if(backgroundBtn)backgroundBtn.addEventListener('click',()=>openManager('background'));
    document.body.insertAdjacentHTML('beforeend',modalHtml());
    ui('sp-close')?.addEventListener('click',closeManager);
    ui('seasonal-promo-modal')?.addEventListener('click',e=>{if(e.target.id==='seasonal-promo-modal')closeManager();});
    if(!client){console.warn('[Seasonal promotions] Shared client unavailable');return;}
    refresh();
    syncManagementControlVisibility();
    client.auth.onAuthStateChange(()=>{setTimeout(syncManagementControlVisibility,0);});
    // Refresh at least every five minutes; date changes are checked in Cambodia time.
    ticker=setInterval(()=>{if(liveDay!==today())redraw();if(Date.now()-lastRefresh>270000)refresh();},60000);
    window.addEventListener('online',()=>{refresh();syncManagementControlVisibility();});
    window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(applyTheme,120);});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){redraw();refresh();syncManagementControlVisibility();}});
    document.addEventListener('keydown',e=>{
      const modal=ui('seasonal-promo-modal');if(!modal||modal.classList.contains('hidden'))return;
      if(e.key==='Escape')closeManager();
      if(e.key==='Tab'){
        const controls=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(el=>el.getClientRects().length);
        const first=controls[0],last=controls[controls.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    });
  }
  window.SeasonalPromos={refresh,catalogUpdated:renderBanner,view,reset:()=>{showingAll=false;renderBanner();},setManagerMode,
    afterAddToCart,isFeatured, get showingAll(){return showingAll;},openManager,
    openBackgroundManager:()=>openManager('background'),handleManagementToggle,requestManagementAccess,checkManagementPermission,syncManagementControlVisibility};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();
