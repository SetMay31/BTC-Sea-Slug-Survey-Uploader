// Sea Slug SCUBA Survey — single-page PWA
// One dive survey = shared metadata + N sea-slug (nudibranch) observations.
// Persists drafts to localStorage; syncs completed surveys to a Google Apps
// Script web app that writes one row per slug to a single shared Sheet tab.
//
// The species list (SLUG_SPECIES) is loaded from species-data.js, auto-
// extracted from "Nudibranchs and Sea Slugs of Koh Tao" (Mehrotra & Urgell).

/* =========================================================================
 *  REFERENCE DATA
 * ========================================================================= */

// Dive sites for the Sea Slug surveys (Koh Tao / Koh Phangan area). Surveyors
// can append device-local custom sites via the picker's "+ Add new site".
const DEFAULT_DIVE_SITES = [
  "Aow Leuk",
  "Aow Mao",
  "Buoyancy World",
  "BTD Reef",
  "Buddha Point",
  "Chalok Bay",
  "Chumphon Pinnacle",
  "Green Rock",
  "Hin Fai",
  "Hin Pee Wee",
  "Hin Wong Pinnacle",
  "HTMS Sattakut",
  "HTMS Suphairin",
  "Japanese Gardens",
  "Junkyard",
  "King Kong Rocks",
  "Laem Thian",
  "Lighthouse",
  "Mae Haad",
  "Mango Bay",
  "No Name Pinnacle",
  "Red Rock",
  "Sail Rock",
  "Shark Island",
  "Southwest Pinnacle",
  "Tanote Bay",
  "Tao Tong",
  "Twins",
  "White Rock",
];

// Site Region — habitat / zone type. Fixed dropdown list. "Other (Please
// Specify)" reveals a free-text box that is folded into the stored value.
const SITE_REGION_OTHER = "Other (Please Specify)";
const SITE_REGIONS = [
  "Artificial Reef",
  "Caves",
  "Coral Reef",
  "Main Site",
  "Muck",
  "NA",
  "Pinnacle",
  "Reef Wall",
  "Reef Wall (North)",
  "Reef Wall (East)",
  "Reef Wall (South)",
  "Reef Wall (West)",
  "Rubble",
  "Sand",
  "Shipwreck",
  SITE_REGION_OTHER,
];

// Substrate types — identical to the EMP Uploader. One selection per slug.
// needsHC → opens the Hard Coral details modal (growth / health / genus).
// needsText → opens the "Other" free-text modal.
const SUBSTRATE_TYPES = [
  // Abiotic
  { code: "SI", name: "Silt", group: "abiotic" },
  { code: "SD", name: "Sand", group: "abiotic" },
  { code: "RB", name: "Rubble", group: "abiotic" },
  { code: "RC", name: "Rock", group: "abiotic" },
  { code: "AR", name: "Artificial Reef", group: "abiotic" },
  { code: "TR", name: "Trash", group: "abiotic" },
  // Biotic
  { code: "SC", name: "Soft Coral", group: "biotic" },
  { code: "SP", name: "Sponge", group: "biotic" },
  { code: "NIA", name: "Nutrient Indicator Algae", group: "biotic" },
  { code: "OTH", name: "Other", group: "biotic", needsText: true },
  { code: "HC", name: "Hard Coral", group: "biotic", needsHC: true },
];

// Hard Coral growth forms — identical to EMP.
const HC_GROWTH = [
  ["B", "Branching"],
  ["C", "Corymbose"],
  ["D", "Digitate"],
  ["E", "Encrusting"],
  ["F", "Foliose"],
  ["L", "Laminar"],
  ["M", "Massive"],
  ["R", "Solitary"],
  ["S", "Submassive"],
  ["T", "Tabulate"],
  ["U", "Unknown"],
];

// Coral genus codes grouped by Tax tier — identical to EMP. The HC modal
// narrows the genus picker by tier so the surveyor doesn't scroll one giant
// list.
const HC_GENUS_TIERS = {
  "Tax I":   ["ACRO", "POCI", "DUNC", "DIPL", "LOBO", "GONIO", "HYDN", "PAVO", "PECT", "MERU", "PACH", "GARD", "GALA", "PORI", "MONT", "STYL", "FIMB", "PLER"],
  "Tax II":  ["ASTR", "TURB", "CAUL", "DIPS", "PLES", "CYPH", "ECHINOPO", "OXYP", "FUNG", "DANA", "PLEU", "CTEN", "HERP", "POLY", "CYCL", "LITH", "PODA", "SAND"],
  "Tax III": ["ACAN", "ECHINOPH", "PSAM", "COSC", "LEPTA", "PSEU", "LEPTOS", "FAVI", "GONIA", "PARA", "PLAT", "LEPTOR", "TUBA", "CLAD"],
};

const HC_HEALTH = [
  ["H", "Healthy"],
  ["PBL", "Partially Bleached"],
  ["FBL", "Fully Bleached"],
  ["RKC", "Recently Killed Coral"],
  ["DC", "Dead Coral"],
];

// Species picker sentinel for "not in the book".
const SPECIES_OTHER = "Other";

// Exact Google Sheet column headers, in order. Row objects are keyed by these
// strings so the Apps Script can map straight onto the existing sheet without
// any schema translation. "Nudi no." is filled server-side at submit.
const SHEET_HEADERS = [
  "Surveyor",
  "No. Surveyors",
  "Date DD",
  "Date MM",
  "Date YYYY",
  "Dive Site",
  "Site Region",
  "Temperature (degrees C)",
  "Day or Night",
  "Survey Start Time (00:00)",
  "Nudi no.",
  "Depth found (m)(0.0)",
  "Substrate found on",
  "Coral Growth Form",
  "Coral Health Status",
  "Coral Genus",
  "Species",
  "Size (cm)",
  "General substrate of survey site from observation",
  "Notes",
];

/* =========================================================================
 *  STORAGE KEYS
 * ========================================================================= */

const LS_DRAFT = "slug:draft";
const LS_QUEUE = "slug:queue";
const LS_SETTINGS = "slug:settings";
const LS_CUSTOM_SITES = "slug:customDiveSites";

// Baked-in Apps Script Web App endpoint for the BTC team's shared master Sea
// Slug Sheet. PASTE THE /exec URL HERE after deploying apps-script.gs (or set
// it per-device in Settings ⚙). Leaving it blank just means sync is off until
// a URL is provided — exports still work.
const DEFAULT_SYNC_URL = "https://script.google.com/macros/s/AKfycbzHSJMLksCJK5Be8wvDJ8KNmm-ubIdeAuAy1S-jqF2CyODz-UGFY5-YNTACdsdX9pds0A/exec";

// Shared secret token sent in every submission payload. Must match the
// SYNC_SECRET constant in apps-script.gs. Rotate by regenerating, updating
// both files, redeploying the script and bumping the sw.js CACHE_VERSION.
const SYNC_SECRET = "5b9d2e7a-1c84-4f60-9a3e-7d2f6b0c8e91-slug1";

/* =========================================================================
 *  STATE
 * ========================================================================= */

const state = {
  draft: null,
  queue: [],
  settings: { syncUrl: "", autoSync: true },
  current: "setup",
  expandedSlug: null, // id of the slug card currently expanded
  maxNudi: null,      // best-effort current max Nudi no. fetched from the Sheet
};

function newDraft() {
  return {
    id: cryptoId(),
    createdAt: new Date().toISOString(),
    metadata: {
      numberOfSurveyors: "",
      surveyorNames: [],
      date: "", // ISO "YYYY-MM-DD"; split into DD/MM/YYYY for the Sheet
      diveSite: "",
      siteRegion: "",
      siteRegionOther: "",
      generalSubstrate: "",
      temperature: "",
      dayNight: "",
    },
    slugs: [],
    submitted: false,
  };
}

