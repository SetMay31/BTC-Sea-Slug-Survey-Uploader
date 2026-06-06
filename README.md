# Sea Slug SCUBA Survey — Data Uploader

A single-page PWA for Black Turtle Conservation's weekly sea slug (nudibranch)
SCUBA surveys. Same framework and feel as the **Shark** and **EMP** uploaders,
themed with the Sea Slug palette from the BTC Photo Uploader.

One dive survey = shared metadata + **N per-slug observation cards**. Completed
surveys sync **one row per slug** to the shared master Google Sheet via a Google
Apps Script web app. Drafts persist to `localStorage`; submissions queue offline
and flush when back online.

## Fields

**Survey (shared) — Setup / Info tab**
- Number of surveyors → one first-name input per surveyor (comma-joined into the
  Sheet's `Surveyor` column)
- Date — split DD / MM / YYYY (defaults to today)
- Dive Site — EMP-style picker with "+ Add new site"
- Site Region — dropdown; "Other (Please Specify)" reveals a free-text box
- General Substrate of survey site — free text
- Temperature (°C)
- Day or Night — segmented toggle

**Per slug — Slugs tab (collapsible cards)**
- Time — with a "Same time as previous" tick
- Nudi no. — unique, auto-incrementing; **assigned server-side from the Sheet's
  current max at submit** (shown provisionally in-app)
- Depth Found (m) — forced to nearest 0.1
- Substrate found on — identical EMP substrate picker (one per slug). Selecting
  **HC** opens the Growth Form / Health Status / Genus-tier modal
- Species (SPP) — type-to-search box over 131 species from the Koh Tao guidebook,
  plus **Other → manual entry**
- Slug Size (cm) — forced to nearest 0.1
- Notes — optional

## Google Sheet

- Target: the existing master Sea Slug Sheet (single data tab, 20 columns).
- Rows are keyed by the **exact** existing header strings, so the Apps Script
  appends straight onto the sheet with no schema translation.
- `Nudi no.` is assigned by the Apps Script (`max + 1`, under a script lock so
  concurrent surveyors never collide).

### Deploy the sync endpoint

1. Open the master Sea Slug Sheet → **Extensions → Apps Script**.
2. Paste `apps-script.gs`. If the data tab isn't the first sheet, set `TAB_NAME`.
3. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access:
   Anyone*. Copy the `/exec` URL.
4. Paste the URL into the app's **Settings (⚙)** — or bake it into
   `DEFAULT_SYNC_URL` in `app.js` for zero-setup on teammates' devices.

The `SYNC_SECRET` in `app.js` and `apps-script.gs` must match.

## Species data

`species-data.js` holds `SLUG_SPECIES` — 131 unique binomials auto-extracted
from *Nudibranchs and Sea Slugs of Koh Tao and Nearby Islands* (Mehrotra &
Urgell, 2018). The picker also offers **Other** for anything not in the book.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell + screen / modal templates |
| `app.js` | All app logic (state, screens, cards, sync) |
| `species-data.js` | Embedded species list |
| `styles.css` | Sea Slug theme + components |
| `apps-script.gs` | Google Sheets sync + server-side Nudi numbering |
| `manifest.json`, `sw.js` | PWA install + offline shell |

## Notes / follow-ups

- **Photo uploader link:** the Nudi no. should eventually share a single source
  of truth with the Sea Slug Photo Uploader's Slug Number so a data row and its
  photo line up. Planned as a follow-up — currently each tool numbers
  independently and this app reads/assigns from the Sheet.
- Bump `CACHE_VERSION` in `sw.js` (and the `?v=` query in `index.html`) whenever
  client files change so teammates' devices pick up the new build.
