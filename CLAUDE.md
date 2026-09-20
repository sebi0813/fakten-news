# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Faktum is an ad-free German-language news PWA served as static files from `docs/` on
GitHub Pages. There is **no server and no build step for the frontend** — the browser
loads `docs/index.html` + `docs/app.js` and fetches `docs/data/news.json`. All the
"backend" work (fetching feeds, filtering, dedup, translation, scoring) runs
**server-side in GitHub Actions** on a schedule and commits the resulting JSON back
into the repo. This design exists to sidestep CORS (browsers can't fetch third-party
RSS directly) with no proxies, no API keys in the client, and nothing to host.

**No npm dependencies.** Pure Node 20+ (uses built-in `fetch` and `zlib`). There is no
`package.json`. Everything is ESM `.mjs`.

## Commands

```bash
# Build news.json locally (respects the 5:30–23:00 Vienna time window)
node scripts/build-news.mjs

# Force a build outside the time window (for local testing)
FAKTUM_FORCE=1 node scripts/build-news.mjs

# Serve the app locally
python3 -m http.server 8099 --directory docs   # → http://localhost:8099

# Regenerate PNG app icons (no external image libs)
node scripts/make-icons.mjs

# Push your own changes without colliding with the hourly news-bot commits
./sync.sh
```

There is no test suite, no linter, and no bundler. Verification is by running the build
and reading its console log (per-source `ok`/`ALT`/`FEHLER` lines, dedup counts,
translation counts).

### Translation / check-it require a Claude key

`scripts/build-news.mjs`, `translate.mjs`, and `checkit.mjs` use Claude (Haiku 4.5) via
`ANTHROPIC_API_KEY`. It is **optional**: without it the build runs fully, but foreign
articles that the free translation service couldn't handle stay untranslated (orange
language badge) and the check-it quiz tab stays empty. In CI it comes from a
**repository secret** (Settings → Secrets → Actions), never committed.

## The pipeline (`scripts/build-news.mjs` → `main()`)

Order matters — several stages were deliberately placed where they are:

1. **Time-window gate** — `insideUpdateWindow()` checks real Vienna time (handles DST;
   cron can't). Skips the build at night **unless** the current data is >4h old
   (`alterDesBestands()`), so rare nightly runs still produce fresh data.
2. **Fetch** all `SOURCES` in parallel; parse RSS/Atom by hand (`parseFeed`). Flag
   **stale feeds** by the age of the *newest* entry (>7 days), not by whether items
   passed the time filter — a slow feed is not a dead feed.
3. **Filter** opinion/ads (`OPINION_PATTERNS`), focus-only tech sources, AI-noise.
4. **First dedup** (`dedupe`, threshold 0.62) — catches same-language duplicates.
5. **Translate** foreign titles+summaries to German (`translateItems`), cached in
   `docs/data/i18n-cache.json`.
6. **Re-filter** opinion patterns on now-German text (catches translated advertorials).
7. **Second dedup** — the effective one: only after everything is German can ORF, BBC,
   Le Monde etc. be recognized as the same story. Cross-category, higher threshold for
   `wissenschaft`/`fokus`. Multiple independent sources on one story raises its
   fact-score (`alsoBonus`).
8. **Score** each item (`factScore` 0–100 → `hoch`/`solide`/`prüfen`), detect focus
   topics (`detectFocus`) and flash/warning events (`isFlash`).
9. **Summarize** merged clusters, cap per category, sample-check 12 links for liveness.
10. Build the **info block** (traffic/ÖBB closures — scraped from HTML pages, not
    feeds), **events** (scraped from meinbezirk.at), and **check-it** quiz.
11. Write `docs/data/news.json`. **Exits non-zero if zero items** — a hard failure.

## Frontend (`docs/app.js`, ~100KB single file)

- **`APP_VERSION`** (e.g. `'v21'`) is the self-heal mechanism. The build reads it out of
  `app.js` and stamps it into `news.json`. On launch the app compares the running
  version against `news.json`'s `appVersion`; on mismatch it clears caches, unregisters
  the service worker, and reloads once (a `sessionStorage` marker prevents a loop).
  **Bump `APP_VERSION` whenever you change frontend behavior**, or iOS may keep serving
  a resurrected-from-memory old build.
- **Storage is per-profile and namespaced**: `faktum.<profileId>.<key>.v1`
  (`prefs`, `settings`, `read`, `saved`, `history`, `cache`). `migrateToProfiles()` and
  `migratePrefs()` handle upgrades from the old flat keys. Everything is local
  (localStorage) — no accounts, no tracking, no server round-trip.
- **Learning**: 👍/👎 adjust weights on source (±1.0), category (±0.6), keywords (±0.7);
  `personalScore` drives the "Für dich" tab, blended with recency + fact-score, then
  diversified so one source doesn't dominate. Voting does **not** rebuild the feed.
- Read-tracking is by `IntersectionObserver` (≥60% visible for 5s); read items fade but
  only disappear on the next feed rebuild.

## Data & git model — important

`docs/data/news.json` and `docs/data/i18n-cache.json` are **generated and committed**.
The `news-bot` pushes them hourly.

- **Never hand-edit** `news.json` — it's overwritten every build.
- The **i18n-cache must always be committed** — dropping it makes every run re-translate
  everything and hit the free service's rate limit.
- Because the bot moves the remote forward constantly, a plain `git push` of your own
  work will be rejected. **Use `./sync.sh`**, which rebases onto the bot's state and
  auto-resolves the two generated files (news.json → yours; i18n-cache → *union* of both
  sides so no paid translation is lost).

## Configuration lives in `scripts/sources.mjs`

This is the tuning surface for editorial behavior. Key exports:
`SOURCES` (feeds, with `trust` 1–3, `lang`, `cat`, and flags `requireLocal`/`focusOnly`/
`ai`), `CATEGORIES`, `REGIONS` + `LOCAL_TERMS` (region detection by geolocated place
name), `FOCUS_TOPICS`, `CONTEXT_TOPICS` (background dossiers), `FLASH_PATTERNS`,
`OPINION_PATTERNS`/`CLICKBAIT_PATTERNS`/`URL_BLOCKLIST` (filters), event scraping config,
and the ÖBB/traffic constants. Deliberately limited to **German + English** sources: the
free translation service is call-count limited, and more languages caused HTTP 429s that
left most items untranslated (see README for the full rationale).

## Scheduling reality (see README "Warum der Zeitplan…")

GitHub cron is "best effort" and was measured dropping to **zero runs for 28h**. The
real trigger is an **external cron (`repository_dispatch: news-update`)**; the GitHub
`schedule` is a fallback. Automatic triggers respect the night quiet-hours; only
`workflow_dispatch` (manual) and `push` build at any hour. The workflow retries the
push up to 5× because the bot can lose the race against a concurrent push.

## README

`README.md` is unusually detailed (German) and documents the *why* behind nearly every
design decision — dedup thresholds, why APA/OTS is excluded, why traffic data is
news-derived not live, the iOS PWA caching workaround, etc. Consult it before changing
filtering, dedup, translation, or scheduling behavior; the current values are the result
of documented experiments.
