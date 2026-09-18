/*
(c) 2026, Gianluca Regni
License: MIT (see LICENSE)

Description:
UI of the Strength Workout Fixer from Garmin to Strava web app. Everything runs in the browser:
files never leave the device.
*/

import { readSets, patchSets, fitFromZip } from "./fitpatch.js";

const LBS_TO_KG = 0.45359237;
const STRAVA_UPLOAD = "https://www.strava.com/upload/select";
const $ = id => document.getElementById(id);

// ---------- i18n ----------
const T = {
  en: {
    title: "Strength Workout Fixer from Garmin to Strava",
    lead: "Garmin watches often guess strength exercises wrong, and fixes made in Garmin Connect never reach Strava. This page writes the correct exercises, reps and weights into your workout file, so you can upload it to Strava and see the right workout there.",
    s1: "Workout file (.zip)", s1h: "The .zip from Export Original. A .fit file works too.",
    s2: "Your Garmin Connect corrections (.csv)", s2h: "Only if you already fixed the exercises in Garmin Connect: the .csv from Export to CSV. Otherwise skip this step and fix the exercises below.",
    s3: "Check the exercises", s3h: "Each box is a group of consecutive sets. Below it you see what the watch recorded. Tap a name to change it and pick the right exercise from the list.",
    sets: "sets", detected: "watch", unknown: "Not in the Garmin list: pick one from the suggestions",
    s4: "Get the corrected file", download: "Download corrected file",
    s5: "Upload to Strava", s5h: "First delete the original workout on Strava (app or website), otherwise Strava refuses the new file as a duplicate. Then open the upload page and choose the downloaded file ending in _fixed.fit. On a phone, turn on the browser option \"Desktop site\".",
    open: "Open Strava upload page", err: "Error", fixinput: "Fix the exercises marked in red first.",
    csvwarn: n => `The CSV has ${n.csv} sets, the file has ${n.fit}: extra sets were ignored.`,
  },
};
const L = T.en;
document.querySelectorAll("[data-t]").forEach(el => { el.textContent = L[el.dataset.t]; });

// ---------- exercise catalog ----------
let CATALOG = [];                 // [catCode, subtype(-1 = generic), category, name], best-first
const byLabel = new Map();        // display label -> entry

/**
 * Normalizes an exercise name for matching
 *
 * Args:
 *     s (string): Free-text or FIT enum name.
 *
 * Returns:
 *     key (string): Lower-case letters and digits only.
 */
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Turns a FIT enum name into a readable name ("lat_pulldown" -> "Lat Pulldown")
 *
 * Args:
 *     s (string): FIT enum name.
 *
 * Returns:
 *     text (string): Title-cased name.
 */
const pretty = s => s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/**
 * Display label of a catalog entry, unique across categories
 *
 * Args:
 *     e (Array): Catalog entry.
 *
 * Returns:
 *     label (string): e.g. "Face Pull (Row)" or "Curl".
 */
const labelOf = e => (e[1] < 0 ? pretty(e[2]) : `${pretty(e[3])} (${pretty(e[2])})`);

/**
 * Maps free text (display label, Garmin Connect name, or FIT enum) to an entry
 *
 * Args:
 *     text (string): Exercise name.
 *
 * Returns:
 *     entry (Array|null): Catalog entry or null.
 */
function resolve(text) {
  if (!text) return null;
  if (byLabel.has(text)) return byLabel.get(text);
  const key = norm(text), key2 = key.replace(/s$/, "");
  return CATALOG.find(e => norm(e[3]) === key) ||
         CATALOG.find(e => norm(e[3]).replace(/s$/, "") === key2) || null;
}

/**
 * Label of what the watch stored for a set
 *
 * Args:
 *     s (object): Set from readSets.
 *
 * Returns:
 *     label (string): Readable exercise, "Unknown" if none.
 */
function detectedLabel(s) {
  const e = CATALOG.find(x => x[0] === s.category && x[1] === (s.subtype ?? -1));
  return e ? labelOf(e) : "Unknown";
}

// ---------- state ----------
let fitName = "", fitData = null, sets = [], csvRows = null;

