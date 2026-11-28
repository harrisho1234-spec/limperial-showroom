# Elite Bohemia catalog and price reference

## Status
- Brand tab: **Elite Bohemia**, integrated in the unified **Price Reference** picker.
- 5 user-supplied supplier PDF sources indexed as **reference-only** models.
- 1,036 distinct automatically parsed model-code strings, with references to original PDF pages and source catalogs.
- Searchable by code, product category, source and provisional dimensions.
- **190 calculated USD selling-price options** were loaded from the 12 uploaded 2025 supplier price lists. Other catalog entries remain **Price Pending**.
- **Not stock inventory**; does not create or modify stock, order products, SKUs, quotations, or costs.
- Catalog measurements and codes are machine-extracted, require visual supplier verification, particularly models shared by several pages or containing finish suffixes.

## Catalog sources
- 2017 lamps — 48 pages (`2017_lamps(2).pdf`)
- 2014 chandelier catalog — 307 pages (`Katalog-2014(2).pdf`)
- 2016 chandelier catalog — 68 pages (`2016(2).pdf`)
- 2017 chandelier catalog — 28 pages (`2017(2).pdf`)
- Storybook of Crystal Chandeliers — 73 pages (`STORYBOOK AJ pro Pepu 26.10 - kopie (2)(1).pdf`)

## Catalog photographs
A ZIP containing one small preview JPEG for every page of the uploaded five
PDF catalogs has been generated separately and can be obtained from the
conversation artifact `Elite_Bohemia_Catalog_Page_Previews.zip`.

**Images are not yet uploaded to GitHub Pages.** To enable them, extract the
ZIP into:
`assets/price-reference/elite-bohemia-page-previews/`
so that URLs like
`assets/price-reference/elite-bohemia-page-previews/2014_catalog/p0014.jpg`
exist. Keep folder names and page numbering intact. The UI attempts those
URLs and displays a placeholder when missing. These are full-page preview
images (which may contain multiple products); they are **not** validated
single-product photographs. Never imply an exact model-photo match where a
page contains multiple codes.

## 2025 partial selling-price list now loaded

Supplier list price is treated as the retail/list basis. L’Imperial's agreed formula is:

- Discounted costing = supplier listed USD price × 0.55
- Selling price = discounted costing × 3 = supplier listed USD price × **1.65**

Only the calculated selling price is stored in Supabase `showroom_private_price_references` under `brand = elite`. Supplier list prices and internal costing are **not** committed to public GitHub assets or returned to Showroom staff. The archived user calculation CSV includes the costing and original price for management checking.

The protected pricing data uses the existing authenticated Showroom permission/RLS. Distinct supplier finishes (e.g. Seashell Crystal, Opal/Gold and Amber/Champagne; Water Crystal/Aqua) remain separate price options. Unlisted finishes are **not priced by assumption**. Original Storybook and Golden Glow price lists specify gold finish as base and nickel/silver at supplier list +5%; the 190 prices use only supplier base-gold prices. Some Crystalion models exclude LED ceiling lights as stated on their lists.

## When additional supplier selling prices arrive
- Use full supplier model code as key, **including variant/finish suffixes**.
- Match price list codes to `assets/price-reference/elite-bohemia-catalog.json`.
- Keep unmatched variants flagged for review, do not assume parent-code prices.
- Determine price currency and whether price is a net cost or actual retail
  selling price before enabling price display.
- Store retail prices in the same protected,
  authenticated reference mechanism used by existing brands. Do not commit
  confidential prices to the public static JSON asset.
- Preserve `reference_only` semantics. **Never sync these rows into inventory**.
- Verify catalog versions, product codes, measurements and photos before quoting.

## Files
- `assets/price-reference/elite-bohemia-catalog.json`
- `elite-bohemia-price-reference.js`
- `elite-bohemia-price-reference.css`
- `unified-price-reference.js` (brand picker)
- `showroom-reference-search.js` (read-only main search)

## 2025 supplemental spreadsheet imports — 28 November 2026

- Imported **model-code and source-row references only** from five newer `.xlsx` price sheets; the public catalog index now contains **1,151 unique model codes** (previously 1,036).
- Reviewed **301 spreadsheet price rows**: 186 codes already matched the earlier catalog index, and 115 additional codes were indexed. These are code matches, **not photo matches**.
- **84** spreadsheet rows overlap earlier 2025 PDF retail prices but have different numeric bases. Example: Storybook `L 678/6/03/AD` appears as USD 969.045 in the XLSX while the earlier supplier PDF lists USD 1,609.00. Illusion and Melody show similar ~60.24% relationships. **Do not multiply the XLSX numbers by 1.65 or overwrite existing prices until supplier-price meaning is confirmed**.
- The previous **190 protected retail-based selling prices remain unchanged**, and no supplemental pricing or costing was added to public GitHub assets.
- Legacy Excel `.xls` files `Ceník Exclusive 2025 USD pb.xls` and `CENÍK lamp 2025 USD pb.xls` are not yet imported because the current spreadsheet reader cannot import that legacy binary format. Convert them to `.xlsx` without changing values for complete intake.
- The Illusion product sheet PDF provides model imagery and variant/finish evidence but still requires exact code-to-image/photo mapping and image hosting. No product photos were guessed or swapped.
- The source reconciliation is available as the conversation artifact `Elite_Bohemia_Additional_Pricelists_Reconciliation.csv` and deliberately is not committed to the public repository because it contains pricing data.