function newSlug() {
  return {
    id: cryptoId(),
    time: "",
    depthFound: "",
    substrate: null,       // { code, growth?, health?, genus?, text? }
    species: "",           // a binomial from SLUG_SPECIES, or SPECIES_OTHER
    speciesOther: "",      // free text when species === SPECIES_OTHER
    size: "",
    notes: "",
  };
}

function cryptoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* =========================================================================
 *  PERSISTENCE
 * ========================================================================= */

function saveDraft() {
  if (state.draft) localStorage.setItem(LS_DRAFT, JSON.stringify(state.draft));
}
function loadDraft() {
  const raw = localStorage.getItem(LS_DRAFT);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (!d.slugs) d.slugs = [];
    if (!d.metadata) d.metadata = {};
    if (!Array.isArray(d.metadata.surveyorNames)) d.metadata.surveyorNames = [];
    // Migrate legacy split-date drafts (dateDD/dateMM/dateYYYY) to ISO date.
    if (!d.metadata.date && d.metadata.dateYYYY && d.metadata.dateMM && d.metadata.dateDD) {
      d.metadata.date = `${d.metadata.dateYYYY}-${d.metadata.dateMM}-${d.metadata.dateDD}`;
    }
    if (typeof d.submitted !== "boolean") d.submitted = false;
    return d;
  } catch { return null; }
}
function clearDraft() {
  localStorage.removeItem(LS_DRAFT);
  state.draft = null;
}
function saveQueue() { localStorage.setItem(LS_QUEUE, JSON.stringify(state.queue)); }
function loadQueue() {
  const raw = localStorage.getItem(LS_QUEUE);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
function loadCustomSites() {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM_SITES) || "[]"); }
  catch { return []; }
}
function saveCustomSites(list) {
  localStorage.setItem(LS_CUSTOM_SITES, JSON.stringify(list));
}
function getAllDiveSites() {
  const seen = new Set();
  const out = [];
  [...DEFAULT_DIVE_SITES, ...loadCustomSites()].forEach((s) => {
    const trimmed = (s || "").trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  });
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
function addCustomSite(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return false;
  const all = getAllDiveSites().map((s) => s.toLowerCase());
  if (all.includes(trimmed.toLowerCase())) return false;
  const custom = loadCustomSites();
  custom.push(trimmed);
  saveCustomSites(custom);
  return true;
}

function saveSettings() { localStorage.setItem(LS_SETTINGS, JSON.stringify(state.settings)); }
function loadSettings() {
  const defaults = { syncUrl: DEFAULT_SYNC_URL, autoSync: true };
  const raw = localStorage.getItem(LS_SETTINGS);
  if (!raw) return defaults;
  try { return { ...defaults, ...JSON.parse(raw) }; }
  catch { return defaults; }
}

/* =========================================================================
 *  ROUTING / RENDER
 * ========================================================================= */

const $app = () => document.getElementById("app");

function renderTpl(id) {
  const tpl = document.getElementById(id);
  const node = tpl.content.firstElementChild.cloneNode(true);
  $app().innerHTML = "";
  $app().appendChild(node);
  return node;
}

function go(screen) {
  state.current = screen;
  document.querySelectorAll("#survey-tabs .tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.screen === screen);
  });
  const tabs = document.getElementById("survey-tabs");
  tabs.classList.toggle("hidden", screen === "setup");
  if (screen === "setup") renderSetup();
  else if (screen === "info") renderInfo();
  else if (screen === "slugs") renderSlugs();
  else if (screen === "review") renderReview();
}

/* =========================================================================
 *  DIVE SITE PICKER — strict <select> + "+ Add new site" affordance.
 *  Same pattern as the EMP / Shark uploaders.
 * ========================================================================= */

function attachDiveSitePicker(select, initialValue) {
  if (!select || select.tagName !== "SELECT") return;

  function rebuildOptions(selectedValue) {
    const placeholder = select.querySelector('option[value=""]');
    select.innerHTML = "";
    if (placeholder) select.appendChild(placeholder);
    const sites = getAllDiveSites();
    if (selectedValue && !sites.includes(selectedValue)) sites.push(selectedValue);
    sites
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        select.appendChild(opt);
      });
    if (selectedValue) select.value = selectedValue;
  }
  rebuildOptions(initialValue || "");

  const host = select.closest("label") || select.parentNode;
  const addRow = document.createElement("div");
  addRow.className = "dive-site-add-row";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "dive-site-add";
  addBtn.textContent = "+ Add new site";

  const addForm = document.createElement("div");
  addForm.className = "dive-site-add-form hidden";
  const newInput = document.createElement("input");
  newInput.type = "text";
  newInput.maxLength = 60;
  newInput.placeholder = "New site name";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "primary";
  saveBtn.textContent = "Save";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "ghost";
  cancelBtn.textContent = "Cancel";
  addForm.append(newInput, saveBtn, cancelBtn);

  addBtn.addEventListener("click", () => {
    addBtn.classList.add("hidden");
    addForm.classList.remove("hidden");
    newInput.focus();
  });
  cancelBtn.addEventListener("click", () => {
    addForm.classList.add("hidden");
    addBtn.classList.remove("hidden");
    newInput.value = "";
  });
  function commitNew() {
    const name = newInput.value.trim();
    if (!name) return;
    const added = addCustomSite(name);
    rebuildOptions(name);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    if (added) toast(`Added "${name}" to site list.`);
    else toast(`"${name}" is already in the site list — selected.`);
    addForm.classList.add("hidden");
    addBtn.classList.remove("hidden");
    newInput.value = "";
  }
  saveBtn.addEventListener("click", commitNew);
  newInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitNew(); }
    if (e.key === "Escape") { cancelBtn.click(); }
  });

  addRow.append(addBtn, addForm);
  host.appendChild(addRow);
}

/* =========================================================================
 *  SETUP / INFO SHARED FIELD WIRING
 * ========================================================================= */

// Wire the native date picker and default to today. Stores ISO "YYYY-MM-DD"
// in m.date; the DD/MM/YYYY split happens only when building Sheet rows.
function setupDateFields(form, m) {
  const dateInp = form.querySelector('[name="date"]');
  if (!dateInp) return;
  if (!m.date) m.date = todayISO();
  dateInp.value = m.date;
}

function todayISO() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

// Split an ISO "YYYY-MM-DD" date into { dd, mm, yyyy } strings (blank if unset).
function splitDate(iso) {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!mt) return { dd: "", mm: "", yyyy: "" };
  return { yyyy: mt[1], mm: mt[2], dd: mt[3] };
}

// Populate the Site Region dropdown + wire the "Other" free-text reveal.
function setupRegionField(form, m, onChange) {
  const sel = form.querySelector('[name="siteRegion"]');
  const otherInput = form.querySelector('[name="siteRegionOther"]');
  if (sel && sel.options.length <= 1) {
    SITE_REGIONS.forEach((r) => sel.appendChild(new Option(r, r)));
  }
  if (sel) sel.value = m.siteRegion || "";
  if (otherInput) otherInput.value = m.siteRegionOther || "";
  function syncOther() {
    const show = sel && sel.value === SITE_REGION_OTHER;
    const wrap = otherInput && otherInput.closest(".region-other-wrap");
    if (wrap) wrap.classList.toggle("hidden", !show);
  }
  syncOther();
  if (sel) sel.addEventListener("change", () => { syncOther(); if (onChange) onChange(); });
  if (otherInput && onChange) otherInput.addEventListener("input", onChange);
}

// Day / Night segmented toggle.
function setupDayNight(form, m, onChange) {
  const wrap = form.querySelector(".daynight-toggle");
  if (!wrap) return;
  wrap.innerHTML = "";
  ["Day", "Night"].forEach((v) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pill-btn" + (m.dayNight === v ? " selected" : "");
    b.textContent = v;
    b.addEventListener("click", () => {
      m.dayNight = m.dayNight === v ? "" : v;
      wrap.querySelectorAll(".pill-btn").forEach((x) => x.classList.remove("selected"));
      if (m.dayNight) b.classList.add("selected");
      if (onChange) onChange();
    });
    wrap.appendChild(b);
  });
}

