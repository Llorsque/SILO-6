import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { loadDataset, loadMeta } from "../../core/storage.js";

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

function modal(title, content, onClose){
  const overlay = el("div", { class:"modal-overlay" });
  const box = el("div", { class:"modal-box" }, [
    el("div", { class:"modal-header" }, [
      el("h3", { class:"modal-title" }, title),
      el("button", { class:"modal-close", type:"button" }, "×")
    ]),
    el("div", { class:"modal-content" }, content)
  ]);
  
  overlay.appendChild(box);
  
  const close = () => {
    overlay.remove();
    if(onClose) onClose();
  };
  
  overlay.addEventListener("click", (e) => {
    if(e.target === overlay) close();
  });
  
  box.querySelector(".modal-close").addEventListener("click", close);
  
  return overlay;
}

function showSharedEventsModal(events, riderA, riderB){
  // Calculate distance breakdown
  const distanceCount = {};
  events.forEach(ev => {
    const dist = ev.distance || "Onbekend";
    distanceCount[dist] = (distanceCount[dist] || 0) + 1;
  });
  
  // Create summary pills
  const summaryPills = Object.entries(distanceCount)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .map(([dist, count]) => 
      el("span", { class:"summary-pill" }, `${dist}: ${count}`)
    );
  
  const rows = events.map(ev => {
    return el("div", { class:"event-row" }, [
      el("span", {}, ev.tournament || "—"),
      el("span", {}, ev.distance || "—"),
      el("span", {}, ev.location || "—"),
      el("span", {}, String(ev.season || "—"))
    ]);
  });
  
  const content = el("div", { class:"event-list" }, [
    el("div", { class:"summary-section" }, [
      el("div", { class:"summary-title" }, "Samenvatting per afstand"),
      el("div", { class:"summary-pills" }, summaryPills)
    ]),
    el("div", { style:"height:16px" }),
    el("div", { class:"event-header" }, [
      el("span", {}, "Wedstrijd"),
      el("span", {}, "Afstand"),
      el("span", {}, "Locatie"),
      el("span", {}, "Seizoen")
    ]),
    ...rows
  ]);
  
  if(rows.length === 0){
    content.appendChild(el("div", { class:"notice", style:"margin-top:10px" }, "Geen gezamenlijke uitslagen gevonden."));
  }
  
  const m = modal(`Samen in uitslag: ${riderA} vs ${riderB}`, content);
  document.body.appendChild(m);
}

function showWinsModal(events, winner, loser){
  // Calculate distance breakdown
  const distanceCount = {};
  events.forEach(ev => {
    const dist = ev.distance || "Onbekend";
    distanceCount[dist] = (distanceCount[dist] || 0) + 1;
  });
  
  // Create summary pills
  const summaryPills = Object.entries(distanceCount)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .map(([dist, count]) => 
      el("span", { class:"summary-pill" }, `${dist}: ${count}`)
    );
  
  const rows = events.map(ev => {
    const winnerData = ev.riders[winner] || { pos: null, opmerking: null };
    const loserData = ev.riders[loser] || { pos: null, opmerking: null };
    
    const winnerPos = winnerData.pos || "—";
    const loserPos = loserData.pos || "—";
    const winnerOpm = winnerData.opmerking;
    const loserOpm = loserData.opmerking;
    
    return el("div", { class:"event-row-with-pos" }, [
      el("div", { class:"event-info" }, [
        el("span", {}, ev.tournament || "—"),
        el("span", {}, ev.distance || "—"),
        el("span", {}, ev.location || "—"),
        el("span", {}, String(ev.season || "—"))
      ]),
      el("div", { class:"event-positions" }, [
        el("span", {}, `${winner}: ${winnerPos}${winnerOpm ? ` (${winnerOpm})` : ""}`),
        el("span", {}, `${loser}: ${loserPos}${loserOpm ? ` (${loserOpm})` : ""}`)
      ])
    ]);
  });
  
  const content = el("div", { class:"event-list" }, [
    el("div", { class:"summary-section" }, [
      el("div", { class:"summary-title" }, "Samenvatting per afstand"),
      el("div", { class:"summary-pills" }, summaryPills)
    ]),
    el("div", { style:"height:16px" }),
    el("div", { class:"event-header-with-pos" }, [
      el("div", { class:"event-info-header" }, [
        el("span", {}, "Wedstrijd"),
        el("span", {}, "Afstand"),
        el("span", {}, "Locatie"),
        el("span", {}, "Seizoen")
      ]),
      el("div", { class:"event-positions-header" }, "Posities")
    ]),
    ...rows
  ]);
  
  if(rows.length === 0){
    content.appendChild(el("div", { class:"notice", style:"margin-top:10px" }, "Geen overwinningen gevonden."));
  }
  
  const m = modal(`Winst ${winner} over ${loser}`, content);
  document.body.appendChild(m);
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
  // Unique event = Column F + G + H + I + J + K
  // F = Wedstrijd (tournament)
  // G = Locatie (location)
  // H = Afstand (distance)
  // I = Datum (date)
  // J = Seizoen (season)
  // K = Sekse (sex)
  const date = r.dateISO ? r.dateISO.slice(0,10) : "";
  return [
    r.wedstrijdRaw || r.tournament,  // Column F
    r.locatie,                        // Column G - NOW INCLUDED
    r.afstandRaw || r.distance,       // Column H
    date,                              // Column I
    r.season,                          // Column J
    r.sekseRaw || r.sex               // Column K
  ].join("|");
}

