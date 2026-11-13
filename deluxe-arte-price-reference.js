/* Deluxe Arte Price Reference — photo-first, read-only.
   Separate from official catalog, stock, reservations, quotation and cart.
   Only USD selling prices from the curated retail snapshot are rendered.
   Product imagery is sourced from the owner's publicly shared Deluxe Arte gallery. */
(function (root) {
  'use strict';
  const doc = root.document;
  const DATA_URL = './assets/price-reference/deluxe-arte.json';
  const PHOTOS_URL = './assets/price-reference/deluxe-arte-photo-map.json';
  const GALLERY_URL = 'https://drive.google.com/drive/folders/1dfSR3XctDBuP6c2jwcOwwHg5pbq_hDZ2';
  const PAGE_SIZE = 24;
  const id = name => doc && doc.getElementById(name);
  const state = {
    items: [], photos: null, open: false, loading: null, error: '',
    query: '', collection: '', order: 'source', view: 'gallery',
    photoFilter: false, visible: PAGE_SIZE, lastFocus: null, zoomId: '',
    photoUnavailable: false
  };
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  function normalizeRecord(raw) {
    if (!raw || typeof raw !== 'object' || !/^DA-REF-\d{3,}$/.test(String(raw.id || ''))) return null;
    if (!Number.isFinite(raw.priceUsd) || raw.priceUsd <= 0 || !String(raw.name || '').trim()) return null;
    return {
      id: String(raw.id), name: String(raw.name).trim().slice(0,180),
      dimensions: String(raw.dimensions || '').trim().slice(0,240),
      collection: String(raw.collection || 'Other').trim().slice(0,90),
      priceUsd: Number(raw.priceUsd), designVariant: String(raw.designVariant || '').trim().slice(0,50)
    };
  }
  function validateSnapshot(payload) {
    if (!payload || payload.kind !== 'reference_only' || payload.brand !== 'Deluxe Arte' ||
        payload.currency !== 'USD' || !Array.isArray(payload.items)) {
      throw new Error('The selling-price reference is not in the approved format.');
    }
    const items = payload.items.map(normalizeRecord);
    if (!items.length || items.some(x => !x) || new Set(items.map(x => x.id)).size !== items.length)
      throw new Error('Invalid or repeated Deluxe Arte reference items.');
    return items;
  }
  function validatePhotoMap(payload) {
    if (!payload || payload.kind !== 'deluxe_arte_public_gallery' ||
      typeof payload.files !== 'object' || !payload.files ||
      typeof payload.collections !== 'object' || !payload.collections ||
      typeof payload.items !== 'object' || !payload.items) {
      throw new Error('Photo gallery mapping is invalid.');
    }
    const files = {};
    for (const [name, rawId] of Object.entries(payload.files)) {
      if (!/^Slide\d+$/.test(name) || !/^[a-zA-Z0-9_-]{20,70}$/.test(String(rawId)))
        throw new Error('Invalid gallery photo reference.');
      files[name] = String(rawId);
    }
    const collection = {};
    const products = {};
    for (const [name, key] of Object.entries(payload.collections)) {
      if (files[key]) collection[name] = key;
    }
    for (const [name, key] of Object.entries(payload.items)) {
      if (files[key]) products[name] = key;
    }
    return {files, collection, products};
  }
  function price(value) {
    return new Intl.NumberFormat('en-US', {
      style:'currency', currency:'USD', maximumFractionDigits:2
    }).format(value);
  }
  function resolvePhoto(item, photoMap) {
    if (!item || !photoMap) return null;
    // Duplicated name + dimensions = a different design: only show its collection
    // as a labelled example until a verified per-variant image is mapped.
    const exact = !item.designVariant && photoMap.products[item.name];
    const key = exact || photoMap.collection[item.collection];
    const fileId = key && photoMap.files[key];
    if (!fileId || !/^[a-zA-Z0-9_-]{20,70}$/.test(fileId)) return null;
    return {
      url:'https://drive.google.com/thumbnail?id='+fileId+'&sz=w1200',
      kind:exact?'product':'collection',
      label:exact?'Product example':'Collection photo',
      slide:key
    };
  }
  function filterItems(items, query, collection, order) {
    const words = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const result = items.filter(item => {
      if (collection && item.collection !== collection) return false;
      const searchable = [item.name,item.dimensions,item.collection,item.id,item.designVariant].join(' ').toLowerCase();
      return words.every(w => searchable.includes(w));
    });
    if (order === 'priceAsc') return result.sort((a,b)=>a.priceUsd-b.priceUsd || a.id.localeCompare(b.id));
    if (order === 'priceDesc') return result.sort((a,b)=>b.priceUsd-a.priceUsd || a.id.localeCompare(b.id));
    if (order === 'name') return result.sort((a,b)=>a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return result;
  }
  function results() {
    const found = filterItems(state.items,state.query,state.collection,state.order);
    return state.photoFilter ? found.filter(x=>resolvePhoto(x,state.photos)?.kind==='product') : found;
  }
  function counts() {
    return state.items.reduce((acc,x)=>{
      acc.set(x.collection,(acc.get(x.collection)||0)+1);return acc;
    },new Map());
  }
  async function load() {
    if (state.items.length) return;
    if (state.loading) return state.loading;
    state.error = '';
    state.loading = (async()=>{
      const [reference,photos] = await Promise.allSettled([
        fetch(DATA_URL,{cache:'no-cache',credentials:'same-origin'}).then(async r=>{
          if (!r.ok) throw new Error('Could not open the reference price list ('+r.status+').');
          return validateSnapshot(await r.json());
        }),
        fetch(PHOTOS_URL,{cache:'no-cache',credentials:'same-origin'}).then(async r=>{
          if (!r.ok) throw new Error('Photo catalog not found');
          return validatePhotoMap(await r.json());
        })
      ]);
      if(reference.status!=='fulfilled') throw reference.reason;
      state.items=reference.value;
      if(photos.status==='fulfilled')state.photos=photos.value;
      else {state.photoUnavailable=true;state.photos=null;}
    })();
    try{await state.loading;}
    catch(e){state.error=e&&e.message || 'Could not load reference prices';}
    finally{state.loading=null;}
  }
  function renderCollections() {
    const node=id('da-ref-collections');if(!node)return;
    node.replaceChildren();
    const make=(label,name,count)=>{
      const button=doc.createElement('button');
      button.type='button';
      button.className='da-ref-chip'+(state.collection===name?' is-active':'');
      button.dataset.collection=name;
      button.setAttribute('aria-pressed',String(state.collection===name));
      button.textContent=label+' · '+count;
      node.appendChild(button);
    };
    make('All','',state.items.length);
    for(const [name,count] of counts())make(name.replace(' Collection','').replace(' Set',''),name,count);
  }
  function updateSelectionControls() {
    const select=id('da-ref-collection');
    if(select){
      select.replaceChildren();
      const all=doc.createElement('option');all.value='';all.textContent='All collections';select.appendChild(all);
      for(const [name,count] of counts()){
        const opt=doc.createElement('option');opt.value=name;opt.textContent=name+' ('+count+')';select.appendChild(opt);
      }
      select.value=state.collection;
    }
  }
  function imageMarkup(item,photo) {
    const label=photo?.kind==='product'?'Product example':'Collection photo';
    const hint=photo?'Photo guide · not a price source':'Photo not available';
    return '<button type="button" class="da-ref-photo'+(photo?'':' is-missing')+'" aria-label="View photo reference for '+escapeHtml(item.name)+'">'+
      (photo?'<img class="da-ref-photo-img" src="'+escapeHtml(photo.url)+'" alt="'+escapeHtml(label+' for '+item.name)+'" loading="lazy" referrerpolicy="no-referrer" decoding="async">':'')+
      '<div class="da-ref-photo-empty"><i class="fa-regular fa-image"></i><span>Photo unavailable</span></div>'+
      (photo?'<span class="da-ref-photo-tag">'+escapeHtml(label)+'</span>':'')+
      '<span class="da-ref-photo-hint">'+escapeHtml(hint)+'</span>'+
      '</button>';
  }
  function itemCard(item) {
    const photo=resolvePhoto(item,state.photos);
    const el=doc.createElement('article');
    el.className='da-ref-card';
    el.dataset.referenceId=item.id;
    el.innerHTML=
      imageMarkup(item,photo)+
      '<div class="da-ref-card-body">'+
        '<div class="da-ref-collection-label">'+escapeHtml(item.collection)+'</div>'+
        '<div class="da-ref-card-row"><h3 class="da-ref-card-name">'+escapeHtml(item.name)+'</h3>'+
          '<div class="da-ref-card-price"><strong class="da-price-ref-price">'+escapeHtml(price(item.priceUsd))+'</strong>'+
            '<span class="da-price-ref-price-hidden">Hidden</span></div></div>'+
        '<p class="da-ref-card-size">'+escapeHtml(item.dimensions || 'Dimensions not specified')+'</p>'+
        '<div class="da-ref-card-footer">'+
          (item.designVariant?'<span class="da-ref-variant">'+escapeHtml(item.designVariant)+' · Different design</span>':'')+
          '<span class="da-ref-ref">'+escapeHtml(item.id)+'</span>'+
        '</div>'+
      '</div>';
    const img=el.querySelector('.da-ref-photo-img');
    if(img){
      img.addEventListener('error',()=>{
        const photoBox=img.closest('.da-ref-photo');
        if(photoBox)photoBox.classList.add('is-missing');
      },{once:true});
    }
    return el;
  }
  function closePreview(){
    state.zoomId='';
    const panel=id('da-ref-preview');
    if(panel)panel.hidden=true;
    id('da-ref-close')?.focus();
  }
  function openPreview(itemId){
    const item=state.items.find(x=>x.id===itemId);
    if(!item)return;
    const photo=resolvePhoto(item,state.photos);
    if(!photo)return;
    const panel=id('da-ref-preview');
    if(!panel)return;
    state.zoomId=item.id;
    panel.hidden=false;
    const box=id('da-ref-preview-content');
    if(!box)return;
    box.innerHTML=
      '<div class="da-ref-preview-stage"><img src="'+escapeHtml(photo.url)+'" alt="'+escapeHtml('Reference photo of '+item.name)+'">'+
        '<span class="da-ref-photo-tag">'+escapeHtml(photo.label)+'</span></div>'+
      '<div class="da-ref-preview-info">'+
        '<span class="da-ref-collection-label">'+escapeHtml(item.collection)+'</span>'+
        '<h3>'+escapeHtml(item.name)+'</h3>'+
        '<p>'+escapeHtml(item.dimensions||'Dimensions not specified')+'</p>'+
        (item.designVariant?'<p class="da-ref-preview-variant">'+escapeHtml(item.designVariant)+' · Confirm the exact design</p>':'')+
        '<div class="da-ref-preview-price"><b class="da-price-ref-price">'+escapeHtml(price(item.priceUsd))+'</b>'+
        '<span class="da-price-ref-price-hidden">Price hidden</span><small>USD · Reference only · '+escapeHtml(item.id)+'</small></div>'+
        '<p class="da-ref-preview-disclaimer">'+(photo.kind==='collection'?
        'This is a collection photo, not a confirmed image of this individual item. Confirm the design before offering it to a customer.':
        'This is a product catalog example. Finishes and design variations should be verified before ordering.')+'</p>'+
      '</div>';
    id('da-ref-preview-close')?.focus();
  }
  function render() {
    if(!state.open)return;
    const list=id('da-ref-results'),msg=id('da-ref-message'),more=id('da-ref-more');
    if(!list||!msg||!more)return;
    list.replaceChildren();
    list.className='da-ref-grid'+(state.view==='list'?' as-list':'');
    const filtered=results();
    const count=id('da-ref-count');
    if(count)count.textContent=filtered.length+' items'+(state.photoFilter?' with matched product photos':'');
    const allCount=id('da-ref-total');
    if(allCount)allCount.textContent=state.items.length+' price references';
    id('da-ref-clear-search')?.classList.toggle('is-hidden',!state.query);
    id('da-ref-view-gallery')?.setAttribute('aria-pressed',String(state.view==='gallery'));
    id('da-ref-view-list')?.setAttribute('aria-pressed',String(state.view==='list'));
    const photosOnly=id('da-ref-exact-only');
    if(photosOnly)photosOnly.checked=state.photoFilter;
    if(state.error){
      msg.hidden=false;msg.textContent=state.error;more.hidden=true;return;
    }
    if(state.loading&&!state.items.length){
      msg.hidden=false;msg.textContent='Loading Deluxe Arte prices and photos…';more.hidden=true;return;
    }
    if(!filtered.length){
      msg.hidden=false;msg.textContent=state.items.length?'No matching items. Clear the search or choose another collection.':'The price list is empty.';
      more.hidden=true;return;
    }
    msg.hidden=true;
    const fragment=doc.createDocumentFragment();
    filtered.slice(0,state.visible).forEach(item=>fragment.appendChild(itemCard(item)));
    list.appendChild(fragment);
    const remaining=filtered.length-state.visible;
    more.hidden=remaining<=0;
    if(!more.hidden) more.textContent='Show '+Math.min(remaining,PAGE_SIZE)+' more items · '+remaining+' remaining';
  }
  function frame() {
    if(!doc)return null;
    if(id('da-ref-overlay'))return id('da-ref-overlay');
    const overlay=doc.createElement('div');
    overlay.id='da-ref-overlay';
    overlay.hidden=true;
    overlay.className='da-ref-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-labelledby','da-ref-title');
    overlay.innerHTML=
      '<div class="da-ref-panel">'+
        '<header class="da-ref-header">'+
          '<div class="da-ref-heading"><span class="da-ref-kicker"><i class="fa-solid fa-gem"></i> GENERAL PRICE REFERENCE</span>'+
            '<h2 id="da-ref-title">Deluxe Arte</h2>'+
            '<p>Browse selling prices with photos · Separate from Stock & quotations</p></div>'+
          '<button id="da-ref-close" type="button" class="da-ref-close" aria-label="Close price reference"><i class="fa-solid fa-xmark"></i></button>'+
        '</header>'+
        '<div class="da-ref-toolbar">'+
          '<div class="da-ref-search-box"><i class="fa-solid fa-magnifying-glass"></i>'+
            '<input id="da-ref-search" type="search" aria-label="Search Deluxe Arte products" placeholder="Search product name, size or reference code…" autocomplete="off">'+
            '<button id="da-ref-clear-search" type="button" class="da-ref-clear is-hidden" aria-label="Clear search"><i class="fa-solid fa-xmark"></i></button></div>'+
          '<label class="da-ref-field"><span>Collection</span><select id="da-ref-collection" aria-label="Filter collection"><option value="">All collections</option></select></label>'+
          '<label class="da-ref-field"><span>Sort</span><select id="da-ref-sort" aria-label="Sort prices">'+
            '<option value="source">Collection / original order</option><option value="name">Product name</option>'+
            '<option value="priceAsc">Price: Low to high</option><option value="priceDesc">Price: High to low</option>'+
          '</select></label>'+
        '</div>'+
        '<div id="da-ref-collections" class="da-ref-collections" aria-label="Browse collections"></div>'+
        '<div class="da-ref-results-bar">'+
          '<div><strong id="da-ref-count">Loading prices…</strong><span class="da-ref-count-muted" id="da-ref-total"></span></div>'+
          '<div class="da-ref-results-options"><label class="da-ref-photo-filter"><input id="da-ref-exact-only" type="checkbox"> Matched product photos</label>'+
            '<div class="da-ref-view-switch" role="group" aria-label="Display layout">'+
              '<button id="da-ref-view-gallery" type="button" aria-pressed="true" title="Photo gallery" aria-label="Photo gallery"><i class="fa-solid fa-grip"></i> <span>Photos</span></button>'+
              '<button id="da-ref-view-list" type="button" aria-pressed="false" title="Compact list" aria-label="Compact list"><i class="fa-solid fa-list"></i> <span>List</span></button>'+
            '</div></div></div>'+
        '<div class="da-ref-scroll"><div id="da-ref-message" class="da-ref-message">Loading…</div><div id="da-ref-results" class="da-ref-grid"></div>'+
        '<button id="da-ref-more" class="da-ref-more" type="button" hidden>Load more</button></div>'+
        '<div id="da-ref-preview" class="da-ref-preview" hidden role="region" aria-label="Enlarged Deluxe Arte photo">'+
          '<div class="da-ref-preview-dialog"><button type="button" id="da-ref-preview-close" class="da-ref-preview-close" aria-label="Close photo preview"><i class="fa-solid fa-xmark"></i></button>'+
           '<div id="da-ref-preview-content" class="da-ref-preview-content"></div></div></div>'+
        '<footer class="da-ref-bottom"><span><i class="fa-solid fa-circle-info"></i> Photos are references from the Deluxe Arte catalog. A "Collection photo" may show another item or design. Only the USD price displayed here is used.</span>'+
          '<span class="da-ref-bottom-secondary">Not in Stock · No automatic quotation changes</span></footer>'+
      '</div>';
    overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)close();});
    overlay.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();if(state.zoomId)closePreview();else close();return;}
      if(e.key!=='Tab')return;
      const selectors='button:not([hidden]),input,select';
      const controls=Array.from(overlay.querySelectorAll(selectors)).filter(el=>el.offsetParent!==null && !el.disabled);
      if(!controls.length)return;
      if(e.shiftKey&&doc.activeElement===controls[0]){e.preventDefault();controls[controls.length-1].focus();}
      else if(!e.shiftKey&&doc.activeElement===controls[controls.length-1]){e.preventDefault();controls[0].focus();}
    });
    doc.body.appendChild(overlay);
    id('da-ref-close').addEventListener('click',close);
    id('da-ref-preview-close').addEventListener('click',closePreview);
    id('da-ref-preview').addEventListener('pointerdown',e=>{
      if(e.target===id('da-ref-preview'))closePreview();
    });
    id('da-ref-results').addEventListener('click',e=>{
      const photo=e.target.closest('.da-ref-photo');
      if(!photo)return;
      const itemId=photo.closest('[data-reference-id]')?.dataset.referenceId;
      if(itemId)openPreview(itemId);
    });
    id('da-ref-search').addEventListener('input',e=>{state.query=e.target.value.trim().toLowerCase();state.visible=PAGE_SIZE;render();});
    id('da-ref-clear-search').addEventListener('click',()=>{
      state.query='';id('da-ref-search').value='';id('da-ref-search').focus();state.visible=PAGE_SIZE;render();
    });
    id('da-ref-collection').addEventListener('change',e=>{state.collection=e.target.value;state.visible=PAGE_SIZE;renderCollections();render();});
    id('da-ref-sort').addEventListener('change',e=>{state.order=e.target.value;state.visible=PAGE_SIZE;render();});
    id('da-ref-collections').addEventListener('click',e=>{
      const button=e.target.closest('button[data-collection]');
      if(!button)return;
      state.collection=button.dataset.collection;state.visible=PAGE_SIZE;
      id('da-ref-collection').value=state.collection;
      renderCollections();render();
    });
    id('da-ref-exact-only').addEventListener('change',e=>{state.photoFilter=e.target.checked;state.visible=PAGE_SIZE;render();});
    id('da-ref-view-gallery').addEventListener('click',()=>{state.view='gallery';render();});
    id('da-ref-view-list').addEventListener('click',()=>{state.view='list';render();});
    id('da-ref-more').addEventListener('click',()=>{state.visible+=PAGE_SIZE;render();});
    return overlay;
  }
  function close() {
    if(!state.open)return;
    if(state.zoomId)closePreview();
    state.open=false;
    const overlay=id('da-ref-overlay');
    if(overlay)overlay.hidden=true;
    doc?.body.classList.remove('da-price-reference-open');
    if(state.lastFocus&&typeof state.lastFocus.focus==='function')state.lastFocus.focus();
  }
  async function open() {
    if(!doc)return;
    const overlay=frame();
    if(!overlay||state.open)return;
    state.lastFocus=doc.activeElement;
    state.open=true;overlay.hidden=false;doc.body.classList.add('da-price-reference-open');
    if(state.items.length){updateSelectionControls();renderCollections();}
    render();
    id('da-ref-search').focus();
    await load();
    if(state.open){updateSelectionControls();renderCollections();render();}
  }
  function install() {
    if(!doc||id('da-price-reference-button'))return;
    const anchor=id('showroom-price-toggle');
    if(!anchor||!anchor.parentElement)return;
    const button=doc.createElement('button');
    button.id='da-price-reference-button';
    button.type='button';
    button.className='da-ref-trigger';
    button.title='Deluxe Arte selling prices with photos — not part of Stock';
    button.setAttribute('aria-label','Open Deluxe Arte Price Reference');
    button.innerHTML='<i class="fa-solid fa-images" aria-hidden="true"></i><span>Price Reference</span>';
    button.addEventListener('click',open);
    anchor.parentElement.insertBefore(button,anchor.nextSibling);
  }
  root.DeluxeArtePriceReference=Object.freeze({
    open, close, filterItems, validateSnapshot, validatePhotoMap, resolvePhoto,
    get loadedCount(){return state.items.length;},
    get photosReady(){return !!state.photos;}
  });
  if(doc){
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',install,{once:true});
    else install();
  }
})(typeof window !== 'undefined' ? window : globalThis);