// Number of surveyors → render that many first-name inputs.
function setupSurveyorNames(form, m, onChange) {
  const numInput = form.querySelector('[name="numberOfSurveyors"]');
  const namesWrap = form.querySelector(".surveyor-names");
  if (!numInput || !namesWrap) return;

  function render() {
    const n = Math.max(0, Math.min(20, parseInt(numInput.value, 10) || 0));
    const names = m.surveyorNames.slice(0, n);
    while (names.length < n) names.push("");
    m.surveyorNames = names;

    namesWrap.innerHTML = "";
    if (n === 0) { namesWrap.classList.add("hidden"); return; }
    namesWrap.classList.remove("hidden");
    for (let i = 0; i < n; i++) {
      const label = document.createElement("label");
      label.className = "surveyor-name-field";
      const span = document.createElement("span");
      span.textContent = `Surveyor ${i + 1} — first name`;
      const inp = document.createElement("input");
      inp.type = "text";
      inp.maxLength = 40;
      inp.placeholder = "e.g. Seth";
      inp.value = m.surveyorNames[i] || "";
      inp.addEventListener("input", () => {
        m.surveyorNames[i] = inp.value;
        if (onChange) onChange();
      });
      label.append(span, inp);
      namesWrap.appendChild(label);
    }
  }
  numInput.addEventListener("input", () => { render(); if (onChange) onChange(); });
  render();
}

/* =========================================================================
 *  SETUP SCREEN
 * ========================================================================= */

function renderSetup() {
  const node = renderTpl("tpl-setup");
  const form = node.querySelector("#setup-form");
  const resumeBtn = node.querySelector("#resume-btn");

  const existing = loadDraft();
  const m = existing ? existing.metadata : newDraft().metadata;

  if (existing) {
    resumeBtn.classList.remove("hidden");
    resumeBtn.addEventListener("click", () => {
      state.draft = existing;
      saveDraft();
      go("slugs");
    });
  }

  form.querySelector('[name="numberOfSurveyors"]').value = m.numberOfSurveyors || "";
  form.querySelector('[name="generalSubstrate"]').value = m.generalSubstrate || "";
  form.querySelector('[name="temperature"]').value = m.temperature || "";

  setupSurveyorNames(form, m);
  setupDateFields(form, m);
  attachDiveSitePicker(form.querySelector('[name="diveSite"]'), m.diveSite || "");
  setupRegionField(form, m);
  setupDayNight(form, m);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const meta = {
      numberOfSurveyors: (fd.get("numberOfSurveyors") || "").toString().trim(),
      surveyorNames: m.surveyorNames.map((s) => (s || "").trim()),
      date: (fd.get("date") || "").toString(),
      diveSite: (fd.get("diveSite") || "").toString(),
      siteRegion: (fd.get("siteRegion") || "").toString(),
      siteRegionOther: (fd.get("siteRegionOther") || "").toString().trim(),
      generalSubstrate: (fd.get("generalSubstrate") || "").toString().trim(),
      temperature: (fd.get("temperature") || "").toString().trim(),
      dayNight: m.dayNight || "",
    };
    const err = metadataError(meta);
    if (err) { toast(err); return; }

    if (!state.draft) state.draft = newDraft();
    state.draft.metadata = meta;
    saveDraft();
    go("slugs");
  });
}

// Returns an error string if required metadata is missing, else null.
function metadataError(meta) {
  if (!meta.numberOfSurveyors || parseInt(meta.numberOfSurveyors, 10) < 1)
    return "Enter the number of surveyors.";
  if (!meta.surveyorNames.length || meta.surveyorNames.some((n) => !n))
    return "Enter every surveyor's first name.";
  if (!meta.date) return "Choose the survey date.";
  if (!meta.diveSite) return "Choose a dive site.";
  if (!meta.siteRegion) return "Choose a site region.";
  if (meta.siteRegion === SITE_REGION_OTHER && !meta.siteRegionOther)
    return "Specify the site region (you chose Other).";
  if (meta.temperature === "") return "Enter the water temperature.";
  if (!meta.dayNight) return "Choose Day or Night.";
  return null;
}

/* =========================================================================
 *  INFO SCREEN (auto-saving metadata editor)
 * ========================================================================= */

function renderInfo() {
  if (!state.draft) return go("setup");
  const node = renderTpl("tpl-info");
  const form = node.querySelector("#info-form");
  const savedIndicator = node.querySelector("#info-saved");
  const m = state.draft.metadata;

  form.querySelector('[name="numberOfSurveyors"]').value = m.numberOfSurveyors || "";
  form.querySelector('[name="generalSubstrate"]').value = m.generalSubstrate || "";
  form.querySelector('[name="temperature"]').value = m.temperature || "";

  let savedTimer = null;
  function flashSaved() {
    if (!savedIndicator) return;
    savedIndicator.textContent = "Saved ✓";
    savedIndicator.classList.add("flash");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => {
      savedIndicator.textContent = "Changes save automatically.";
      savedIndicator.classList.remove("flash");
    }, 1400);
  }

  function persist() {
    const fd = new FormData(form);
    m.numberOfSurveyors = (fd.get("numberOfSurveyors") || "").toString().trim();
    m.date = (fd.get("date") || "").toString();
    m.diveSite = (fd.get("diveSite") || "").toString();
    m.siteRegion = (fd.get("siteRegion") || "").toString();
    m.siteRegionOther = (fd.get("siteRegionOther") || "").toString().trim();
    m.generalSubstrate = (fd.get("generalSubstrate") || "").toString().trim();
    m.temperature = (fd.get("temperature") || "").toString().trim();
    // surveyorNames + dayNight are mutated directly by their widgets.
    saveDraft();
    flashSaved();
  }

  setupSurveyorNames(form, m, persist);
  setupDateFields(form, m);
  attachDiveSitePicker(form.querySelector('[name="diveSite"]'), m.diveSite || "");
  setupRegionField(form, m, persist);
  setupDayNight(form, m, persist);

  ["generalSubstrate", "temperature"].forEach((n) => {
    const el = form.querySelector(`[name="${n}"]`);
    if (el) el.addEventListener("input", persist);
  });
  form.querySelector('[name="date"]').addEventListener("change", persist);
  form.querySelector('[name="diveSite"]').addEventListener("change", persist);
}

/* =========================================================================
 *  SLUGS SCREEN — collapsible list of per-slug cards
 * ========================================================================= */

function renderSlugs() {
  if (!state.draft) return go("setup");
  const node = renderTpl("tpl-slugs");

  const countPill = node.querySelector("#slug-count");
  const list = node.querySelector("#slug-list");
  const addBtn = node.querySelector("#add-slug");

  function refreshCount() {
    const n = state.draft.slugs.length;
    countPill.textContent = `${n} slug${n === 1 ? "" : "s"}`;
  }
  refreshCount();

  function renderList() {
    list.innerHTML = "";
    if (state.draft.slugs.length === 0) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = "No slugs logged yet. Tap “+ Add a slug” when you spot your first nudibranch.";
      list.appendChild(hint);
      return;
    }
    state.draft.slugs.forEach((s, idx) => {
      list.appendChild(buildSlugCard(s, idx, () => {
        refreshCount();
        renderList();
      }));
    });
  }
  renderList();

  addBtn.addEventListener("click", () => {
    const s = newSlug();
    state.draft.slugs.push(s);
    state.expandedSlug = s.id;
    saveDraft();
    refreshCount();
    renderList();
  });

  node.querySelector("#no-slugs").addEventListener("click", openNoSlugsModal);

  // Best-effort: refresh the provisional Nudi numbering from the Sheet.
  fetchMaxNudi().then((max) => {
    if (max != null && state.current === "slugs") renderList();
  });
}

