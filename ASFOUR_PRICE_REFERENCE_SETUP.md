# Asfour approved USD price reference

**Status:** UI integrated in L'Imperial Showroom V4.11.08. A separate
Google Apps Script Web App URL must be configured to activate live pricing.

## Source

Private Google Sheet: https://docs.google.com/spreadsheets/d/1n1aAO0V6lmz9z6dWVX33Tnn0OGxMzJDODywJ-YhUmQo/edit

Tab: `Asfour Retail Prices`. The 32 known code references are seeded as
`Draft`, with blank USD sale prices. No costs or supplier prices were copied.

Sheet columns:
A Product Code
B Product Name
C Design Family
D Product Type
E Size / Dimensions
F Finish
G Crystal
H Approved Sale Price USD
I Photo URL (exact item)
J Status (Draft, Approved, Hidden)
K Approved By (internal only)
L Approval Date (internal only)
M Internal Notes (internal only)

Only rows with J exactly `Approved` and a positive H value are
returned by the publisher. Public read output contains A-I only.

## Activation

1. Review/edit prices and exact matching photos in the private Google Sheet.
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
- An exact HTTPS product photo must be supplied explicitly; no default
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
