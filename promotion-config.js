// Existing Sales Tracking public configuration. This key is publishable, not a secret.
// Access is enforced by the campaign table's row-level policies.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://msxvnaintafqdgheutfu.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_RpLdBcXql9MpBZCU-GLqPQ_G3VKM8zd'
};

// Reusable showroom background presets. Campaigns only store the preset key;
// the artwork remains versioned with the static showroom app.
window.SEASONAL_THEME_PRESETS = {
  international_new_year: {
    label: 'International New Year',
    backgroundDesktop: 'assets/seasonal/international-new-year.webp',
    backgroundMobile: 'assets/seasonal/international-new-year.webp',
    overlay: 'rgba(8, 18, 38, 0.32)'
  },
  chinese_new_year: {
    label: 'Chinese New Year',
    backgroundDesktop: 'assets/seasonal/chinese-new-year.webp',
    backgroundMobile: 'assets/seasonal/chinese-new-year.webp',
    overlay: 'rgba(72, 8, 10, 0.34)'
  },
  khmer_new_year: {
    label: 'Khmer New Year',
    backgroundDesktop: 'assets/seasonal/khmer-new-year.webp',
    backgroundMobile: 'assets/seasonal/khmer-new-year.webp',
    overlay: 'rgba(55, 34, 8, 0.24)'
  },
  pchum_ben: {
    label: 'Pchum Ben',
    backgroundDesktop: 'assets/seasonal/pchum-ben-generated.jpg',
    backgroundMobile: 'assets/seasonal/pchum-ben-generated.jpg',
    overlay: 'rgba(46, 35, 22, 0.12)'
  },
  water_festival: {
    label: 'Water Festival',
    backgroundDesktop: 'assets/seasonal/water-festival.webp',
    backgroundMobile: 'assets/seasonal/water-festival.webp',
    overlay: 'rgba(8, 22, 46, 0.32)'
  },
  christmas: {
    label: 'Christmas',
    backgroundDesktop: 'assets/seasonal/christmas.webp',
    backgroundMobile: 'assets/seasonal/christmas.webp',
    overlay: 'rgba(32, 18, 15, 0.30)'
  }
};
