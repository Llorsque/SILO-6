
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
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = o;
        onPick?.(o);
        setOpen(false);
      });
      list.appendChild(item);
    }
  };

  input.addEventListener("focus", () => setOpen(true));
  input.addEventListener("input", () => { if (!open) setOpen(true); renderList(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
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
  const results = dataset?.results || dataset?.Results || dataset?.RESULTS || [];
  const skaters = dataset?.skaters || dataset?.Skaters || dataset?.SKATERS || [];
  const wtNames = dataset?.wtNames || dataset?.WTNames || dataset?.["WT Name"] || dataset?.["WT Names"] || dataset?.WT_NAME || [];
  return { results, skaters, wtNames };
}

function buildSkaterCanonicalMap(skatersRows) {
  const map = new Map();
  for (const r of skatersRows || []) {
    const canonical = norm(pick(r, ["SKATERS", "Skaters", "Naam", "NAME", "Name", "D"]));
    if (!canonical) continue;
    const variants = [canonical, norm(pick(r, ["Naam", "NAME", "Name"]))].filter(Boolean);
    for (const v of variants) {
      const k = normKey(v);
      if (k && !map.has(k)) map.set(k, canonical);
    }
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
  const row = (skatersRows || []).find(r => norm(pick(r, ["SKATERS","Skaters","Naam","NAME","Name","D"])) === target);
  if (!row) return { nat:"", birthYear:null };

  const nat = norm(pick(row, ["NAT","Nat.","Nat", "D", "E"]));

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
  const row = (wtRows || []).find(r => String(pick(r, ["NAT","Nat.","Nat","Country","A","B"])).toUpperCase() === code);
  if (!row) {
    const r2 = (wtRows || []).find(r => Object.values(r||{}).some(v => String(v||"").toUpperCase() === code));
    if (!r2) return "";
    return norm(pick(r2, ["WT Name","WT NAME","WT_NAME","Team","TEAM","C"]));
  }
  return norm(pick(row, ["WT Name","WT NAME","WT_NAME","Team","TEAM","C"]));
}

function ageFromBirthYear(birthYear) {
  if (!Number.isFinite(birthYear)) return null;
  const now = new Date();
  return now.getFullYear() - birthYear;
}

/* ------------------------- tournament mapping ------------------------- */

function tournamentShort(wedstrijdRaw, runRaw) {
  const w = normKey(wedstrijdRaw);
  const r = normKey(runRaw);

  if (w.includes("world cup") || w.includes("world tour") || w.includes("worldcup") || w.includes("worldtour")) return "WC";
  if (w.includes("olymp")) return "OS";
  if (w.includes("wereld") || w.includes("world championship") || w.includes("world championships")) return "WK";
  if (w.includes("europe") || w.includes("europ")) return "EK";
  if (w.includes("neder") || w.includes("dutch") || w.includes("netherlands")) return "NK";
  if (r.includes("eindklassement") || r.includes("overall")) return "WC";

  return "";
}

const TOUR_PRIORITY = { OS: 1, WK: 2, EK: 3, WC: 4, NK: 5 };
function tourOrder(short) { return TOUR_PRIORITY[short] ?? 99; }

function runKey(runRaw) {
  const r = normKey(runRaw);
  if (!r) return "";
  if (r.includes("final a")) return "final a";
  if (r.includes("final")) return "final";
  if (r.includes("eindklassement")) return "eindklassement";
  if (r.includes("overall")) return "overall";
  return r;
}

function medalEmoji(pos) {
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return "";
}

/* ------------------------- results selection logic ------------------------- */

function computeTopResults(resultsRows, canonicalName, canonicalMap) {
  const rows = (resultsRows || []).map(r => {
    const rawName = pick(r, ["Naam","NAME","Name","C"]);
    const name = canonicalizeName(rawName, canonicalMap);

    const pos = asInt(pick(r, ["Pos.","Pos", "Ranking", "B"]));
    const wedstrijd = pick(r, ["Wedstrijd", "F"]);
    const seizoen = asInt(pick(r, ["Seizoen","Season","J"]));
    const afstand = norm(pick(r, ["Afstand","Distance","H"]));
    const run = pick(r, ["Run", "Race", "A"]);
    const rk = runKey(run);
    const tShort = tournamentShort(wedstrijd, run);
    return { name, pos, wedstrijd, seizoen, afstand, run, rk, tShort };
  }).filter(x => x.name && x.name === canonicalName);

  const eligible = rows.filter(r => {
    if (!(r.pos >= 1 && r.pos <= 5)) return false;
    if (r.tShort === "WC") {
      return (r.rk.includes("eindklassement") || r.rk.includes("overall") || normKey(r.afstand).includes("eindklassement"));
    }
    return ["OS","WK","EK","NK"].includes(r.tShort);
  });

  const gmap = new Map();
  for (const r of eligible) {
    const key = `${r.pos}||${r.tShort}||${normKey(r.afstand)}`;
    const g = gmap.get(key) || { pos: r.pos, tShort: r.tShort, afstand: r.afstand, years: new Set() };
    if (Number.isFinite(r.seizoen)) g.years.add(r.seizoen);
    gmap.set(key, g);
  }

  let list = Array.from(gmap.values()).map(g => {
    const years = Array.from(g.years).filter(Number.isFinite).sort((a,b)=>b-a);
    return { ...g, years };
  });

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

function computeTitleCounts(resultsRows, canonicalName, canonicalMap) {
  const rows = (resultsRows || []).map(r => {
    const rawName = pick(r, ["Naam","NAME","Name","C"]);
    const name = canonicalizeName(rawName, canonicalMap);
    const pos = asInt(pick(r, ["Pos.","Pos", "Ranking", "B"]));
    const wedstrijd = pick(r, ["Wedstrijd", "F"]);
    const seizoen = asInt(pick(r, ["Seizoen","Season","J"]));
    const afstand = norm(pick(r, ["Afstand","Distance","H"]));
    const run = pick(r, ["Run", "Race", "A"]);
    const rk = runKey(run);
    const tShort = tournamentShort(wedstrijd, run);
    return { name, pos, seizoen, afstand, rk, tShort };
  }).filter(x => x.name && x.name === canonicalName);

  const counts = { OS:0, WK:0, EK:0, NK:0 };
  const seen = new Set();

  for (const r of rows) {
    if (r.pos !== 1) continue;
    if (!["OS","WK","EK","NK"].includes(r.tShort)) continue;
    if (!(r.rk === "final a" || r.rk === "final")) continue;

    const key = `${r.tShort}||${r.seizoen}||${normKey(r.afstand)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts[r.tShort]++;
  }

  return counts;
}

/* ------------------------- UI: rider card ------------------------- */

function RiderCard({ slotIndex, name, skatersRows, wtRows, resultsRows, canonicalMap }) {
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

  const top = computeTopResults(resultsRows, name, canonicalMap);
  const titles = computeTitleCounts(resultsRows, name, canonicalMap);

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

  const canonicalMap = buildSkaterCanonicalMap(skaters);

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
      RiderCard({ slotIndex: leftIdx, name: slots[leftIdx], skatersRows: skaters, wtRows: wtNames, resultsRows: results, canonicalMap }),
      RiderCard({ slotIndex: rightIdx, name: slots[rightIdx], skatersRows: skaters, wtRows: wtNames, resultsRows: results, canonicalMap }),
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