/**
 * Parses a Garmin Connect exercise CSV export
 *
 * Args:
 *     text (string): CSV content (columns Set, Exercise Name, Reps, Weight).
 *
 * Returns:
 *     rows (Map): set number -> {name, reps, weight in kg}.
 */
function parseCsv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
  const split = l => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || [])
    .map(c => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim());
  const head = split(lines[0]);
  const col = n => head.indexOf(n);
  const rows = new Map();
  for (const l of lines.slice(1)) {
    const c = split(l), n = parseInt(c[col("Set")], 10);
    if (!n) continue;
    const w = (c[col("Weight")] || "").split(/\s+/);
    let weight = null;
    if (w.length === 2 && !isNaN(parseFloat(w[0].replace(",", "."))))
      weight = parseFloat(w[0].replace(",", ".")) * (w[1].toLowerCase().startsWith("lb") ? LBS_TO_KG : 1);
    const reps = parseInt(c[col("Reps")], 10);
    rows.set(n, { name: c[col("Exercise Name")], reps: isNaN(reps) ? null : reps, weight });
  }
  return rows;
}

/**
 * Groups consecutive sets with the same weight and same starting name
 *
 * Args:
 *     None
 *
 * Returns:
 *     blocks (Array): {from, to (1-based set numbers), name (initial text), detected}.
 */
function buildBlocks() {
  const blocks = [];
  sets.forEach((s, i) => {
    const n = i + 1;
    const name = csvRows?.get(n)?.name ?? detectedLabel(s);
    const w = csvRows?.get(n)?.weight ?? s.weight;
    const last = blocks[blocks.length - 1];
    if (last && (!csvRows || last.name === name) && Math.abs(last.weight - w) < 1e-6) { last.to = n; return; }
    blocks.push({ from: n, to: n, name, weight: w, detected: detectedLabel(s) });
  });
  return blocks;
}

/**
 * Renders the exercise table
 *
 * Args:
 *     None
 *
 * Returns:
 *     None
 */
function render() {
  const list = $("blocks");
  list.innerHTML = "";
  for (const b of buildBlocks()) {
    const row = document.createElement("div");
    row.className = "block";
    const reps = [];
    for (let n = b.from; n <= b.to; n++) reps.push(csvRows?.get(n)?.reps ?? sets[n - 1].reps);
    const range = b.from === b.to ? `${b.from}` : `${b.from}–${b.to}`;
    row.innerHTML = `
      <div class="meta"><span class="range">${range}</span>
        <span>${b.to - b.from + 1} ${L.sets} · ${reps.join("/")} × ${+b.weight.toFixed(2)} kg</span></div>
      <input list="catalog" autocomplete="off" spellcheck="false">
      <div class="hint">${L.detected}: ${b.detected}</div>`;
    const inp = row.querySelector("input");
    const entry = resolve(b.name);
    inp.value = entry ? labelOf(entry) : b.name;
    inp.dataset.from = b.from;
    inp.dataset.to = b.to;
    const check = () => {
      const ok = !!resolve(inp.value);
      inp.classList.toggle("bad", !ok);
      inp.title = ok ? "" : L.unknown;
    };
    inp.addEventListener("input", check);
    inp.addEventListener("focus", () => inp.select());
    check();
    list.appendChild(row);
  }
  $("step3").hidden = $("step4").hidden = $("step5").hidden = false;
}

/**
 * Collects the corrections from the table
 *
 * Args:
 *     None
 *
 * Returns:
 *     corrections (Map|null): set number -> correction, null if some name is invalid.
 */
function collect() {
  const corrections = new Map();
  for (const inp of document.querySelectorAll("#blocks input")) {
    const e = resolve(inp.value);
    if (!e) { inp.focus(); return null; }
    for (let n = +inp.dataset.from; n <= +inp.dataset.to; n++) {
      const c = csvRows?.get(n);
      corrections.set(n, { category: e[0], subtype: e[1] < 0 ? null : e[1],
                           reps: c?.reps ?? null, weight: c?.weight ?? null });
    }
  }
  return corrections;
}

