/**
 * SILO — Module: A Final presentation
 *
 * SCOPE GUARANTEE
 * - Only this module folder is touched (modules/finalpresentation/*)
 * - No changes to header, routing, global CSS or other modules
 */

import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { loadDataset, loadMeta } from "../../core/storage.js";

/* ----------------------------- small utilities ----------------------------- */

function normalizeSpaces(s){ return String(s ?? "").replace(/\s+/g, " ").trim(); }

function medalEmoji(pos){
  if(pos === 1) return "🥇";
  if(pos === 2) return "🥈";
  if(pos === 3) return "🥉";
  return "";
}

function tournamentPriority(short){
  // User requirement: OS > WK > EK > Eindklassement WC/WT > NK
  if(short === "OS") return 1;
  if(short === "WK") return 2;
  if(short === "EK") return 3;
  if(short === "WC") return 4;
  if(short === "NK") return 5;
  return 99;
}

function toernooiLabel(short){
  if(short === "WC") return "WC/WT";
  return short || "";
}

function getSkaterNames(dataset){
  return Array.from(new Set(
    (dataset?.skaters || [])
      .map(r => r.SKATERS ?? r["SKATERS"] ?? "")
      .map(normalizeSpaces)
      .filter(Boolean)
  )).sort((a,b)=>a.localeCompare(b));
}

function findSkaterRow(dataset, name){
  const target = normalizeSpaces(name);
  return (dataset?.skaters || []).find(r => normalizeSpaces(r.SKATERS ?? r["SKATERS"] ?? "") === target) || null;
}

function findWTNameByNat(dataset, nat){
  const code = normalizeSpaces(nat).toUpperCase();
  if(!code) return { country:"", wtName:"" };
  const row = (dataset?.wtNames || []).find(r => String(r.NAT ?? r["NAT"] ?? "").toUpperCase() === code);
  if(!row) return { country:"", wtName:"" };
  const country = normalizeSpaces(row.COUNTRY ?? row["COUNTRY"] ?? "");
  const wtName = normalizeSpaces(row["WT NAME"] ?? row["WT NAME "] ?? row.WT_NAME ?? row["WT_NAME"] ?? "");
  return { country, wtName };
}

function inferBirthYear(skaterRow){
  if(!skaterRow) return null;
  const candidates = [];
  for(const k of ["DOB","Dob","BIRTHDATE","Birthdate","Birth date","Date of Birth","Geboortedatum","BirthYear","BIRTHYEAR","Birth year","Geboortejaar","YEAR","Year"]){
    if(skaterRow[k] != null && String(skaterRow[k]).trim() !== "") candidates.push(skaterRow[k]);
  }
  // Fallback: scan all values for a 4-digit year
  for(const v of Object.values(skaterRow)){
    if(v == null) continue;
    const s = String(v).trim();
    if(!s) continue;
    const m = s.match(/(19\d{2}|20\d{2})/);
    if(m){ candidates.push(m[1]); break; }
  }
  for(const c of candidates){
    const s = String(c).trim();
    const m = s.match(/(19\d{2}|20\d{2})/);
    if(m) return Number(m[1]);
  }
  return null;
}

function ageFromBirthYear(birthYear){
  if(!Number.isFinite(birthYear)) return null;
  const now = new Date();
  return now.getFullYear() - birthYear;
}

/* --------------------------- shared typeable dropdown --------------------------- */

