import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { loadDataset, loadMeta } from "../../core/storage.js";


function formatEventLine(info){
  const dist = info.distance || "—";
  const tour = info.tournamentShort || "—";
  const loc = info.location || "—";
  const year = info.season || "—";
  return `${dist}, ${tour}, ${loc}, ${year}`;
}

function openModal(root, title, lines){
  // Remove existing modal if any
  const existing = root.querySelector(".h2hModalOverlay");
  if(existing) existing.remove();

  const overlay = el("div", { class:"h2hModalOverlay", role:"dialog", "aria-modal":"true" });
  const box = el("div", { class:"h2hModal" });

  const head = el("div", { class:"h2hModal__head" }, [
    el("div", { class:"h2hModal__title" }, title),
    el("button", { class:"btn btn--sm", type:"button" }, "Sluiten")
  ]);

  const body = el("div", { class:"h2hModal__body" });
  if(!lines || !lines.length){
    body.appendChild(el("div", { class:"muted" }, "Geen uitslagen gevonden binnen deze selectie."));
  }else{
    const ul = el("ul", { class:"h2hModal__list" });
    for(const ln of lines){
      ul.appendChild(el("li", {}, ln));
    }
    body.appendChild(ul);
  }

  box.appendChild(head);
  box.appendChild(body);
  overlay.appendChild(box);

  function close(){
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  head.querySelector("button").addEventListener("click", close);
  overlay.addEventListener("click", (e)=>{ if(e.target === overlay) close(); });

  function onKey(e){ if(e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);

  root.appendChild(overlay);
}

/**
 * Head-to-Head
 * - Compare 2–6 riders using the same filters
 * - Results sheet only (dataset.results)
 *
 * Key rules:
 * - Podium counts: pos 1/2/3 in Run = Final A OR Eindklassement/Overall
 * - Tournaments: OS, WK, EK, WC/WT, NK (multi)
 * - Distances: 500m, 1000m, 1500m (multi)
 * - Seasons (multi)
 * - Shared results: same tournament + season + distance + run + date + location
 * - Wins: in shared results, lower pos (closer to 1) is better
 * - Participation: unique tournament+season (and distance shown once per tournament+season)
 */

function chip(label, active, onClick){
  const b = el("button", { type:"button", class: active ? "chip chip--on" : "chip" }, label);
  b.addEventListener("click", onClick);
  return b;
}

function medalIcon(pos){
  if(pos === 1) return "🥇";
  if(pos === 2) return "🥈";
  if(pos === 3) return "🥉";
  return "";
}

function normalizeSetToggle(set, value){
  if(set.has(value)) set.delete(value);
  else set.add(value);
}

function uniqSorted(arr){
  return Array.from(new Set(arr.filter(v => v != null))).sort((a,b)=>{
    if(typeof a === "number" && typeof b === "number") return a-b;
    return String(a).localeCompare(String(b));
  });
}

function typeableDropdown({placeholder, value, options, onChange}){
  const wrap = el("div", { class:"dropdown" });
  const input = el("input", { class:"input", placeholder, value: value || "" });
  const list = el("div", { class:"dropdown__list" });

  let open = false;
  function renderList(){
    clear(list);
    const q = (input.value || "").toLowerCase().trim();
    const filtered = options
      .filter(o => o.toLowerCase().includes(q))
      .slice(0, 80);
    if(!filtered.length){
      list.appendChild(el("div", { class:"dropdown__item dropdown__item--muted" }, "Geen resultaten"));
      return;
    }
    for(const o of filtered){
      const it = el("div", { class:"dropdown__item" }, o);
      it.addEventListener("click", ()=>{
        input.value = o;
        onChange && onChange(o);
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
  input.addEventListener("focus", ()=> setOpen(true));
  input.addEventListener("input", ()=> { if(!open) setOpen(true); renderList(); });
  input.addEventListener("keydown", (e)=>{ if(e.key === "Escape") setOpen(false); });

  // close on outside click (scoped, safe)
  const onDocClick = (e)=>{ if(!wrap.contains(e.target)) setOpen(false); };
  document.addEventListener("click", onDocClick);

  // Provide a tiny cleanup hook so route switches don't stack listeners
  wrap.__cleanup = () => document.removeEventListener("click", onDocClick);

  wrap.appendChild(input);
  wrap.appendChild(list);
  return { wrap, input };
}

function seasonsMultiDropdown({ allSeasons, selectedSet, onChange }){
  const wrap = el("div", { class:"msel" });
  const btn = el("button", { type:"button", class:"btn btn--sm msel__btn" }, "Seizoen");
  const panel = el("div", { class:"msel__panel" });
  let open = false;

  function label(){
    const n = selectedSet.size;
    btn.textContent = n ? `Seizoen (${n})` : "Seizoen";
  }
  function render(){
    clear(panel);
    const header = el("div", { class:"msel__head" }, [
      el("div", { class:"muted" }, "Kies één of meer seizoenen"),
      el("button", { type:"button", class:"btn btn--sm", onclick:()=>{
        if(selectedSet.size === allSeasons.length) selectedSet.clear();
        else { selectedSet.clear(); allSeasons.forEach(y=>selectedSet.add(y)); }
        label(); render(); onChange && onChange();
      }}, selectedSet.size === allSeasons.length ? "Deselect all" : "Select all")
    ]);
    panel.appendChild(header);

    const list = el("div", { class:"msel__list" });
    for(const y of allSeasons){
      const row = el("label", { class:"msel__row" });
      const cb = el("input", { type:"checkbox" });
      cb.checked = selectedSet.has(y);
      cb.addEventListener("change", ()=>{
        if(cb.checked) selectedSet.add(y);
        else selectedSet.delete(y);
        label();
        onChange && onChange();
      });
      row.appendChild(cb);
      row.appendChild(el("span", {}, String(y)));
      list.appendChild(row);
    }
    panel.appendChild(list);
  }

  function setOpen(v){
    open = v;
    if(open){
      render();
      panel.classList.add("msel__panel--open");
    }else{
      panel.classList.remove("msel__panel--open");
    }
  }

  btn.addEventListener("click", ()=> setOpen(!open));

  const onDocClick = (e)=>{ if(!wrap.contains(e.target)) setOpen(false); };
  document.addEventListener("click", onDocClick);
  wrap.__cleanup = () => document.removeEventListener("click", onDocClick);

  wrap.appendChild(btn);
  wrap.appendChild(panel);
  label();
  return wrap;
}

function buildEventKey(r){
  const d = r.dateISO ? r.dateISO.slice(0,10) : "";
  return [r.tournamentShort, r.season, r.distance, r.runKey, d, r.locatie].join("|");
}

function isEligibleRun(r){
  // Final A or Eindklassement/Overall
  const rk = String(r.runKey || "").toLowerCase();
  return rk === "final a" || rk === "eindklassement";
}

function filterRows(results, filters){
  const tSet = filters.tournaments;
  const dSet = filters.distances;
  const ySet = filters.seasons;

  return results.filter(r => {
    if(!r || !r.skaterName) return false;
    if(!isEligibleRun(r)) return false;

    if(tSet.size && !tSet.has(r.tournamentShort)) return false;
    if(ySet.size && !ySet.has(r.season)) return false;

    // Distance handling:
    // - For normal races: must match selected distances (if any)
    // - For WC/WT eindklassement: allow even when distance is "Eindklassement"
    if(dSet.size){
      const distOk = dSet.has(r.distance);
      const allowOverall = (r.tournamentShort === "WC" && r.runKey === "eindklassement");
      if(!distOk && !allowOverall) return false;
    }

    // WC/WT rule: only eindklassement
    if(r.tournamentShort === "WC" && r.runKey !== "eindklassement") return false;

    return true;
  });
}

function computeMetrics(filteredRows, riders){
  // Build rider -> rows
  const byRider = new Map();
  for(const name of riders) byRider.set(name, []);
  for(const r of filteredRows){
    if(byRider.has(r.skaterName)) byRider.get(r.skaterName).push(r);
  }

  // best position per rider
  const bestPos = {};
  const podium = {};
  const participation = {};
  for(const name of riders){
    bestPos[name] = null;
    podium[name] = { gold:0, silver:0, bronze:0 };
    const rows = byRider.get(name) || [];

    // bestPos = minimum pos in filtered rows
    for(const rr of rows){
      const p = Number(rr.pos);
      if(!p) continue;
      if(bestPos[name] == null || p < bestPos[name]) bestPos[name] = p;

      // podium: only pos 1-3
      if(p === 1) podium[name].gold++;
      if(p === 2) podium[name].silver++;
      if(p === 3) podium[name].bronze++;
    }

    // participation: unique tournamentShort + season, and keep set of distances per event
    const ev = new Map(); // key -> Set(distances)
    for(const rr of rows){
      const key = `${rr.tournamentShort}|${rr.season}`;
      if(!ev.has(key)) ev.set(key, new Set());
      if(rr.distance && rr.distance !== "Eindklassement") ev.get(key).add(rr.distance);
    }
    participation[name] = {
      events: ev.size,
      distancesPerEvent: ev
    };
  }

// shared results and wins matrix (+ store event meta for drill-down)
const events = new Map();      // eventKey -> Map(rider->pos)
const eventInfo = new Map();   // eventKey -> { distance, tournamentShort, location, season, date, run }

for(const r of filteredRows){
  if(!riders.includes(r.skaterName)) continue;
  const key = buildEventKey(r);
  if(!events.has(key)) events.set(key, new Map());
  const mp = events.get(key);

  const p = Number(r.pos);
  if(!p) continue;

  const prev = mp.get(r.skaterName);
  // keep best (min pos) if duplicates exist
  if(prev == null || p < prev) mp.set(r.skaterName, p);

  if(!eventInfo.has(key)){
    eventInfo.set(key, {
      distance: r.distance || "—",
      tournamentShort: r.tournamentShort || "—",
      location: r.location || "—",
      season: r.season || "—",
      date: r.date || "",
      run: r.run || ""
    });
  }
}

// pairwise stats
const pair = {};
const pairDetails = {}; // a||b -> { shared:[], aWins:[], bWins:[], ties:[] } (shared events with meta)

for(let i=0;i<riders.length;i++){
  for(let j=0;j<riders.length;j++){
    if(i===j) continue;
    const a=riders[i], b=riders[j];
    pair[`${a}||${b}`] = { shared:0, aAhead:0, bAhead:0, ties:0 };
    pairDetails[`${a}||${b}`] = { shared:[], aWins:[], bWins:[], ties:[] };
  }
}

for(const [key, mp] of events.entries()){
  const info = eventInfo.get(key) || {};
  for(let i=0;i<riders.length;i++){
    for(let j=i+1;j<riders.length;j++){
      const a=riders[i], b=riders[j];
      if(!mp.has(a) || !mp.has(b)) continue;
      const pa=mp.get(a), pb=mp.get(b);

      const recAB = { ...info, aPos: pa, bPos: pb, aName: a, bName: b };
      const recBA = { ...info, aPos: pb, bPos: pa, aName: b, bName: a };

      pair[`${a}||${b}`].shared++;
      pair[`${b}||${a}`].shared++;
      pairDetails[`${a}||${b}`].shared.push(recAB);
      pairDetails[`${b}||${a}`].shared.push(recBA);

      if(pa < pb){
        pair[`${a}||${b}`].aAhead++;
        pair[`${b}||${a}`].bAhead++;
        pairDetails[`${a}||${b}`].aWins.push(recAB);
        pairDetails[`${b}||${a}`].bWins.push(recBA);
      }else if(pb < pa){
        pair[`${a}||${b}`].bAhead++;
        pair[`${b}||${a}`].aAhead++;
        pairDetails[`${a}||${b}`].bWins.push(recAB);
        pairDetails[`${b}||${a}`].aWins.push(recBA);
      }else{
        pair[`${a}||${b}`].ties++;
        pair[`${b}||${a}`].ties++;
        pairDetails[`${a}||${b}`].ties.push(recAB);
        pairDetails[`${b}||${a}`].ties.push(recBA);
      }
    }
  }
}

  return { byRider, podium, bestPos, participation, pair, pairDetails };
}

function riderCard(name, meta, metrics){
  const p = metrics.podium[name];
  const bp = metrics.bestPos[name];
  const part = metrics.participation[name];

  const lines = [];
  lines.push(el("div", { class:"h2" }, name));
  lines.push(el("div", { class:"muted" }, "Podium (Final A + Eindklassement)"));
  lines.push(el("div", { class:"hrow" }, [
    el("div", { class:"pill" }, `🥇 ${p.gold}`),
    el("div", { class:"pill" }, `🥈 ${p.silver}`),
    el("div", { class:"pill" }, `🥉 ${p.bronze}`)
  ]));
  lines.push(el("div", { style:"height:6px" }));
  lines.push(el("div", { class:"muted" }, `Hoogste uitslag (beste pos): ${bp ?? "—"}`));
  lines.push(el("div", { class:"muted" }, `Deelnames: ${part.events}`));

  return el("div", { class:"hcard" }, lines);
}

function compareMiddle(root, a, b, metrics, filters){
  const key = `${a}||${b}`;
  const s = metrics.pair[key] || { shared:0, aAhead:0, bAhead:0, ties:0 };
  const details = metrics.pairDetails?.[key] || { shared:[], aWins:[], bWins:[], ties:[] };

  const filterSummary = [
    `Toernooi: ${(filters.tournaments && filters.tournaments.length) ? filters.tournaments.join(", ") : "alles"}`,
    `Afstand: ${(filters.distances && filters.distances.length) ? filters.distances.join(", ") : "alles"}`,
    `Seizoen: ${(filters.seasons && filters.seasons.length) ? filters.seasons.join(", ") : "alles"}`
  ].join(" • ");

  function showShared(){
    const lines = details.shared
      .slice()
      .sort((x,y)=> (Number(y.season)||0) - (Number(x.season)||0) || String(y.date||"").localeCompare(String(x.date||"")))
      .map(d => `${formatEventLine(d)} (pos ${d.aPos} vs ${d.bPos})`);
    openModal(root, `Samen in uitslag (${s.shared})`, [filterSummary, ...lines]);
  }
  function showWinsA(){
    const lines = details.aWins
      .slice()
      .sort((x,y)=> (Number(y.season)||0) - (Number(x.season)||0) || String(y.date||"").localeCompare(String(x.date||"")))
      .map(d => `${formatEventLine(d)} (pos ${d.aPos} vs ${d.bPos})`);
    openModal(root, `Winst ${a.split(" ")[0]} (${s.aAhead})`, [filterSummary, ...lines]);
  }
  function showWinsB(){
    const lines = details.bWins
      .slice()
      .sort((x,y)=> (Number(y.season)||0) - (Number(x.season)||0) || String(y.date||"").localeCompare(String(x.date||"")))
      .map(d => `${formatEventLine(d)} (pos ${d.aPos} vs ${d.bPos})`);
    openModal(root, `Winst ${b.split(" ")[0]} (${s.bAhead})`, [filterSummary, ...lines]);
  }
  function showExplain(){
    openModal(root, "Vergelijk — waarop gebaseerd?", [
      filterSummary,
      "Samen in uitslag = aantal gedeelde uitslagen (zelfde wedstrijd + datum + afstand + run).",
      "Winst = vaker een betere positie (lager pos-getal) binnen dezelfde gedeelde uitslag."
    ]);
  }

  const btn = (label, count, onClick) => {
    const isActive = Number(count) > 0;
    const cls = "pill pill--wide pill--click" + (isActive ? "" : " pill--disabled");
    const node = el("button", { class: cls, type:"button", disabled: !isActive }, label);
    if(isActive) node.addEventListener("click", onClick);
    return node;
  };

  const titleBtn = el("button", { class:"hmid__titleBtn", type:"button" }, "Vergelijk");
  titleBtn.addEventListener("click", showExplain);

  return el("div", { class:"hmid" }, [
    el("div", { class:"hmid__titleRow" }, [
      el("div", { class:"hmid__title" }, "Vergelijking"),
      titleBtn
    ]),
    el("div", { class:"hmid__row" }, [
      btn(`Samen in uitslag: ${s.shared}`, s.shared, showShared),
      btn(`Winst ${a.split(" ")[0]}: ${s.aAhead}`, s.aAhead, showWinsA),
      btn(`Winst ${b.split(" ")[0]}: ${s.bAhead}`, s.bAhead, showWinsB),
      el("div", { class:"pill pill--wide" }, `Gelijk: ${s.ties}`)
    ]),
    el("div", { class:"muted", style:"margin-top:10px" },
      "Tip: klik op ‘Vergelijk’ of op een metric om te zien op welke uitslagen dit gebaseerd is."
    )
  ]);
}

function matrixTable(riders, metrics){
  // Shows how often row rider finishes ahead of column rider (within shared results)
  const table = el("table", { class:"matrix" });
  const thead = el("thead");
  const trh = el("tr");
  trh.appendChild(el("th", {}, ""));
  for(const r of riders) trh.appendChild(el("th", {}, r.split(" ").slice(-1)[0]));
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = el("tbody");
  for(const a of riders){
    const tr = el("tr");
    tr.appendChild(el("th", {}, a.split(" ").slice(-1)[0]));
    for(const b of riders){
      if(a===b){
        tr.appendChild(el("td", { class:"matrix__self" }, "—"));
      }else{
        const s = metrics.pair[`${a}||${b}`];
        const txt = s ? `${s.aAhead} / ${s.shared}` : "0 / 0";
        tr.appendChild(el("td", {}, txt));
      }
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  return el("div", { class:"matrixWrap" }, [
    el("div", { class:"muted" }, "Matrix: ‘voor’ / ‘samen in uitslag’"),
    table
  ]);
}

export async function mountHeadToHead(root){
  clear(root);

  const dataset = await loadDataset();
  const meta = loadMeta();

  if(!dataset || !dataset.results || !dataset.results.length){
    root.appendChild(sectionCard({
      title:"Head-to-Head",
      subtitle:"Upload eerst een Excel met tabblad 'Results' en 'Skaters'.",
      children:[
        el("div", { class:"notice" }, "Geen dataset gekoppeld (of leeg). Ga terug naar Menu en upload je Excel."),
        el("div", { style:"height:10px" }),
        el("button", { class:"btn", type:"button", onclick:()=>router.go("home") }, "Terug naar menu")
      ]
    }));
    return;
  }

  // Options
  const allRiders = uniqSorted((dataset.skaters || [])
    .map(r => (r.SKATERS ?? r["SKATERS"] ?? r[3] ?? ""))
    .filter(Boolean));

  const seasons = uniqSorted(dataset.results.map(r => r.season).filter(Boolean));
  const tournaments = [
    { key:"OS", label:"OS" },
    { key:"WK", label:"WK" },
    { key:"EK", label:"EK" },
    { key:"WC", label:"WC/WT" },
    { key:"NK", label:"NK" }
  ];
  const distances = [
    { key:"500m", label:"500m" },
    { key:"1000m", label:"1000m" },
    { key:"1500m", label:"1500m" }
  ];

  // State
  let riderCount = 2;
  const selectedRiders = Array(6).fill("");
  const tSet = new Set(["OS","WK","EK","WC","NK"]); // default all on
  const dSet = new Set(["500m","1000m","1500m"]); // default all on
  const ySet = new Set(); // empty = all
  const cleanupFns = [];

  const resultsWrap = el("div", { class:"h2hWrap" });

  function activeFiltersSummary(){
    const t = Array.from(tSet).map(k => (k==="WC" ? "WC/WT" : k)).join(", ");
    const d = Array.from(dSet).join(", ");
    const y = ySet.size ? Array.from(ySet).sort((a,b)=>b-a).join(", ") : "Alle";
    return `Toernooi: ${t || "—"}  |  Afstand: ${d || "—"}  |  Seizoen: ${y}`;
  }

  function renderResults(){
    clear(resultsWrap);

    const chosen = selectedRiders.slice(0, riderCount).filter(Boolean);
    const missing = chosen.length < 2;

    resultsWrap.appendChild(el("div", { class:"muted" }, activeFiltersSummary()));

    if(missing){
      resultsWrap.appendChild(el("div", { class:"notice", style:"margin-top:10px" },
        "Selecteer minimaal 2 rijders om te vergelijken."
      ));
      return;
    }

    const filters = { tournaments: tSet, distances: dSet, seasons: ySet };
    const filtered = filterRows(dataset.results, filters)
      .filter(r => chosen.includes(r.skaterName));

    const metrics = computeMetrics(filtered, chosen);

    if(chosen.length === 2){
      const a = chosen[0], b = chosen[1];
      resultsWrap.appendChild(el("div", { class:"h2hGrid" }, [
        riderCard(a, meta, metrics),
        compareMiddle(root, a, b, metrics, filters),
        riderCard(b, meta, metrics),
      ]));
    }else{
      // Multi: cards + matrix
      const cards = el("div", { class:"cardsGrid" });
      for(const n of chosen) cards.appendChild(riderCard(n, meta, metrics));
      resultsWrap.appendChild(cards);
      resultsWrap.appendChild(el("div", { style:"height:12px" }));
      resultsWrap.appendChild(matrixTable(chosen, metrics));
    }
  }

  function render(){
    // cleanup prior dropdown doc listeners
    for(const fn of cleanupFns.splice(0)) try{ fn(); }catch(_){}

    clear(root);

    const topControls = el("div", { class:"h2hTop" });

    // compact rider count select
    const countSel = el("select", { class:"input input--sm" });
    [2,3,4,5,6].forEach(n => countSel.appendChild(el("option", { value:String(n) }, String(n))));
    countSel.value = String(riderCount);
    countSel.addEventListener("change", ()=>{
      riderCount = Number(countSel.value) || 2;
      render(); // re-render controls
      renderResults();
    });

    const headerRow = el("div", { class:"h2hTop__row" }, [
      el("div", { class:"muted" }, "Aantal rijders"),
      countSel
    ]);

    // rider selectors
    const riderRow = el("div", { class:"h2hRiders" });
    for(let i=0;i<riderCount;i++){
      const dd = typeableDropdown({
        placeholder: `Rijder ${i+1}`,
        value: selectedRiders[i] || "",
        options: allRiders,
        onChange: (v)=>{ selectedRiders[i] = v; renderResults(); }
      });
      cleanupFns.push(dd.wrap.__cleanup || (()=>{}));
      riderRow.appendChild(dd.wrap);
    }

    // Filters
    const filters = el("div", { class:"filtersCard", style:"margin-top:12px" }, [
      el("div", { class:"filtersCard__head" }, [
        el("div", {}, el("div", { class:"muted" }, "Filters")),
        el("div", { class:"muted" }, meta?.name ? `Dataset: ${meta.name}` : "")
      ]),
      el("div", { class:"chipRow" }, tournaments.map(t =>
        chip(t.label, tSet.has(t.key), ()=>{
          normalizeSetToggle(tSet, t.key);
          renderResults();
        })
      )),
      el("div", { class:"chipRow", style:"margin-top:10px" }, distances.map(d =>
        chip(d.label, dSet.has(d.key), ()=>{
          normalizeSetToggle(dSet, d.key);
          renderResults();
        })
      )),
      el("div", { class:"h2hSeasonRow" }, [
        seasonsMultiDropdown({
          allSeasons: seasons.slice().sort((a,b)=>b-a),
          selectedSet: ySet,
          onChange: ()=> renderResults()
        })
      ])
    ]);

    // Ensure dropdown cleanup
    cleanupFns.push(filters.querySelector(".msel").__cleanup || (()=>{}));

    topControls.appendChild(headerRow);
    topControls.appendChild(riderRow);

    root.appendChild(sectionCard({
      title:"Head-to-Head",
      subtitle:"Vergelijk rijders op dezelfde filters (Results-tabblad).",
      children:[
        topControls,
        filters,
        el("div", { style:"height:14px" }),
        resultsWrap
      ]
    }));

    renderResults();
  }

  render();
}