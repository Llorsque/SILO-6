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

// Stats calculation helpers
function calculateStats(events, riderA, riderB){
  const stats = {
    total: events.length,
    aWins: 0,
    bWins: 0,
    ties: 0,
    byDistance: {},
    recent: [],
    positions: { a: [], b: [] }
  };
  
  // Process each event
  events.forEach((ev, idx) => {
    const aData = ev.riders[riderA] || { pos: null, opmerking: null };
    const bData = ev.riders[riderB] || { pos: null, opmerking: null };
    const aPos = aData.pos;
    const bPos = bData.pos;
    const aOpm = aData.opmerking;
    const bOpm = bData.opmerking;
    
    // Track positions for average calculation
    if(aPos) stats.positions.a.push(aPos);
    if(bPos) stats.positions.b.push(bPos);
    
    // Determine winner
    const hasA = aPos && Number.isFinite(aPos);
    const hasB = bPos && Number.isFinite(bPos);
    let winner = null;
    
    if(hasA && hasB){
      if(aPos < bPos) winner = 'a';
      else if(bPos < aPos) winner = 'b';
      else winner = 'tie';
    }else if(hasA && !hasB){
      winner = 'a';
    }else if(!hasA && hasB){
      winner = 'b';
    }
    
    // Count overall
    if(winner === 'a') stats.aWins++;
    else if(winner === 'b') stats.bWins++;
    else if(winner === 'tie') stats.ties++;
    
    // Count by distance
    const dist = ev.distance || "Onbekend";
    if(!stats.byDistance[dist]){
      stats.byDistance[dist] = { total: 0, aWins: 0, bWins: 0, ties: 0 };
    }
    stats.byDistance[dist].total++;
    if(winner === 'a') stats.byDistance[dist].aWins++;
    else if(winner === 'b') stats.byDistance[dist].bWins++;
    else if(winner === 'tie') stats.byDistance[dist].ties++;
    
    // Track recent (last 5) with actual positions and opmerkingen
    if(idx >= events.length - 5){
      stats.recent.push({
        winner: winner,
        aPos: aPos || "—",
        bPos: bPos || "—",
        aOpm: aOpm,
        bOpm: bOpm
      });
    }
  });
  
  return stats;
}

function getConfidenceLevel(total){
  if(total >= 15) return { level: "Hoog", emoji: "✓", color: "#52E8E8" };
  if(total >= 8) return { level: "Medium", emoji: "⚠", color: "#FFA500" };
  return { level: "Laag", emoji: "⚠", color: "#FF6B6B" };
}