/**
 * Shows a message box
 *
 * Args:
 *     text (string): Message ("" hides the box).
 *     kind (string): "error" or "info".
 *
 * Returns:
 *     None
 */
function say(text, kind = "error") {
  const m = $("msg");
  m.textContent = text;
  m.className = kind;
  m.hidden = !text;
}

// ---------- events ----------
$("fit").addEventListener("change", async ev => {
  say("");
  const f = ev.target.files[0];
  if (!f) return;
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (f.name.toLowerCase().endsWith(".zip")) {
      const z = await fitFromZip(bytes);
      fitName = z.name; fitData = z.data;
    } else {
      fitName = f.name; fitData = bytes;
    }
    await catalogReady;
    sets = readSets(fitData);
    if (!sets.length) throw new Error("No strength sets in this file");
    $("fitname").textContent = `${fitName} · ${sets.length} ${L.sets}`;
    render();
  } catch (e) {
    say(`${L.err}: ${e.message}`);
  }
});

$("csv").addEventListener("change", async ev => {
  say("");
  const f = ev.target.files[0];
  if (!f) return;
  csvRows = parseCsv(await f.text());
  $("csvname").textContent = f.name;
  if (sets.length) {
    if (csvRows.size !== sets.length)
      say(L.csvwarn({ csv: csvRows.size, fit: sets.length }), "info");
    render();
  }
});

$("download").addEventListener("click", () => {
  say("");
  const corrections = collect();
  if (!corrections) { say(L.fixinput); return; }
  const out = patchSets(fitData, corrections);
  const url = URL.createObjectURL(new Blob([out], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fitName.replace(/\.fit$/i, "") + "_fixed.fit";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

$("strava").href = STRAVA_UPLOAD;

// load catalog
/**
 * Converts a FIT SDK camelCase enum name to snake_case ("latPulldown" -> "lat_pulldown")
 *
 * Args:
 *     s (string): camelCase name.
 *
 * Returns:
 *     name (string): snake_case name.
 */
const snake = s => s.replace(/([a-z])([A-Z0-9])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
                     .replace(/([0-9])([A-Za-z])/g, "$1_$2").toLowerCase();

/**
 * Builds the exercise catalog from the official Garmin FIT SDK profile
 *
 * The catalog is not stored in this repository: it is read at run time from
 * Garmin's own @garmin/fitsdk package (FIT Protocol License).
 *
 * Args:
 *     Profile (object): Profile export of @garmin/fitsdk.
 *
 * Returns:
 *     catalog (Array): [catCode, subtype (-1 = generic), category, name], best match first.
 */
function buildCatalog(Profile) {
  const types = Profile.types, out = [];
  for (const [code, catCamel] of Object.entries(types.exerciseCategory)) {
    if (catCamel === "unknown") continue;
    const cat = snake(catCamel);
    out.push([+code, -1, cat, cat]);
    for (const [sub, name] of Object.entries(types[catCamel + "ExerciseName"] || {}))
      out.push([+code, +sub, cat, snake(name)]);
  }
  // prefer common gym categories, and the generic entry before specific ones
  const rank = e => [PREFERRED.includes(e[2]) ? PREFERRED.indexOf(e[2]) : PREFERRED.length, e[1] < 0 ? 0 : 1];
  return out.map((e, i) => [e, rank(e), i])
            .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1] || a[2] - b[2])
            .map(x => x[0]);
}

const PREFERRED = ["bench_press", "row", "pull_up", "shoulder_press", "curl", "triceps_extension",
                   "lateral_raise", "squat", "deadlift", "lunge", "flye", "crunch", "core", "plank"];
const FIT_SDK_URL = "https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.214.0/+esm";

// load catalog
const catalogReady = import(FIT_SDK_URL).then(({ Profile }) => {
  CATALOG = buildCatalog(Profile);
  const dl = $("catalog");
  for (const e of CATALOG) {
    const l = labelOf(e);
    byLabel.set(l, e);
    const o = document.createElement("option");
    o.value = l;
    dl.appendChild(o);
  }
}).catch(e => say(`${L.err}: could not load the Garmin exercise list (${e.message}). Check your connection and reload.`));
