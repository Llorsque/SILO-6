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
  try {
    console.log('Opening individual stats for:', name);
    console.log('All filtered data:', allFilteredData);
    console.log('Active filters:', activeFilters);
    
    // Defensive checks
    if(!allFilteredData || !Array.isArray(allFilteredData)){
      console.error('Invalid allFilteredData:', allFilteredData);
      alert('Fout: Geen data beschikbaar');
      return;
    }
    
    if(!activeFilters){
      console.error('Invalid activeFilters:', activeFilters);
      alert('Fout: Geen filter informatie beschikbaar');
      return;
    }
    
    // Filter data for this specific rider
    const riderData = allFilteredData.filter(r => r && r.skaterName === name);
    
    console.log('Rider data found:', riderData.length, 'races');
    
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
    if(activeFilters.tournaments && activeFilters.tournaments.size > 0) {
      filterContext.push(Array.from(activeFilters.tournaments).map(t => t === "WC" ? "WC/WT" : t).join(", "));
    }
    if(activeFilters.distances && activeFilters.distances.size > 0) {
      filterContext.push(Array.from(activeFilters.distances).join(", "));
    }
    if(activeFilters.seasons && activeFilters.seasons.size > 0) {
      const years = Array.from(activeFilters.seasons).sort((a,b) => b-a);
      if(years.length <= 3) {
        filterContext.push(years.join(", "));
      } else {
        filterContext.push(`${years[0]}-${years[years.length-1]}`);
      }
    }
    if(activeFilters.runFilter && activeFilters.runFilter !== "none") {
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
          el("div", { class:"main-stat-value" }, String(totalRaces)),
          el("div", { class:"main-stat-label" }, "Totaal races")
        ]),
        el("div", { class:"main-stat-item" }, [
          el("div", { class:"main-stat-value" }, bestPos ? String(bestPos) : "—"),
          el("div", { class:"main-stat-label" }, "Beste positie")
        ]),
        el("div", { class:"main-stat-item" }, [
          el("div", { class:"main-stat-value" }, String(avgPos)),
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
    
    console.log('Creating modal...');
    const m = modal(`📊 ${shortName} - Individuele Stats`, content);
    console.log('Modal created, appending to body...');
    document.body.appendChild(m);
    console.log('Modal appended successfully');
  } catch(error) {
    console.error('Error in showIndividualStatsModal:', error);
    alert(`Fout bij het openen van statistieken: ${error.message}`);
  }
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
  
  statsBtn.addEventListener("click", (e) => {
    try {
      console.log('Stats button clicked for:', name);
      console.log('allFilteredData length:', allFilteredData ? allFilteredData.length : 'undefined');
      console.log('activeFilters:', activeFilters);
      e.preventDefault();
      e.stopPropagation();
      showIndividualStatsModal(name, allFilteredData, activeFilters);
    } catch(error) {
      console.error('Error in stats button click:', error);
      alert(`Fout: ${error.message}`);
    }
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

function createIndividualResultsTable(riderName, results){
  // Helper to extract last name
  const getLastName = (fullName) => {
    const parts = fullName.split(" ");
    return parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
  };
  
  const shortName = getLastName(riderName);
  
  // Sort by date (newest first)
  const sorted = results.sort((a, b) => {
    const da = a.dateISO ? new Date(a.dateISO).getTime() : 0;
    const db = b.dateISO ? new Date(b.dateISO).getTime() : 0;
    return db - da;
  });
  
  // Count statistics
  const totalRaces = sorted.length;
  const podiums = sorted.filter(r => {
    const pos = Number(r.pos);
    return pos >= 1 && pos <= 3;
  }).length;
  
  const bestPos = sorted.reduce((best, r) => {
    const pos = Number(r.pos);
    if(!pos) return best;
    return best === null || pos < best ? pos : best;
  }, null);
  
  const avgPos = (() => {
    const positions = sorted.map(r => Number(r.pos)).filter(p => p);
    if(positions.length === 0) return "—";
    return (positions.reduce((a,b) => a+b, 0) / positions.length).toFixed(1);
  })();
  
  // Create collapsible section
  const contentWrap = el("div", { class:"individual-results-content", style:"display:none" });
  const toggleBtn = el("button", { 
    class:"individual-results-toggle", 
    type:"button"
  }, `▶ ${shortName} - ${totalRaces} races`);
  
  toggleBtn.addEventListener("click", () => {
    const isOpen = contentWrap.style.display !== "none";
    contentWrap.style.display = isOpen ? "none" : "block";
    toggleBtn.textContent = (isOpen ? "▶" : "▼") + ` ${shortName} - ${totalRaces} races`;
  });
  
  // Stats summary
  const summary = el("div", { class:"individual-results-summary" }, [
    el("div", { class:"result-stat-item" }, [
      el("div", { class:"result-stat-label" }, "Totaal races"),
      el("div", { class:"result-stat-value" }, String(totalRaces))
    ]),
    el("div", { class:"result-stat-item" }, [
      el("div", { class:"result-stat-label" }, "Podiums"),
      el("div", { class:"result-stat-value" }, String(podiums))
    ]),
    el("div", { class:"result-stat-item" }, [
      el("div", { class:"result-stat-label" }, "Beste positie"),
      el("div", { class:"result-stat-value" }, bestPos ? String(bestPos) : "—")
    ]),
    el("div", { class:"result-stat-item" }, [
      el("div", { class:"result-stat-label" }, "Gemiddelde"),
      el("div", { class:"result-stat-value" }, String(avgPos))
    ])
  ]);
  
  // Results table
  const table = el("table", { class:"results-table" });
  const thead = el("thead", null, el("tr", null, [
    el("th", null, "Datum"),
    el("th", null, "Toernooi"),
    el("th", null, "Locatie"),
    el("th", null, "Afstand"),
    el("th", null, "Run"),
    el("th", null, "Pos."),
    el("th", null, "Opmerking")
  ]));
  table.appendChild(thead);
  
  const tbody = el("tbody");
  sorted.forEach(r => {
    const pos = Number(r.pos);
    const isPodium = pos >= 1 && pos <= 3;
    const medalIcon = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : "";
    
    const row = el("tr", { class: isPodium ? "podium-row" : "" }, [
      el("td", null, r.datum || "—"),
      el("td", null, r.tournamentShort || "—"),
      el("td", null, r.locatie || "—"),
      el("td", null, r.distance || "—"),
      el("td", null, r.runKey || "—"),
      el("td", { style: isPodium ? "font-weight:900" : "" }, pos ? `${medalIcon} ${pos}` : "—"),
      el("td", { class:"muted" }, r.opmerking && r.opmerking !== "-" ? r.opmerking : "")
    ]);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  
  contentWrap.appendChild(summary);
  contentWrap.appendChild(el("div", { style:"height:12px" }));
  contentWrap.appendChild(table);
  
  return el("div", { class:"individual-results-section" }, [
    toggleBtn,
    contentWrap
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

  // Analytics mode state
  let mode = "compare"; // "compare" or "analytics"
  const analyticsRiders = Array(7).fill("");
  let analyticsRiderCount = 3;

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
      // Multi: cards + matrix + individual results
      const cards = el("div", { class:"cardsGrid" });
      for(const n of chosen) cards.appendChild(riderCard(n, meta, metrics, allFiltered, filters));
      resultsWrap.appendChild(cards);
      resultsWrap.appendChild(el("div", { style:"height:12px" }));
      resultsWrap.appendChild(matrixTable(chosen, metrics));
      
      // Add individual results section
      resultsWrap.appendChild(el("div", { style:"height:24px" }));
      resultsWrap.appendChild(el("div", { class:"section-divider" }));
      resultsWrap.appendChild(el("div", { style:"height:16px" }));
      resultsWrap.appendChild(el("h3", { style:"font-size:18px;font-weight:900;color:rgba(82,232,232,1);margin-bottom:16px" }, "📋 Individuele Resultaten"));
      
      // Create results tables for each rider
      chosen.forEach(riderName => {
        const riderResults = allFiltered.filter(r => r.skaterName === riderName);
        resultsWrap.appendChild(createIndividualResultsTable(riderName, riderResults));
        resultsWrap.appendChild(el("div", { style:"height:16px" }));
      });
    }
  }

  // Create filters UI - reusable for both modes
  function createFiltersUI(onUpdate){
    return el("div", { class:"filtersCard", style:"margin-top:12px" }, [
      el("div", { class:"filtersCard__head" }, [
        el("div", {}, el("div", { class:"muted" }, "Filters (selecteer minimaal één)")),
        el("div", { class:"muted" }, meta?.name ? `Dataset: ${meta.name}` : "")
      ]),
      
      // Wedstrijd filter (Tournament)
      el("div", { class:"filterGroup", style:"margin-top:10px" }, [
        el("div", { class:"filterLabel" }, "Toernooi"),
        el("div", { class:"chipRow" }, [
          // "All" toggle
          chip("All", tSet.size === tournaments.length, ()=>{
            if(tSet.size === tournaments.length){
              tSet.clear();
            }else{
              tSet.clear();
              tournaments.forEach(t => tSet.add(t.key));
            }
            onUpdate();
          }),
          ...tournaments.map(t =>
            chip(t.label, tSet.has(t.key), ()=>{
              normalizeSetToggle(tSet, t.key);
              onUpdate();
            })
          )
        ])
      ]),
      
      // Afstand filter (Distance)
      el("div", { class:"filterGroup", style:"margin-top:10px" }, [
        el("div", { class:"filterLabel" }, "Afstand"),
        el("div", { class:"chipRow" }, [
          chip("All", dSet.size === distances.length, ()=>{
            if(dSet.size === distances.length){
              dSet.clear();
            }else{
              dSet.clear();
              distances.forEach(d => dSet.add(d.key));
            }
            onUpdate();
          }),
          ...distances.map(d =>
            chip(d.label, dSet.has(d.key), ()=>{
              normalizeSetToggle(dSet, d.key);
              onUpdate();
            })
          )
        ])
      ]),
      
      // Seizoen filter (Season)
      el("div", { class:"filterGroup", style:"margin-top:10px" }, [
        el("div", { class:"filterLabel" }, "Seizoen"),
        el("div", { class:"chipRow" }, [
          chip("All", ySet.size === seasons.length, ()=>{
            if(ySet.size === seasons.length){
              ySet.clear();
            }else{
              ySet.clear();
              seasons.forEach(y => ySet.add(y));
            }
            onUpdate();
          }),
          ...seasons.slice().sort((a,b)=>b-a).map(y =>
            chip(String(y), ySet.has(y), ()=>{
              normalizeSetToggle(ySet, y);
              onUpdate();
            })
          )
        ])
      ]),
      
      // Run filter
      el("div", { class:"filterGroup", style:"margin-top:10px" }, [
        el("div", { class:"filterLabel" }, "Run"),
        el("div", { class:"chipRow" }, runFilterOptions.map(opt =>
          chip(opt.label, runFilter === opt.key, ()=>{
            runFilter = opt.key;
            onUpdate();
          })
        ))
      ])
    ]);
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

    topControls.appendChild(headerRow);
    topControls.appendChild(riderRow);

    // Create filters using shared function
    const filters = createFiltersUI(() => {
      render();
      renderResults();
    });

    // Mode toggle
    const modeToggle = el("div", { class:"mode-toggle" }, [
      el("button", {
        type:"button",
        class: mode === "compare" ? "mode-toggle-btn mode-toggle-btn--active" : "mode-toggle-btn",
        onclick: () => { mode = "compare"; render(); }
      }, "🔀 Compare Mode"),
      el("button", {
        type:"button",
        class: mode === "analytics" ? "mode-toggle-btn mode-toggle-btn--active" : "mode-toggle-btn",
        onclick: () => { mode = "analytics"; renderAnalyticsMode(); }
      }, "📊 Analytics Mode")
    ]);

    const children = [modeToggle];
    
    if(mode === "compare"){
      children.push(topControls, filters, el("div", { style:"height:14px" }), resultsWrap);
    }

    root.appendChild(sectionCard({
      title: mode === "compare" ? "Head-to-Head" : "Analytics & Rapportage",
      subtitle: mode === "compare" ? "Vergelijk rijders op dezelfde filters (Results-tabblad)." : "Genereer gedetailleerde performance rapporten.",
      children
    }));

    renderResults();
  }

  // ============================================================================
  // ANALYTICS MODE FUNCTIONS
  // ============================================================================

  function calculateRiderStats(riderName, filteredData){
    const riderResults = filteredData.filter(r => r.skaterName === riderName);
    
    const totalRaces = riderResults.length;
    const positions = riderResults.map(r => Number(r.pos)).filter(p => p);
    
    const podiums = positions.filter(p => p >= 1 && p <= 3).length;
    const golds = positions.filter(p => p === 1).length;
    const silvers = positions.filter(p => p === 2).length;
    const bronzes = positions.filter(p => p === 3).length;
    
    const bestPos = positions.length > 0 ? Math.min(...positions) : null;
    const avgPos = positions.length > 0 ? (positions.reduce((a,b) => a+b, 0) / positions.length) : null;
    
    const podiumRate = totalRaces > 0 ? (podiums / totalRaces * 100) : 0;
    
    const consistency = (() => {
      if(positions.length < 3) return null;
      const mean = avgPos;
      const variance = positions.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / positions.length;
      const stdDev = Math.sqrt(variance);
      const score = Math.max(0, 10 - stdDev);
      return score;
    })();

    const recent = riderResults
      .sort((a, b) => {
        const da = a.dateISO ? new Date(a.dateISO).getTime() : 0;
        const db = b.dateISO ? new Date(b.dateISO).getTime() : 0;
        return db - da;
      })
      .slice(0, 5)
      .map(r => {
        const pos = Number(r.pos);
        const remark = r.opmerking && r.opmerking !== "-" ? ` (${r.opmerking})` : "";
        return pos ? `${pos}${remark}` : "—";
      });

    return {
      name: riderName, totalRaces, podiums, golds, silvers, bronzes,
      bestPos, avgPos, podiumRate, consistency, recentForm: recent,
      results: riderResults
    };
  }

  function createAnalyticsResultsTable(results){
    const sorted = results.sort((a, b) => {
      const da = a.dateISO ? new Date(a.dateISO).getTime() : 0;
      const db = b.dateISO ? new Date(b.dateISO).getTime() : 0;
      return db - da;
    });

    const table = el("table", { class:"analytics-table" });
    table.appendChild(el("thead", null, el("tr", null, [
      el("th", null, "Datum"), 
      el("th", null, "Seizoen"),
      el("th", null, "Toernooi"), 
      el("th", null, "Locatie"),
      el("th", null, "Afstand"), 
      el("th", null, "Run"), 
      el("th", null, "Pos."),
      el("th", null, "Opmerking")
    ])));

    const tbody = el("tbody");
    sorted.forEach(r => {
      const pos = Number(r.pos);
      const isPodium = pos >= 1 && pos <= 3;
      const medalIcon = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : "";
      
      // Format date properly
      let dateStr = "—";
      if(r.dateISO){
        try {
          const d = new Date(r.dateISO);
          dateStr = d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
        } catch(e){
          dateStr = r.datum || "—";
        }
      } else if(r.datum && r.datum !== "-"){
        dateStr = r.datum;
      }
      
      tbody.appendChild(el("tr", { class: isPodium ? "podium-row" : "" }, [
        el("td", null, dateStr),
        el("td", null, r.season ? String(r.season) : "—"),
        el("td", null, r.tournamentShort || "—"),
        el("td", null, r.locatie || "—"), 
        el("td", null, r.distance || "—"),
        el("td", null, r.runKey || "—"),
        el("td", { style: isPodium ? "font-weight:900" : "" }, pos ? `${medalIcon} ${pos}` : "—"),
        el("td", { class:"muted" }, r.opmerking && r.opmerking !== "-" ? r.opmerking : "")
      ]));
    });
    table.appendChild(tbody);
    return table;
  }

  // Helper function to filter data for analytics
  function getFilteredData(){
    const filters = { 
      tournaments: tSet, 
      distances: dSet, 
      seasons: ySet, 
      runFilter: runFilter 
    };
    return filterRows(dataset.results, filters);
  }

  // Create comparison matrix for analytics
  function createComparisonMatrix(riders, filteredData){
    if(riders.length < 2) return null;
    
    // Get races where at least 2 of the selected riders competed
    const racesByKey = new Map();
    for(const r of filteredData){
      if(!riders.includes(r.skaterName)) continue;
      const key = buildEventKey(r);
      if(!racesByKey.has(key)) racesByKey.set(key, []);
      racesByKey.get(key).push(r);
    }
    
    // Filter to races with 2+ selected riders
    const sharedRaces = [];
    for(const [key, races] of racesByKey){
      const riderCount = new Set(races.map(r => r.skaterName)).size;
      if(riderCount >= 2){
        sharedRaces.push(...races);
      }
    }
    
    // Compute head-to-head stats
    const h2h = new Map();
    for(let i = 0; i < riders.length; i++){
      for(let j = 0; j < riders.length; j++){
        if(i === j) continue;
        const key = `${riders[i]}|${riders[j]}`;
        h2h.set(key, { wins: 0, total: 0 });
      }
    }
    
    // Count wins in shared races
    const events = new Map();
    for(const r of sharedRaces){
      const key = buildEventKey(r);
      if(!events.has(key)) events.set(key, new Map());
      const mp = events.get(key);
      const p = Number(r.pos) || 999;
      const prev = mp.get(r.skaterName) || 999;
      if(p < prev) mp.set(r.skaterName, p);
    }
    
    for(const [key, positions] of events){
      const participatingRiders = Array.from(positions.keys()).filter(r => riders.includes(r));
      if(participatingRiders.length < 2) continue;
      
      for(let i = 0; i < participatingRiders.length; i++){
        for(let j = 0; j < participatingRiders.length; j++){
          if(i === j) continue;
          const riderA = participatingRiders[i];
          const riderB = participatingRiders[j];
          const posA = positions.get(riderA);
          const posB = positions.get(riderB);
          
          const key = `${riderA}|${riderB}`;
          const stats = h2h.get(key);
          stats.total++;
          if(posA < posB) stats.wins++;
        }
      }
    }
    
    return { h2h, sharedRaces: sharedRaces.length / riders.length };
  }

  // Create comparison table for analytics report
  function createAnalyticsComparisonTable(riders, comparison){
    if(!comparison) return el("div", { class:"notice" }, "Vergelijk functie vereist minimaal 2 rijders.");
    
    const { h2h, sharedRaces } = comparison;
    
    const table = el("table", { class:"analytics-comparison-table" });
    
    // Header row
    const headerRow = el("tr");
    headerRow.appendChild(el("th", { class:"corner-cell" }, "Rijder"));
    riders.forEach(rider => {
      headerRow.appendChild(el("th", { class:"rider-header" }, rider.split(' ').pop())); // Last name
    });
    headerRow.appendChild(el("th", { class:"total-header" }, "Totaal W-L"));
    table.appendChild(el("thead", null, headerRow));
    
    // Data rows
    const tbody = el("tbody");
    riders.forEach(riderA => {
      const row = el("tr");
      row.appendChild(el("td", { class:"rider-name-cell" }, riderA));
      
      let totalWins = 0;
      let totalLosses = 0;
      
      riders.forEach(riderB => {
        if(riderA === riderB){
          row.appendChild(el("td", { class:"diagonal-cell" }, "—"));
        } else {
          const key = `${riderA}|${riderB}`;
          const stats = h2h.get(key) || { wins: 0, total: 0 };
          const losses = stats.total - stats.wins;
          
          totalWins += stats.wins;
          totalLosses += losses;
          
          const winRate = stats.total > 0 ? (stats.wins / stats.total * 100).toFixed(0) : 0;
          const cellClass = stats.wins > losses ? "winning-cell" : stats.wins < losses ? "losing-cell" : "tied-cell";
          
          row.appendChild(el("td", { class: `comparison-cell ${cellClass}` }, [
            el("div", { class:"h2h-score" }, `${stats.wins}-${losses}`),
            el("div", { class:"h2h-percent" }, stats.total > 0 ? `${winRate}%` : "—")
          ]));
        }
      });
      
      row.appendChild(el("td", { class:"total-cell" }, `${totalWins}-${totalLosses}`));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    
    return el("div", null, [
      el("div", { class:"comparison-info", style:"margin-bottom:12px;padding:12px;background:rgba(82,232,232,0.1);border-radius:8px" }, 
        `Gebaseerd op ~${Math.round(sharedRaces)} gedeelde races tussen de geselecteerde rijders.`
      ),
      table
    ]);
  }

  // Create medals summary table
  function createMedalsSummaryTable(stats){
    const table = el("table", { class:"medals-summary-table" });
    
    // Header
    table.appendChild(el("thead", null, el("tr", null, [
      el("th", { class:"rider-col" }, "Rijder"),
      el("th", { class:"medal-col gold-col" }, "🥇 Goud"),
      el("th", { class:"medal-col silver-col" }, "🥈 Zilver"),
      el("th", { class:"medal-col bronze-col" }, "🥉 Brons"),
      el("th", { class:"total-col" }, "Totaal Medailles"),
      el("th", { class:"podium-col" }, "Podium %")
    ])));
    
    // Body
    const tbody = el("tbody");
    let totalGold = 0, totalSilver = 0, totalBronze = 0;
    
    stats.forEach(s => {
      totalGold += s.golds;
      totalSilver += s.silvers;
      totalBronze += s.bronzes;
      
      const totalMedals = s.golds + s.silvers + s.bronzes;
      
      tbody.appendChild(el("tr", null, [
        el("td", { class:"rider-name" }, s.name),
        el("td", { class:"medal-cell gold-cell" }, String(s.golds)),
        el("td", { class:"medal-cell silver-cell" }, String(s.silvers)),
        el("td", { class:"medal-cell bronze-cell" }, String(s.bronzes)),
        el("td", { class:"total-cell" }, String(totalMedals)),
        el("td", { class:"podium-cell" }, `${s.podiumRate.toFixed(1)}%`)
      ]));
    });
    
    // Footer with totals
    const totalMedalsAll = totalGold + totalSilver + totalBronze;
    tbody.appendChild(el("tr", { class:"totals-row" }, [
      el("td", { class:"rider-name" }, el("strong", null, "Totaal")),
      el("td", { class:"medal-cell gold-cell" }, el("strong", null, String(totalGold))),
      el("td", { class:"medal-cell silver-cell" }, el("strong", null, String(totalSilver))),
      el("td", { class:"medal-cell bronze-cell" }, el("strong", null, String(totalBronze))),
      el("td", { class:"total-cell" }, el("strong", null, String(totalMedalsAll))),
      el("td", { class:"podium-cell" }, "—")
    ]));
    
    table.appendChild(tbody);
    return table;
  }

  // Create prediction section
  function createPredictionSection(stats, filteredData){
    if(stats.length === 0) return null;
    
    // Calculate predictions based on historical performance
    const predictions = stats.map(s => {
      const races = s.totalRaces;
      if(races < 3) return null; // Need at least 3 races for meaningful prediction
      
      // Medal chances
      const goldChance = races > 0 ? (s.golds / races * 100) : 0;
      const silverChance = races > 0 ? (s.silvers / races * 100) : 0;
      const bronzeChance = races > 0 ? (s.bronzes / races * 100) : 0;
      const podiumChance = s.podiumRate;
      
      // Top 5 chance
      const top5Count = s.results.filter(r => {
        const pos = Number(r.pos);
        return pos >= 1 && pos <= 5;
      }).length;
      const top5Chance = races > 0 ? (top5Count / races * 100) : 0;
      
      // Top 10 chance
      const top10Count = s.results.filter(r => {
        const pos = Number(r.pos);
        return pos >= 1 && pos <= 10;
      }).length;
      const top10Chance = races > 0 ? (top10Count / races * 100) : 0;
      
      // Recent form trend (last 5 vs overall average)
      const recentPositions = s.results
        .sort((a, b) => {
          const da = a.dateISO ? new Date(a.dateISO).getTime() : 0;
          const db = b.dateISO ? new Date(b.dateISO).getTime() : 0;
          return db - da;
        })
        .slice(0, 5)
        .map(r => Number(r.pos))
        .filter(p => p);
      
      const recentAvg = recentPositions.length > 0 
        ? recentPositions.reduce((a,b) => a+b, 0) / recentPositions.length 
        : s.avgPos;
      
      let trend = "stabiel";
      if(recentAvg && s.avgPos){
        if(recentAvg < s.avgPos - 0.5) trend = "stijgend";
        else if(recentAvg > s.avgPos + 0.5) trend = "dalend";
      }
      
      return {
        name: s.name,
        goldChance,
        silverChance,
        bronzeChance,
        podiumChance,
        top5Chance,
        top10Chance,
        avgPos: s.avgPos,
        consistency: s.consistency,
        trend,
        races
      };
    }).filter(Boolean);
    
    if(predictions.length === 0) return null;
    
    return el("div", { class:"analytics-section prediction-section" }, [
      el("h2", { class:"analytics-section-title" }, `${stats.length + 2}. Voorspelling & Winkansen`),
      
      // Warning box
      el("div", { class:"prediction-warning" }, [
        el("div", { class:"warning-title" }, "⚠️ Belangrijke Kanttekeningen"),
        el("div", { class:"warning-content" }, [
          el("p", null, 
            "Deze voorspellingen zijn gebaseerd op historische prestaties binnen de geselecteerde filters. " +
            "Werkelijke resultaten kunnen sterk afwijken door:"
          ),
          el("ul", { class:"warning-list" }, [
            el("li", null, "🏃 Huidige vorm en conditie van de rijders"),
            el("li", null, "🏥 Blessures of ziekte"),
            el("li", null, "🌍 Specifieke baan eigenschappen en omstandigheden"),
            el("li", null, "👥 Samenstelling van het deelnemersveld"),
            el("li", null, "🎯 Race strategie en tactiek"),
            el("li", null, "🎲 Onvoorziene gebeurtenissen (vallen, diskwalificaties)"),
            el("li", null, "📅 Tijd tussen races en trainingsperiodes"),
            el("li", null, "💪 Mentale gesteldheid en motivatie")
          ]),
          el("p", { style:"margin-top:12px;font-weight:600" }, 
            "Gebruik deze percentages als indicatie, niet als garantie. Schaatsen blijft een dynamische sport!"
          )
        ])
      ]),
      
      el("div", { style:"height:20px" }),
      
      // Explanation
      el("div", { class:"prediction-explanation" }, [
        el("h3", { class:"prediction-subtitle" }, "Hoe Dit Te Interpreteren"),
        el("p", null, 
          `Deze voorspellingen zijn berekend op basis van ${filteredData.length} historische race resultaten ` +
          `die voldoen aan de geselecteerde filters. De percentages geven aan hoe vaak een rijder historisch ` +
          `een bepaald resultaat heeft behaald onder vergelijkbare omstandigheden.`
        ),
        el("div", { class:"prediction-legend" }, [
          el("div", { class:"legend-item" }, [
            el("span", { class:"legend-label" }, "Medaille Kans:"),
            el("span", { class:"legend-value" }, "% van races waarin deze medaille werd gewonnen")
          ]),
          el("div", { class:"legend-item" }, [
            el("span", { class:"legend-label" }, "Podium Kans:"),
            el("span", { class:"legend-value" }, "% van races met top 3 finish")
          ]),
          el("div", { class:"legend-item" }, [
            el("span", { class:"legend-label" }, "Vorm Trend:"),
            el("span", { class:"legend-value" }, "Vergelijking laatste 5 races vs gemiddelde (↗️ stijgend, → stabiel, ↘️ dalend)")
          ])
        ])
      ]),
      
      el("div", { style:"height:20px" }),
      
      // Prediction table
      createPredictionTable(predictions)
    ]);
  }

  // Create prediction table
  function createPredictionTable(predictions){
    const table = el("table", { class:"prediction-table" });
    
    // Header
    table.appendChild(el("thead", null, [
      el("tr", null, [
        el("th", { rowspan: 2, class:"rider-col" }, "Rijder"),
        el("th", { colspan: 3, class:"medals-header" }, "Medaille Kansen"),
        el("th", { colspan: 2, class:"position-header" }, "Positie Kansen"),
        el("th", { rowspan: 2, class:"trend-col" }, "Vorm"),
        el("th", { rowspan: 2, class:"sample-col" }, "Basis")
      ]),
      el("tr", null, [
        el("th", { class:"gold-col" }, "🥇"),
        el("th", { class:"silver-col" }, "🥈"),
        el("th", { class:"bronze-col" }, "🥉"),
        el("th", { class:"podium-col" }, "Podium"),
        el("th", { class:"top5-col" }, "Top 5")
      ])
    ]));
    
    // Body
    const tbody = el("tbody");
    predictions.forEach(p => {
      const trendIcon = p.trend === "stijgend" ? "↗️" : p.trend === "dalend" ? "↘️" : "→";
      const trendClass = p.trend === "stijgend" ? "trending-up" : p.trend === "dalend" ? "trending-down" : "trending-stable";
      
      tbody.appendChild(el("tr", null, [
        el("td", { class:"rider-name" }, p.name),
        el("td", { class:"chance-cell gold-chance" }, `${p.goldChance.toFixed(1)}%`),
        el("td", { class:"chance-cell silver-chance" }, `${p.silverChance.toFixed(1)}%`),
        el("td", { class:"chance-cell bronze-chance" }, `${p.bronzeChance.toFixed(1)}%`),
        el("td", { class:"chance-cell podium-chance" }, `${p.podiumChance.toFixed(1)}%`),
        el("td", { class:"chance-cell top5-chance" }, `${p.top5Chance.toFixed(1)}%`),
        el("td", { class:`trend-cell ${trendClass}` }, `${trendIcon} ${p.trend}`),
        el("td", { class:"sample-cell" }, `${p.races} races`)
      ]));
    });
    
    table.appendChild(tbody);
    
    return el("div", null, [
      table,
      el("div", { class:"prediction-note" }, 
        "💡 Hogere percentages = grotere historische kans op dit resultaat. " +
        "Houd rekening met de kanttekeningen hierboven voor een realistische interpretatie."
      )
    ]);
  }

  // Create executive summary (final page)
  function createExecutiveSummary(stats, comparison, filteredData, chosen){
    return el("div", { class:"executive-summary page-break-before" }, [
      el("div", { class:"summary-header" }, [
        el("h2", { class:"summary-title" }, "📋 Executive Summary"),
        el("div", { class:"summary-subtitle" }, "Overzicht van alle belangrijke informatie in één oogopslag")
      ]),
      
      // Quick Stats Grid
      el("div", { class:"summary-grid" }, [
        // Left column - Key metrics
        el("div", { class:"summary-column" }, [
          el("div", { class:"summary-box" }, [
            el("h3", { class:"summary-box-title" }, "🎯 Kerngegevens"),
            el("div", { class:"summary-items" }, [
              el("div", { class:"summary-item" }, [
                el("span", { class:"summary-label" }, "Aantal Rijders:"),
                el("span", { class:"summary-value" }, String(chosen.length))
              ]),
              el("div", { class:"summary-item" }, [
                el("span", { class:"summary-label" }, "Totaal Races Geanalyseerd:"),
                el("span", { class:"summary-value" }, String(filteredData.length))
              ]),
              el("div", { class:"summary-item" }, [
                el("span", { class:"summary-label" }, "Dataset:"),
                el("span", { class:"summary-value" }, meta?.name || "SILO-6")
              ]),
              el("div", { class:"summary-item" }, [
                el("span", { class:"summary-label" }, "Filters:"),
                el("span", { class:"summary-value small" }, activeFiltersSummary())
              ])
            ])
          ]),
          
          // Medals overview
          el("div", { class:"summary-box" }, [
            el("h3", { class:"summary-box-title" }, "🏆 Medailles Totaal"),
            el("div", { class:"medals-overview" }, [
              el("div", { class:"medal-count gold" }, [
                el("div", { class:"medal-icon" }, "🥇"),
                el("div", { class:"medal-number" }, String(stats.reduce((sum, s) => sum + s.golds, 0))),
                el("div", { class:"medal-label" }, "Goud")
              ]),
              el("div", { class:"medal-count silver" }, [
                el("div", { class:"medal-icon" }, "🥈"),
                el("div", { class:"medal-number" }, String(stats.reduce((sum, s) => sum + s.silvers, 0))),
                el("div", { class:"medal-label" }, "Zilver")
              ]),
              el("div", { class:"medal-count bronze" }, [
                el("div", { class:"medal-icon" }, "🥉"),
                el("div", { class:"medal-number" }, String(stats.reduce((sum, s) => sum + s.bronzes, 0))),
                el("div", { class:"medal-label" }, "Brons")
              ])
            ])
          ])
        ]),
        
        // Right column - Top performers
        el("div", { class:"summary-column" }, [
          el("div", { class:"summary-box" }, [
            el("h3", { class:"summary-box-title" }, "⭐ Top Presteerders"),
            el("div", { class:"summary-items" }, [
              // Most medals
              (() => {
                const topMedals = [...stats].sort((a, b) => 
                  (b.golds + b.silvers + b.bronzes) - (a.golds + a.silvers + a.bronzes)
                )[0];
                return el("div", { class:"summary-item highlight" }, [
                  el("span", { class:"summary-label" }, "Meeste Medailles:"),
                  el("span", { class:"summary-value" }, 
                    `${topMedals.name} (${topMedals.golds + topMedals.silvers + topMedals.bronzes})`
                  )
                ]);
              })(),
              // Most golds
              (() => {
                const topGolds = [...stats].sort((a, b) => b.golds - a.golds)[0];
                return el("div", { class:"summary-item highlight" }, [
                  el("span", { class:"summary-label" }, "Meeste Goud:"),
                  el("span", { class:"summary-value" }, `${topGolds.name} (${topGolds.golds})`)
                ]);
              })(),
              // Best average
              (() => {
                const bestAvg = [...stats].filter(s => s.avgPos).sort((a, b) => a.avgPos - b.avgPos)[0];
                return bestAvg ? el("div", { class:"summary-item highlight" }, [
                  el("span", { class:"summary-label" }, "Beste Gemiddelde:"),
                  el("span", { class:"summary-value" }, `${bestAvg.name} (${bestAvg.avgPos.toFixed(1)})`)
                ]) : null;
              })(),
              // Most consistent
              (() => {
                const mostConsistent = [...stats].filter(s => s.consistency).sort((a, b) => b.consistency - a.consistency)[0];
                return mostConsistent ? el("div", { class:"summary-item highlight" }, [
                  el("span", { class:"summary-label" }, "Meest Consistent:"),
                  el("span", { class:"summary-value" }, `${mostConsistent.name} (${mostConsistent.consistency.toFixed(1)}/10)`)
                ]) : null;
              })(),
              // Highest podium rate
              (() => {
                const topPodium = [...stats].sort((a, b) => b.podiumRate - a.podiumRate)[0];
                return el("div", { class:"summary-item highlight" }, [
                  el("span", { class:"summary-label" }, "Hoogste Podium %:"),
                  el("span", { class:"summary-value" }, `${topPodium.name} (${topPodium.podiumRate.toFixed(1)}%)`)
                ]);
              })()
            ].filter(Boolean))
          ]),
          
          // H2H winner if applicable
          comparison ? el("div", { class:"summary-box" }, [
            el("h3", { class:"summary-box-title" }, "🆚 Head-to-Head Winnaar"),
            (() => {
              const h2hWinner = chosen.reduce((best, rider) => {
                let wins = 0, losses = 0;
                chosen.forEach(opponent => {
                  if(rider === opponent) return;
                  const key = `${rider}|${opponent}`;
                  const stat = comparison.h2h.get(key);
                  if(stat){
                    wins += stat.wins;
                    losses += stat.total - stat.wins;
                  }
                });
                const winRate = wins + losses > 0 ? wins / (wins + losses) * 100 : 0;
                if(!best || winRate > best.winRate){
                  return { name: rider, wins, losses, winRate };
                }
                return best;
              }, null);
              
              return el("div", { class:"h2h-winner" }, [
                el("div", { class:"winner-name" }, h2hWinner.name),
                el("div", { class:"winner-stats" }, `${h2hWinner.wins}-${h2hWinner.losses} (${h2hWinner.winRate.toFixed(1)}%)`),
                el("div", { class:"winner-note" }, "Beste overall W-L record")
              ]);
            })()
          ]) : null
        ])
      ]),
      
      // Compact rider comparison table
      el("div", { class:"summary-box full-width" }, [
        el("h3", { class:"summary-box-title" }, "📊 Snelle Vergelijking"),
        createCompactComparisonTable(stats)
      ]),
      
      // Key insights
      el("div", { class:"summary-box full-width" }, [
        el("h3", { class:"summary-box-title" }, "💡 Belangrijkste Inzichten"),
        el("div", { class:"insights-grid" }, 
          generateKeyInsights(stats, comparison).map(insight => 
            el("div", { class:"insight-item" }, [
              el("span", { class:"insight-icon" }, insight.icon),
              el("span", { class:"insight-text" }, insight.text)
            ])
          )
        )
      ]),
      
      // Footer
      el("div", { class:"summary-footer" }, [
        el("div", { class:"footer-note" }, 
          `Dit rapport werd gegenereerd op ${new Date().toLocaleDateString("nl-NL")} op basis van ${filteredData.length} race resultaten. ` +
          `Voor gedetailleerde analyse en volledige resultaten, zie de voorgaande pagina's.`
        )
      ])
    ]);
  }

  // Create compact comparison table for summary
  function createCompactComparisonTable(stats){
    const table = el("table", { class:"compact-comparison-table" });
    
    table.appendChild(el("thead", null, el("tr", null, [
      el("th", null, "Rijder"),
      el("th", null, "Races"),
      el("th", null, "🥇"),
      el("th", null, "🥈"),
      el("th", null, "🥉"),
      el("th", null, "Podium %"),
      el("th", null, "Ø Positie"),
      el("th", null, "Consistentie")
    ])));
    
    const tbody = el("tbody");
    stats.forEach(s => {
      tbody.appendChild(el("tr", null, [
        el("td", { class:"rider-name" }, s.name),
        el("td", null, String(s.totalRaces)),
        el("td", { class:"gold" }, String(s.golds)),
        el("td", { class:"silver" }, String(s.silvers)),
        el("td", { class:"bronze" }, String(s.bronzes)),
        el("td", null, `${s.podiumRate.toFixed(1)}%`),
        el("td", null, s.avgPos ? s.avgPos.toFixed(1) : "—"),
        el("td", null, s.consistency ? `${s.consistency.toFixed(1)}/10` : "—")
      ]));
    });
    table.appendChild(tbody);
    
    return table;
  }

  // Generate key insights automatically
  function generateKeyInsights(stats, comparison){
    const insights = [];
    
    // Medal leader insight
    const medalLeader = [...stats].sort((a, b) => 
      (b.golds + b.silvers + b.bronzes) - (a.golds + a.silvers + a.bronzes)
    )[0];
    insights.push({
      icon: "🏆",
      text: `${medalLeader.name} leidt met ${medalLeader.golds + medalLeader.silvers + medalLeader.bronzes} medailles totaal`
    });
    
    // Consistency insight
    const consistent = [...stats].filter(s => s.consistency).sort((a, b) => b.consistency - a.consistency)[0];
    if(consistent && consistent.consistency > 7){
      insights.push({
        icon: "📈",
        text: `${consistent.name} toont hoogste consistentie (${consistent.consistency.toFixed(1)}/10)`
      });
    }
    
    // Podium rate insight
    const topPodium = [...stats].sort((a, b) => b.podiumRate - a.podiumRate)[0];
    if(topPodium.podiumRate > 50){
      insights.push({
        icon: "🎯",
        text: `${topPodium.name} bereikt ${topPodium.podiumRate.toFixed(0)}% van de races het podium`
      });
    }
    
    // H2H insight
    if(comparison){
      insights.push({
        icon: "🆚",
        text: `Head-to-head analyse gebaseerd op ~${Math.round(comparison.sharedRaces)} gedeelde races`
      });
    }
    
    // Experience insight
    const mostRaces = [...stats].sort((a, b) => b.totalRaces - a.totalRaces)[0];
    insights.push({
      icon: "📊",
      text: `${mostRaces.name} heeft meeste ervaring met ${mostRaces.totalRaces} races in deze selectie`
    });
    
    // Gold rate insight
    const topGoldRate = [...stats].map(s => ({
      name: s.name,
      rate: s.totalRaces > 0 ? (s.golds / s.totalRaces * 100) : 0
    })).sort((a, b) => b.rate - a.rate)[0];
    if(topGoldRate.rate > 10){
      insights.push({
        icon: "🥇",
        text: `${topGoldRate.name} wint goud in ${topGoldRate.rate.toFixed(1)}% van de races`
      });
    }
    
    return insights;
  }

  function generateAnalyticsReport(reportRoot){
    console.log("=== Analytics Report Generation Started ===");
    clear(reportRoot);
    
    const chosen = analyticsRiders.slice(0, analyticsRiderCount).filter(Boolean);
    console.log("Selected riders:", chosen);
    
    if(chosen.length === 0){
      reportRoot.appendChild(el("div", { class:"notice", style:"padding:20px;background:#fff3cd;border-radius:8px;margin-top:16px" }, "⚠️ Selecteer minimaal 1 rijder."));
      return;
    }
    
    // Check if filters are selected
    const hasFilters = tSet.size > 0 || dSet.size > 0 || ySet.size > 0 || runFilter !== "none";
    console.log("Has filters:", hasFilters, { tournaments: tSet.size, distances: dSet.size, seasons: ySet.size, runFilter });
    
    if(!hasFilters){
      reportRoot.appendChild(el("div", { class:"notice", style:"padding:20px;background:#fff3cd;border-radius:8px;margin-top:16px" }, "⚠️ Selecteer minimaal één filter (Toernooi, Afstand, Seizoen of Run)."));
      return;
    }

    // Filter data using the correct function
    const filteredData = getFilteredData();
    console.log("Filtered data count:", filteredData.length);
    
    if(filteredData.length === 0){
      reportRoot.appendChild(el("div", { class:"notice", style:"padding:20px;background:#fff3cd;border-radius:8px;margin-top:16px" }, "⚠️ Geen resultaten gevonden met de geselecteerde filters."));
      return;
    }
    
    const stats = chosen.map(name => calculateRiderStats(name, filteredData));
    console.log("Stats calculated for riders:", stats.map(s => `${s.name}: ${s.totalRaces} races`));

    // Calculate comparison stats if 2+ riders
    const comparison = chosen.length >= 2 ? createComparisonMatrix(chosen, filteredData) : null;
    console.log("Comparison calculated:", comparison ? `${comparison.sharedRaces} shared races` : "N/A");

    // Create methodology explanation
    const methodologySection = el("div", { class:"analytics-methodology" }, [
      el("h3", { class:"methodology-title" }, "ℹ️ Hoe Dit Rapport Te Lezen"),
      el("div", { class:"methodology-content" }, [
        el("div", { class:"methodology-item" }, [
          el("div", { class:"methodology-label" }, "📊 Gebaseerd Op:"),
          el("div", { class:"methodology-text" }, 
            `Dit rapport analyseert ${filteredData.length} race resultaten op basis van de geselecteerde filters. ` +
            `Alle statistieken zijn berekend over deze gefilterde dataset.`
          )
        ]),
        el("div", { class:"methodology-item" }, [
          el("div", { class:"methodology-label" }, "🏆 Podium & Medailles:"),
          el("div", { class:"methodology-text" }, 
            `Medailles (🥇🥈🥉) worden alleen geteld voor posities 1-3 in 'Final A' of 'Eindklassement' races. ` +
            `Dit zijn de officiële medaille-wedstrijden volgens de schaatsregels.`
          )
        ]),
        el("div", { class:"methodology-item" }, [
          el("div", { class:"methodology-label" }, "📈 Consistentie Score:"),
          el("div", { class:"methodology-text" }, 
            `Een score van 0-10 die meet hoe stabiel een rijder presteert. ` +
            `Score 10 = perfect consistent (altijd dezelfde positie). ` +
            `Score 0 = zeer inconsistent (grote variatie in posities). ` +
            `Berekend via standaarddeviatie van alle posities.`
          )
        ]),
        comparison ? el("div", { class:"methodology-item" }, [
          el("div", { class:"methodology-label" }, "🆚 Head-to-Head Vergelijking:"),
          el("div", { class:"methodology-text" }, 
            `Deze matrix toont directe vergelijkingen in races waar beide rijders deelnamen. ` +
            `Een "win" betekent dat de rijder hoger eindigde (lagere positie) dan de tegenstander in dezelfde race. ` +
            `Bijvoorbeeld: Als Rijder A 2e wordt en Rijder B 4e in dezelfde race, krijgt Rijder A een win. ` +
            `Het winstpercentage geeft aan hoe vaak een rijder hoger eindigde dan een specifieke tegenstander. ` +
            `Gebaseerd op ~${Math.round(comparison.sharedRaces)} gedeelde races.`
          )
        ]) : null,
        el("div", { class:"methodology-item" }, [
          el("div", { class:"methodology-label" }, "📅 Recente Vorm:"),
          el("div", { class:"methodology-text" }, 
            `Toont de posities van de laatste 5 races (nieuwste eerst). ` +
            `Opmerkingen zoals DNS (Did Not Start), DNF (Did Not Finish), of DQ (Disqualified) worden tussen haakjes weergegeven.`
          )
        ]),
        el("div", { class:"methodology-item" }, [
          el("div", { class:"methodology-label" }, "📋 Gedetailleerde Resultaten:"),
          el("div", { class:"methodology-text" }, 
            `Volledige race-per-race tabel gesorteerd van nieuwste naar oudste. ` +
            `Podium posities (1e, 2e, 3e plaats) zijn gemarkeerd met een lichtblauwe achtergrond voor snelle herkenning.`
          )
        ])
      ])
    ]);

    const sections = [
      el("div", { class:"analytics-report-header" }, [
        el("h1", { class:"analytics-report-title" }, "📊 Rijder Performance Analyse"),
        el("div", { class:"analytics-report-meta" }, [
          el("div", {}, `Gegenereerd: ${new Date().toLocaleDateString("nl-NL")}`),
          el("div", {}, `Dataset: ${meta?.name || "SILO-6"}`),
          el("div", {}, activeFiltersSummary())
        ])
      ]),
      el("div", { class:"analytics-divider" }),
      
      // Methodology section
      methodologySection,
      el("div", { class:"analytics-divider" }),
      
      // Summary Section with Medals Table
      el("div", { class:"analytics-section" }, [
        el("h2", { class:"analytics-section-title" }, "1. Samenvatting & Medaille Overzicht"),
        el("div", { class:"analytics-riders-list" }, 
          chosen.map((name, i) => el("div", {}, `• ${name} (${stats[i].totalRaces} races)`))
        ),
        el("div", { style:"height:20px" }),
        el("h3", { class:"analytics-subsection-title" }, "Medaille Telling"),
        el("div", { style:"color:#666;font-size:13px;margin-bottom:12px" }, 
          "Medailles in Final A en Eindklassement races binnen de geselecteerde filters."
        ),
        createMedalsSummaryTable(stats)
      ]),
      el("div", { class:"analytics-divider" })
    ];

    let sectionNumber = 2;

    // Comparison Section (if 2+ riders)
    if(comparison){
      sections.push(
        el("div", { class:"analytics-section" }, [
          el("h2", { class:"analytics-section-title" }, `${sectionNumber}. Head-to-Head Vergelijking`),
          el("div", { class:"comparison-explanation" }, [
            el("p", { style:"color:#666;margin-bottom:12px;line-height:1.6" }, 
              `Deze matrix toont de directe onderlinge prestaties van rijders in dezelfde races. ` +
              `Een hogere eindpositie (lager nummer) telt als een 'win' over de tegenstander in die specifieke race.`
            ),
            el("div", { class:"comparison-legend" }, [
              el("div", { class:"legend-title" }, "Hoe te lezen:"),
              el("div", { class:"legend-items" }, [
                el("div", { class:"legend-item" }, [
                  el("span", { class:"legend-label" }, "Getal (bv. 15-8):"),
                  el("span", { class:"legend-value" }, "15 wins, 8 nederlagen tegen deze tegenstander")
                ]),
                el("div", { class:"legend-item" }, [
                  el("span", { class:"legend-label" }, "Percentage (bv. 65%):"),
                  el("span", { class:"legend-value" }, "Winstpercentage in directe duels")
                ]),
                el("div", { class:"legend-item" }, [
                  el("span", { class:"legend-label" }, "🟢 Groene cel:"),
                  el("span", { class:"legend-value" }, "Meer wins dan nederlagen (positieve balans)")
                ]),
                el("div", { class:"legend-item" }, [
                  el("span", { class:"legend-label" }, "🔴 Rode cel:"),
                  el("span", { class:"legend-value" }, "Meer nederlagen dan wins (negatieve balans)")
                ]),
                el("div", { class:"legend-item" }, [
                  el("span", { class:"legend-label" }, "Totaal Kolom:"),
                  el("span", { class:"legend-value" }, "Gecombineerde W-L tegen alle tegenstanders")
                ])
              ])
            ]),
            el("div", { style:"margin-top:12px;padding:12px;background:rgba(82,232,232,0.1);border-radius:8px;font-size:13px" }, 
              `📍 Gebaseerd op ~${Math.round(comparison.sharedRaces)} gedeelde races tussen de geselecteerde rijders waarin minstens 2 van hen deelnamen.`
            )
          ]),
          createAnalyticsComparisonTable(chosen, comparison)
        ]),
        el("div", { class:"analytics-divider" })
      );
      sectionNumber++;
    }

    // Prediction Section
    const predictionSection = createPredictionSection(stats, filteredData);
    if(predictionSection){
      sections.push(predictionSection, el("div", { class:"analytics-divider" }));
      sectionNumber++;
    }

    // Individual Rider Sections
    stats.forEach((s, idx) => {
      sections.push(
        el("div", { class: idx > 0 ? "analytics-section page-break-before" : "analytics-section" }, [
          el("h2", { class:"analytics-section-title" }, `${sectionNumber + idx}. ${s.name} - Individuele Statistieken`),
          el("div", { class:"stats-explanation" }, [
            el("p", { style:"color:#666;margin-bottom:16px;font-size:14px;line-height:1.6" }, 
              `Onderstaande statistieken zijn gebaseerd op ${s.totalRaces} races die voldoen aan de geselecteerde filters. ` +
              `Medailles worden alleen geteld voor podium finishes (top 3) in Final A of Eindklassement races.`
            )
          ]),
          el("div", { class:"analytics-stats-grid" }, [
            el("div", { class:"analytics-stat-card" }, [
              el("div", { class:"analytics-stat-label" }, "Totaal Races"),
              el("div", { class:"analytics-stat-value" }, String(s.totalRaces)),
              el("div", { class:"analytics-stat-help" }, "Alle races binnen filters")
            ]),
            el("div", { class:"analytics-stat-card" }, [
              el("div", { class:"analytics-stat-label" }, "Podium Finishes"),
              el("div", { class:"analytics-stat-value" }, `${s.podiums} (${s.podiumRate.toFixed(1)}%)`),
              el("div", { class:"analytics-stat-help" }, "Top 3 posities")
            ]),
            el("div", { class:"analytics-stat-card" }, [
              el("div", { class:"analytics-stat-label" }, "🥇 Goud"),
              el("div", { class:"analytics-stat-value" }, String(s.golds)),
              el("div", { class:"analytics-stat-help" }, "1e plaats in Final A")
            ]),
            el("div", { class:"analytics-stat-card" }, [
              el("div", { class:"analytics-stat-label" }, "🥈 Zilver"),
              el("div", { class:"analytics-stat-value" }, String(s.silvers)),
              el("div", { class:"analytics-stat-help" }, "2e plaats in Final A")
            ]),
            el("div", { class:"analytics-stat-card" }, [
              el("div", { class:"analytics-stat-label" }, "🥉 Brons"),
              el("div", { class:"analytics-stat-value" }, String(s.bronzes)),
              el("div", { class:"analytics-stat-help" }, "3e plaats in Final A")
            ]),
            el("div", { class:"analytics-stat-card" }, [
              el("div", { class:"analytics-stat-label" }, "Beste Positie"),
              el("div", { class:"analytics-stat-value" }, s.bestPos ? String(s.bestPos) : "—"),
              el("div", { class:"analytics-stat-help" }, "Hoogste ranking behaald")
            ]),
            el("div", { class:"analytics-stat-card" }, [
              el("div", { class:"analytics-stat-label" }, "Gemiddelde"),
              el("div", { class:"analytics-stat-value" }, s.avgPos ? s.avgPos.toFixed(1) : "—"),
              el("div", { class:"analytics-stat-help" }, "Gemiddelde eindpositie")
            ]),
            el("div", { class:"analytics-stat-card" }, [
              el("div", { class:"analytics-stat-label" }, "Consistentie"),
              el("div", { class:"analytics-stat-value" }, s.consistency ? `${s.consistency.toFixed(1)}/10` : "—"),
              el("div", { class:"analytics-stat-help" }, "10 = zeer stabiel, 0 = variabel")
            ])
          ]),
          el("div", { class:"analytics-subsection" }, [
            el("h3", { class:"analytics-subsection-title" }, "Recente Vorm (laatste 5 races)"),
            el("div", { style:"color:#666;font-size:13px;margin-bottom:8px" }, 
              "Nieuwste resultaten eerst. Opmerkingen zoals DNS (Did Not Start) of DNF (Did Not Finish) tussen haakjes."
            ),
            el("div", { class:"analytics-recent-form" }, s.recentForm.join(" — "))
          ]),
          el("div", { class:"analytics-subsection" }, [
            el("h3", { class:"analytics-subsection-title" }, "Gedetailleerde Resultaten"),
            el("div", { style:"color:#666;font-size:13px;margin-bottom:8px" }, 
              "Alle races binnen de geselecteerde filters, gesorteerd van nieuwste naar oudste. Podium posities (1-3) zijn gemarkeerd met een lichtblauwe achtergrond."
            ),
            createAnalyticsResultsTable(s.results)
          ])
        ]),
        el("div", { class:"analytics-divider" })
      );
    });

    // Add Executive Summary as final page
    sections.push(createExecutiveSummary(stats, comparison, filteredData, chosen));

    const reportContent = el("div", { class:"analytics-report-content", id:"analytics-report-content" }, sections);

    const actions = el("div", { class:"analytics-report-actions" }, [
      el("button", { class:"btn btn--primary", type:"button", onclick: () => downloadAnalyticsPDF() }, "📥 Download PDF"),
      el("button", { class:"btn", type:"button", onclick: () => printAnalyticsReport() }, "🖨️ Print")
    ]);

    reportRoot.appendChild(actions);
    reportRoot.appendChild(el("div", { style:"height:16px" }));
    reportRoot.appendChild(reportContent);
    
    console.log("=== Report Generated Successfully ===");
    
    // Scroll to report
    setTimeout(() => {
      reportContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function downloadAnalyticsPDF(){
    const content = document.getElementById("analytics-report-content");
    if(!content){ 
      alert("Genereer eerst een rapport."); 
      return; 
    }
    
    // Check if libraries are loaded
    if(typeof window.jspdf === "undefined" || typeof window.html2canvas === "undefined"){
      alert("PDF bibliotheek laadt... Probeer over 2 seconden opnieuw.");
      return;
    }
    
    const { jsPDF } = window.jspdf;
    const html2canvas = window.html2canvas;
    
    // Show loading message
    const loadingMsg = el("div", {
      style: "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:30px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:10000;text-align:center"
    }, [
      el("div", { style:"font-size:48px;margin-bottom:16px" }, "📄"),
      el("div", { style:"font-size:18px;font-weight:700;margin-bottom:8px" }, "PDF wordt gegenereerd..."),
      el("div", { style:"font-size:14px;color:#666" }, "Dit kan enkele seconden duren")
    ]);
    document.body.appendChild(loadingMsg);
    
    // Wait a moment for UI to update
    setTimeout(() => {
      html2canvas(content, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;
        
        // Add first page
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        
        // Add additional pages if needed
        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
        
        pdf.save(`SILO6-Analytics-${new Date().toISOString().split('T')[0]}.pdf`);
        document.body.removeChild(loadingMsg);
      }).catch(err => {
        console.error("PDF generation error:", err);
        document.body.removeChild(loadingMsg);
        alert("Fout bij PDF genereren. Probeer de print functie.");
      });
    }, 100);
  }
  
  function printAnalyticsReport(){
    const content = document.getElementById("analytics-report-content");
    if(!content){ 
      alert("Genereer eerst een rapport."); 
      return; 
    }
    
    // Create a print window with the report content
    const printWindow = window.open('', '_blank');
    if(!printWindow){
      alert("Pop-up geblokkeerd. Sta pop-ups toe en probeer opnieuw.");
      return;
    }
    
    // Get the CSS styles
    const styles = Array.from(document.styleSheets)
      .map(sheet => {
        try {
          return Array.from(sheet.cssRules)
            .map(rule => rule.cssText)
            .join('\n');
        } catch(e) {
          return '';
        }
      })
      .join('\n');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>SILO-6 Analytics Report</title>
        <style>
          ${styles}
          
          /* Additional print styles */
          body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          
          .analytics-report-content {
            max-width: 100%;
            background: white;
          }
          
          .page-break-before {
            page-break-before: always;
            break-before: page;
          }
          
          .analytics-table {
            page-break-inside: avoid;
            width: 100%;
            font-size: 10px;
          }
          
          .analytics-section {
            page-break-inside: avoid;
          }
          
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        ${content.outerHTML}
      </body>
      </html>
    `);
    
    printWindow.document.close();
    
    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }

  function renderAnalyticsMode(){
    // cleanup prior dropdown doc listeners
    for(const fn of cleanupFns.splice(0)) try{ fn(); }catch(_){}
    
    clear(root);
    
    // Rider count selector
    const countSel = el("select", { class:"input input--sm" });
    [1,2,3,4,5,6,7].forEach(n => countSel.appendChild(el("option", { value:String(n) }, String(n))));
    countSel.value = String(analyticsRiderCount);
    countSel.addEventListener("change", ()=>{ 
      analyticsRiderCount = Number(countSel.value) || 3; 
      renderAnalyticsMode();
    });
    
    const riderCountRow = el("div", { style:"display:flex;align-items:center;gap:12px;margin-bottom:12px" }, [
      el("div", { class:"filter-label" }, "Aantal Rijders"),
      countSel
    ]);
    
    // Rider dropdowns
    const riderRow = el("div", { class:"h2hRiders" });
    for(let i = 0; i < analyticsRiderCount; i++){
      const dd = typeableDropdown({
        placeholder: `Rijder ${i+1}...`,
        value: analyticsRiders[i] || "",
        options: ["", ...allRiders],
        onChange: (v)=>{ analyticsRiders[i] = v === "" ? "" : v; }
      });
      cleanupFns.push(dd.cleanup);
      riderRow.appendChild(dd.wrap);
    }
    
    // Create filters using shared function
    const filters = createFiltersUI(() => {
      renderAnalyticsMode(); // Re-render to update filter chips
    });
    
    // Generate button with better feedback
    const generateBtn = el("button", {
      class:"btn btn--primary",
      style:"width:100%;margin-top:16px;padding:12px;font-size:16px;font-weight:600;cursor:pointer",
      type:"button",
      onclick: (e) => {
        console.log("Generate button clicked!");
        e.target.textContent = "⏳ Genereren...";
        e.target.disabled = true;
        
        try {
          generateAnalyticsReport(reportWrap);
        } catch(err) {
          console.error("Error generating report:", err);
          reportWrap.innerHTML = `<div style="padding:20px;background:#ffebee;border-radius:8px;margin-top:16px;color:#c62828">
            <strong>❌ Fout bij genereren rapport:</strong><br>
            ${err.message}<br><br>
            Open de console (F12) voor meer details.
          </div>`;
        } finally {
          setTimeout(() => {
            e.target.textContent = "🔍 Genereer Rapport";
            e.target.disabled = false;
          }, 500);
        }
      }
    }, "🔍 Genereer Rapport");
    
    const reportWrap = el("div", { class:"analytics-report-wrap" });
    
    // Add initial helpful message
    reportWrap.appendChild(el("div", { 
      class:"analytics-info-message",
      style:"padding:24px;background:#e3f2fd;border-radius:8px;margin-top:24px;text-align:center;color:#1565c0"
    }, [
      el("div", { style:"font-size:48px;margin-bottom:12px" }, "📊"),
      el("div", { style:"font-weight:600;font-size:18px;margin-bottom:8px" }, "Klaar om te analyseren"),
      el("div", { style:"font-size:14px" }, "Selecteer rijders en filters hierboven, klik dan op 'Genereer Rapport'")
    ]));
    
    // Mode toggle
    const modeToggle = el("div", { class:"mode-toggle" }, [
      el("button", {
        type:"button",
        class: "mode-toggle-btn",
        onclick: () => { mode = "compare"; render(); }
      }, "🔀 Compare Mode"),
      el("button", {
        type:"button",
        class: "mode-toggle-btn mode-toggle-btn--active",
        onclick: () => { mode = "analytics"; renderAnalyticsMode(); }
      }, "📊 Analytics Mode")
    ]);
    
    root.appendChild(sectionCard({
      title:"Analytics & Rapportage",
      subtitle:"Genereer gedetailleerde performance rapporten voor 1-7 rijders.",
      children:[
        modeToggle,
        el("div", { style:"height:16px" }),
        riderCountRow,
        riderRow,
        el("div", { style:"height:16px" }),
        filters,
        generateBtn,
        el("div", { style:"height:24px" }),
        reportWrap
      ]
    }));
  }

  render();

  // Load jsPDF and html2canvas for PDF export
  if(typeof window.jspdf === "undefined"){
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    document.head.appendChild(script);
  }
  
  if(typeof window.html2canvas === "undefined"){
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    document.head.appendChild(script);
  }
}