function getPrediction(percentage, total){
  if(total < 5) return "Onvoldoende data";
  if(percentage > 65) return "Duidelijke favoriet";
  if(percentage > 55) return "Lichte favoriet";
  if(percentage >= 45) return "Evenwichtig";
  return "Underdog";
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

function showIndividualStatsModal(name, allFilteredData, activeFilters){
  // Filter data for this specific rider
  const riderData = allFilteredData.filter(r => r.skaterName === name);
  
  if(riderData.length === 0){
    alert(`Geen data gevonden voor ${name} met de geselecteerde filters.`);
    return;
  }
  
  // Helper: Extract last name
  const getLastName = (fullName) => {
    const parts = fullName.split(" ");
    return parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
  };
  
  const shortName = getLastName(name);
  
  // Build filter context string
  const filterContext = [];
  if(activeFilters.tournaments.size > 0) {
    filterContext.push(Array.from(activeFilters.tournaments).map(t => t === "WC" ? "WC/WT" : t).join(", "));
  }
  if(activeFilters.distances.size > 0) {
    filterContext.push(Array.from(activeFilters.distances).join(", "));
  }
  if(activeFilters.seasons.size > 0) {
    const years = Array.from(activeFilters.seasons).sort((a,b) => b-a);
    if(years.length <= 3) {
      filterContext.push(years.join(", "));
    } else {
      filterContext.push(`${years[0]}-${years[years.length-1]}`);
    }
  }
  if(activeFilters.runFilter !== "none") {
    filterContext.push(activeFilters.runFilter);
  }
  const contextStr = filterContext.length > 0 ? filterContext.join(" | ") : "Alle data";
  
  // Calculate stats
  let totalRaces = riderData.length;
  let racesWithPos = 0;
  let podiums = 0;
  let positions = [];
  let bestPos = null;
  let recent = [];
  
  riderData.forEach((race, idx) => {
    const pos = Number(race.pos);
    const opm = race.opmerking;
    
    if(pos){
      racesWithPos++;
      positions.push(pos);
      
      if(!bestPos || pos < bestPos) bestPos = pos;
      if(pos <= 3) podiums++;
    }
    
    // Last 5
    if(idx >= riderData.length - 5){
      recent.push({ pos: pos || "—", opm: opm });
    }
  });
  
  const avgPos = positions.length > 0 
    ? (positions.reduce((a,b) => a+b, 0) / positions.length).toFixed(1)
    : "—";
  
  const podiumRate = racesWithPos > 0 
    ? ((podiums / racesWithPos) * 100).toFixed(0)
    : 0;
  
  // Build recent form string
  const formatPos = (pos, opm) => {
    const posStr = String(pos);
    return opm ? `${posStr} (${opm})` : posStr;
  };
  const recentStr = recent.map(r => formatPos(r.pos, r.opm)).join(' - ');
  
  // Build compact modal
  const content = el("div", { class:"stats-modal-compact" }, [
    // Filter context banner
    el("div", { class:"filter-context-banner" }, [
      el("div", { class:"filter-context-label" }, "Geselecteerde filters:"),
      el("div", { class:"filter-context-value" }, contextStr)
    ]),
    
    el("div", { style:"height:16px" }),
    
    // Main stats - large and clear
    el("div", { class:"main-stats" }, [
      el("div", { class:"main-stat-item" }, [
        el("div", { class:"main-stat-value" }, totalRaces),
        el("div", { class:"main-stat-label" }, "Totaal races")
      ]),
      el("div", { class:"main-stat-item" }, [
        el("div", { class:"main-stat-value" }, bestPos || "—"),
        el("div", { class:"main-stat-label" }, "Beste positie")
      ]),
      el("div", { class:"main-stat-item" }, [
        el("div", { class:"main-stat-value" }, avgPos),
        el("div", { class:"main-stat-label" }, "Gemiddelde positie")
      ]),
      el("div", { class:"main-stat-item" }, [
        el("div", { class:"main-stat-value" }, `${podiumRate}%`),
        el("div", { class:"main-stat-label" }, `Podium rate (${podiums}/${racesWithPos})`)
      ])
    ]),
    
    el("div", { style:"height:20px" }),
    
    // Recent form
    el("div", { class:"recent-section" }, [
      el("div", { class:"recent-title" }, `📈 Laatste ${recent.length} races`),
      el("div", { class:"recent-positions" }, recentStr)
    ]),
    
    el("div", { style:"height:16px" }),
    
    // Quick notes
    el("div", { class:"quick-notes" }, [
      el("div", { class:"note-item" }, `• ${racesWithPos} races met geldige positie van ${totalRaces} totaal`),
      podiums > 0 
        ? el("div", { class:"note-item" }, `• ${podiums} podium finishes in deze categorie`)
        : el("div", { class:"note-item" }, `• Nog geen podium in deze categorie`),
      positions.length >= 3
        ? el("div", { class:"note-item" }, `• Voldoende data voor betrouwbare analyse`)
        : el("div", { class:"note-item" }, `• Beperkte data - voeg meer filters toe voor betere analyse`)
    ])
  ]);
  
  const m = modal(`📊 ${shortName} - Individuele Stats`, content);
  document.body.appendChild(m);
}

function showStatsModal(events, riderA, riderB){
  const stats = calculateStats(events, riderA, riderB);
  const confidence = getConfidenceLevel(stats.total);
  
  // Helper: Extract last name (everything except first name which is at the end)
  const getLastName = (fullName) => {
    const parts = fullName.split(" ");
    return parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
  };
  
  const nameA = getLastName(riderA);
  const nameB = getLastName(riderB);
  
  // Calculate percentages
  const aPercent = stats.total > 0 ? ((stats.aWins / stats.total) * 100).toFixed(1) : 0;
  const bPercent = stats.total > 0 ? ((stats.bWins / stats.total) * 100).toFixed(1) : 0;
  const tiePercent = stats.total > 0 ? ((stats.ties / stats.total) * 100).toFixed(1) : 0;
  
  // Calculate average positions
  const avgA = stats.positions.a.length > 0 
    ? (stats.positions.a.reduce((a,b) => a+b, 0) / stats.positions.a.length).toFixed(1)
    : "—";
  const avgB = stats.positions.b.length > 0
    ? (stats.positions.b.reduce((a,b) => a+b, 0) / stats.positions.b.length).toFixed(1)
    : "—";
  
  // Calculate consistency (standard deviation)
  const calcStdDev = (arr) => {
    if(arr.length < 2) return 0;
    const mean = arr.reduce((a,b) => a+b, 0) / arr.length;
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  };
  const stdDevA = calcStdDev(stats.positions.a).toFixed(1);
  const stdDevB = calcStdDev(stats.positions.b).toFixed(1);
  
  // Build content sections
  const sections = [];
  
  // Section 1: Overall stats
  sections.push(el("div", { class:"stats-section" }, [
    el("h3", { class:"stats-heading" }, "📊 ALGEMEEN"),
    el("div", { class:"stats-row" }, `Totaal samen: ${stats.total} races`),
    el("div", { class:"stats-row" }, `${riderA}: ${stats.aWins} wins (${aPercent}%)`),
    el("div", { class:"stats-row" }, `${riderB}: ${stats.bWins} wins (${bPercent}%)`),
    stats.ties > 0 ? el("div", { class:"stats-row" }, `Gelijk: ${stats.ties} (${tiePercent}%)`) : null,
    el("div", { class:"stats-confidence", style:`color:${confidence.color}` }, 
      `${confidence.emoji} Betrouwbaarheid: ${confidence.level}`)
  ].filter(Boolean)));
  
  // Section 2: Distance breakdown
  const distanceRows = Object.entries(stats.byDistance)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([dist, data]) => {
      const aP = ((data.aWins / data.total) * 100).toFixed(0);
      const bP = ((data.bWins / data.total) * 100).toFixed(0);
      const predA = getPrediction(parseFloat(aP), data.total);
      const predB = getPrediction(parseFloat(bP), data.total);
      
      return el("div", { class:"distance-stat" }, [
        el("div", { class:"distance-stat-header" }, `${dist} (${data.total} races)`),
        el("div", { class:"distance-stat-bar" }, [
          el("div", { class:"bar-item bar-a", style:`width:${aP}%` }, 
            data.aWins > 0 ? `${nameA}: ${aP}%` : ""),
          el("div", { class:"bar-item bar-b", style:`width:${bP}%` }, 
            data.bWins > 0 ? `${nameB}: ${bP}%` : "")
        ]),
        el("div", { class:"distance-stat-detail" }, 
          `${nameA}: ${data.aWins} wins | ${nameB}: ${data.bWins} wins${data.ties > 0 ? ` | Gelijk: ${data.ties}` : ""}`)
      ]);
    });
  
  sections.push(el("div", { class:"stats-section" }, [
    el("h3", { class:"stats-heading" }, "🎯 PER AFSTAND"),
    ...distanceRows
  ]));
  
  // Section 3: Recent form
  if(stats.recent.length > 0){
    // Build position strings with opmerking
    const formatPos = (pos, opm) => {
      const posStr = String(pos);
      return opm ? `${posStr} (${opm})` : posStr;
    };
    
    const recentA = stats.recent.map(r => formatPos(r.aPos, r.aOpm)).join(' - ');
    const recentB = stats.recent.map(r => formatPos(r.bPos, r.bOpm)).join(' - ');
    const recentAWins = stats.recent.filter(r => r.winner === 'a').length;
    const recentBWins = stats.recent.filter(r => r.winner === 'b').length;
    const recentAPercent = ((recentAWins / stats.recent.length) * 100).toFixed(0);
    const recentBPercent = ((recentBWins / stats.recent.length) * 100).toFixed(0);
    
    sections.push(el("div", { class:"stats-section" }, [
      el("h3", { class:"stats-heading" }, `📈 RECENTE VORM (laatste ${stats.recent.length})`),
      el("div", { class:"stats-row recent-row" }, [
        el("span", {}, `${nameA}: `),
        el("span", { class:"recent-record" }, recentA),
        el("span", { class:"recent-percent" }, ` (${recentAPercent}%)`)
      ]),
      el("div", { class:"stats-row recent-row" }, [
        el("span", {}, `${nameB}: `),
        el("span", { class:"recent-record" }, recentB),
        el("span", { class:"recent-percent" }, ` (${recentBPercent}%)`)
      ])
    ]));
  }
  
  // Section 4: Average positions
  sections.push(el("div", { class:"stats-section" }, [
    el("h3", { class:"stats-heading" }, "📍 GEMIDDELDE POSITIE"),
    el("div", { class:"stats-row" }, `${riderA}: ⌀ ${avgA}`),
    el("div", { class:"stats-row" }, `${riderB}: ⌀ ${avgB}`),
    el("div", { class:"stats-note" }, "Lager = beter")
  ]));
  
  // Section 5: Consistency
  const getConsistencyStars = (stdDev) => {
    if(stdDev < 1) return "★★★★★ (Zeer consistent)";
    if(stdDev < 1.5) return "★★★★☆ (Consistent)";
    if(stdDev < 2.5) return "★★★☆☆ (Gemiddeld)";
    if(stdDev < 3.5) return "★★☆☆☆ (Wisselvallig)";
    return "★☆☆☆☆ (Zeer wisselvallig)";
  };
  
  sections.push(el("div", { class:"stats-section" }, [
    el("h3", { class:"stats-heading" }, "🎲 CONSISTENTIE"),
    el("div", { class:"stats-row" }, [
      el("div", {}, `${riderA}: ${getConsistencyStars(stdDevA)}`),
      el("div", { class:"stats-note" }, `Standaard deviatie: ${stdDevA}`)
    ]),
    el("div", { class:"stats-row" }, [
      el("div", {}, `${riderB}: ${getConsistencyStars(stdDevB)}`),
      el("div", { class:"stats-note" }, `Standaard deviatie: ${stdDevB}`)
    ])
  ]));
  
  // Section 6: Prediction
  const predictionA = getPrediction(parseFloat(aPercent), stats.total);
  const predictionB = getPrediction(parseFloat(bPercent), stats.total);
  
  const distPredictions = Object.entries(stats.byDistance)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([dist, data]) => {
      const aP = ((data.aWins / data.total) * 100).toFixed(0);
      const bP = ((data.bWins / data.total) * 100).toFixed(0);
      let prediction = "";
      
      if(data.total < 5){
        prediction = "⚠ Onvoldoende data";
      }else if(Math.abs(aP - bP) < 10){
        prediction = "⚖ 50-50 (Evenwichtig)";
      }else if(aP > bP){
        prediction = `⭐ ${nameA} ${aP}% kans`;
      }else{
        prediction = `⭐ ${nameB} ${bP}% kans`;
      }
      
      return el("div", { class:"prediction-row" }, `${dist}: ${prediction}`);
    });
  
  sections.push(el("div", { class:"stats-section stats-prediction" }, [
    el("h3", { class:"stats-heading" }, "🔮 VOORSPELLING"),
    el("div", { class:"stats-row" }, `Algemeen: ${nameA} ${predictionA}`),
    el("div", { style:"height:8px" }),
    el("div", { class:"stats-subheading" }, "Bij volgende race:"),
    ...distPredictions
  ]));
  
  const content = el("div", { class:"stats-modal-content" }, sections);
  
  const m = modal(`📊 Statistische Analyse: ${nameA} vs ${nameB}`, content);
  document.body.appendChild(m);
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

