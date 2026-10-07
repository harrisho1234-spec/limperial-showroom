/* Pure campaign rules, shared by the browser and regression tests. */
(function(root) {
  'use strict';
  const code = value => String(value || '').trim().toUpperCase();
  const themeKeys = [
    'international_new_year',
    'chinese_new_year',
    'khmer_new_year',
    'pchum_ben',
    'water_festival',
    'christmas'
  ];
  const today = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  const state = (c, day = today()) => !c.is_enabled ? 'Disabled' :
    c.start_date > day ? 'Scheduled' : c.end_date < day ? 'Ended' : 'Active';
  function active(campaigns, day = today()) {
    return campaigns.filter(c => state(c, day) === 'Active').sort((a,b) =>
      b.start_date.localeCompare(a.start_date) || String(b.created_at || '').localeCompare(String(a.created_at || '')) || String(a.id).localeCompare(String(b.id)));
  }
  function index(campaigns, day) {
    const result = new Map();
    active(campaigns, day).forEach(c => (Array.isArray(c.items) ? c.items : []).forEach(item => {
      const key = code(item.code);
      if (key && !result.has(key)) result.set(key, {campaign:c, item});
    }));
    return result;
  }
  function project(product, match) {
    if (!product || product.isSet || !match) return product;
    const result = {...product};
    const base = Number(product.actualSalesPrice ?? product.price);
    const fixed = match.item.promo_price == null || match.item.promo_price === '' ? null : Number(match.item.promo_price);
    const percent = Number(match.campaign.discount_percent || 0);
    const validFixed = fixed !== null && Number.isFinite(fixed) && fixed >= 0 && fixed <= base;
    let target = validFixed ? fixed : fixed === null && percent > 0 && percent <= 100 ? base * (1-percent/100) : null;
    if (target !== null && Number.isFinite(target) && base >= 0) {
      target = Math.round((target + Number.EPSILON) * 100) / 100;
      result.price = target;
      result.margin = Math.round((target - Number(product.costing || 0)) * 100) / 100;
      // Numeric price is authoritative; badge text is never parsed as a discount.
      result.promotion = 'SPECIAL PRICE';
      result.pricePromotion = String(target);
    } else target = null;
    result._seasonalCampaign = {id:match.campaign.id, title:match.campaign.name,
      badge:match.campaign.badge || 'SEASONAL OFFER', actualPromoPrice:target};
    return result;
  }
  function validate(payload, products) {
    if (payload.name.length < 2 || payload.name.length > 120 || payload.badge.length > 40) return 'Enter a campaign name (2–120 characters) and a badge of at most 40 characters.';
    const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
    if (!validDate(payload.start_date) || !validDate(payload.end_date) || payload.end_date < payload.start_date) return 'Choose valid start and end dates.';
    if (payload.discount_percent !== null && (!Number.isFinite(payload.discount_percent) || payload.discount_percent < 0 || payload.discount_percent > 100)) return 'Discount must be between 0 and 100%.';
    if (payload.theme_preset && !themeKeys.includes(payload.theme_preset)) return 'Choose a valid seasonal background theme.';
    if (!payload.items.length || payload.items.length > 300) return 'Select between 1 and 300 products.';
    for (const item of payload.items) {
      const product = products.find(p => !p.isSet && code(p.code) === code(item.code));
      if (item.promo_price !== null && (!Number.isFinite(item.promo_price) || item.promo_price < 0 || (product && item.promo_price > Number(product.actualSalesPrice ?? product.price)))) return 'Promo prices must be non-negative and cannot exceed the product’s actual sales price.';
    }
    return '';
  }
  const api = {code, themeKeys, today, state, active, index, project, validate};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SeasonalCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