/* =========================================================================
 *  "NO SLUGS SPOTTED" — submit one summary row (row-1535 format)
 *  Slug-specific columns are recorded as "NA"; the Apps Script leaves the
 *  Nudi no. as "NA" rather than assigning a number.
 * ========================================================================= */

function openNoSlugsModal() {
  if (!state.draft) return;
  if (state.draft.submitted) { toast("This survey has already been submitted."); return; }
  const metaErr = metadataError(state.draft.metadata);
  if (metaErr) { toast(metaErr + " (fill the Info tab first)."); return; }
  if (state.draft.slugs.length > 0) {
    toast("You have slugs logged — submit those via Review, or remove them first.");
    return;
  }

  const node = renderModal("tpl-noslug-modal");
  const timeInp = node.querySelector("#noslug-time");
  const now = new Date();
  timeInp.value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  node.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(node));
  node.querySelector('[data-action="confirm"]').addEventListener("click", () => {
    const time = timeInp.value;
    const notes = node.querySelector("#noslug-notes").value.trim();
    closeModal(node);
    submitNoSlugsSurvey(time, notes);
  });
}

// Build the single "no slugs" row in the exact row-1535 format.
function buildNoSlugRow(draft, time, notes) {
  const m = draft.metadata;
  const d = splitDate(m.date);
  return [{
    "Surveyor": joinSurveyors(m),
    "No. Surveyors": m.numberOfSurveyors || "",
    "Date DD": d.dd,
    "Date MM": d.mm,
    "Date YYYY": d.yyyy,
    "Dive Site": m.diveSite || "",
    "Site Region": m.siteRegion === SITE_REGION_OTHER ? (m.siteRegionOther || "Other") : (m.siteRegion || ""),
    "Temperature (degrees C)": m.temperature || "",
    "Day or Night": m.dayNight || "",
    "Survey Start Time (00:00)": time || "",
    "Nudi no.": "NA",
    "Depth found (m)(0.0)": "NA",
    "Substrate found on": "NA",
    "Coral Growth Form": "",
    "Coral Health Status": "",
    "Coral Genus": "",
    "Species": "NA",
    "Size (cm)": "NA",
    "General substrate of survey site from observation": m.generalSubstrate || "",
    "Notes": notes || "",
    surveyId: draft.id,
  }];
}

async function submitNoSlugsSurvey(time, notes) {
  if (!state.draft || state.draft.submitted) return;
  const rows = buildNoSlugRow(state.draft, time, notes);
  const payload = { rows, headers: SHEET_HEADERS };

  state.queue.push({ id: state.draft.id, queuedAt: new Date().toISOString(), payload });
  saveQueue();
  updateQueuePill();

  state.draft.submitted = true;
  state.draft.noSlugs = true;
  saveDraft();

  if (!state.settings.syncUrl) {
    toast("Queued ‘no slugs’ survey locally — will push when a Sheets URL is set.");
    go("review");
    return;
  }
  try {
    await flushQueue();
    toast("Submitted ‘no slugs’ survey to Google Sheets ✓");
  } catch (e) {
    toast(`Sync failed (${e.message}). Queued, will retry when online.`);
  }
  go("review");
}

// Provisional Nudi number for the slug at list index `idx` (0-based). Returns
// a string like "1625" or "(auto)" if the current max is unknown.
function provisionalNudi(idx) {
  if (state.maxNudi == null) return "(auto)";
  return String(state.maxNudi + idx + 1);
}

function buildSlugCard(slug, idx, onChange) {
  const card = document.createElement("div");
  card.className = "shark-card" + (state.expandedSlug === slug.id ? " open" : "");

  const head = document.createElement("div");
  head.className = "shark-card-head";

  const num = document.createElement("div");
  num.className = "shark-card-num";
  num.textContent = idx + 1;
  head.appendChild(num);

  const summary = document.createElement("div");
  summary.className = "shark-card-summary";
  const title = document.createElement("div");
  title.className = "shark-card-title";
  const meta = document.createElement("div");
  meta.className = "shark-card-meta";
  meta.textContent = buildSlugSummary(slug);
  const incompleteBadge = document.createElement("span");
  incompleteBadge.className = "incomplete-badge";
  incompleteBadge.textContent = "Incomplete";
  summary.append(title, meta, incompleteBadge);
  head.appendChild(summary);

  function refreshTitle() {
    title.textContent = `Slug ${idx + 1}  ·  Nudi #${provisionalNudi(idx)}`;
  }
  refreshTitle();

  function refreshIncomplete() {
    const missing = slugMissingFields(slug);
    incompleteBadge.classList.toggle("hidden", missing.length === 0);
    incompleteBadge.title = missing.length ? `Missing: ${missing.join(", ")}` : "";
  }
  refreshIncomplete();

  const chev = document.createElement("div");
  chev.className = "shark-card-chev";
  chev.textContent = state.expandedSlug === slug.id ? "▾" : "▸";
  head.appendChild(chev);

  head.addEventListener("click", () => {
    state.expandedSlug = state.expandedSlug === slug.id ? null : slug.id;
    onChange();
  });
  card.appendChild(head);

  if (state.expandedSlug === slug.id) {
    card.appendChild(buildSlugBody(slug, idx, () => {
      refreshTitle();
      meta.textContent = buildSlugSummary(slug);
      refreshIncomplete();
    }, () => {
      const i = state.draft.slugs.findIndex((x) => x.id === slug.id);
      if (i >= 0) state.draft.slugs.splice(i, 1);
      if (state.expandedSlug === slug.id) state.expandedSlug = null;
      saveDraft();
      onChange();
    }, () => {
      state.expandedSlug = null;
      onChange();
    }));
  }

  return card;
}

function buildSlugSummary(s) {
  const bits = [];
  if (s.time) bits.push(s.time);
  const sp = speciesDisplay(s);
  if (sp) bits.push(sp);
  if (s.substrate) bits.push(formatSubstrateValue(s.substrate));
  if (s.depthFound) bits.push(`${s.depthFound} m`);
  if (s.size) bits.push(`${s.size} cm`);
  return bits.length ? bits.join(" · ") : "Tap to fill in details";
}

function speciesDisplay(s) {
  if (s.species === SPECIES_OTHER) return s.speciesOther ? `Other: ${s.speciesOther}` : "Other";
  return s.species || "";
}