function typeableDropdown({ placeholder, value, options, onChange }){
  const wrap = el("div", { class:"dropdown" });
  const input = el("input", { class:"input", placeholder, value: value || "" });
  const list = el("div", { class:"dropdown__list" });
  let open = false;

  function renderList(){
    clear(list);
    const q = (input.value || "").toLowerCase().trim();
    const filtered = options
      .filter(o => o.toLowerCase().includes(q))
      .slice(0, 120);

    if(!filtered.length){
      list.appendChild(el("div", { class:"dropdown__item dropdown__item--muted" }, "Geen resultaten"));
      return;
    }
    for(const o of filtered){
      const it = el("div", { class:"dropdown__item" }, o);
      it.addEventListener("click", () => {
        onChange(o);
        setOpen(false);
      });
      list.appendChild(it);
    }
  }

  function setOpen(v){
    open = v;
    if(open){
      renderList();
      list.classList.add("dropdown__list--open");
    }else{
      list.classList.remove("dropdown__list--open");
    }
  }

  function tryCommitExactMatch(){
    const t = normalizeSpaces(input.value);
    if(!t) return;
    const found = options.find(o => normalizeSpaces(o).toLowerCase() === t.toLowerCase());
    if(found){ onChange(found); }
  }

  input.addEventListener("focus", ()=> setOpen(true));
  input.addEventListener("input", ()=> { if(!open) setOpen(true); renderList(); });
  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") setOpen(false);
    if(e.key === "Enter"){
      e.preventDefault();
      tryCommitExactMatch();
      setOpen(false);
    }
  });
  input.addEventListener("blur", ()=>{
    // if user typed the full name, commit it
    tryCommitExactMatch();
  });

  // Outside click closes list
  document.addEventListener("click", (e)=>{ if(!wrap.contains(e.target)) setOpen(false); });

  wrap.appendChild(input);
  wrap.appendChild(list);
  return { wrap, input, setValue: (v)=>{ input.value = v || ""; } };
}

/* ------------------------------ results logic ------------------------------ */

function isWCOverall(row){
  // Only count WC/WT for overall/eindklassement
  const rk = String(row?.runKey || "").toLowerCase();
  const dist = String(row?.distance || "").toLowerCase();
  return rk.includes("eindklassement") || dist.includes("eindklassement") || dist.includes("overall");
}

function eligibleRow(row){
  // Positie 1..5
  if(!(row?.pos >= 1 && row?.pos <= 5)) return false;
  const t = row?.tournamentShort;
  if(t === "WC") return isWCOverall(row);
  return t === "OS" || t === "WK" || t === "EK" || t === "NK";
}

function groupTopResults(rows){
  // Group by pos + tournamentShort + distance (ignore date), collect seasons
  const byKey = new Map();
  for(const r of rows){
    if(!eligibleRow(r)) continue;
    // In this module we only list #1 highlights under 'Belangrijkste resultaten'.
    if(r.pos !== 1) continue;
    const key = `${r.pos}__${r.tournamentShort}__${r.distance}`;
    if(!byKey.has(key)){
      byKey.set(key, {
        pos: r.pos,
        tournamentShort: r.tournamentShort,
        distance: r.distance,
        seasons: new Set(),
        yearMax: null
      });
    }
    const g = byKey.get(key);
    if(Number.isFinite(r.season)){
      g.seasons.add(r.season);
      g.yearMax = g.yearMax == null ? r.season : Math.max(g.yearMax, r.season);
    }
  }
  const groups = Array.from(byKey.values());
  groups.sort((a,b)=>{
    if(a.pos !== b.pos) return a.pos - b.pos;
    const ta = tournamentPriority(a.tournamentShort);
    const tb = tournamentPriority(b.tournamentShort);
    if(ta !== tb) return ta - tb;
    const ya = a.yearMax ?? -9999;
    const yb = b.yearMax ?? -9999;
    return yb - ya; // newest first
  });
  return groups.slice(0,5).map(g => {
    const years = Array.from(g.seasons).filter(Boolean).sort((a,b)=>b-a);
    return {
      pos: g.pos,
      toernooi: toernooiLabel(g.tournamentShort),
      distance: g.distance,
      years
    };
  });
}

function computePodiumCounts(rows){
  // Podium summary per tournament: count pos 1/2/3.
  // Dedupe per tournament+season+distance+pos (ignore date duplicates).
  const counts = {
    OS: { g:0, s:0, b:0 },
    WK: { g:0, s:0, b:0 },
    EK: { g:0, s:0, b:0 },
    NK: { g:0, s:0, b:0 },
  };
  const seen = new Set();

  for(const r of rows){
    const pos = Number(r?.pos);
    if(!(pos === 1 || pos === 2 || pos === 3)) continue;
    const t = r?.tournamentShort;
    if(!(t === "OS" || t === "WK" || t === "EK" || t === "NK")) continue;

    // Avoid heats/series: only finals or overall
    const rk = String(r?.runKey || "");
    if(!(rk === "final a" || rk === "final" || rk === "eindklassement")) continue;

    const season = Number.isFinite(r?.season) ? r.season : "";
    const key = `${t}__${season}__${r.distance}__${pos}`;
    if(seen.has(key)) continue;
    seen.add(key);

    if(pos === 1) counts[t].g += 1;
    else if(pos === 2) counts[t].s += 1;
    else if(pos === 3) counts[t].b += 1;
  }

  return counts;
}

