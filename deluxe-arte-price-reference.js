/* Deluxe Arte selling-price reference only — independent of catalog, stock, cart and quotations.
 * DATA CONTRACT: assets/price-reference/deluxe-arte.json contains ONLY sale-facing fields.
 * Never read the confidential costing workbook in the browser.
 */
(function (root) {
  'use strict';
  const DATA_URL = './assets/price-reference/deluxe-arte.json';
  const PAGE_SIZE = 24;
  const IDS = Object.freeze({
    trigger: 'da-price-reference-button',
    dialog: 'da-price-reference-dialog',
    search: 'da-price-reference-search',
    collection: 'da-price-reference-collection',
    order: 'da-price-reference-order',
    results: 'da-price-reference-results',
    count: 'da-price-reference-count',
    more: 'da-price-reference-more',
    loading: 'da-price-reference-loading'
  });
  const state = { items: [], loading: null, error: '', search: '', collection: '', order: 'collection', visible: PAGE_SIZE, open: false, lastFocus: null };
  const doc = root.document;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function safeNumber(x) {
    return typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 10000000;
  }
  function normalizeRecord(raw) {
    if (!raw || typeof raw !== 'object' || !/^DA-REF-\d{3,}$/.test(String(raw.id || ''))) return null;
    if (!safeNumber(raw.priceUsd) || !String(raw.name || '').trim()) return null;
    return {
      id: String(raw.id),
      name: String(raw.name).trim().slice(0, 180),
      dimensions: String(raw.dimensions || '').trim().slice(0, 250),
      collection: String(raw.collection || 'Other').trim().slice(0, 80),
      priceUsd: raw.priceUsd,
      designVariant: String(raw.designVariant || '').trim().slice(0, 40)
    };
  }
  function validateSnapshot(payload) {
    if (!payload || payload.brand !== 'Deluxe Arte' || payload.currency !== 'USD' || payload.kind !== 'reference_only' || !Array.isArray(payload.items)) {
      throw new Error('Price reference is not in the expected selling-price-only format.');
    }
    const items = payload.items.map(normalizeRecord);
    if (items.length === 0 || items.some(x => !x)) throw new Error('Price reference contains invalid items.');
    const refs = new Set(items.map(x => x.id));
    if (refs.size !== items.length) throw new Error('Price reference contains repeated row identifiers.');
    // Explicit whitelist: no costs, stock quantities or quotation fields are materialized in the UI.
    return items;
  }
  function price(x) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(x);
  }
  function byId(id) { return doc.getElementById(id); }
  function close() {
    const dialog = byId(IDS.dialog);
    if (!dialog || !state.open) return;
    dialog.hidden = true;
    doc.body.classList.remove('da-price-reference-open');
    state.open = false;
    if (state.lastFocus && typeof state.lastFocus.focus === 'function') state.lastFocus.focus();
  }
  function frame() {
    if (byId(IDS.dialog)) return byId(IDS.dialog);
    const dialog = doc.createElement('div');
    dialog.id = IDS.dialog;
    dialog.className = 'da-ref-overlay';
    dialog.hidden = true;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Deluxe Arte Price Reference');
    dialog.innerHTML =
      '<div class="da-ref-panel" role="document">' +
        '<div class="da-ref-top">' +
          '<div class="da-ref-title-wrap">' +
            '<span class="da-ref-eyebrow">GENERAL PRICE REFERENCE · DELUXE ARTE</span>' +
            '<h2 class="da-ref-title">Deluxe Arte Price Reference</h2>' +
            '<p class="da-ref-note">Selling prices only · Reference items · No stock or quotation changes</p>' +
          '</div>' +
          '<button class="da-ref-close" type="button" aria-label="Close price reference" title="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
        '</div>' +
        '<div class="da-ref-controls">' +
          '<label class="da-ref-search-wrap"><span class="sr-only">Search item, size or reference</span>' +
            '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
            '<input id="' + IDS.search + '" type="search" autocomplete="off" placeholder="Search collection, item or dimensions…" aria-label="Search Deluxe Arte reference items"></label>' +
          '<label class="da-ref-select-wrap"><span class="sr-only">Filter collection</span><select id="' + IDS.collection + '" aria-label="Filter by collection"><option value="">All collections</option></select></label>' +
          '<label class="da-ref-select-wrap"><span class="sr-only">Sort items</span><select id="' + IDS.order + '" aria-label="Sort price reference"><option value="collection">Collection / source order</option><option value="priceAsc">Lowest price</option><option value="priceDesc">Highest price</option><option value="name">Item name</option></select></label>' +
        '</div>' +
        '<div class="da-ref-results-header"><span id="' + IDS.count + '" aria-live="polite">Loading…</span><span>USD selling price</span></div>' +
        '<div class="da-ref-scroll" tabindex="-1"><div id="' + IDS.loading + '" class="da-ref-message">Loading selling-price reference…</div>' +
          '<div id="' + IDS.results + '" class="da-ref-grid"></div>' +
          '<button id="' + IDS.more + '" class="da-ref-more" type="button" hidden>Load more items</button>' +
        '</div>' +
        '<div class="da-ref-bottom"><i class="fa-solid fa-circle-info" aria-hidden="true"></i>' +
          '<p>Reference prices only. Items here are not stock products, cannot be reserved, and are not added to quotations. Designs sharing dimensions remain separate entries.</p></div>' +
      '</div>';
    dialog.querySelector('.da-ref-close').addEventListener('click', close);
    dialog.addEventListener('mousedown', e => { if (e.target === dialog) close(); });
    dialog.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button:not([hidden]),input,select')].filter(x => !x.disabled && x.offsetParent !== null);
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    doc.body.appendChild(dialog);
    byId(IDS.search).addEventListener('input', e => {
      state.search = e.target.value.trim().toLowerCase();
      state.visible = PAGE_SIZE;
      render();
    });
    byId(IDS.collection).addEventListener('change', e => {
      state.collection = e.target.value;
      state.visible = PAGE_SIZE;
      render();
    });
    byId(IDS.order).addEventListener('change', e => {
      state.order = e.target.value;
      state.visible = PAGE_SIZE;
      render();
    });
    byId(IDS.more).addEventListener('click', () => {
      state.visible += PAGE_SIZE;
      render();
    });
    return dialog;
  }
  async function load() {
    if (state.items.length) return state.items;
    if (state.loading) return state.loading;
    state.error = '';
    state.loading = (async () => {
      const res = await fetch(DATA_URL, { cache: 'no-cache', credentials: 'same-origin' });
      if (!res.ok) throw new Error('Price reference is unavailable (' + res.status + ').');
      const payload = await res.json();
      const items = validateSnapshot(payload);
      state.items = items;
      return items;
    })();
    try { return await state.loading; }
    catch (err) {
      state.error = err && err.message || 'Could not load price reference';
      throw err;
    } finally {
      state.loading = null;
    }
  }
  function filterItems(items, query, collection, order) {
    const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = items.filter(item => {
      if (collection && item.collection !== collection) return false;
      const target = [item.name, item.dimensions, item.collection, item.id, item.designVariant].join(' ').toLowerCase();
      return words.every(w => target.includes(w));
    });
    if (order === 'priceAsc') return filtered.sort((a, b) => a.priceUsd - b.priceUsd || a.id.localeCompare(b.id));
    if (order === 'priceDesc') return filtered.sort((a, b) => b.priceUsd - a.priceUsd || a.id.localeCompare(b.id));
    if (order === 'name') return filtered.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    // Stable source-row reference is the identity: never collapse equal names/sizes.
    return filtered;
  }
  function render() {
    if (!state.open) return;
    const results = byId(IDS.results), loading = byId(IDS.loading), more = byId(IDS.more), count = byId(IDS.count);
    if (!results || !loading || !more || !count) return;
    results.innerHTML = '';
    const list = filterItems(state.items, state.search, state.collection, state.order);
    count.textContent = list.length + ' distinct reference items';
    if (state.error) { loading.textContent = state.error; loading.hidden = false; more.hidden = true; return; }
    if (state.loading && !state.items.length) { loading.textContent = 'Loading selling-price reference…'; loading.hidden = false; more.hidden = true; return; }
    if (!list.length) { loading.textContent = 'No matching prices. Try another name, collection or size.'; loading.hidden = false; more.hidden = true; return; }
    loading.hidden = true;
    const fragment = doc.createDocumentFragment();
    for (const item of list.slice(0, state.visible)) {
      const card = doc.createElement('article');
      card.className = 'da-ref-card';
      card.dataset.referenceId = item.id;
      card.innerHTML =
        '<div class="da-ref-card-info">' +
          '<div class="da-ref-card-collection">' + escapeHtml(item.collection) + '</div>' +
          '<h3 class="da-ref-card-name">' + escapeHtml(item.name) + '</h3>' +
          (item.dimensions ? '<p class="da-ref-card-size">' + escapeHtml(item.dimensions) + '</p>' : '') +
          '<div class="da-ref-card-meta">' +
            (item.designVariant ? '<span class="da-ref-variant">' + escapeHtml(item.designVariant) + '</span>' : '') +
            '<span class="da-ref-code">' + escapeHtml(item.id) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="da-ref-card-price">' +
          '<strong class="da-price-ref-price">' + escapeHtml(price(item.priceUsd)) + '</strong>' +
          '<span class="da-price-ref-price-hidden">Price hidden</span>' +
          '<small>Reference only</small>' +
        '</div>';
      fragment.appendChild(card);
    }
    results.appendChild(fragment);
    more.hidden = state.visible >= list.length;
    if (!more.hidden) more.textContent = 'Load more (' + Math.min(PAGE_SIZE, list.length - state.visible) + ' of ' + (list.length - state.visible) + ' remaining)';
  }
  function collections() {
    const select = byId(IDS.collection);
    if (!select) return;
    select.replaceChildren();
    const all = doc.createElement('option'); all.value = ''; all.textContent = 'All collections'; select.appendChild(all);
    [...new Set(state.items.map(x => x.collection))].forEach(value => {
      const option = doc.createElement('option'); option.value = value; option.textContent = value; select.appendChild(option);
    });
    select.value = state.collection;
  }
  async function open() {
    const dialog = frame();
    if (state.open) return;
    state.lastFocus = doc.activeElement;
    state.open = true;
    dialog.hidden = false;
    doc.body.classList.add('da-price-reference-open');
    render();
    byId(IDS.search).focus();
    try {
      await load();
      if (state.open) { collections(); render(); }
    } catch (_) { if (state.open) render(); }
  }
  function install() {
    if (!doc || byId(IDS.trigger)) return;
    const anchor = byId('showroom-price-toggle');
    if (!anchor || !anchor.parentElement) return;
    const button = doc.createElement('button');
    button.id = IDS.trigger;
    button.type = 'button';
    button.className = 'da-ref-trigger';
    button.title = 'Deluxe Arte General Price Reference (no stock)';
    button.setAttribute('aria-label', 'Open Deluxe Arte Price Reference');
    button.innerHTML = '<i class="fa-solid fa-book-open" aria-hidden="true"></i><span>Price Reference</span>';
    button.addEventListener('click', open);
    // Keep the existing catalog, stock, shopping cart, promotion and quotation code untouched.
    anchor.parentElement.insertBefore(button, anchor.nextSibling);
  }
  root.DeluxeArtePriceReference = Object.freeze({ open, close, filterItems, validateSnapshot, get loadedCount() { return state.items.length; } });
  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
  }
})(typeof window !== 'undefined' ? window : globalThis);
