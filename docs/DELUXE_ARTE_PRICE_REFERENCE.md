# Deluxe Arte Price Reference — non-stock, selling-price only

**Live Showroom:** https://harrisho1234-spec.github.io/limperial-showroom/

This feature is **not part of the inventory, product catalog, purchase orders, customer interest list, quotations or sales orders**. It cannot add, reserve or release stock. No stock quantities or costs are copied into the reference. The small **Price Reference** button appears near the existing sales-price eye toggle in the Showroom header (on mobile, a book icon).

## Source and current snapshot

Owner's source: Google Sheet "Deluxe Arte (Price Structure)", tab **Deluxe Update Price (2025)**, with item names and dimensions in Column A and final USD selling prices in Column P.

Only the **196 rows** with a positive selling price were imported, from the source as of **13 Nov 2026**, into `assets/price-reference/deluxe-arte.json`. The source workbook was not modified. Eight lines with item details but no positive Column P price were intentionally excluded rather than assigned a fabricated price; collection heading rows were not counted as items.

The released dataset has only these sale-facing fields:

- `id`: a stable distinct identifier based on the original row index, such as `DA-REF-020`
- `name`: product name
- `dimensions`: dimensions / description
- `collection`: original collection heading
- `priceUsd`: USD **selling** price from Column P
- `designVariant`: a descriptive "Design 1 of 2" / "Design 2 of 2" when names and sizes repeat

There are seven groups of repeated descriptions/sizes. They **represent different designs** and MUST NOT be merged, matched to stock codes or overwritten based on the name. The IDs preserve the separate source rows. Embedded floating images in the sheet did not expose URLs via cell values, so this version does not pretend that different designs have verified matching photos. Actual design photos can be added in a later explicitly verified mapping pass.

## Updates

This first implementation uses a sanitized, **static selling-price snapshot** for immediate use and offline PWA access. Updating Column P in the owner's Google Sheet **does not automatically refresh the Showroom**. An authorized editor must re-read the latest Column A and P values, regenerate the whitelist-only JSON, validate the row IDs and separate design variants, and commit a new Showroom release/version.

Do **not** publish the full costing workbook, expose a `gviz` link to its entire sheet, or fetch the confidential original sheet from Showroom's browser. A public Showroom means the curated retail selling-price-only JSON is also public; if access to the retail price list must be restricted to signed-in Sales staff, migrate this module to an authenticated price-only API and login flow before relying on it as confidential.

## Release safety

- The price reference does not feed the official `products` array, `cart`, quotation rows, scanner, or stock logic.
- The existing Showroom **Hide sales prices** eye switch visually hides selling prices here too (as in other Showroom views; not a server-side permission system).
- Only 24 results appear initially. Search, filter by collection, sort by source order/name/price and Load More are available on desktop and mobile.
- If an item has no known selling price, it does not appear in the reference.
- Test: `node --test tests/deluxe-arte-price-reference.test.cjs`; then open Showroom, search two same-size Princess Dining Tables, verify that they display as two separate designs, and toggle Hide prices.
