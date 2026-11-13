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

## Photos and easier browsing (V4.11.05)

The photo-first reference uses a **publicly shared, existing Deluxe Arte Google Drive image folder**, with a curated name/collection mapping in `assets/price-reference/deluxe-arte-photo-map.json`. It DOES NOT read the confidential costing sheet to fetch images.

- All 196 priced items have a product or collection image reference. At initial matching, 48 records use a named product example and 148 use a representative collection photo.
- A **Product example** is mapped from a catalog slide whose product name matches. It may still show another finish or minor variant.
- A **Collection photo** is a visual example of the collection and must NOT be treated as a confirmed picture of that exact item.
- Identical-size different-design entries continue to show separate stable row IDs; they intentionally use collection photos until unique per-design images are positively matched.
- The original catalog slides often contain their **historical prices** below the image. The UI crops this lower caption from the photo preview. **Only the current USD selling price in the reference card is authoritative**.
- The panel has a large search field, readable collection and sort selectors, collection chips, photo-grid/compact-list modes, a matched-photo filter, load more, tap-to-preview, and light/dark contrast fixes.
- Photo links are the original Google Drive public gallery thumbnails. If the owner changes the Drive file's sharing permissions, the photo can stop rendering; the product price remains visible with a placeholder. Photos are not saved as stock images and are not quotation attachments.

The gallery remains **reference-only**: not a product, inventory, purchase, shopping-cart, or quotation data source. Importing another photo source requires explicit matching by source reference ID, never just matching sizes.

## Exact photos from Excel Column B (import prepared, pending execution)

The owner provided `Deluxe Arte (Price Structure)(1).xlsx` to replace the approximate
collection images with **actual photos anchored to Column B** in the sheet
`Deluxe Update Price (2025)`. The picture importer has been prepared in:
`scripts/extract-deluxe-arte-column-b.py`.

The current development environment was unable to mount or inspect the uploaded
~196 MB workbook, so the imported photos have **NOT yet been generated, verified,
or released**. Do not describe the replacement as live until the extraction
manifest and image assets are committed and tested.

When file-processing is available, complete these steps **without uploading any
full costing workbook to GitHub**:

1. Open the checked-out L'Imperial Showroom repository locally or in a private
   execution environment.
2. Install Pillow: `python -m pip install Pillow`.
3. Dry-run the importer to confirm matching anchored images:
   `python scripts/extract-deluxe-arte-column-b.py "/path/to/Deluxe Arte (Price Structure)(1).xlsx" --dry-run`.
4. If it reports enough *unambiguous Column B* photos anchored to exact rows,
   run the same command without `--dry-run`.
5. It creates only resized WebP item photos in
   `assets/price-reference/deluxe-arte-row-images/` and a strictly
   whitelisted `assets/price-reference/deluxe-arte-row-photos.json` mapping,
   keyed by existing source-row IDs like `DA-REF-004`.
6. Review the number of missing/ambiguous rows. If there are too many missing
   photos, **stop and investigate source picture anchors**; never guess by
   name or dimensions, and never shift photos between rows.
7. Run `python -m unittest discover -s tests -p 'test_deluxe_arte_column_b.py' -v`
   and `node --test tests/deluxe-arte-price-reference.test.cjs`, then inspect
   visual samples including repeated-size different-design Princess tables.
8. Commit **only** the generated WebP files and map. Never commit the
   original workbook, costs, or other worksheets. Bump the app release from
   V4.11.05 to V4.11.06 and update the service-worker cache so staff receive it.

The Showroom price-reference code now supports an optional, strictly validated
row-photo manifest. Once installed, each `DA-REF-###` uses its exact image
from the corresponding **Column B row**. If the manifest exists but a row is
not mapped, that item will show **Photo unavailable**, not a potentially
incorrect collection image. Without the manifest, the current gallery examples
remain visible and remain clearly labeled.

Existing USD reference prices stay sourced from the selling-price-only JSON
created from **Column P**, not from image files. This import does not modify
Stock, SKU/catalog records, reservations, procurement, quotations, or orders.

## Updates

This first implementation uses a sanitized, **static selling-price snapshot** for immediate use and offline PWA access. Updating Column P in the owner's Google Sheet **does not automatically refresh the Showroom**. An authorized editor must re-read the latest Column A and P values, regenerate the whitelist-only JSON, validate the row IDs and separate design variants, and commit a new Showroom release/version.

Do **not** publish the full costing workbook, expose a `gviz` link to its entire sheet, or fetch the confidential original sheet from Showroom's browser. A public Showroom means the curated retail selling-price-only JSON is also public; if access to the retail price list must be restricted to signed-in Sales staff, migrate this module to an authenticated price-only API and login flow before relying on it as confidential.

## Release safety

- The price reference does not feed the official `products` array, `cart`, quotation rows, scanner, or stock logic.
- The existing Showroom **Hide sales prices** eye switch visually hides selling prices here too (as in other Showroom views; not a server-side permission system).
- Only 24 results appear initially. Search, filter by collection, sort by source order/name/price and Load More are available on desktop and mobile.
- If an item has no known selling price, it does not appear in the reference.
- Test: `node --test tests/deluxe-arte-price-reference.test.cjs`; then open Showroom, search two same-size Princess Dining Tables, verify that they display as two separate designs, and toggle Hide prices.

## V4.11.06 verified photo release (13 Nov 2026)

The owner extracted and committed **193 row-matched product photos** from Column B of the Deluxe Arte workbook in Codespaces. All 193 `.webp` files and `deluxe-arte-row-photos.json` are now present in the public repository. The main product list continues to use the original price-only column P JSON. Image rows **92, 95, and 164** have no row-specific photo and show a **Photo unavailable** placeholder, never an incorrect collection image. The original confidential `.xlsx` workbook was not committed. The Sales & Stock inventories, SKU catalog, procurement, orders and quotations remain unchanged.

This supersedes the earlier pending-extraction notice above. Node price reference tests and Python extraction tests passed in the owner's Codespaces before publication. The Showroom service worker and asset URLs are bumped for V4.11.06. Future source image changes require re-extraction and a fresh version bump; editing the price sheet does not auto-refresh this static snapshot.