function isEligibleRun(r, runFilterValue){
  // If "none" selected, exclude all
  if(runFilterValue === "none") return false;
  
  // Always exclude "eindklassement"
  const rk = String(r.runKey || "").toLowerCase();
  if(rk === "eindklassement") return false;
  
  // If "all" selected, include everything except eindklassement
  if(runFilterValue === "all") return true;
  
  // Normalize the run name from the data
  const runRaw = String(r.runRaw || r.runKey || "").toLowerCase().trim();
  
  // Check if it matches the selected filter
  if(runFilterValue === "Final A"){
    return runRaw === "final a";
  }
  if(runFilterValue === "Final B"){
    return runRaw === "final b";
  }
  
  return false;
}

function filterRows(results, filters){
  const tSet = filters.tournaments;
  const dSet = filters.distances;
  const ySet = filters.seasons;
  const runFilterValue = filters.runFilter;

  return results.filter(r => {
    if(!r || !r.skaterName) return false;
    if(!isEligibleRun(r, runFilterValue)) return false;

    if(tSet.size && !tSet.has(r.tournamentShort)) return false;
    if(ySet.size && !ySet.has(r.season)) return false;

    // Distance filter
    if(dSet.size && !dSet.has(r.distance)) return false;

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

      // Podium: BOTH conditions must be met:
      // 1. Column B (pos) = 1, 2, or 3
      // 2. Column A (run) = "Final A" OR "Eindklassement"
      const runKey = String(rr.runKey || "").toLowerCase();
      const isPodiumRun = runKey === "final a" || runKey === "eindklassement";
      
      if(isPodiumRun){
        if(p === 1) podium[name].gold++;
        if(p === 2) podium[name].silver++;
        if(p === 3) podium[name].bronze++;
      }
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

  // shared results and wins matrix
  const events = new Map(); // eventKey -> Map(rider->pos)
  for(const r of filteredRows){
    if(!riders.includes(r.skaterName)) continue;
    const key = buildEventKey(r);
    if(!events.has(key)) events.set(key, new Map());
    const mp = events.get(key);
    const p = Number(r.pos) || null; // Store null if no valid position
    const prev = mp.get(r.skaterName);
    // keep best (min pos) if duplicates exist, or set null if no position
    if(prev == null || (p != null && p < prev)) mp.set(r.skaterName, p);
  }

  // pairwise stats with detailed event tracking
  const pair = {};
  const pairDetails = {}; // Store detailed event info for modals
  
  for(let i=0;i<riders.length;i++){
    for(let j=0;j<riders.length;j++){
      if(i===j) continue;
      const a=riders[i], b=riders[j];
      pair[`${a}||${b}`] = { shared:0, aAhead:0, bAhead:0 };
      pairDetails[`${a}||${b}`] = { sharedEvents: [], aWins: [], bWins: [] };
    }
  }

  // Build detailed event list from filteredRows for modal display
  const eventDetails = new Map(); // eventKey -> { tournament, distance, location, season, riders: {name: {pos, opmerking}} }
  for(const r of filteredRows){
    if(!riders.includes(r.skaterName)) continue;
    const key = buildEventKey(r);
    if(!eventDetails.has(key)){
      eventDetails.set(key, {
        tournament: r.wedstrijdRaw || r.tournament,
        distance: r.afstandRaw || r.distance,
        location: r.locatie,
        season: r.season,
        riders: {}
      });
    }
    const p = Number(r.pos);
    const opm = String(r.opmerking || "").trim();
    eventDetails.get(key).riders[r.skaterName] = {
      pos: p || null,
      opmerking: opm && opm !== "-" ? opm : null
    };
  }

  for(const mp of events.values()){
    for(let i=0;i<riders.length;i++){
      for(let j=i+1;j<riders.length;j++){
        const a=riders[i], b=riders[j];
        if(!mp.has(a) || !mp.has(b)) continue;
        const pa=mp.get(a), pb=mp.get(b);

        // Find the event key for this event
        let eventKey = null;
        for(const [key, riderMap] of events.entries()){
          if(riderMap === mp){
            eventKey = key;
            break;
          }
        }
        const eventInfo = eventKey ? eventDetails.get(eventKey) : null;

        // Samen in uitslag: both riders present
        pair[`${a}||${b}`].shared++;
        pair[`${b}||${a}`].shared++;
        
        if(eventInfo){
          pairDetails[`${a}||${b}`].sharedEvents.push(eventInfo);
          pairDetails[`${b}||${a}`].sharedEvents.push(eventInfo);
        }

        // Winst: Apply position comparison rules
        // Rule 1: Number vs Number → lower wins
        // Rule 2: Number vs Empty → number wins
        // Rule 3: Empty vs Empty → no winner (tie)
        
        const hasA = pa && Number.isFinite(pa);
        const hasB = pb && Number.isFinite(pb);
        
        if(hasA && hasB){
          // Both have positions - lower number wins
          if(pa < pb){
            pair[`${a}||${b}`].aAhead++;
            pair[`${b}||${a}`].bAhead++;
            if(eventInfo){
              pairDetails[`${a}||${b}`].aWins.push(eventInfo);
              pairDetails[`${b}||${a}`].bWins.push(eventInfo);
            }
          }else if(pb < pa){
            pair[`${a}||${b}`].bAhead++;
            pair[`${b}||${a}`].aAhead++;
            if(eventInfo){
              pairDetails[`${a}||${b}`].bWins.push(eventInfo);
              pairDetails[`${b}||${a}`].aWins.push(eventInfo);
            }
          }
          // If pa === pb, it's a tie - don't count in wins
        }else if(hasA && !hasB){
          // A has position, B doesn't - A wins
          pair[`${a}||${b}`].aAhead++;
          pair[`${b}||${a}`].bAhead++;
          if(eventInfo){
            pairDetails[`${a}||${b}`].aWins.push(eventInfo);
            pairDetails[`${b}||${a}`].bWins.push(eventInfo);
          }
        }else if(!hasA && hasB){
          // B has position, A doesn't - B wins
          pair[`${a}||${b}`].bAhead++;
          pair[`${b}||${a}`].aAhead++;
          if(eventInfo){
            pairDetails[`${a}||${b}`].bWins.push(eventInfo);
            pairDetails[`${b}||${a}`].aWins.push(eventInfo);
          }
        }
        // If neither has position - no winner
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
  lines.push(el("div", { class:"muted" }, "Podium (geselecteerde runs)"));
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

function compareMiddle(a, b, metrics){
  const s = metrics.pair[`${a}||${b}`] || { shared:0, aAhead:0, bAhead:0 };
  const details = metrics.pairDetails[`${a}||${b}`] || { sharedEvents: [], aWins: [], bWins: [] };
  
  // Create clickable pills
  const sharedPill = el("div", { class:"pill pill--wide pill--clickable" }, `Samen in uitslag: ${s.shared}`);
  const aPill = el("div", { class:"pill pill--wide pill--clickable" }, `Winst ${a.split(" ")[0]}: ${s.aAhead}`);
  const bPill = el("div", { class:"pill pill--wide pill--clickable" }, `Winst ${b.split(" ")[0]}: ${s.bAhead}`);
  
  // Add click handlers
  sharedPill.addEventListener("click", () => {
    showSharedEventsModal(details.sharedEvents, a, b);
  });
  
  aPill.addEventListener("click", () => {
    showWinsModal(details.aWins, a, b);
  });
  
  bPill.addEventListener("click", () => {
    showWinsModal(details.bWins, b, a);
  });
  
  return el("div", { class:"hmid" }, [
    el("div", { class:"hmid__title" }, "Vergelijking"),
    el("div", { class:"hmid__row" }, [
      sharedPill,
      aPill,
      bPill
    ]),
    el("div", { class:"muted", style:"margin-top:10px" },
      "'Winst' = vaker een betere positie (lager pos-getal) binnen dezelfde uitslag. Klik op een resultaat voor details."
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
  
  // Normalize run names: Final A, FINAL A, final a → "Final A"
  function normalizeRunName(run){
    const str = String(run).toLowerCase().trim();
    if(str === "eindklassement") return null; // Exclude
    if(str === "final a") return "Final A";
    if(str === "final b") return "Final B";
    // For any other run type, return as-is with proper casing
    return run;
  }
  
  // Run filter options - simplified to 4 choices
  const runFilterOptions = [
    { key: "none", label: "None" },
    { key: "all", label: "All" },
    { key: "Final A", label: "Final A" },
    { key: "Final B", label: "Final B" }
  ];
  
  const tournaments = [
    { key:"OS", label:"OS" },
    { key:"WK", label:"WK" },
    { key:"WKJ", label:"WKJ" },
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
  const tSet = new Set(); // EMPTY by default - no filters selected
  const dSet = new Set(); // EMPTY by default - no filters selected
  const ySet = new Set(); // EMPTY by default - no filters selected
  let runFilter = "none"; // Run filter: "none", "all", "Final A", or "Final B"
  const cleanupFns = [];

  const resultsWrap = el("div", { class:"h2hWrap" });

  function activeFiltersSummary(){
    const t = tSet.size ? Array.from(tSet).map(k => (k==="WC" ? "WC/WT" : k)).join(", ") : "Geen";
    const d = dSet.size ? Array.from(dSet).join(", ") : "Geen";
    const y = ySet.size ? Array.from(ySet).sort((a,b)=>b-a).join(", ") : "Geen";
    const r = runFilter !== "none" ? runFilter : "Geen";
    return `Toernooi: ${t}  |  Afstand: ${d}  |  Seizoen: ${y}  |  Run: ${r}`;
  }

  function hasAnyFilters(){
    return tSet.size > 0 || dSet.size > 0 || ySet.size > 0 || runFilter !== "none";
  }

  function renderResults(){
    clear(resultsWrap);

    const chosen = selectedRiders.slice(0, riderCount).filter(Boolean);
    const missing = chosen.length < 2;

    resultsWrap.appendChild(el("div", { class:"muted" }, activeFiltersSummary()));

    // Require at least one filter to be selected
    if(!hasAnyFilters()){
      resultsWrap.appendChild(el("div", { class:"notice", style:"margin-top:10px" },
        "Selecteer minimaal één filter (Toernooi, Afstand, Seizoen of Run) om resultaten te zien."
      ));
      return;
    }

    if(missing){
      resultsWrap.appendChild(el("div", { class:"notice", style:"margin-top:10px" },
        "Selecteer minimaal 2 rijders om te vergelijken."
      ));
      return;
    }

    const filters = { tournaments: tSet, distances: dSet, seasons: ySet, runFilter: runFilter };
    const filtered = filterRows(dataset.results, filters)
      .filter(r => chosen.includes(r.skaterName));

    const metrics = computeMetrics(filtered, chosen);

    if(chosen.length === 2){
      const a = chosen[0], b = chosen[1];
      resultsWrap.appendChild(el("div", { class:"h2hGrid" }, [
        riderCard(a, meta, metrics),
        compareMiddle(a, b, metrics),
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

    // Filters - clearly structured with labels
    const filters = el("div", { class:"filtersCard", style:"margin-top:12px" }, [
      el("div", { class:"filtersCard__head" }, [
        el("div", {}, el("div", { class:"muted" }, "Filters (selecteer minimaal één)")),
        el("div", { class:"muted" }, meta?.name ? `Dataset: ${meta.name}` : "")
      ]),
      
      // Wedstrijd filter
      el("div", { class:"filterGroup", style:"margin-top:10px" }, [
        el("div", { class:"filterLabel" }, "Wedstrijd"),
        el("div", { class:"chipRow" }, tournaments.map(t =>
          chip(t.label, tSet.has(t.key), ()=>{
            normalizeSetToggle(tSet, t.key);
            render(); // Re-render to update chip states
          })
        ))
      ]),
      
      // Afstand filter
      el("div", { class:"filterGroup", style:"margin-top:10px" }, [
        el("div", { class:"filterLabel" }, "Afstand"),
        el("div", { class:"chipRow" }, distances.map(d =>
          chip(d.label, dSet.has(d.key), ()=>{
            normalizeSetToggle(dSet, d.key);
            render(); // Re-render to update chip states
          })
        ))
      ]),
      
      // Seizoen filter
      el("div", { class:"filterGroup", style:"margin-top:10px" }, [
        el("div", { class:"filterLabel" }, "Seizoen"),
        el("div", { class:"chipRow" }, seasons.slice().sort((a,b)=>b-a).map(y =>
          chip(String(y), ySet.has(y), ()=>{
            normalizeSetToggle(ySet, y);
            render(); // Re-render to update chip states
          })
        ))
      ]),
      
      // Run filter - 4 simple options
      el("div", { class:"filterGroup", style:"margin-top:10px" }, [
        el("div", { class:"filterLabel" }, "Run"),
        el("div", { class:"chipRow" }, runFilterOptions.map(opt =>
          chip(opt.label, runFilter === opt.key, ()=>{
            runFilter = opt.key;
            render(); // Re-render to update chip states
          })
        ))
      ])
    ]);

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