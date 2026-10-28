# Scan by Photo corrective fix — 28 October 2026

## Confirmed cause

`captureVariants` passes three HTMLCanvasElements to `visualSignature`. The old function used `naturalWidth` and `naturalHeight`, which canvases do not have. The resulting non-finite drawing coordinates left the white destination canvas untouched. `bestScore` then compared every query against the same three all-white signatures. CEL0288 consequently received a constant 0.949312 score, regardless of the input photo.

The original published index had 1,594 rows, 1,556 distinct signatures and no malformed signatures; the largest exact duplicate group contained four rows. It was not a globally duplicated index. Four downloaded catalog images decoded as three-channel RGB and closely matched their stored signatures (maximum component differences 0.036–0.074, with self-match scores 0.977–0.993). Browser and Sharp resampling are not pixel-identical.

## Changes

- Read intrinsic image dimensions or canvas dimensions as appropriate; reject missing/zero/non-finite dimensions and invalid signature values.
- Keep the existing score formula, but now compute crops from actual photo pixels.
- Remove the first-30-product fallback when the index cannot load; report unavailable search instead of showing a biased partial catalog.
- Restore the missing Load More button and normalize index code whitespace.
- Generate explicitly sRGB, white-composited, three-channel pixels. Validate byte length, signature diversity and coverage before replacing the index.
- Rebuild the public index: 1,593 indexed entries / 2,221 catalog rows, 1,555 distinct signatures. One previously indexed photo, FUR0183, timed out during this rebuild. Other rows lacked eligible code/photo fields. No private catalog fields are added.
- Bump script/service-worker cache versions to `20261028-canvas-fix1`; make the photo index network-first with offline cached fallback and a versioned request URL.

## Verification

Real headless Chrome ran the production signature, crop and ranking functions against the complete index. Products: WAL-AL-853/A2, CHL-31511/618/193/137, CHL0513-3 and FUR0344. Each was tested as the original catalog image and as a JPEG surrounded by a wider dark background (eight queries).

Before the fix, all four wider-background queries returned the same top three products. After the fix, all eight queries ranked their own SKU first, with no blank crop signatures. Tests also cover invalid dimensions/values, 10-to-20 result pagination, unavailable-index handling without stale results, and network-first/offline cache behavior.

The existing suite passed 35 of 39 tests; four promotion/database tests failed. Those same four tests were rerun against untouched commit `a2ef719549318e11709bce91161da0d80e2ab572` and also failed. The new cache regression test passes separately. JavaScript syntax and diff-whitespace checks pass.

## Reproduce

Install dependencies, then run `npm test` and `npm run test:photo`. The browser test downloads four public catalog thumbnails into `../photo-fixtures` and requires Playwright Chromium (`npx playwright install chromium`) or an installed Chrome path in `PHOTO_BROWSER_PATH`. Optional `PHOTO_BASE_REF` runs a before/after comparison against an existing Git revision. `npm run build:photo-index` rebuilds from the published catalog and needs network access.

## Limits

This verifies the repeated-result software defect, not general real-world recognition accuracy. The matcher still uses low-resolution color/layout/edges, not a learned recognition model. Different viewpoints, clutter, lighting, off-center subjects, duplicate catalog photos and products missing from the index may remain ambiguous. Similarity percentages are not identification confidence. The user's physical phone and original full-resolution camera photos were not tested; the referenced chat supplied screenshots only. Installed clients need to reopen online to obtain the new code and service worker.