function computeMetrics(filteredRows, riders, allFiltered){
  // For individual rider stats, use allFiltered (all races matching filters)
  // For comparison stats, use filteredRows (only races where both riders appear)
  
  // Build rider -> rows from ALL filtered data (not just shared races)
  const byRider = new Map();
  for(const name of riders) byRider.set(name, []);
  for(const r of allFiltered){
    if(byRider.has(r.skaterName)) byRider.get(r.skaterName).push(r);
  }

  // best position per rider (from ALL filtered races for that rider)
  const bestPos = {};
  const podium = {};
  const participation = {};
  for(const name of riders){
    bestPos[name] = null;
    podium[name] = { gold:0, silver:0, bronze:0 };
    const rows = byRider.get(name) || [];

    // bestPos = minimum pos in ALL filtered rows for this rider
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

    // participation: unique tournamentShort + season from ALL filtered races
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

  // shared results and wins matrix (use filteredRows = comparison data)
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

function riderCard(name, meta, metrics, allFilteredData, activeFilters){
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
  
  // Add Stats button
  const statsBtn = el("button", { 
    class:"btn-stats", 
    type:"button",
    style:"margin-top:12px"
  }, "📊 Stats & Voorspelling");
  
  statsBtn.addEventListener("click", () => {
    showIndividualStatsModal(name, allFilteredData, activeFilters);
  });
  
  lines.push(statsBtn);

  return el("div", { class:"hcard" }, lines);
}

function compareMiddle(a, b, metrics){
  const s = metrics.pair[`${a}||${b}`] || { shared:0, aAhead:0, bAhead:0 };
  const details = metrics.pairDetails[`${a}||${b}`] || { sharedEvents: [], aWins: [], bWins: [] };
  
  // Create clickable pills
  const sharedPill = el("div", { class:"pill pill--wide pill--clickable" }, `Samen in uitslag: ${s.shared}`);
  const aPill = el("div", { class:"pill pill--wide pill--clickable" }, `Winst ${a.split(" ")[0]}: ${s.aAhead}`);
  const bPill = el("div", { class:"pill pill--wide pill--clickable" }, `Winst ${b.split(" ")[0]}: ${s.bAhead}`);
  
  // Create stats button
  const statsBtn = el("button", { 
    class:"btn-stats", 
    type:"button" 
  }, "📊 Stats & Voorspelling");
  
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
  
  statsBtn.addEventListener("click", () => {
    showStatsModal(details.sharedEvents, a, b);
  });
  
  return el("div", { class:"hmid" }, [
    el("div", { class:"hmid__title" }, "Vergelijking"),
    el("div", { class:"hmid__row" }, [
      sharedPill,
      aPill,
      bPill
    ]),
    el("div", { style:"margin-top:12px" }, statsBtn),
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
    
    // Get all filtered results (for individual rider stats)
    const allFiltered = filterRows(dataset.results, filters);
    
    // Get filtered results for comparison (only races with chosen riders)
    const comparisonFiltered = allFiltered.filter(r => chosen.includes(r.skaterName));

    const metrics = computeMetrics(comparisonFiltered, chosen, allFiltered);

    if(chosen.length === 2){
      const a = chosen[0], b = chosen[1];
      resultsWrap.appendChild(el("div", { class:"h2hGrid" }, [
        riderCard(a, meta, metrics, allFiltered, filters),
        compareMiddle(a, b, metrics),
        riderCard(b, meta, metrics, allFiltered, filters),
      ]));
    }else{
      // Multi: cards + matrix
      const cards = el("div", { class:"cardsGrid" });
      for(const n of chosen) cards.appendChild(riderCard(n, meta, metrics, allFiltered, filters));
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
        el("div", { class:"chipRow" }, [
          // "All" toggle
          chip("All", tSet.size === tournaments.length, ()=>{
            if(tSet.size === tournaments.length){
              // All selected → deselect all
              tSet.clear();
            }else{
              // Not all selected → select all
              tSet.clear();
              tournaments.forEach(t => tSet.add(t.key));
            }
            render();
          }),
          ...tournaments.map(t =>
            chip(t.label, tSet.has(t.key), ()=>{
              normalizeSetToggle(tSet, t.key);
              render();
            })
          )
        ])
      ]),
      
      // Afstand filter
      el("div", { class:"filterGroup", style:"margin-top:10px" }, [
        el("div", { class:"filterLabel" }, "Afstand"),
        el("div", { class:"chipRow" }, [
          // "All" toggle
          chip("All", dSet.size === distances.length, ()=>{
            if(dSet.size === distances.length){
              // All selected → deselect all
              dSet.clear();
            }else{
              // Not all selected → select all
              dSet.clear();
              distances.forEach(d => dSet.add(d.key));
            }
            render();
          }),
          ...distances.map(d =>
            chip(d.label, dSet.has(d.key), ()=>{
              normalizeSetToggle(dSet, d.key);
              render();
            })
          )
        ])
      ]),
      
      // Seizoen filter
      el("div", { class:"filterGroup", style:"margin-top:10px" }, [
        el("div", { class:"filterLabel" }, "Seizoen"),
        el("div", { class:"chipRow" }, [
          // "All" toggle
          chip("All", ySet.size === seasons.length, ()=>{
            if(ySet.size === seasons.length){
              // All selected → deselect all
              ySet.clear();
            }else{
              // Not all selected → select all
              ySet.clear();
              seasons.forEach(y => ySet.add(y));
            }
            render();
          }),
          ...seasons.slice().sort((a,b)=>b-a).map(y =>
            chip(String(y), ySet.has(y), ()=>{
              normalizeSetToggle(ySet, y);
              render();
            })
          )
        ])
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