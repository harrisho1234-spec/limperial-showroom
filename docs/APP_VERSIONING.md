# L'Imperial Showroom app versioning

The sticky header always displays the current release number and the date that release was published. The single metadata source is `app-version.js`, currently **V4.11.07 · Last updated 13 Nov 2026**.

## Numbering

- **V4** stays fixed for this application.
- **11** represents the November major/monthly release sequence.
- **02** is the update count within release 11, always displayed with two digits: V4.11.02, V4.11.03, …
- At the next major/monthly release, increment the middle number and reset the update count to 01: V4.12.01.
- The last-updated date changes when the update is actually released; page refreshes never increment it.

## For the next deployment

From the repo root, in the same PR as the app changes, run:

```bash
node scripts/bump-app-version.cjs update            # V4.11.07 → V4.11.08
node scripts/bump-app-version.cjs monthly           # V4.11.07 → V4.12.01
```

These commands set the release date to the current date in Asia/Phnom_Penh, and consistently update `app-version.js`, the cache-busting version URL in `index.html`, and the offline service-worker cache in `sw.js`. Do **not** run both commands for a single release. For a specified date or a preview:

```bash
node scripts/bump-app-version.cjs update --date 2026-11-08 --dry-run
```

Run `node --test tests/app-version.test.cjs` and existing app tests. Merge the PR after tests pass and verify GitHub Pages has deployed the same commit. For every subsequent app release, bump the version as part of that release; do not create a version merely because a page was reloaded or a draft was saved.

The persistent label is in the sticky header, just below the main control row, on desktop, tablet and mobile. The version is information only: it does not alter catalog, stock, quotations, permissions, sales orders, or synchronization.