/* ------------------------------ module mount ------------------------------ */

export async function mountFinalPresentation(root){
  clear(root);

  const meta = loadMeta?.() || null;
  const dataset = await loadDataset?.();

  if(!dataset?.results?.length || !dataset?.skaters?.length){
    root.appendChild(sectionCard({
      title:"A Final presentation",
      subtitle:"Upload eerst een Excel met tabbladen 'Results' en 'Skaters'.",
      children:[
        el("div", { class:"notice" }, "Geen dataset gekoppeld (of leeg). Ga terug naar Menu en upload je Excel."),
        el("div", { style:"height:10px" }),
        el("button", { class:"btn", type:"button", onclick:()=>router.go("home") }, "Terug naar menu")
      ]
    }));
    return;
  }

  const skaterNames = getSkaterNames(dataset);
  const resultsAll = dataset.results;

  // Pre-index results per skater for speed
  const resultsBySkater = new Map();
  for(const r of resultsAll){
    const n = r?.skaterName;
    if(!n) continue;
    if(!resultsBySkater.has(n)) resultsBySkater.set(n, []);
    resultsBySkater.get(n).push(r);
  }

  const state = {
    slots: Array.from({ length: 8 }, ()=>""),
    viewStart: 1 // 1..7 (because we show 2)
  };

  const header = sectionCard({
    title:"A Final presentation",
    subtitle:"Selecteer startposities (1–8). Je bekijkt steeds 2 rijders naast elkaar en schuift met Vorige/Volgende.",
    children:[]
  });

  const selectorsCard = el("div", { class:"card" });
  const navRow = el("div", { class:"fp-nav" });
  const cardsWrap = el("div", { class:"fp-cards" });

  header.appendChild(selectorsCard);
  header.appendChild(el("div", { style:"height:12px" }));
  header.appendChild(navRow);
  header.appendChild(el("div", { style:"height:12px" }));
  header.appendChild(cardsWrap);

  root.appendChild(header);

  /* ----------------------------- selectors UI ----------------------------- */

  const dropdownRefs = [];

  function renderSelectors(){
    clear(selectorsCard);
    selectorsCard.appendChild(el("div", { class:"card__title" }, "Startposities"));
    selectorsCard.appendChild(el("div", { class:"card__sub" }, "2 rijen van 4 – typ om snel een rijder te vinden."));
    selectorsCard.appendChild(el("div", { class:"hr" }));

    const grid = el("div", { class:"fp-select-grid" });
    dropdownRefs.length = 0;

    for(let i=0;i<8;i++){
      const pos = i + 1;
      const group = el("div", { class:"filterGroup fp-slot" });
      group.appendChild(el("div", { class:"filterLabel" }, `Startpositie ${pos}`));
      const dd = typeableDropdown({
        placeholder:"Typ om te zoeken...",
        value: state.slots[i] || "",
        options: skaterNames,
        onChange: (val)=>{
          state.slots[i] = val;
          dd.setValue(val);
          renderCards();
        }
      });
      group.appendChild(dd.wrap);
      dropdownRefs.push(dd);
      grid.appendChild(group);
    }

    selectorsCard.appendChild(grid);
  }

  /* ----------------------------- navigation UI ---------------------------- */

  function renderNav(){
    clear(navRow);
    const leftPos = state.viewStart;
    const rightPos = state.viewStart + 1;

    const btnPrev = el("button", { class:"btn btn--ghost", type:"button" }, "←");
    const btnNext = el("button", { class:"btn btn--ghost", type:"button" }, "→");
    const title = el("div", { class:"fp-nav__title" }, `Startpositie ${leftPos} & ${rightPos}`);

    btnPrev.disabled = state.viewStart <= 1;
    btnNext.disabled = state.viewStart >= 7;
    btnPrev.classList.toggle("fp-nav__btn--disabled", btnPrev.disabled);
    btnNext.classList.toggle("fp-nav__btn--disabled", btnNext.disabled);

    btnPrev.addEventListener("click", ()=>{
      if(state.viewStart <= 1) return;
      state.viewStart -= 1;
      renderCards();
    });
    btnNext.addEventListener("click", ()=>{
      if(state.viewStart >= 7) return;
      state.viewStart += 1;
      renderCards();
    });

    navRow.appendChild(btnPrev);
    navRow.appendChild(title);
    navRow.appendChild(btnNext);
  }

  /* ------------------------------- card render ------------------------------ */

  function renderSkaterCard(slotIndex){
    const posNumber = slotIndex + 1;
    const name = state.slots[slotIndex];

    const card = el("div", { class:"card fp-card" });
    const top = el("div", { class:"fp-card__top" });
    const badge = el("div", { class:"fp-badge" }, String(posNumber));
    top.appendChild(badge);

    const body = el("div", { class:"fp-card__body" });
    if(!name){
      body.appendChild(el("div", { class:"notice" }, `Selecteer een rijder voor startpositie ${posNumber}.`));
      card.appendChild(top);
      card.appendChild(body);
      return card;
    }

    const sk = findSkaterRow(dataset, name);
    const nat = normalizeSpaces(sk?.NAT ?? sk?.["NAT"] ?? "");
    const wt = findWTNameByNat(dataset, nat);
    const birthYear = inferBirthYear(sk);
    const age = ageFromBirthYear(birthYear);

    const lines = el("div", { class:"fp-lines" }, [
      el("div", { class:"fp-name" }, name),
      el("div", { class:"fp-sub" }, wt?.country || nat || "—"),
      el("div", { class:"fp-sub" }, wt?.wtName || "—"),
      el("div", { class:"fp-sub" }, age != null ? `${age} jaar` : "— jaar")
    ]);
    body.appendChild(lines);

    // Top results
    const riderRows = resultsBySkater.get(name) || [];
    const topResults = groupTopResults(riderRows);

    const resultsBox = el("div", { class:"fp-results" });
    resultsBox.appendChild(el("div", { class:"fp-section-title" }, "Belangrijkste resultaten"));

    if(!topResults.length){
      resultsBox.appendChild(el("div", { class:"fp-muted" }, "Geen resultaten (positie 1) gevonden binnen OS/WK/EK/NK en Eindklassement WC/WT."));
    }else{
      const ul = el("ul", { class:"fp-list" });
      for(const r of topResults){
        const years = (r.years || []).join(", ");
        const medal = medalEmoji(r.pos);
        const txt = `${medal ? medal + " " : ""}${r.pos} - ${r.toernooi} - ${r.distance} - ${years || "—"}`;
        ul.appendChild(el("li", null, txt));
      }
      resultsBox.appendChild(ul);
    }

    // Podium summary (pos 1-3)
    const podium = computePodiumCounts(riderRows);
    const titlesBox = el("div", { class:"fp-titles" });
    titlesBox.appendChild(el("div", { class:"fp-section-title" }, "Podium (pos 1-3)"));
    titlesBox.appendChild(el("div", { class:"fp-titles-grid" }, [
      el("div", { class:"fp-titleItem" }, `OS - ${podium.OS.g} - ${podium.OS.s} - ${podium.OS.b}`),
      el("div", { class:"fp-titleItem" }, `WK - ${podium.WK.g} - ${podium.WK.s} - ${podium.WK.b}`),
      el("div", { class:"fp-titleItem" }, `EK - ${podium.EK.g} - ${podium.EK.s} - ${podium.EK.b}`),
      el("div", { class:"fp-titleItem" }, `NK - ${podium.NK.g} - ${podium.NK.s} - ${podium.NK.b}`),
    ]));

    body.appendChild(el("div", { class:"hr" }));
    body.appendChild(titlesBox);
    body.appendChild(el("div", { style:"height:10px" }));
    body.appendChild(resultsBox);

    card.appendChild(top);
    card.appendChild(body);
    return card;
  }

  function renderCards(){
    renderNav();
    clear(cardsWrap);
    const leftIndex = state.viewStart - 1;
    const rightIndex = state.viewStart;
    cardsWrap.appendChild(renderSkaterCard(leftIndex));
    cardsWrap.appendChild(renderSkaterCard(rightIndex));
  }

  renderSelectors();
  renderCards();
}