function buildSlugBody(slug, idx, onUpdate, onDelete, onSave) {
  const body = document.createElement("div");
  body.className = "shark-card-body";

  function field(labelText, build) {
    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = labelText;
    label.appendChild(span);
    label.appendChild(build());
    return label;
  }
  function persist() { saveDraft(); onUpdate(); }

  // Nudi number readout (provisional, assigned for real on submit).
  const nudiNote = document.createElement("div");
  nudiNote.className = "nudi-note";
  nudiNote.textContent = `Nudi no. #${provisionalNudi(idx)} — assigned on submit`;
  body.appendChild(nudiNote);

  const grid = document.createElement("div");
  grid.className = "shark-grid";

  // Time + "same as previous"
  const timeLabel = document.createElement("label");
  const timeSpan = document.createElement("span");
  timeSpan.textContent = "Time *";
  const timeInput = document.createElement("input");
  timeInput.type = "time";
  timeInput.value = slug.time || "";
  timeInput.addEventListener("change", () => { slug.time = timeInput.value; persist(); });
  timeLabel.append(timeSpan, timeInput);

  // "Same as previous card" — only meaningful when there is a previous slug
  // with a time recorded. Copies that time into this card.
  const prev = state.draft.slugs[idx - 1];
  if (prev && prev.time) {
    const sameRow = document.createElement("label");
    sameRow.className = "same-prev-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!slug.time && slug.time === prev.time;
    const txt = document.createElement("span");
    txt.textContent = `Same time as previous (${prev.time})`;
    cb.addEventListener("change", () => {
      if (cb.checked) { slug.time = prev.time; timeInput.value = prev.time; }
      persist();
    });
    sameRow.append(cb, txt);
    timeLabel.appendChild(sameRow);
  }
  grid.appendChild(timeLabel);

  // Depth Found (m) — forced to nearest 0.1 on blur
  grid.appendChild(field("Depth Found (m) *", () => {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = "0.1";
    inp.min = "0";
    inp.inputMode = "decimal";
    inp.placeholder = "e.g. 6.6";
    inp.value = slug.depthFound || "";
    inp.addEventListener("focus", () => setTimeout(() => inp.select(), 0));
    inp.addEventListener("input", () => { slug.depthFound = inp.value; persist(); });
    inp.addEventListener("blur", () => {
      const v = roundTo1(inp.value);
      if (v !== null) { inp.value = v; slug.depthFound = v; persist(); }
    });
    return inp;
  }));

  body.appendChild(grid);

  // Substrate found on — EMP-style button grid, single selection per slug.
  body.appendChild(buildSubstrateField(slug, persist));

  // Species — searchable combobox + Other free-text.
  body.appendChild(buildSpeciesField(slug, persist));

  // Slug Size (cm) — forced to nearest 0.1 on blur
  body.appendChild(field("Slug Size (cm) *", () => {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = "0.1";
    inp.min = "0";
    inp.inputMode = "decimal";
    inp.placeholder = "e.g. 2.5";
    inp.value = slug.size || "";
    inp.addEventListener("focus", () => setTimeout(() => inp.select(), 0));
    inp.addEventListener("input", () => { slug.size = inp.value; persist(); });
    inp.addEventListener("blur", () => {
      const v = roundTo1(inp.value);
      if (v !== null) { inp.value = v; slug.size = v; persist(); }
    });
    return inp;
  }));

  // Notes (optional)
  const notesLabel = document.createElement("label");
  const notesSpan = document.createElement("span");
  notesSpan.textContent = "Notes";
  const notesArea = document.createElement("textarea");
  notesArea.rows = 2;
  notesArea.maxLength = 800;
  notesArea.placeholder = "Anything else worth noting about this slug.";
  notesArea.value = slug.notes || "";
  notesArea.addEventListener("input", () => { slug.notes = notesArea.value; persist(); });
  notesLabel.append(notesSpan, notesArea);
  body.appendChild(notesLabel);

  // Card actions — Delete (left) + Save Slug (right)
  const actions = document.createElement("div");
  actions.className = "shark-card-actions";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "shark-delete-btn";
  delBtn.textContent = "Delete this slug";
  delBtn.addEventListener("click", () => {
    if (!confirm("Delete this slug? This removes it from the draft on this device.")) return;
    onDelete();
    toast("Slug removed.");
  });
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "primary shark-save-btn";
  saveBtn.textContent = "Save Slug";
  saveBtn.addEventListener("click", () => {
    if (typeof onSave === "function") onSave();
    toast("Slug saved.");
  });
  actions.append(delBtn, saveBtn);
  body.appendChild(actions);

  return body;
}

/* ---- Substrate field (single select per slug) ---- */

function buildSubstrateField(slug, persist) {
  const wrap = document.createElement("div");
  wrap.className = "slug-subfield";
  const span = document.createElement("span");
  span.className = "field-label";
  span.textContent = "Substrate found on *";
  wrap.appendChild(span);

  const grid = document.createElement("div");
  grid.className = "substrate-buttons";

  const current = document.createElement("div");
  current.className = "sub-current";
  function refreshCurrent() {
    current.textContent = slug.substrate
      ? `Selected: ${formatSubstrateValue(slug.substrate)}`
      : "Tap a substrate code";
  }

  SUBSTRATE_TYPES.forEach((sub) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sub-btn " + (sub.code === "HC" ? "hc" : sub.group);
    if (slug.substrate && slug.substrate.code === sub.code) b.classList.add("selected");
    b.innerHTML = `<span class="code">${sub.code}</span><span class="name">${sub.name}</span>`;
    b.addEventListener("click", () => {
      const commit = (val) => {
        slug.substrate = val;
        grid.querySelectorAll(".sub-btn").forEach((x) => x.classList.remove("selected"));
        if (val) b.classList.add("selected");
        refreshCurrent();
        persist();
      };
      if (sub.needsHC) {
        openHCModal((details) => { if (details) commit({ code: "HC", ...details }); });
      } else if (sub.needsText) {
        openOTHModal((text) => { if (text !== null) commit({ code: "OTH", text }); });
      } else {
        commit({ code: sub.code });
      }
    });
    grid.appendChild(b);
  });

  wrap.appendChild(grid);
  refreshCurrent();
  wrap.appendChild(current);
  return wrap;
}

/* ---- Species field (searchable combobox + Other) ---- */

function buildSpeciesField(slug, persist) {
  const wrap = document.createElement("div");
  wrap.className = "slug-subfield species-field";
  const span = document.createElement("span");
  span.className = "field-label";
  span.textContent = "Species (SPP) *";
  wrap.appendChild(span);

  const combo = document.createElement("div");
  combo.className = "species-combo";

  const input = document.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  input.placeholder = "Type to search… e.g. Chromodoris";
  input.value = slug.species && slug.species !== SPECIES_OTHER ? slug.species : (slug.species === SPECIES_OTHER ? SPECIES_OTHER : "");

  const menu = document.createElement("div");
  menu.className = "species-menu hidden";

  const otherWrap = document.createElement("label");
  otherWrap.className = "species-other-wrap hidden";
  const otherSpan = document.createElement("span");
  otherSpan.textContent = "Other species — type the name";
  const otherInput = document.createElement("input");
  otherInput.type = "text";
  otherInput.maxLength = 80;
  otherInput.placeholder = "Genus species (not in the book)";
  otherInput.value = slug.speciesOther || "";
  otherInput.addEventListener("input", () => { slug.speciesOther = otherInput.value; persist(); });
  otherWrap.append(otherSpan, otherInput);

  function syncOther() {
    otherWrap.classList.toggle("hidden", slug.species !== SPECIES_OTHER);
  }

  function selectValue(val) {
    slug.species = val;
    input.value = val === SPECIES_OTHER ? SPECIES_OTHER : val;
    menu.classList.add("hidden");
    syncOther();
    persist();
  }

  function renderMenu(filter) {
    menu.innerHTML = "";
    const f = (filter || "").trim().toLowerCase();
    const list = (typeof SLUG_SPECIES !== "undefined" ? SLUG_SPECIES : [])
      .filter((s) => s.toLowerCase().includes(f))
      .slice(0, 60);
    if (list.length === 0) {
      const none = document.createElement("div");
      none.className = "species-item muted";
      none.textContent = "No matches in the book";
      menu.appendChild(none);
    }
    list.forEach((s) => {
      const item = document.createElement("div");
      item.className = "species-item";
      item.textContent = s;
      item.addEventListener("mousedown", (e) => { e.preventDefault(); selectValue(s); });
      menu.appendChild(item);
    });
    // Always offer Other at the bottom.
    const other = document.createElement("div");
    other.className = "species-item species-item-other";
    other.textContent = "➕ Other (not in the book)";
    other.addEventListener("mousedown", (e) => { e.preventDefault(); selectValue(SPECIES_OTHER); });
    menu.appendChild(other);
  }

  input.addEventListener("focus", () => { renderMenu(input.value === SPECIES_OTHER ? "" : input.value); menu.classList.remove("hidden"); });
  input.addEventListener("input", () => { renderMenu(input.value); menu.classList.remove("hidden"); });
  input.addEventListener("blur", () => { setTimeout(() => menu.classList.add("hidden"), 150); });

  combo.append(input, menu);
  wrap.append(combo, otherWrap);
  syncOther();
  return wrap;
}

/* ---- shared little helpers ---- */

