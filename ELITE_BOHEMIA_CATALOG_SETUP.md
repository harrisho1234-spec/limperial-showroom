# Elite Bohemia catalog and price reference

## Status
- Brand tab: **Elite Bohemia**, integrated in the unified **Price Reference** picker.
- 5 user-supplied supplier PDF sources indexed as **reference-only** models.
- 1,036 distinct automatically parsed model-code strings, with references to original PDF pages and source catalogs.
- Searchable by code, product category, source and provisional dimensions.
- No selling prices were supplied. All prices remain **pending**, with no assumed currency or zero-price fallback.
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

## When supplier selling prices arrive
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
