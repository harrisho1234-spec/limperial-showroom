# Asfour approved USD price reference

**Status:** UI integrated in L'Imperial Showroom V4.11.08. A separate
Google Apps Script Web App URL must be configured to activate live pricing.

## Source

Private Google Sheet: https://docs.google.com/spreadsheets/d/1ucAj39V5auDG0B0v0H_jCZOWtT3qnkvv6ZII8i3USY4/edit

Tab: `Asfour Retail Prices`. The 32 known code references are seeded as `Draft`, with blank USD selling prices. The workbook retains the two original Asfour photo-catalog tabs from the Product Performance workbook; the price-entry tab links to their relevant photo locations. No supplier costs are published.

Sheet columns:
A Product Code
B Photo (clickable link to the copied Asfour visual catalog)
C Product Name
D Design Family
E Product Type
F Size / Dimensions
G Finish
H Crystal
I Actual Sale Price USD
J Status (Draft, Approved, Hidden)
K Photo URL (exact item, optional for Showroom thumbnail)
L Approved By (internal only)
M Approval Date (internal only)
N Notes (internal only)
O Photo Match (warnings for shared or ambiguous source images)

Only rows with J exactly `Approved` and a positive I value are returned
by the publisher. Public output contains A,C-H,I,K only (product code,
description, approved selling price and optional exact photo URL). The private
photo catalog and annotations remain in the workbook, but embedded Google
Sheets images cannot automatically be served as Showroom thumbnails. For
Showroom photos, supply exact-item Google Drive or HTTPS image links in K.

## Activation

1. Review photos by clicking each row's photo link, then fill USD selling prices in column I. Verify the six rows marked as shared/ambiguous photo references. For a photo to display inside the Showroom card, add its exact HTTPS/Drive URL in column K.
2. Create a **standalone** Google Apps Script project at
   https://script.google.com/home/projects/create (do not overwrite Showroom's
   current catalog backend). Paste
   [Code.gs](./google-apps-script/asfour-price-reference/Code.gs).
3. Deploy a Web App executing as the Google Sheet owner. If configured for
   access by **Anyone**, the APPROVED selling prices are publicly readable
   from the /exec URL. Do not use Anyone if prices must be company-private;
   in that case, switch to an authenticated proxy before activation.
4. Copy the deployed URL (ending in `/exec`) to
   [asfour-price-reference-config.js](./asfour-price-reference-config.js):
   `window.LImperialAsfourPriceFeedUrl = 'https://script.google.com/macros/s/.../exec';`
5. Reload Showroom and select **Asfour Prices** next to the existing
   **Price Reference** button. Use Refresh prices after changing Approved rows.

## Boundaries

- Independent from stock, inventory, reservations, quotations, customer cart
  and procurement.
- No costs, margins, supplier prices or draft values are emitted.
- An exact HTTPS product photo must be supplied in K for Showroom thumbnails; the copied visual catalog contains native embedded reference photos, not public image URLs. No default
  chandelier/family substitution is made for wall lamps or custom designs.
- The existing sales-price visibility switch also hides Asfour reference prices.
- Duplicate product codes in the publisher are ignored after the first valid
  approved row; maintain one approved row per full supplier code.

## Release testing

- Confirm no rows are visible before any price is approved.
- Approve a test row with a manually entered retail USD amount and an
  exact item photo URL. Confirm the item becomes visible.
- Change the row to Hidden. Confirm the item disappears on Refresh prices.
- Confirm Cart, quotations, stock and procurement remain unchanged.
- Verify access settings with a browser signed out of Google before sharing the URL.