// Round a numeric string to nearest 0.1. Returns the formatted string, or
// null for blank / non-numeric input. (6 → "6.0", 6.57 → "6.6", 6.54 → "6.5")
function roundTo1(raw) {
  const s = (raw || "").toString().trim();
  if (!s) return null;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return Math.max(0, n).toFixed(1);
}

function formatSubstrateValue(val) {
  if (!val) return "";
  if (val.code === "HC") return `HC ${val.growth} ${val.health} ${val.genus}`;
  if (val.code === "OTH") return `OTH: ${val.text}`;
  return val.code;
}

function slugMissingFields(s) {
  const missing = [];
  if (!s.time) missing.push("time");
  if (!s.depthFound) missing.push("depth");
  if (!s.substrate) missing.push("substrate");
  if (!s.species) missing.push("species");
  else if (s.species === SPECIES_OTHER && !s.speciesOther) missing.push("species name");
  if (!s.size) missing.push("size");
  return missing;
}

/* =========================================================================
 *  MODALS — HC details, OTH text
 * ========================================================================= */

function makeCodeButton(code, name) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "code-btn";
  const codeEl = document.createElement("span");
  codeEl.className = "code-btn-code";
  codeEl.textContent = code;
  const nameEl = document.createElement("span");
  nameEl.className = "code-btn-name";
  nameEl.textContent = name;
  b.append(codeEl, nameEl);
  return b;
}

function openHCModal(onClose) {
  const node = renderModal("tpl-hc-modal");
  let growth = null;
  let health = null;

  const growthWrap = node.querySelector('[data-group="growth"]');
  HC_GROWTH.forEach(([code, name]) => {
    const b = makeCodeButton(code, name);
    b.addEventListener("click", () => {
      growth = code;
      growthWrap.querySelectorAll("button").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
    });
    growthWrap.appendChild(b);
  });

  const healthWrap = node.querySelector('[data-group="health"]');
  HC_HEALTH.forEach(([code, name]) => {
    const b = makeCodeButton(code, name);
    b.addEventListener("click", () => {
      health = code;
      healthWrap.querySelectorAll("button").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
    });
    healthWrap.appendChild(b);
  });

  const tier = node.querySelector("#hc-genus-tier");
  const genus = node.querySelector("#hc-genus");
  function fillGenusForTier(tierName) {
    if (!tierName || !HC_GENUS_TIERS[tierName]) {
      genus.innerHTML = '<option value="">← Pick tier first</option>';
      genus.disabled = true;
      return;
    }
    genus.innerHTML = '<option value="">— Genus —</option>';
    const codes = [...HC_GENUS_TIERS[tierName]].sort();
    codes.forEach((code) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code;
      genus.appendChild(opt);
    });
    genus.disabled = false;
  }
  tier.addEventListener("change", () => fillGenusForTier(tier.value));

  node.querySelector('[data-action="cancel"]').addEventListener("click", () => {
    closeModal(node); onClose(null);
  });
  node.querySelector('[data-action="confirm"]').addEventListener("click", () => {
    if (!growth || !health) { toast("Pick a growth form and health code."); return; }
    const genusValue = (genus.value || "").trim() || "UNDEF";
    closeModal(node);
    onClose({ growth, health, genus: genusValue });
  });
}

function openOTHModal(onClose) {
  const node = renderModal("tpl-oth-modal");
  const inp = node.querySelector("#oth-text");
  setTimeout(() => inp.focus(), 50);
  inp.addEventListener("input", () => {
    const pos = inp.selectionStart;
    const upper = inp.value.toUpperCase();
    if (upper !== inp.value) {
      inp.value = upper;
      try { inp.setSelectionRange(pos, pos); } catch (_) {}
    }
  });
  node.querySelector('[data-action="cancel"]').addEventListener("click", () => {
    closeModal(node); onClose(null);
  });
  node.querySelector('[data-action="confirm"]').addEventListener("click", () => {
    if (!inp.value.trim()) { toast("Describe the substrate found on."); return; }
    closeModal(node);
    onClose(inp.value.trim().toUpperCase());
  });
}

/* =========================================================================
 *  REVIEW / SUBMIT
 * ========================================================================= */

function renderReview() {
  if (!state.draft) return go("setup");
  const node = renderTpl("tpl-review");
  const sum = node.querySelector("#review-summary");
  const m = state.draft.metadata;

  const metaList = document.createElement("dl");
  metaList.className = "review-meta";
  [
    ["Surveyors", `${m.numberOfSurveyors || "—"} (${(m.surveyorNames || []).filter(Boolean).join(", ") || "—"})`],
    ["Date", (() => { const d = splitDate(m.date); return d.dd ? `${d.dd}/${d.mm}/${d.yyyy}` : "—"; })()],
    ["Dive Site", m.diveSite],
    ["Site Region", m.siteRegion === SITE_REGION_OTHER ? `Other: ${m.siteRegionOther}` : m.siteRegion],
    ["Temperature (°C)", m.temperature],
    ["Day or Night", m.dayNight],
    ["General Substrate", m.generalSubstrate],
    ["Slugs Logged", String(state.draft.slugs.length)],
  ].forEach(([k, v]) => {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = (v === "" || v === undefined || v === null) ? "—" : v;
    metaList.append(dt, dd);
  });
  sum.appendChild(metaList);

  const block = document.createElement("div");
  block.className = "review-block";
  const h4 = document.createElement("h4");
  h4.textContent = "Slugs ";
  const badge = document.createElement("span");
  const status = reviewStatus();
  badge.className = "review-status " + status.kind;
  badge.textContent = status.label;
  h4.appendChild(badge);
  block.appendChild(h4);

  if (status.notes) {
    const p = document.createElement("p");
    p.className = "muted small";
    p.textContent = status.notes;
    p.style.margin = "4px 0 0";
    block.appendChild(p);
  }

  if (state.draft.slugs.length > 0) {
    const mini = document.createElement("div");
    mini.className = "shark-mini-list";
    state.draft.slugs.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "shark-mini";
      const numEl = document.createElement("span");
      numEl.className = "shark-mini-num";
      numEl.textContent = `#${i + 1}`;
      const wrap = document.createElement("div");
      wrap.style.flex = "1";
      const wTitle = document.createElement("div");
      wTitle.textContent = `Slug ${i + 1} · Nudi #${provisionalNudi(i)}`;
      wTitle.style.fontWeight = "600";
      const wDetail = document.createElement("div");
      wDetail.className = "shark-mini-detail";
      wDetail.textContent = buildSlugSummary(s);
      wrap.append(wTitle, wDetail);
      const missing = slugMissingFields(s);
      if (missing.length) {
        const warn = document.createElement("div");
        warn.className = "shark-mini-warn";
        warn.textContent = `Missing: ${missing.join(", ")}`;
        wrap.appendChild(warn);
      }
      row.append(numEl, wrap);
      mini.appendChild(row);
    });
    block.appendChild(mini);
  }
  sum.appendChild(block);

  // Prominent, on-screen list of everything blocking submission (tooltips are
  // invisible on phones). Each incomplete slug is tappable to jump to it.
  const blockers = submissionBlockers();
  if (!state.draft.submitted && blockers.length) {
    const panel = document.createElement("div");
    panel.className = "submit-blockers";
    const ph = document.createElement("h4");
    ph.textContent = "Can’t submit yet — finish these first:";
    panel.appendChild(ph);
    const ul = document.createElement("ul");
    blockers.forEach((b) => {
      const li = document.createElement("li");
      li.textContent = b.text;
      if (b.type === "slug") {
        li.classList.add("clickable");
        li.addEventListener("click", () => {
          state.expandedSlug = b.id;
          go("slugs");
        });
      }
      ul.appendChild(li);
    });
    panel.appendChild(ul);
    const actions = node.querySelector(".review-actions.all-actions");
    actions.parentNode.insertBefore(panel, actions);
  }

  const submitBtn = node.querySelector("#submit-all");
  const metaErr = metadataError(m);
  const incompleteCount = state.draft.slugs.filter((s) => slugMissingFields(s).length > 0).length;
  const noSlugs = state.draft.slugs.length === 0;
  submitBtn.disabled = state.draft.submitted || !!metaErr || incompleteCount > 0 || noSlugs;
  if (state.draft.submitted) {
    submitBtn.textContent = "ALREADY SUBMITTED";
    submitBtn.title = "This draft has already been submitted. Reset to start a new survey.";
  } else if (metaErr) {
    submitBtn.title = metaErr;
  } else if (noSlugs) {
    submitBtn.title = "Add at least one slug before submitting.";
  } else if (incompleteCount > 0) {
    submitBtn.title = `${incompleteCount} slug${incompleteCount === 1 ? "" : "s"} still missing required fields.`;
  } else {
    submitBtn.title = `Submit ${state.draft.slugs.length} slug row${state.draft.slugs.length === 1 ? "" : "s"} to the Sheet.`;
  }
  submitBtn.addEventListener("click", submitSurvey);

  node.querySelector("#download-csv").addEventListener("click", downloadCSV);
  node.querySelector("#copy-tsv").addEventListener("click", copyTSV);
  node.querySelector("#export-json").addEventListener("click", exportJSON);
  node.querySelector("#discard-all").addEventListener("click", () => {
    if (confirm("Reset all data for this survey? This wipes the entire draft and cannot be undone.")) {
      clearDraft();
      toast("All data reset");
      go("setup");
    }
  });
}

