# Seasonal promotions

## Deployment required

The showroom now loads the seasonal promotion manager. **The shared database must also be updated before public campaigns work.**

On 7 October 2026, a read-only request to the existing Sales Tracking project's `showroom_promotion_campaigns` table returned HTTP 401 / `42501: permission denied for function current_app_role`. The table is present, but its public policy incorrectly reaches a manager-only function. Do not grant that function to anonymous visitors as a workaround.

1. In the existing Sales Tracking Supabase project (`msxvnaintafqdgheutfu`), run [database/seasonal-promotions.sql](database/seasonal-promotions.sql) in the SQL Editor as the database administrator. It repairs policies on the campaign table only, validates new/edited campaigns, and keeps history. It does not change the existing role function or users. It is transactional and safe to rerun.
2. Publish this repository's static files using its existing GitHub Pages deployment. No frontend build is required. The new service-worker cache version refreshes the installed app's assets; shared campaign/auth responses bypass the cache.
3. In Management Mode, open **Seasonal Promotions**, sign in with an existing Sales Tracking Super Admin, Admin, or Manager account, and create a disabled test campaign. Verify name, dates, badge, selected products, optional percentage and per-item prices; then enable it for a date range that includes today.
4. Open the showroom in a second signed-out browser/device. Confirm the campaign appears above the catalog. Use View All Promotions, product filters, product details and product selection. Verify the exact selected quote price. Disable the test campaign and refresh the second device; it should disappear while existing quote lines keep their prices.
5. Verify a normal sales account cannot create/edit campaigns. Future, ended and disabled campaigns must remain invisible to signed-out visitors.

The SQL script was tested in an isolated PostgreSQL-compatible PGlite database, including anonymous reads without permission to execute `current_app_role`, rejected anonymous/non-manager writes, manager editing, date/status visibility, validation and rerunning the script. Production SQL execution and authenticated production campaign creation require database-admin/manager access and are not verified by those local tests.

## Management and pricing

- Unlock Management Mode → Seasonal Promotions → sign in → New Campaign. Products already selected in the Interest List are included; search to add or remove products. Up to 300 products per campaign.
- Campaigns have name, optional badge, inclusive start/end dates in Cambodia time, Enabled/Published status, optional percentage discount and optional per-product promo prices. Scheduled/Active/Ended status is calculated automatically; disable to unpublish while keeping history.
- Blank discount and item prices only feature the product. They preserve existing inventory promotions and prices. Badge text is display text, never a discount instruction.
- An explicit item price overrides the campaign percentage. Zero is valid. Percentages use actual sales price, are rounded to cents, and do not stack with source promotions. Item prices above actual sales price are rejected by the editor and ignored by the price projection if encountered in stored data.
- Where campaigns overlap, latest start date wins, then latest creation time, then ID. The editor describes that discounts do not stack.
- Source inventory prices, actual sales prices, costing and stored inventory remain unchanged. Displayed margin is calculated from the offer price. Selecting a product snapshots the exact offer in a new quote line. Existing/opened/saved quotes and reusable set prices are not repriced by campaign refreshes.
- View All Promotions filters to seasonal items while retaining search, category, brand, location, material and sort settings. Promo Only includes both source promotions and seasonal campaigns. Reset Filters clears the seasonal view too.
- Campaigns refresh on opening, reconnect, returning to the tab and at least every five minutes. Local day boundaries are checked each minute even if the network is unavailable. Refreshing does not overwrite an unsaved editor. Conflicting saves from another device are rejected and the draft stays available for comparison.

## Backend inspected

The existing `index.html` uses the Google Apps Script saved-list endpoint with JSONP `list`/`get` reads, `text/plain` no-CORS POST writes, and read-back confirmation. It also handles saved reusable sets. The deployed Apps Script source is not included in this repository or the related Sales Tracking repository. Its API does not establish authenticated campaign writes, so this feature adds no invented actions to that endpoint and leaves saved lists/quotes/sets untouched.

The existing orphaned `seasonal-promotions.js` already targeted the Sales Tracking Supabase campaign table and role lookup. This implementation connects and repairs that integration, using only the existing public URL and publishable key from Sales Tracking's public `config.js`. No service key, password or database credential is embedded. Authentication is in memory and campaign writes remain protected by row-level security.

## Verification

Use Node 24.15+ and pnpm: `pnpm install --frozen-lockfile`, then `pnpm test`. The tests cover pure campaign rules, the actual showroom DOM and cart/filter integration, manager forms and conflicts, all browser script syntax, and isolated database permissions. Local desktop/browser preview uses fixture campaigns only; it must not be mistaken for production persistence verification.
