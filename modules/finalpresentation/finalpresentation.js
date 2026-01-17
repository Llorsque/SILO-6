
/**
 * SILO — Module: A Final presentation
 * Scope: ONLY modules/finalpresentation/*
 * Does NOT touch header, global CSS, routing, or other modules.
 */

import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { loadDataset, loadMeta } from "../../core/storage.js";

/* ------------------------- helpers: normalize & getters ------------------------- */

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const normKey = (v) => norm(v).toLowerCase();

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return "";
}

function asInt(v) {
  const n = Number(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

/* ------------------------- typeable dropdown ------------------------- */

function TypeableDropdown({ placeholder, value, options, onPick }) {
  const wrap = el("div", { class: "fp-dd" });
  const input = el("input", {
    class: "fp-input",
    placeholder,
    value: value || "",
    autocomplete: "off",
    spellcheck: "false"
  });
  const list = el("div", { class: "fp-dd__list" });

  let open = false;

  const setOpen = (v) => {
    open = v;
    list.style.display = open ? "block" : "none";
    if (open) renderList();
  };

  const renderList = () => {
    clear(list);
    const q = normKey(input.value);
    const filtered = options
      .filter((o) => normKey(o).includes(q))
      .slice(0, 80);

    if (!filtered.length) {
      list.appendChild(el("div", { class: "fp-dd__item fp-dd__item--muted" }, "Geen resultaten"));
      return;
    }
    for (const o of filtered) {
      const item = el("div", { class: "fp-dd__item" }, o);
      item.addEventListener("click", () => {
        input.value = o;
        onPick?.(o);
        setOpen(false);
      });
      list.appendChild(item);
    }
  };

  function commitIfExactMatch(){
    const typed = norm(input.value);
    if(!typed) return;
    const match = options.find(o => normKey(o) === normKey(typed));
    if(match){
      input.value = match;
      onPick?.(match);
    }
  }

  input.addEventListener("focus", () => setOpen(true));
  input.addEventListener("input", () => { if (!open) setOpen(true); renderList(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
    if (e.key === "Enter") {
      e.preventDefault();
      commitIfExactMatch();
      setOpen(false);
    }
  });

  input.addEventListener("blur", () => {
    // If the user typed a full name and tabs away, treat it as selection.
    commitIfExactMatch();
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) setOpen(false);
  });

  wrap.appendChild(input);
  wrap.appendChild(list);
  return wrap;
}

/* ------------------------- dataset adapters ------------------------- */

function getSheets(dataset) {
  // In SILO v6 dev: dataset is stored normalized by core/excel.js
  // {
  //   results: NormalizedResultRow[]  (keys: skaterName,pos,tournament,tournamentShort,runKey,season,distance,...)
  //   skaters: raw Skaters sheet rows
  //   wtNames: raw WT Names sheet rows
  //   nameMap: { [normalizedKey]: canonicalName }
  // }
  const results = dataset?.results || [];
  const skaters = dataset?.skaters || [];
  const wtNames = dataset?.wtNames || [];
  return { results, skaters, wtNames };
}

function buildSkaterCanonicalMap(skatersRows) {
  // Keep a small helper map for robustness, but Results are already canonicalized
  // by core/excel.js using Skaters sheet.
  const map = new Map();
  for (const r of skatersRows || []) {
    const canonical = norm(r.SKATERS ?? r["SKATERS"] ?? "");
    const original = norm(r.ORIGINAL ?? r["ORIGINAL"] ?? "");
    if (canonical) map.set(normKey(canonical), canonical);
    if (original) map.set(normKey(original), canonical);
  }
  return map;
}

function canonicalizeName(name, canonicalMap) {
  const k = normKey(name);
  if (!k) return "";
  return canonicalMap.get(k) || norm(name);
}

function skaterInfoByName(skatersRows, canonicalName) {
  const target = norm(canonicalName);
  const row = (skatersRows || []).find(r => norm(r.SKATERS ?? r["SKATERS"] ?? "") === target);
  if (!row) return { nat:"", birthYear:null };

  const nat = norm(row.NAT ?? row["NAT"] ?? "");

  const candidates = [
    pick(row, ["DOB","Dob","Geboortedatum","Birthdate","Birth date","Date of Birth","BIRTHDATE"]),
    pick(row, ["BirthYear","BIRTHYEAR","Birth year","Geboortejaar","YEAR","Year"]),
  ].filter(v => v != null && String(v).trim() !== "");

  let birthYear = null;
  for (const c of candidates) {
    const s = String(c).trim();
    const m = s.match(/(19\d{2}|20\d{2})/);
    if (m) { birthYear = Number(m[1]); break; }
  }

  return { nat, birthYear };
}

function wtTeamByNat(wtRows, nat) {
  const code = norm(nat).toUpperCase();
  if (!code) return "";
  // WT Names sheet: typically columns NAT, COUNTRY, WT NAME (team)
  const row = (wtRows || []).find(r => String(r.NAT ?? r["NAT"] ?? "").toUpperCase() === code);
  if (!row) {
    return "";
  }
  return norm(row["WT NAME"] ?? row["WT NAME "] ?? row.WT_NAME ?? row["WT_NAME"] ?? row["WT NAME"] ?? "");
}

function ageFromBirthYear(birthYear) {
  if (!Number.isFinite(birthYear)) return null;
  const now = new Date();
  return now.getFullYear() - birthYear;
}

/* ------------------------- tournament mapping ------------------------- */

function tournamentShortFromRow(r) {
  // Prefer normalized key from import
  const t = norm(r?.tournamentShort || "");
  if (t) return t;
  // Fallback
  const w = normKey(r?.tournament || r?.wedstrijdRaw || "");
  if (w.includes("world cup") || w.includes("world tour")) return "WC";
  if (w.includes("olymp")) return "OS";
  if (w.includes("wereld")) return "WK";
  if (w.includes("europe") || w.includes("europ")) return "EK";
  if (w.includes("neder")) return "NK";
  return "";
}

const TOUR_PRIORITY = { OS: 1, WK: 2, EK: 3, WC: 4, NK: 5 };
function tourOrder(short) { return TOUR_PRIORITY[short] ?? 99; }

function runKeyFromRow(r) {
  const k = normKey(r?.runKey || r?.runRaw || r?.run || "");
  if (!k) return "";
  if (k.includes("final a")) return "final a";
  if (k === "final" || k.includes("final")) return "final";
  if (k.includes("eind") || k.includes("overall")) return "eindklassement";
  return k;
}

function medalEmoji(pos) {
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return "";
}

/* ------------------------- results selection logic ------------------------- */

function computeTopResults(resultsRows, canonicalName) {
  const rows = (resultsRows || []).filter(r => r?.skaterName === canonicalName);

  const eligible = rows.filter(r => {
    const pos = r.pos;
    if (!(pos >= 1 && pos <= 5)) return false;
    const tShort = tournamentShortFromRow(r);
    const rk = runKeyFromRow(r);
    if (tShort === "WC") {
      // WC/WT: only overall/eindklassement
      return rk === "eindklassement" || normKey(r.distance).includes("eindklassement");
    }
    // For tournament highlights we only accept Final A/Final to avoid heats
    if (!(rk === "final a" || rk === "final")) return false;
    return ["OS","WK","EK","NK"].includes(tShort);
  });

  const gmap = new Map();
  for (const r of eligible) {
    const pos = r.pos;
    const tShort = tournamentShortFromRow(r);
    const dist = norm(r.distance || r.afstandRaw || "");
    const season = r.season;
    const key = `${pos}||${tShort}||${normKey(dist)}`;
    const g = gmap.get(key) || { pos, tShort, afstand: dist, years: new Set() };
    if (Number.isFinite(season)) g.years.add(season);
    gmap.set(key, g);
  }

  let list = Array.from(gmap.values()).map(g => ({
    ...g,
    years: Array.from(g.years).filter(Number.isFinite).sort((a,b)=>b-a)
  }));

  list.sort((a,b)=>{
    if (a.pos !== b.pos) return a.pos - b.pos;
    const ao = tourOrder(a.tShort);
    const bo = tourOrder(b.tShort);
    if (ao !== bo) return ao - bo;
    const ay = a.years[0] ?? -Infinity;
    const by = b.years[0] ?? -Infinity;
    return by - ay;
  });

  return list.slice(0, 5);
}

function computeTitleCounts(resultsRows, canonicalName) {
  const rows = (resultsRows || []).filter(r => r?.skaterName === canonicalName);

  const counts = { OS:0, WK:0, EK:0, NK:0 };
  const seen = new Set();

  for (const r of rows) {
    if (r.pos !== 1) continue;
    const tShort = tournamentShortFromRow(r);
    if (!["OS","WK","EK","NK"].includes(tShort)) continue;
    const rk = runKeyFromRow(r);
    if (!(rk === "final a" || rk === "final")) continue;
    const dist = norm(r.distance || r.afstandRaw || "");
    const season = r.season;
    const key = `${tShort}||${season}||${normKey(dist)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts[tShort]++;
  }

  return counts;
}

/* ------------------------- UI: rider card ------------------------- */

function RiderCard({ slotIndex, name, skatersRows, wtRows, resultsRows }) {
  const badge = el("div", { class: "fp-badge" }, String(slotIndex + 1));

  if (!name) {
    return el("div", { class: "fp-card fp-card--empty" },
      badge,
      el("div", { class: "fp-empty" }, "Geen rijder geselecteerd")
    );
  }

  const { nat, birthYear } = skaterInfoByName(skatersRows, name);
  const team = wtTeamByNat(wtRows, nat);
  const age = ageFromBirthYear(birthYear);

  const top = computeTopResults(resultsRows, name);
  const titles = computeTitleCounts(resultsRows, name);

  const lines = top.map(t => {
    const years = t.years?.length ? t.years.join(", ") : "—";
    const m = medalEmoji(t.pos);
    const prefix = m ? `${m} ` : "";
    return `${prefix}${t.pos} - ${t.tShort} - ${t.afstand} - ${years}`;
  });

  return el("div", { class: "fp-card" },
    badge,
    el("div", { class: "fp-name" }, name),
    el("div", { class: "fp-meta" }, nat || "—"),
    el("div", { class: "fp-meta" }, team || "—"),
    el("div", { class: "fp-meta" }, (age != null ? `${age} jaar` : "— jaar")),
    el("div", { class: "fp-titles" },
      el("div", { class: "fp-title" }, `OS - ${titles.OS}`),
      el("div", { class: "fp-title" }, `WK - ${titles.WK}`),
      el("div", { class: "fp-title" }, `EK - ${titles.EK}`),
      el("div", { class: "fp-title" }, `NK - ${titles.NK}`),
    ),
    el("div", { class: "fp-results" },
      ...lines.map(s => el("div", { class: "fp-result" }, s))
    )
  );
}

/* ------------------------- mount ------------------------- */

export async function mountFinalPresentation(root) {
  clear(root);

  const meta = loadMeta?.() || {};
  const dataset = await loadDataset?.();
  const { results, skaters, wtNames } = getSheets(dataset || {});

  if (!dataset || !Array.isArray(skaters) || skaters.length === 0 || !Array.isArray(results) || results.length === 0) {
    root.appendChild(sectionCard({
      title: "A Final presentation",
      subtitle: "Upload eerst een Excel met tabbladen 'Results' en 'Skaters'.",
      children: [
        el("div", { class: "notice" }, "Geen dataset gekoppeld (of leeg)."),
        el("div", { style: "height:10px" }),
        el("button", { class: "btn", type:"button", onclick: () => router.go("home") }, "Terug naar menu")
      ]
    }));
    return;
  }

  const riderOptions = Array.from(new Set(
    (skaters || [])
      .map(r => norm(pick(r, ["SKATERS","Skaters","Naam","NAME","Name","D"])))
      .filter(Boolean)
  )).sort((a,b)=>a.localeCompare(b));

  // Results are already mapped to canonical names via dataset.nameMap, but we keep
  // this for extra robustness when looking up Skaters rows.
  buildSkaterCanonicalMap(skaters);

  const slots = Array(8).fill("");
  let windowStart = 0;

  const selectors = el("div", { class: "fp-selectors" });
  const display = el("div", { class: "fp-display" });

  function renderSelectors() {
    clear(selectors);
    for (let i = 0; i < 8; i++) {
      const dd = TypeableDropdown({
        placeholder: `Startpositie ${i+1}`,
        value: slots[i] || "",
        options: riderOptions,
        onPick: (picked) => {
          slots[i] = picked;
          renderDisplay();
        }
      });
      selectors.appendChild(el("div", { class: "fp-selectors__cell" }, dd));
    }
  }

  function renderDisplay() {
    clear(display);

    const leftIdx = windowStart;
    const rightIdx = windowStart + 1;

    const prevBtn = el("button", {
      class: "btn btn--icon",
      type: "button",
      disabled: windowStart === 0,
      onclick: () => { windowStart = Math.max(0, windowStart - 1); renderDisplay(); }
    }, "◀");

    const nextBtn = el("button", {
      class: "btn btn--icon",
      type: "button",
      disabled: windowStart === 6,
      onclick: () => { windowStart = Math.min(6, windowStart + 1); renderDisplay(); }
    }, "▶");

    const bar = el("div", { class: "fp-bar" },
      prevBtn,
      el("div", { class: "fp-bar__label" }, `Startpositie ${leftIdx+1} & ${rightIdx+1}`),
      nextBtn
    );

    const grid = el("div", { class: "fp-grid" },
      RiderCard({ slotIndex: leftIdx, name: slots[leftIdx], skatersRows: skaters, wtRows: wtNames, resultsRows: results }),
      RiderCard({ slotIndex: rightIdx, name: slots[rightIdx], skatersRows: skaters, wtRows: wtNames, resultsRows: results }),
    );

    display.appendChild(bar);
    display.appendChild(grid);
  }

  root.appendChild(sectionCard({
    title: "A Final presentation",
    subtitle: meta?.datasetName ? `Dataset: ${meta.datasetName}` : "Selecteer rijders per startpositie.",
    children: [selectors, el("div", { style:"height:12px" }), display]
  }));

  renderSelectors();
  renderDisplay();
}

export const mountAFinalPresentation = mountFinalPresentation;
export default mountFinalPresentation;