// Every reason the survey can't be submitted yet, as a flat list. Metadata
// problems first, then the "no slugs" case, then each incomplete slug with the
// specific fields it's missing. Empty array => submission is allowed.
function submissionBlockers() {
  const d = state.draft;
  const out = [];
  const metaErr = metadataError(d.metadata);
  if (metaErr) out.push({ type: "meta", text: `Survey Info — ${metaErr}` });
  if (d.slugs.length === 0) {
    out.push({ type: "noslug", text: "No slugs added — add at least one, or use “No slugs spotted this survey” on the Slugs tab." });
  }
  d.slugs.forEach((s, i) => {
    const miss = slugMissingFields(s);
    if (miss.length) out.push({ type: "slug", id: s.id, idx: i, text: `Slug ${i + 1} — missing ${miss.join(", ")} (tap to fix)` });
  });
  return out;
}

function reviewStatus() {
  const n = state.draft.slugs.length;
  if (state.draft.submitted) {
    return { kind: "complete", label: "Submitted", notes: "This survey has been submitted. Reset to start a new one." };
  }
  const metaErr = metadataError(state.draft.metadata);
  if (metaErr) {
    return { kind: "partial", label: "Check Info", notes: metaErr + " Fix it on the Info tab." };
  }
  if (n === 0) {
    return { kind: "nodata", label: "No Slugs", notes: "Add at least one slug on the Slugs tab before submitting." };
  }
  const incomplete = state.draft.slugs.filter((s) => slugMissingFields(s).length > 0).length;
  if (incomplete > 0) {
    return {
      kind: "partial",
      label: "Incomplete",
      notes: `${n} slug${n === 1 ? "" : "s"} logged · ${incomplete} with missing required fields. Fill them in on the Slugs tab.`,
    };
  }
  return { kind: "complete", label: "Complete", notes: `${n} slug${n === 1 ? "" : "s"} ready to submit.` };
}

/* =========================================================================
 *  PAYLOAD / ROW BUILDING
 *  Rows are keyed by the exact Sheet header strings (SHEET_HEADERS). The
 *  Apps Script maps them straight onto the existing sheet and fills the
 *  "Nudi no." column server-side.
 * ========================================================================= */

function joinSurveyors(m) {
  // Periods between names to match the Sheet's existing convention, e.g.
  // "Seth. Tereza. Nicole. Thomas".
  return (m.surveyorNames || []).map((s) => (s || "").trim()).filter(Boolean).join(". ");
}

function buildRows(draft) {
  const m = draft.metadata;
  const d = splitDate(m.date);
  const baseMeta = {
    "Surveyor": joinSurveyors(m),
    "No. Surveyors": m.numberOfSurveyors || "",
    "Date DD": d.dd,
    "Date MM": d.mm,
    "Date YYYY": d.yyyy,
    "Dive Site": m.diveSite || "",
    "Site Region": m.siteRegion === SITE_REGION_OTHER ? (m.siteRegionOther || "Other") : (m.siteRegion || ""),
    "Temperature (degrees C)": m.temperature || "",
    "Day or Night": m.dayNight || "",
    "General substrate of survey site from observation": m.generalSubstrate || "",
  };

  return draft.slugs.map((s) => {
    const sub = s.substrate || {};
    return {
      ...baseMeta,
      "Survey Start Time (00:00)": s.time || "",
      "Nudi no.": "", // assigned server-side at submit
      "Depth found (m)(0.0)": s.depthFound || "",
      "Substrate found on": sub.code === "OTH" ? `OTH: ${sub.text || ""}` : (sub.code || ""),
      "Coral Growth Form": sub.code === "HC" ? (sub.growth || "") : "",
      "Coral Health Status": sub.code === "HC" ? (sub.health || "") : "",
      "Coral Genus": sub.code === "HC" ? (sub.genus || "") : "",
      "Species": s.species === SPECIES_OTHER ? (s.speciesOther || "Other") : (s.species || ""),
      "Size (cm)": s.size || "",
      "Notes": s.notes || "",
      // surveyId rides along for traceability but isn't a sheet column.
      surveyId: draft.id,
    };
  });
}

/* =========================================================================
 *  SUBMIT / SYNC
 * ========================================================================= */

async function submitSurvey() {
  if (!state.draft) return;
  if (state.draft.submitted) { toast("This survey has already been submitted."); return; }

  const metaErr = metadataError(state.draft.metadata);
  if (metaErr) { toast(metaErr); return; }
  if (state.draft.slugs.length === 0) { toast("Add at least one slug before submitting."); return; }

  const incomplete = state.draft.slugs
    .map((s, i) => ({ idx: i + 1, missing: slugMissingFields(s) }))
    .filter((x) => x.missing.length > 0);
  if (incomplete.length > 0) {
    toast(`Slug ${incomplete[0].idx} is missing: ${incomplete[0].missing.join(", ")}.`);
    return;
  }

  const rows = buildRows(state.draft);
  const payload = { rows, headers: SHEET_HEADERS };

  state.queue.push({ id: state.draft.id, queuedAt: new Date().toISOString(), payload });
  saveQueue();
  updateQueuePill();

  state.draft.submitted = true;
  saveDraft();
  renderReview();

  if (!state.settings.syncUrl) {
    toast(`Queued ${rows.length} slug row${rows.length === 1 ? "" : "s"} locally — add a Sheets URL in Settings to push.`);
    return;
  }

  try {
    await flushQueue();
    toast(`Submitted ${rows.length} slug row${rows.length === 1 ? "" : "s"} to Google Sheets ✓`);
  } catch (e) {
    toast(`Sync failed (${e.message}). Rows queued, will retry when online.`);
  }
}

