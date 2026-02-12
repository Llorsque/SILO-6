import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { getDataset } from "../../core/dataset.js";

function chip(label, active, onClick){
  const b = el("button", { type:"button", class: active ? "chip chip--on" : "chip" }, label);
  b.addEventListener("click", onClick);
  return b;
}

export function mountFilters(root){
  clear(root);
  
  const dataset = getDataset();
  if(!dataset || !dataset.results){
    root.appendChild(sectionCard({
      title:"World Tour Klassementen",
      subtitle:"Geen data beschikbaar.",
      children:[
        el("div", { class:"notice" }, "Upload eerst Excel data via Settings."),
        el("button", { class:"btn", type:"button", onclick:()=>router.go("home") }, "Terug naar menu")
      ]
    }));
    return;
  }
  
  // Filter World Cup / World Tour races
  const allWTRaces = dataset.results.filter(r => 
    r.tournamentShort === "WC" && 
    r.runKey && 
    String(r.runKey).toLowerCase() === "eindklassement"
  );
  
  // Get unique distances and seasons
  const distances = ["500m", "1000m", "1500m"];
  const seasons = Array.from(new Set(allWTRaces.map(r => r.season).filter(Boolean))).sort((a,b) => b-a);
  
  // State
  let selectedDistance = null;
  let selectedSeason = null;
  let showMedallistsOnly = false;
  
  const resultsContainer = el("div", { class:"wt-results" });
  
  function render(){
    clear(resultsContainer);
    
    // Filter data
    let filtered = allWTRaces;
    
    if(selectedDistance){
      filtered = filtered.filter(r => r.distance === selectedDistance);
    }
    
    if(selectedSeason){
      filtered = filtered.filter(r => r.season === selectedSeason);
    }
    
    if(showMedallistsOnly){
      filtered = filtered.filter(r => {
        const pos = Number(r.pos);
        return pos >= 1 && pos <= 3;
      });
    }
    
    // Group by race (Wedstrijd + Locatie + Datum)
    const races = new Map(); // key -> {info, results[]}
    
    filtered.forEach(r => {
      const key = `${r.wedstrijdRaw}|${r.locatie}|${r.datum}|${r.afstandRaw}`;
      if(!races.has(key)){
        races.set(key, {
          tournament: r.wedstrijdRaw || r.tournament,
          location: r.locatie,
          date: r.datum,
          distance: r.afstandRaw || r.distance,
          season: r.season,
          results: []
        });
      }
      races.get(key).results.push({
        name: r.skaterName,
        pos: Number(r.pos) || null,
        opmerking: r.opmerking
      });
    });
    
    // Sort races by date (newest first)
    const sortedRaces = Array.from(races.values()).sort((a, b) => {
      if(!a.date || !b.date) return 0;
      return new Date(b.date) - new Date(a.date);
    });
    
    if(sortedRaces.length === 0){
      resultsContainer.appendChild(el("div", { class:"notice" }, "Geen resultaten gevonden met de geselecteerde filters."));
      return;
    }
    
    // Summary
    const summary = el("div", { class:"wt-summary" }, [
      el("span", { class:"wt-summary-label" }, "Gevonden:"),
      el("span", { class:"wt-summary-value" }, `${sortedRaces.length} race${sortedRaces.length !== 1 ? 's' : ''}`)
    ]);
    resultsContainer.appendChild(summary);
    resultsContainer.appendChild(el("div", { style:"height:12px" }));
    
    // Display races
    sortedRaces.forEach(race => {
      // Sort results by position
      const sortedResults = race.results
        .filter(r => r.pos)
        .sort((a, b) => a.pos - b.pos);
      
      const raceCard = el("div", { class:"wt-race-card" }, [
        el("div", { class:"wt-race-header" }, [
          el("div", { class:"wt-race-title" }, `${race.tournament} - ${race.location}`),
          el("div", { class:"wt-race-meta" }, `${race.distance} | ${race.date} | ${race.season}`)
        ]),
        el("div", { class:"wt-race-results" }, 
          sortedResults.slice(0, showMedallistsOnly ? 3 : 10).map(r => {
            const isMedallist = r.pos <= 3;
            const medalIcon = r.pos === 1 ? "🥇" : r.pos === 2 ? "🥈" : r.pos === 3 ? "🥉" : "";
            
            return el("div", { 
              class: isMedallist ? "wt-result-row wt-result-row--medal" : "wt-result-row" 
            }, [
              el("div", { class:"wt-result-pos" }, `${medalIcon} ${r.pos}`),
              el("div", { class:"wt-result-name" }, r.name),
              r.opmerking && r.opmerking !== "-" 
                ? el("div", { class:"wt-result-note" }, `(${r.opmerking})`)
                : null
            ].filter(Boolean));
          })
        )
      ]);
      
      resultsContainer.appendChild(raceCard);
    });
  }
  
  // Build UI
  const controls = el("div", { class:"wt-controls" }, [
    // Distance filter
    el("div", { class:"filter-group" }, [
      el("div", { class:"filter-label" }, "Afstand"),
      el("div", { class:"chip-row" }, [
        chip("Alle", !selectedDistance, () => {
          selectedDistance = null;
          render();
          controls.replaceWith(buildControls());
        }),
        ...distances.map(d => 
          chip(d, selectedDistance === d, () => {
            selectedDistance = d;
            render();
            controls.replaceWith(buildControls());
          })
        )
      ])
    ]),
    
    // Season filter
    el("div", { class:"filter-group", style:"margin-top:12px" }, [
      el("div", { class:"filter-label" }, "Seizoen"),
      el("div", { class:"chip-row" }, [
        chip("Alle", !selectedSeason, () => {
          selectedSeason = null;
          render();
          controls.replaceWith(buildControls());
        }),
        ...seasons.map(s => 
          chip(String(s), selectedSeason === s, () => {
            selectedSeason = s;
            render();
            controls.replaceWith(buildControls());
          })
        )
      ])
    ]),
    
    // Medallists toggle
    el("div", { class:"filter-group", style:"margin-top:12px" }, [
      el("div", { class:"filter-label" }, "Resultaten"),
      el("div", { class:"chip-row" }, [
        chip("Alle posities", !showMedallistsOnly, () => {
          showMedallistsOnly = false;
          render();
          controls.replaceWith(buildControls());
        }),
        chip("🏅 Alleen medaillisten (1-2-3)", showMedallistsOnly, () => {
          showMedallistsOnly = true;
          render();
          controls.replaceWith(buildControls());
        })
      ])
    ])
  ]);
  
  function buildControls(){
    const newControls = el("div", { class:"wt-controls" }, [
      // Distance filter
      el("div", { class:"filter-group" }, [
        el("div", { class:"filter-label" }, "Afstand"),
        el("div", { class:"chip-row" }, [
          chip("Alle", !selectedDistance, () => {
            selectedDistance = null;
            render();
            newControls.replaceWith(buildControls());
          }),
          ...distances.map(d => 
            chip(d, selectedDistance === d, () => {
              selectedDistance = d;
              render();
              newControls.replaceWith(buildControls());
            })
          )
        ])
      ]),
      
      // Season filter
      el("div", { class:"filter-group", style:"margin-top:12px" }, [
        el("div", { class:"filter-label" }, "Seizoen"),
        el("div", { class:"chip-row" }, [
          chip("Alle", !selectedSeason, () => {
            selectedSeason = null;
            render();
            newControls.replaceWith(buildControls());
          }),
          ...seasons.map(s => 
            chip(String(s), selectedSeason === s, () => {
              selectedSeason = s;
              render();
              newControls.replaceWith(buildControls());
            })
          )
        ])
      ]),
      
      // Medallists toggle
      el("div", { class:"filter-group", style:"margin-top:12px" }, [
        el("div", { class:"filter-label" }, "Resultaten"),
        el("div", { class:"chip-row" }, [
          chip("Alle posities", !showMedallistsOnly, () => {
            showMedallistsOnly = false;
            render();
            newControls.replaceWith(buildControls());
          }),
          chip("🏅 Alleen medaillisten (1-2-3)", showMedallistsOnly, () => {
            showMedallistsOnly = true;
            render();
            newControls.replaceWith(buildControls());
          })
        ])
      ])
    ]);
    return newControls;
  }
  
  root.appendChild(sectionCard({
    title:"World Tour Klassementen",
    subtitle:"Bekijk World Cup / World Tour eindklassementen en medaillisten.",
    children:[
      controls,
      el("div", { style:"height:16px" }),
      resultsContainer
    ]
  }));
  
  // Initial render
  render();
}
