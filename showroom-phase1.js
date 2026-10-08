/* Limperial Showroom — Phase 1 quality-of-life features.
   Drafts and preferences stay on this device. Saved quotations and their
   numbering continue through the existing Google Sheets/Sales workflow. */
(function(){
  'use strict';
  const core=window.ShowroomPhase1Core;
  if(!core)return;
  const DRAFT_KEY='limperial_showroom_drafts_v1';
  const FAVORITES_KEY='limperial_showroom_favorites_v1';
  const RECENT_KEY='limperial_showroom_recent_v1';
  const MAX_DRAFTS=8;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeJson=(value,otherwise)=>{try{return JSON.parse(value)}catch(_){return otherwise}};
  const safeRead=(key,otherwise)=>{try{return safeJson(localStorage.getItem(key),otherwise)}catch(_){return otherwise}};
  const safeWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e){console.warn('[Showroom] Local draft storage unavailable:',e);return false}};
  const clone=value=>JSON.parse(JSON.stringify(value));
  let favorites=new Set((Array.isArray(safeRead(FAVORITES_KEY,[]))?safeRead(FAVORITES_KEY,[]):[]).map(String));
  let recent=(Array.isArray(safeRead(RECENT_KEY,[]))?safeRead(RECENT_KEY,[]):[]).map(String);
  let comparison=[];
  let ready=false,dirty=false,suppress=false,saveTimer=null,liveDraftId='',backupWarningShown=false,modal=null,restoreShown=false;
  const quoteField=key=>String($(key)?.value||'').trim();
  const money=core.money;
  const ownProduct=id=>Array.isArray(products)?products.find(p=>String(p.id)===String(id)):null;
  const decorateProduct=source=>window.SeasonalPromos?.view(source)||source;
  const displayProduct=id=>{const x=ownProduct(id);return x?decorateProduct(x):null};
  const getSelected=()=>Array.isArray(cart)?cart:[];
  // Prune expired snapshots whenever drafts are read, written or restored.
  // "savedAt" is refreshed by autosave, so retention follows last activity.
  const draftList=()=>{
    const raw=safeRead(DRAFT_KEY,[]);
    const fresh=core.freshDrafts(raw).slice(0,MAX_DRAFTS);
    if(!Array.isArray(raw)||raw.length!==fresh.length)safeWrite(DRAFT_KEY,fresh);
    return fresh;
  };
  const putDrafts=items=>safeWrite(DRAFT_KEY,core.freshDrafts(items).slice(0,MAX_DRAFTS));
  const stamp=()=>new Date().toISOString();
  const labelTime=time=>{const d=new Date(time);return Number.isNaN(d.getTime())?'Unknown time':d.toLocaleString([], {dateStyle:'medium',timeStyle:'short'});};
  const describeDraft=d=>{
    const data=d.data||{}, f=data.documentFormStates?.quotation?.fields||{};
    const name=f['quote-customer-input']?.value || (data.activeQuotationNo?'Quotation '+data.activeQuotationNo:'New quotation');
    return name+' · '+(data.cart?.length||0)+' item(s) · '+labelTime(d.savedAt);
  };
  function snapshot(){
    try{captureDocumentFormState(documentType)}catch(e){console.warn('[Showroom] Could not snapshot form',e)}
    const state=clone({
      cart:getSelected(),discountPctValue,discountFlatValue,partnerCommType,partnerCommValue,hasPartner,
      documentType,documentFormStates,
      showPreOrderOnDoc,
      activeQuotationId:activeSavedQuotationId,activeQuotationName:activeSavedQuotationName,
      activeQuotationNo:activeSavedQuotationNo,activeQuotationRevision:activeSavedQuotationRevision,
      viewedQuotationRevision:activeViewedQuotationRevision
    });
    const f=state.documentFormStates?.quotation?.fields||{};
    const meaningful=['quote-customer-input','quote-sales-input','quote-tel-input','quote-address-input']
      .some(k=>String(f[k]?.value||'').trim());
    return state.cart.length||meaningful?state:null;
  }
  function updateDraftBadge(){
    const pill=$('showroom-draft-status');
    if(!pill)return;
    const all=draftList();
    if(dirty){pill.textContent='Unsaved edits · autosaving';pill.dataset.status='unsaved';}
    else if(all.length){pill.textContent=all.length+' recoverable draft'+(all.length===1?'':'s');pill.dataset.status='available';}
    else{pill.textContent='Draft protection · 7 days';pill.dataset.status='idle';}
  }
  function persistDraft(){
    if(!ready||suppress||!dirty)return;
    clearTimeout(saveTimer); saveTimer=null;
    let data;
    try{data=snapshot()}catch(e){console.warn('[Showroom] Snapshot error',e);return;}
    if(!data){ // Clearing an empty unsaved cart should not resurrect it.
      const remaining=draftList().filter(d=>d.id!==liveDraftId);
      putDrafts(remaining);dirty=false;liveDraftId='';updateDraftBadge();return;
    }
    if(!liveDraftId)liveDraftId='draft-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
    const entries=draftList().filter(d=>d.id!==liveDraftId);
    entries.unshift({id:liveDraftId,version:1,savedAt:stamp(),data});
    if(putDrafts(entries)){
      dirty=false;
      updateDraftBadge();
    }else if(!backupWarningShown){
      backupWarningShown=true;
      showNotification('This device could not store the draft. Please save the quotation manually.', 'error');
    }
  }
  function scheduleDraft(){
    if(!ready||suppress)return;
    dirty=true;
    clearTimeout(saveTimer);
    saveTimer=setTimeout(persistDraft,750);
    updateDraftBadge();
  }
  function flushDraft(){if(saveTimer)clearTimeout(saveTimer);persistDraft();}
  function savedSuccessfully(){
    clearTimeout(saveTimer);
    dirty=false;
    if(liveDraftId){
      putDrafts(draftList().filter(d=>d.id!==liveDraftId));
      liveDraftId='';
    }
    updateDraftBadge();
  }
  function willLoadSaved(){
    flushDraft();
    // Other drafts remain recoverable if the user switches to a saved quote.
    dirty=false;liveDraftId='';
    updateDraftBadge();
  }
  function loadedSaved(){suppress=false;dirty=false;updateDraftBadge();}
  function dismissModal(){
    modal?.remove();modal=null;
  }
  function panel(title,subtitle=''){
    dismissModal();
    const wrap=document.createElement('div');
    wrap.id='showroom-phase1-modal';
    wrap.className='sp1-backdrop';
    wrap.setAttribute('role','dialog');
    wrap.setAttribute('aria-modal','true');
    wrap.setAttribute('aria-label',title);
    const section=document.createElement('section');
    section.className='sp1-panel';
    section.innerHTML='<header class="sp1-panel-head"><div class="sp1-panel-heading"><strong>'+esc(title)+'</strong><p>'+esc(subtitle)+'</p></div><button type="button" class="sp1-icon-button" data-sp1-close aria-label="Close">✕</button></header><div class="sp1-panel-body"></div>';
    wrap.append(section);
    section.querySelector('[data-sp1-close]').addEventListener('click',dismissModal);
    let pressedBackdrop=false;
    wrap.addEventListener('pointerdown',e=>pressedBackdrop=e.target===wrap);
    wrap.addEventListener('pointerup',e=>{if(pressedBackdrop&&e.target===wrap)dismissModal();pressedBackdrop=false;});
    document.body.append(wrap);modal=wrap;
    return section.querySelector('.sp1-panel-body');
  }
  function confirmation(label,onClick,alt=''){
    const row=document.createElement('div');row.className='sp1-actions';
    const btn=document.createElement('button');btn.className='sp1-primary';btn.type='button';btn.textContent=label;
    btn.addEventListener('click',onClick);row.append(btn);
    if(alt){const secondary=document.createElement('button');secondary.type='button';secondary.className='sp1-secondary';secondary.textContent=alt;secondary.onclick=dismissModal;row.append(secondary)}
    return row;
  }
  function manageDrafts(){
    // Always capture pending edits before opening the draft manager.
    flushDraft();
    restoreShown=false;
    offerRecovery(true);
  }
  function confirmDraftRemoval(id=null){
    const drafts=draftList();
    if(!drafts.length){offerRecoveryAgain();return;}
    const targetDraft=id===null?null:drafts.find(d=>d.id===id);
    if(id!==null&&!targetDraft){offerRecoveryAgain();return;}
    const all=id===null;
    const target=panel(all?'Clear all drafts?':'Discard this draft?',
      'This deletes only unsaved recovery drafts stored on this device.');
    const message=document.createElement('p');
    message.className='sp1-hint';
    message.textContent=all
      ? 'Permanently remove all '+drafts.length+' recoverable drafts from this device? This cannot be undone. Your current open work remains visible, but any deleted backup will no longer be recoverable.'
      : 'Permanently discard "'+describeDraft(targetDraft)+'"? This cannot be undone.';
    target.append(message);
    const actions=confirmation(all?'Yes, Clear All Drafts':'Yes, Discard Draft',()=>{
      const current=draftList();
      const keep=all?[]:current.filter(d=>d.id!==id);
      if(!putDrafts(keep)){
        showNotification('Draft removal failed. Please check browser storage and try again.','error');
        return;
      }
      if(all||id===liveDraftId){
        if(saveTimer)clearTimeout(saveTimer);
        saveTimer=null;liveDraftId='';dirty=false;
      }
      updateDraftBadge();
      showNotification(all?'All unsaved drafts cleared from this device.':'Unsaved draft discarded.','success');
      offerRecoveryAgain();
    },'Cancel');
    actions.querySelector('.sp1-primary')?.classList.add('sp1-danger');
    const cancel=actions.querySelector('.sp1-secondary');
    if(cancel)cancel.onclick=offerRecoveryAgain;
    target.append(actions);
  }
  function offerRecovery(force=false){
    if((restoreShown&&!force)||!ready)return;
    const drafts=draftList();
    if(!drafts.length&&!force)return;
    restoreShown=true;
    const target=panel('Draft Management',drafts.length
      ? 'Restore an unsaved draft or permanently discard it.'
      : 'There are currently no recoverable drafts on this device.');
    const intro=document.createElement('p');
    intro.className='sp1-hint';
    intro.textContent='Unsaved drafts are stored only on this device and automatically expire after 7 days without edits. Officially saved quotations and all revision history are not affected.';
    target.append(intro);
    if(!drafts.length){
      const empty=document.createElement('p');empty.className='sp1-hint';
      empty.textContent='No unsaved drafts available.';
      target.append(empty);
    }
    drafts.forEach(d=>{
      const row=document.createElement('div');row.className='sp1-row';
      const meta=document.createElement('div');meta.className='sp1-row-main';
      const strong=document.createElement('strong');strong.textContent=describeDraft(d);
      const foot=document.createElement('small');foot.textContent=d.data?.activeQuotationNo?'Previously editing '+d.data.activeQuotationNo:'Unsubmitted customer interest list';
      meta.append(strong,foot);
      const restore=document.createElement('button');restore.type='button';restore.className='sp1-primary';restore.textContent='Restore';
      restore.onclick=()=>restoreDraft(d.id);
      const discard=document.createElement('button');discard.type='button';discard.className='sp1-secondary';discard.textContent='Discard';
      discard.onclick=()=>confirmDraftRemoval(d.id);
      row.append(meta,restore,discard);target.append(row);
    });
    const controls=document.createElement('div');
    controls.className='sp1-actions';
    const clear=document.createElement('button');clear.type='button';
    clear.className='sp1-secondary sp1-danger-outline';clear.textContent='Clear All Drafts';
    clear.disabled=!drafts.length;
    clear.onclick=()=>confirmDraftRemoval(null);
    const close=document.createElement('button');close.type='button';
    close.className='sp1-primary';close.textContent='Close';
    close.onclick=dismissModal;
    controls.append(clear,close);target.append(controls);
  }
  function offerRecoveryAgain(){restoreShown=false;offerRecovery(true);}
  function restoreDraft(id){
    const d=draftList().find(d=>d.id===id);
    if(!d)return showNotification('This draft is no longer available.', 'error');
    flushDraft();
    const data=d.data||{};
    suppress=true;
    try {
      cart=clone(Array.isArray(data.cart)?data.cart:[]);
      discountPctValue=Number(data.discountPctValue)||0;
      discountFlatValue=Number(data.discountFlatValue)||0;
      partnerCommType=data.partnerCommType==='flat'?'flat':'pct';
      partnerCommValue=Number(data.partnerCommValue)||0;
      hasPartner=!!data.hasPartner;
      documentFormStates=clone(data.documentFormStates||{});
      ['quotation','sales_order','inventory','delivery_order'].forEach(type=>{
        if(!documentFormStates[type])documentFormStates[type]={initialized:false};
      });
      activeSavedQuotationId=String(data.activeQuotationId||'');
      activeSavedQuotationName=String(data.activeQuotationName||'');
      activeSavedQuotationNo=String(data.activeQuotationNo||'');
      activeSavedQuotationRevision=Math.max(0,Number(data.activeQuotationRevision)||0);
      activeViewedQuotationRevision=Number.isInteger(Number(data.viewedQuotationRevision))&&data.viewedQuotationRevision!==null?Number(data.viewedQuotationRevision):null;
      showPreOrderOnDoc=data.showPreOrderOnDoc!==false;
      isRestoringSavedDocumentState=true;
      try{setDocType(data.documentType||'quotation')}finally{isRestoringSavedDocumentState=false}
      [['discount-pct',discountPctValue],['discount-flat',discountFlatValue],
       ['mobile-discount-pct',discountPctValue],['mobile-discount-flat',discountFlatValue]]
       .forEach(([id,n])=>{const node=$(id);if(node)node.value=n||''});
      [['partner-toggle',hasPartner],['mobile-partner-toggle',hasPartner]]
       .forEach(([id,checked])=>{const node=$(id);if(node)node.checked=checked});
      renderQuoteItemsNotesForm();
      restoreDocumentFormState(documentType);
      if(documentType==='quotation')syncQuotationTypeFromNumber();
      updateCartVisuals();
      renderProductGrid();
      updateQuotationNumberHelp();
      updateQuotationPreview();
      liveDraftId=d.id;dirty=false;
      dismissModal();updateDraftBadge();
      showNotification('Unsaved work restored. Review the details before saving.', 'success');
    }catch(e){console.error('[Showroom] Draft restore failed',e);showNotification('Could not restore this draft. The backup remains stored.','error');}
    finally{suppress=false;}
  }
  function recordViewed(id){
    const k=String(id||'');if(!k)return;
    recent=[k,...recent.filter(x=>x!==k)].slice(0,24);
    safeWrite(RECENT_KEY,recent);
    updateToolbar();
  }
  function favorite(id){
    const k=String(id);
    if(favorites.has(k))favorites.delete(k);else favorites.add(k);
    safeWrite(FAVORITES_KEY,[...favorites]);
    updateToolbar();
    try{renderProductGrid()}catch(_){}
  }
  function compareToggle(id){
    const k=String(id);
    if(comparison.includes(k))comparison=comparison.filter(x=>x!==k);
    else if(comparison.length<3)comparison.push(k);
    else{showNotification('You can compare up to 3 products at once.', 'info');return;}
    updateToolbar();
    try{renderProductGrid()}catch(_){}
  }
  function decorateProductCard(card,item){
    if(!card||!item?.id||card.dataset.sp1Enhanced)return;
    card.dataset.sp1Enhanced='true';
    const group=card.querySelector('.select-btn')?.parentElement;
    if(!group)return;
    const id=String(item.id);
    const build=(label,icon,handler,active)=>{
      const b=document.createElement('button');b.type='button';
      b.className='sp1-card-button'+(active?' is-active':'');
      b.title=label;b.setAttribute('aria-label',label);
      b.innerHTML='<i class="fa-solid '+icon+'"></i>';
      b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();handler(id);});
      group.prepend(b);
    };
    // Prepend compare first, then favorite, yielding Favorite • Compare • Select.
    build(comparison.includes(id)?'Remove from comparison':'Compare product','fa-code-compare',compareToggle,comparison.includes(id));
    build(favorites.has(id)?'Remove favorite':'Save favorite','fa-heart',favorite,favorites.has(id));
  }
  function imgSrc(image){
    const raw=String(image||'').trim();if(!raw)return '';
    const value=typeof resolveGoogleDriveImg==='function'?resolveGoogleDriveImg(raw):raw;
    if(/^https:\/\//i.test(value)||/^data:image\/(png|jpeg|webp|gif);base64,/i.test(value)||/^blob:/i.test(value))return value;
    return '';
  }
  function imageNode(src,alt,fallback=''){
    const wrap=document.createElement('div');wrap.className='sp1-product-image';
    const url=imgSrc(src);
    const alternate=imgSrc(fallback);
    const first=url||alternate;
    if(first){
      const img=document.createElement('img');
      img.alt=alt||'';
      img.loading='lazy';
      img.onerror=()=>{
        if(alternate&&img.src!==alternate){img.src=alternate;return;}
        img.remove();wrap.textContent='No photo';
      };
      img.src=first;
      wrap.append(img);
    }else wrap.textContent='No photo';
    return wrap;
  }
  function openCollection(which){
    const ids=(which==='favorites'?[...favorites]:recent).filter(id=>!!displayProduct(id));
    const target=panel(which==='favorites'?'Favorite products':'Recently viewed','Open a product or add it to the interest list.');
    if(!ids.length){target.innerHTML='<p class="sp1-hint">Nothing saved here yet. Open a product or tap its heart to get started.</p>';return;}
    ids.forEach(id=>{
      const item=displayProduct(id),row=document.createElement('div');row.className='sp1-row';
      row.append(imageNode(item.imgLink,item.itemName||''));
      const info=document.createElement('div');info.className='sp1-row-main';
      const strong=document.createElement('strong');strong.textContent=item.itemName||item.code||'Product';
      const small=document.createElement('small');small.textContent=(item.code||'')+' · '+money(item.price||0);
      info.append(strong,small);row.append(info);
      const view=document.createElement('button');view.className='sp1-secondary';view.type='button';view.textContent='View';view.onclick=()=>{dismissModal();openProductDetailModal(id);};
      const add=document.createElement('button');add.className='sp1-primary';add.type='button';add.textContent='Select';add.onclick=()=>{toggleCartSelection(id);dismissModal();};
      row.append(view,add);target.append(row);
    });
  }
  function openCompare(){
    const ids=comparison.filter(id=>!!displayProduct(id));
    if(ids.length<2){showNotification('Select at least two products to compare.','info');return;}
    const body=panel('Compare products','Compare up to three products before adding them to the quotation.');
    const grid=document.createElement('div');grid.className='sp1-product-comparison';
    ids.forEach(id=>{
      const item=displayProduct(id),col=document.createElement('article');col.className='sp1-product-column';
      col.append(imageNode(item.imgLink,item.itemName));
      const title=document.createElement('strong');title.textContent=item.itemName||'Product';col.append(title);
      const desc=document.createElement('p');desc.textContent=item.description||'No description';col.append(desc);
      const details=document.createElement('dl');
      [['Code',item.code||'—'],['Price',money(item.price||0)],['Availability',Number(item.qty)>0?String(item.qty)+' in stock':'Out of stock'],['Location',item.location||'—'],['Category',item.class||'—']].forEach(([k,v])=>{
        const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=v;details.append(dt,dd);
      });
      col.append(details);
      const btn=document.createElement('button');btn.className='sp1-primary';btn.type='button';btn.textContent='Select product';btn.onclick=()=>toggleCartSelection(id);
      col.append(btn);grid.append(col);
    });
    body.append(grid);
  }
  function presentation(){
    if(!getSelected().length){showNotification('Select products first to start customer presentation.','info');return;}
    const target=panel('Customer Presentation','Customer-facing view — internal costing and margin information are hidden.');
    modal.classList.add('sp1-presentation');
    const items=getSelected().map((c,i)=>core.presentationLine(c,i));
    const title=document.createElement('div');title.className='sp1-presentation-top';
    title.innerHTML='<span>L’IMPERIAL <small>HOME & LUXURY</small></span><strong>Selected Collection</strong>';
    target.append(title);
    const gallery=document.createElement('div');gallery.className='sp1-presentation-grid';
    items.forEach(item=>{
      const card=document.createElement('article');card.className='sp1-presentation-card';
      card.append(imageNode(item.photo,item.title,item.fallbackPhoto));
      const info=document.createElement('div');info.className='sp1-presentation-info';
      const name=document.createElement('h3');name.textContent=item.title;
      const description=document.createElement('p');description.textContent=item.description||item.code;
      const tag=document.createElement('div');tag.className='sp1-presentation-meta';
      tag.textContent=item.code+' · Qty '+item.quantity+(item.stock!==null?(item.stock>0?' · Available':' · Check availability'):'');
      const bottom=document.createElement('div');bottom.className='sp1-presentation-price';
      bottom.textContent=money(item.net)+(item.discount>0?' · '+item.discount+'% item discount':'');
      info.append(name,description,tag,bottom);card.append(info);gallery.append(card);
    });
    target.append(gallery);
    const note=document.createElement('p');note.className='sp1-hint';
    note.textContent='Displayed prices reflect selected item pricing before any overall quotation discount. Confirm the final amount in the quotation.';
    target.append(note);
  }
  function compareRevisions(revision){
    const before=savedQuotationVersionOptions?.get(Number(revision));
    if(!before)return showNotification('This revision is not available.','error');
    const all=[...savedQuotationVersionOptions.entries()].sort((a,b)=>a[0]-b[0]);
    const latest=all.at(-1);
    if(!latest||Number(latest[0])===Number(revision))return;
    const from=before.snapshot?.state||{},to=latest[1].snapshot?.state||{};
    const result=core.compare(from,to);
    const body=panel('Quotation changes','Rev '+revision+' → '+(latest[0]===0?'Original':'Rev '+latest[0])+' · read-only comparison');
    const totals=document.createElement('div');totals.className='sp1-diff-totals';
    totals.innerHTML='<div><small>Earlier estimated total</small><strong>'+money(result.oldTotal)+'</strong></div><span>→</span><div><small>Latest estimated total</small><strong>'+money(result.newTotal)+'</strong></div>';
    body.append(totals);
    if(result.discountChanged){
      const diff=document.createElement('p');diff.className='sp1-hint';
      diff.textContent='Overall discounts: '+result.oldPct+'% + '+money(result.oldFlat)+' → '+result.newPct+'% + '+money(result.newFlat);
      body.append(diff);
    }
    if(!result.changes.length&&!result.discountChanged){
      const p=document.createElement('p');p.className='sp1-hint';p.textContent='No changes to products, quantities, item prices, or discounts were detected.';body.append(p);
    }
    result.changes.forEach(change=>{
      const row=document.createElement('article');row.className='sp1-diff-row sp1-diff-'+change.kind;
      const flag=document.createElement('span');flag.className='sp1-diff-flag';flag.textContent=change.kind.toUpperCase();
      const content=document.createElement('div');content.className='sp1-row-main';
      const title=document.createElement('strong');title.textContent=(change.newLine||change.oldLine).title;
      const foot=document.createElement('small');
      const short=x=>x?('Qty '+x.quantity+' · '+money(x.unitPrice)+' / unit · '+x.discount+'% discount'):'—';
      foot.textContent=short(change.oldLine)+' → '+short(change.newLine);
      content.append(title,foot);
      if(change.fields){const fields=document.createElement('small');fields.textContent='Changed: '+change.fields.join(', ');content.append(fields);}
      row.append(flag,content);body.append(row);
    });
    const disclaimer=document.createElement('p');disclaimer.className='sp1-hint';
    disclaimer.textContent='Estimates reflect item and overall discounts; final payable amounts may also include special quote settings.';
    body.append(disclaimer);
  }
  function updateToolbar(){
    const fav=$('showroom-favorites-btn'),rec=$('showroom-recent-btn'),cmp=$('showroom-compare-btn');
    if(fav)fav.textContent='♡ Favorites ('+favorites.size+')';
    if(rec)rec.textContent='↺ Recent ('+recent.length+')';
    if(cmp){cmp.textContent='⇄ Compare ('+comparison.length+'/3)';cmp.disabled=comparison.length<2}
    updateDraftBadge();
  }
  function buildToolbar(){
    const controls=$('catalog-controls-panel');
    if(!controls||$('showroom-phase1-tools'))return;
    const toolbar=document.createElement('div');
    toolbar.id='showroom-phase1-tools';toolbar.className='sp1-toolbar';
    toolbar.innerHTML='<div class="sp1-toolbar-group"><button id="showroom-favorites-btn" type="button" class="sp1-tool-btn"></button><button id="showroom-recent-btn" type="button" class="sp1-tool-btn"></button><button id="showroom-compare-btn" type="button" class="sp1-tool-btn"></button></div><div class="sp1-toolbar-group"><button id="showroom-present-btn" type="button" class="sp1-tool-btn sp1-tool-feature">▣ Present</button><button id="showroom-recovery-btn" type="button" class="sp1-tool-btn">↶ Recover drafts</button><span id="showroom-draft-status" class="sp1-draft-status">Draft protection on</span></div>';
    controls.append(toolbar);
    $('showroom-favorites-btn').onclick=()=>openCollection('favorites');
    $('showroom-recent-btn').onclick=()=>openCollection('recent');
    $('showroom-compare-btn').onclick=openCompare;
    $('showroom-present-btn').onclick=presentation;
    $('showroom-recovery-btn').onclick=manageDrafts;
    updateToolbar();
  }
  function changedByInput(e){
    const target=e.target;
    if(!target?.closest)return;
    if(target.closest('#share-modal, #desktop-cart-items, #mobile-cart-items')||
       ['discount-pct','discount-flat','mobile-discount-pct','mobile-discount-flat','partner-toggle','mobile-partner-toggle'].includes(target.id))scheduleDraft();
  }
  function init(){
    buildToolbar();
    ready=true;
    document.addEventListener('input',changedByInput,true);
    document.addEventListener('change',changedByInput,true);
    window.addEventListener('pagehide',flushDraft);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)flushDraft();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal){e.preventDefault();dismissModal();}});
    // On boot, no empty initial state is written over the previous draft.
    setTimeout(offerRecovery,1100);
  }
  window.ShowroomPhase1=Object.freeze({
    init,scheduleDraft,savedSuccessfully,willLoadSaved,loadedSaved,
    decorateProductCard,recordViewed,compareRevisions,
    showPresentation:presentation,showDraftRecovery:manageDrafts
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();