async function flushQueue() {
  if (!state.settings.syncUrl) return;
  if (!navigator.onLine) throw new Error("Offline");
  while (state.queue.length > 0) {
    const item = state.queue[0];
    const body = { ...item.payload, secret: SYNC_SECRET };
    const res = await fetch(state.settings.syncUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    if (data && data.ok === false) throw new Error(data.error || "Apps Script error");
    // Refresh our provisional max from the server's response if present.
    if (data && typeof data.maxNudi === "number") state.maxNudi = data.maxNudi;
    state.queue.shift();
    saveQueue();
    updateQueuePill();
  }
}

// Best-effort GET to read the current max Nudi no. so cards can show a
// provisional number. Silently ignores failures (offline, no URL, CORS).
async function fetchMaxNudi() {
  if (!state.settings.syncUrl || !navigator.onLine) return state.maxNudi;
  try {
    const res = await fetch(state.settings.syncUrl, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (data && typeof data.maxNudi === "number") state.maxNudi = data.maxNudi;
  } catch (_) { /* ignore */ }
  return state.maxNudi;
}

/* =========================================================================
 *  PENDING SYNC QUEUE MODAL
 * ========================================================================= */

function relativeTime(iso) {
  if (!iso) return "queued";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const mm = Math.floor(s / 60);
  if (mm < 60) return `${mm} min ago`;
  const h = Math.floor(mm / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function summarizeQueueItem(item) {
  const rows = (item.payload && item.payload.rows) || [];
  const site = rows[0] && rows[0]["Dive Site"];
  const date = rows[0] ? `${rows[0]["Date DD"]}/${rows[0]["Date MM"]}/${rows[0]["Date YYYY"]}` : "";
  return {
    title: site ? `${site} · ${date}`.trim() : "Sea slug survey",
    detail: `${rows.length} slug row${rows.length === 1 ? "" : "s"}`,
  };
}

function removeQueueItem(idx) {
  const item = state.queue[idx];
  if (state.draft && item && item.id === state.draft.id) {
    state.draft.submitted = false;
    saveDraft();
  }
  state.queue.splice(idx, 1);
  saveQueue();
  updateQueuePill();
}

function openQueueModal() {
  const node = renderModal("tpl-queue-modal");
  const list = node.querySelector("#queue-list");
  const emptyHint = node.querySelector("#queue-empty-hint");
  const syncHint = node.querySelector("#queue-sync-hint");
  const retryBtn = node.querySelector("#queue-retry-btn");

  function render() {
    list.innerHTML = "";
    if (state.queue.length === 0) {
      emptyHint.classList.remove("hidden");
      retryBtn.disabled = true;
      syncHint.textContent = "";
      return;
    }
    emptyHint.classList.add("hidden");

    state.queue.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "queue-item";
      const top = document.createElement("div");
      top.className = "queue-item-top";
      const titleWrap = document.createElement("div");
      titleWrap.className = "queue-item-title-wrap";
      const summary = summarizeQueueItem(item);
      const title = document.createElement("div");
      title.className = "queue-item-title";
      title.textContent = summary.title;
      const detail = document.createElement("div");
      detail.className = "queue-item-detail muted small";
      detail.textContent = `${summary.detail} · ${relativeTime(item.queuedAt)}`;
      titleWrap.append(title, detail);
      top.appendChild(titleWrap);

      const rmBtn = document.createElement("button");
      rmBtn.className = "queue-item-remove";
      rmBtn.textContent = "Remove";
      rmBtn.title = "Drop this submission and re-enable the survey for re-submission";
      rmBtn.addEventListener("click", () => {
        if (!confirm(`Remove this queued submission?\n\n${summary.title}\n${summary.detail}`)) return;
        removeQueueItem(idx);
        render();
        if (state.current === "review") renderReview();
      });
      top.appendChild(rmBtn);
      card.appendChild(top);
      list.appendChild(card);
    });

    if (!state.settings.syncUrl) {
      syncHint.textContent = "No Sheets sync URL set in Settings — Retry won't push anywhere yet.";
      retryBtn.disabled = true;
    } else if (!navigator.onLine) {
      syncHint.textContent = "Offline — Retry will fail until the device is back online.";
      retryBtn.disabled = false;
    } else {
      syncHint.textContent = "";
      retryBtn.disabled = false;
    }
  }
  render();

  node.querySelector('[data-action="close"]').addEventListener("click", () => closeModal(node));
  retryBtn.addEventListener("click", async () => {
    retryBtn.disabled = true;
    retryBtn.textContent = "Retrying…";
    try {
      await flushQueue();
      toast("Queue flushed ✓");
      closeModal(node);
      if (state.current === "review") renderReview();
    } catch (e) {
      retryBtn.disabled = false;
      retryBtn.textContent = "Retry now";
      toast(`Retry failed (${e.message})`);
      render();
    }
  });
}

function openSettings() {
  const node = renderModal("tpl-settings");
  node.querySelector("#sync-url").value = state.settings.syncUrl || "";
  node.querySelector("#auto-sync").checked = !!state.settings.autoSync;
  node.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(node));
  node.querySelector('[data-action="save"]').addEventListener("click", () => {
    state.settings.syncUrl = node.querySelector("#sync-url").value.trim();
    state.settings.autoSync = node.querySelector("#auto-sync").checked;
    saveSettings();
    closeModal(node);
    toast("Settings saved");
    updateQueuePill();
    fetchMaxNudi();
  });
}

function renderModal(tplId) {
  const tpl = document.getElementById(tplId);
  const node = tpl.content.firstElementChild.cloneNode(true);
  document.body.appendChild(node);
  return node;
}
function closeModal(node) {
  if (node && node.parentNode) node.parentNode.removeChild(node);
}

/* =========================================================================
 *  EXPORTS — JSON / CSV / TSV
 * ========================================================================= */

function exportJSON() {
  if (!state.draft && state.queue.length === 0) return;
  const data = state.draft
    ? { rows: buildRows(state.draft), headers: SHEET_HEADERS }
    : state.queue;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  downloadBlob(blob, `sea-slug-survey-${stampForFilename()}.json`);
}

function downloadCSV() {
  if (!state.draft) return;
  const csv = surveyToDelimited(",");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `sea-slug-survey-${stampForFilename()}.csv`);
}

async function copyTSV() {
  if (!state.draft) return;
  const tsv = surveyToDelimited("\t");
  try {
    await navigator.clipboard.writeText(tsv);
    toast("Copied as TSV — paste into Sheets.");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = tsv;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast("Copied to clipboard."); }
    catch { toast("Could not copy — select and copy manually."); }
    ta.remove();
  }
}

function surveyToDelimited(sep) {
  const cols = SHEET_HEADERS;
  const rows = buildRows(state.draft);
  const lines = [cols.map(csvEscape).join(sep)];
  rows.forEach((r) => {
    lines.push(cols.map((c) => csvEscape(r[c] === undefined ? "" : r[c])).join(sep));
  });
  return lines.join("\n");
}

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\t\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function stampForFilename() {
  const m = state.draft?.metadata || {};
  const date = m.date || new Date().toISOString().slice(0, 10);
  const loc = (m.diveSite || "survey").replace(/[^a-z0-9]+/gi, "_");
  return `${date}-${loc}`;
}

/* =========================================================================
 *  UI HELPERS
 * ========================================================================= */

function updateQueuePill() {
  const el = document.getElementById("queue-count");
  if (el) el.textContent = state.queue.length;
}

function updateNetStatus() {
  const dot = document.getElementById("net-status");
  if (!dot) return;
  dot.classList.toggle("offline", !navigator.onLine);
  dot.title = navigator.onLine ? "Online" : "Offline — submissions will queue";
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

/* =========================================================================
 *  BOOT
 * ========================================================================= */

function boot() {
  state.queue = loadQueue();
  state.settings = loadSettings();
  state.draft = loadDraft();
  updateQueuePill();
  updateNetStatus();

  document.querySelectorAll("#survey-tabs .tab").forEach((b) => {
    b.addEventListener("click", () => {
      if (!state.draft) return go("setup");
      go(b.dataset.screen);
    });
  });
  document.getElementById("settings-btn").addEventListener("click", openSettings);
  document.getElementById("queue-count").addEventListener("click", openQueueModal);

  window.addEventListener("online", () => {
    updateNetStatus();
    if (state.settings.autoSync && state.queue.length > 0) flushQueue().catch(() => {});
  });
  window.addEventListener("offline", updateNetStatus);

  fetchMaxNudi();
  go(state.draft ? "slugs" : "setup");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", boot);
