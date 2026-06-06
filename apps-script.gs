/**
 * Sea Slug SCUBA Survey — Google Sheets sync endpoint.
 *
 * This script is BOUND to the existing master Sea Slug spreadsheet. It appends
 * one row per slug to the single data tab, matching the sheet's existing
 * row-1 headers, and assigns each slug a unique "Nudi no." server-side
 * (current max + 1) so concurrent surveyors never collide.
 *
 * SETUP
 *  1. Open the master Sea Slug Google Sheet.
 *  2. Extensions → Apps Script. Replace the default code with this whole file.
 *  3. If your data tab is NOT the first sheet, set TAB_NAME below to its exact
 *     name. Leave it as "" to use the first sheet in the workbook.
 *  4. Deploy → New deployment → Type: Web app
 *       - Description: Sea Slug Survey sync
 *       - Execute as: Me
 *       - Who has access: Anyone
 *     Copy the deployment URL (ends in /exec). Paste it into the app's
 *     Settings (⚙) — or bake it into DEFAULT_SYNC_URL in app.js.
 *
 * Payload shape (POST, JSON body as text/plain):
 *   {
 *     secret: "...",
 *     headers: [ ...exact sheet column headers in order... ],
 *     rows: [ { "<header>": value, ... , "Nudi no.": "" }, ... ]
 *   }
 *
 * GET returns { ok: true, maxNudi: <number> } so the app can show provisional
 * Nudi numbers before submitting.
 */

// Leave "" to target the first sheet in the workbook; otherwise the exact tab name.
const TAB_NAME = "";

// The column that holds the unique, auto-incrementing slug number.
const NUDI_HEADER = "Nudi no.";

// Shared secret token — must match SYNC_SECRET in app.js. Rotate by
// regenerating, updating both files, redeploying and bumping sw.js
// CACHE_VERSION.
const SYNC_SECRET = "5b9d2e7a-1c84-4f60-9a3e-7d2f6b0c8e91-slug1";

function doPost(e) {
  // Serialise concurrent submissions so two devices can't read the same max
  // Nudi no. and assign duplicates.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return jsonResponse({ ok: false, error: "Server busy, try again" });
  }
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body || body.secret !== SYNC_SECRET) {
      return jsonResponse({ ok: false, error: "Unauthorized" });
    }
    if (!body.rows || !body.rows.length) {
      return jsonResponse({ ok: false, error: "No rows in payload" });
    }

    const sheet = getTargetSheet();
    if (!sheet) return jsonResponse({ ok: false, error: "Data tab not found" });

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim(); });
    const nudiCol = headers.indexOf(NUDI_HEADER); // 0-based; -1 if absent

    var nextNudi = nudiCol >= 0 ? currentMaxNudi(sheet, nudiCol) + 1 : null;

    var newRows = body.rows.map(function (rowObj) {
      return headers.map(function (h) {
        if (h === NUDI_HEADER && nudiCol >= 0) {
          return nextNudi++; // assign + advance
        }
        var v = rowObj[h];
        return (v === undefined || v === null) ? "" : v;
      });
    });

    // Bulk append in one write for speed.
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, headers.length).setValues(newRows);

    return jsonResponse({
      ok: true,
      written: newRows.length,
      maxNudi: nudiCol >= 0 ? (nextNudi - 1) : null,
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err && err.message ? err.message : String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  try {
    const sheet = getTargetSheet();
    if (!sheet) return jsonResponse({ ok: true, maxNudi: null });
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim(); });
    const nudiCol = headers.indexOf(NUDI_HEADER);
    const maxNudi = nudiCol >= 0 ? currentMaxNudi(sheet, nudiCol) : null;
    return jsonResponse({ ok: true, service: "Sea Slug Survey sync", maxNudi: maxNudi });
  } catch (err) {
    return jsonResponse({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

/** Return the configured data sheet, or the first sheet if TAB_NAME is "". */
function getTargetSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (TAB_NAME) return ss.getSheetByName(TAB_NAME);
  const sheets = ss.getSheets();
  return sheets.length ? sheets[0] : null;
}

/**
 * Scan the Nudi-no. column (0-based index nudiCol) and return the largest
 * numeric value found, or 0 if the column is empty. Robust to blank cells and
 * stray text — only finite numbers count.
 */
function currentMaxNudi(sheet, nudiCol) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, nudiCol + 1, lastRow - 1, 1).getValues();
  var max = 0;
  for (var i = 0; i < values.length; i++) {
    var n = Number(values[i][0]);
    if (isFinite(n) && n > max) max = n;
  }
  return max;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
