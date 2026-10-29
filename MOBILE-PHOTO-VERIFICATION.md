# Mobile photo processing — 28 October 2026

Follow-up to the report of no results and stuttering after camera return on a Samsung S24 Ultra installed app. The phone itself is not connected for debugging.

Confirmed code defects:
- Ambiguous or lower-scoring searches calculated a ranked list, then discarded the entire list in favor of a warning. Candidates now remain visible with an explicit uncertainty warning; Load More retains that warning and the captured-photo preview.
- Three crop canvases were allocated at camera resolution. A 4000×3000 test photo allocated 17,467,696 canvas pixels (69,870,784 bytes of nominal RGBA storage). Direct 32×32 crop sampling plus a 160×160 thumbnail now allocates 29,696 pixels (118,784 bytes). These figures exclude the source image decoder and browser overhead.
- The preview reused the original full-resolution file. It now uses the small thumbnail, and the original decoded image is released after sampling. Result rows use indexed thumbnail URLs, lazy decoding, and reserved image dimensions even when a thumbnail fails.

Verification: the 12MP browser regression reproduces zero visible candidates before the change and 10 afterward, then 20 after Load More, with the warning retained. All eight original/framed catalog-image ranking queries still put the expected SKU first. All eight viewport/theme layout checks, camera-return/rotation/keyboard/scroll-restoration checks, cache regression and JavaScript syntax checks pass.

Reproduce with `npm run test:mobile-photo`, `npm run test:photo`, `npm run test:photo-layout`, and `npm run test:camera-return`. Use Playwright Chromium or set `PHOTO_BROWSER_PATH` to an installed Chrome executable. Set `PHOTO_BASE_REF=17e051f` for the memory/candidate before-and-after comparison.

Limitations: the memory pressure explanation for device stutter is a hypothesis supported by the excessive allocations, not a confirmed device-level diagnosis. No actual S24 Ultra rendering trace or original camera photo was provided. Matching still uses low-resolution appearance signatures; displaying candidates does not prove that the correct product will appear for every viewpoint, background or screen photograph.

## Follow-up: camera request ownership (2026-10-29)

The S24 Ultra user still reports twitching and inconsistent matching. Physical-device reproduction remains unavailable.

Confirmed a separate asynchronous camera bug: after a close/reopen, the old device-enumeration request used the newer global reader and started it. Late decode completion also could reactivate the barcode camera after entering photo mode, and old failures could stop the current reader.

Each open now owns a session token, reader and video element. Stop invalidates pending requests. Every asynchronous boundary and callback checks ownership; stale requests release only their own stream. No visual-ranking algorithm change is claimed in this follow-up.

Validation: the new delayed-camera regression fails on f2130f4 (old enumeration starts the new reader), and passes all three delayed enumeration/completion/error cases after the fix. Existing camera-return viewport test, eight layout/theme cases, and 12 MP photo-memory/results test pass. These use Chrome with controlled camera responses, not a physical Android camera.

Remaining: obtain the original failed photo and expected product code to evaluate ranking. The 32x32 color/edge matcher is not robust recognition of real scenes, printed catalogs, or photographed screens. The previous eight image fixtures do not establish accuracy on those inputs. This fix is not confirmation that the user's twitching is resolved.
