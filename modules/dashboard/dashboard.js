import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { loadDataset } from "../../core/storage.js";

function normalizeSpaces(s){
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function normalizeForComparison(s){
  // Normalize for case-insensitive comparison
  return normalizeSpaces(s).toLowerCase();
}

function createSearchableFilter(label, options, stateSet, onChange){
  const searchInput = el("input", { 
    type:"text", 
    class:"filterSearchInput", 
    placeholder:`Zoek ${label.toLowerCase()}...`
  });
  
  const resultsWrap = el("div", { class:"searchResults" });
  
  function renderResults(query = ""){
    clear(resultsWrap);
    
    const q = query.toLowerCase().trim();
    const filtered = q 
      ? options.filter(opt => opt.toLowerCase().includes(q))
      : options;
    
    if(filtered.length === 0){
      resultsWrap.appendChild(
        el("div", { class:"searchNoResults" }, "Geen resultaten")
      );
      return;
    }
    
    // Limit display to first 50 results for performance
    const display = filtered.slice(0, 50);
    
    for(const opt of display){
      const isActive = stateSet.has(normalizeForComparison(opt));
      const btn = el("button", { 
        type:"button", 
        class: isActive ? "searchResult searchResult--active" : "searchResult"
      }, opt);
      btn.addEventListener("click", ()=>{
        const normalized = normalizeForComparison(opt);
        if(stateSet.has(normalized)){
          stateSet.delete(normalized);
        }else{
          stateSet.add(normalized);
        }
        onChange();
      });
      resultsWrap.appendChild(btn);
    }
    
    if(filtered.length > 50){
      resultsWrap.appendChild(
        el("div", { class:"searchNoResults" }, `... en ${filtered.length - 50} meer`)
      );
    }
  }
  
  searchInput.addEventListener("input", ()=>{
    renderResults(searchInput.value);
  });
  
  // Initial render
  renderResults();
  
  return el("div", { class:"filterSection" }, [
    el("div", { class:"filterSection__label" }, label),
    el("div", { class:"filterSection__search" }, searchInput),
    resultsWrap
  ]);
}

function safeSeason(r){
  const n = Number(r?.season);
  return Number.isFinite(n) ? n : -1;
}

function safeDateMs(r){
  const d = r?.dateISO ? new Date(r.dateISO).getTime() : 0;
  return Number.isFinite(d) ? d : 0;
}

function sortNewestFirst(rows){
  // HARD REQUIREMENT: always newest season first (descending). Never change.
  return [...rows].sort((a,b)=>{
    const ya = safeSeason(a);
    const yb = safeSeason(b);
    if(ya !== yb) return yb - ya;
    const da = safeDateMs(a);
    const db = safeDateMs(b);
    if(da !== db) return db - da;
    return (a._idx||0) - (b._idx||0);
  });
}

function fmtDate(iso){
  if(!iso) return "";
  const d = new Date(iso);
  if(isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yy = d.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

function getOptions(results, keyFn){
  const set = new Set();
  for(const r of results){
    const v = keyFn(r);
    const s = normalizeSpaces(v);
    if(!s) continue;
    set.add(s);
  }
  return Array.from(set).sort((a,b)=> a.localeCompare(b, "nl"));
}

function getSeasonOptions(results){
  const set = new Set();
  for(const r of results){
    if(r?.season != null && r.season !== "") set.add(Number(r.season));
  }
  return Array.from(set).filter(n=>Number.isFinite(n)).sort((a,b)=>b-a); // newest first
}

export async function mountDashboard(root){
  clear(root);

  const dataset = await loadDataset();
  const resultsAll = dataset?.results || [];

  if(!resultsAll.length){
    root.appendChild(sectionCard({
      title:"Sebastiaans Draaitabel",
      subtitle:"Upload eerst een Excel met tabblad 'Results'.",
      children:[
        el("div", { class:"notice" }, "Geen dataset gekoppeld (of leeg). Ga terug naar Menu en upload je Excel."),
        el("div", { style:"height:10px" }),
        el("button", { class:"btn", type:"button", onclick:()=>router.go("home") }, "Terug naar menu")
      ]
    }));
    return;
  }

  // View mode: "rijder" or "toernooi"
  let viewMode = "rijder";

  // State: Sets with normalized (lowercase) values for case-insensitive matching
  const stateRijder = {
    sex: new Set(),
    tournament: new Set(),
    season: new Set(),
    distance: new Set(),
    locatie: new Set(),
    nat: new Set(),
    name: new Set()
  };

  const stateToernooi = {
    pos: new Set(),
    nat: new Set(),
    tournament: new Set(),
    sex: new Set(),
    distance: new Set(),
    season: new Set()
  };

  function getCurrentState(){
    return viewMode === "rijder" ? stateRijder : stateToernooi;
  }

  // Get unique options with case-insensitive deduplication
  function getUniqueOptions(results, keyFn){
    const map = new Map(); // normalized -> display value
    for(const r of results){
      const v = keyFn(r);
      const s = normalizeSpaces(v);
      if(!s) continue;
      const key = normalizeForComparison(s);
      if(!map.has(key)) map.set(key, s);
    }
    return Array.from(map.values()).sort((a,b)=> a.localeCompare(b, "nl"));
  }

  const optionsRijder = {
    sex: getUniqueOptions(resultsAll, r=>r.sekseRaw || r.sex),
    tournament: getUniqueOptions(resultsAll, r=>r.wedstrijdRaw || r.tournament),
    season: getSeasonOptions(resultsAll),
    distance: getUniqueOptions(resultsAll, r=>r.afstandRaw || r.distance),
    locatie: getUniqueOptions(resultsAll, r=>r.locatie),
    nat: getUniqueOptions(resultsAll, r=>r.nat),
    name: getUniqueOptions(resultsAll, r=>r.skaterName || r.nameRaw)
  };

  // Get unique positions for Toernooi filter
  function getPositionOptions(results){
    const set = new Set();
    for(const r of results){
      const pos = Number(r.pos);
      if(Number.isFinite(pos) && pos > 0) set.add(pos);
    }
    return Array.from(set).sort((a,b)=>a-b); // ascending order
  }

  const optionsToernooi = {
    pos: getPositionOptions(resultsAll),
    nat: getUniqueOptions(resultsAll, r=>r.nat),
    tournament: getUniqueOptions(resultsAll, r=>r.wedstrijdRaw || r.tournament),
    sex: getUniqueOptions(resultsAll, r=>r.sekseRaw || r.sex),
    distance: getUniqueOptions(resultsAll, r=>r.afstandRaw || r.distance),
    season: getSeasonOptions(resultsAll)
  };

  function getCurrentOptions(){
    return viewMode === "rijder" ? optionsRijder : optionsToernooi;
  }

  function pass(r){
    const state = getCurrentState();
    
    if(viewMode === "rijder"){
      // Case-insensitive matching for all filters
      if(state.sex && state.sex.size > 0){
        const v = normalizeForComparison(r.sekseRaw || r.sex);
        if(!state.sex.has(v)) return false;
      }
      if(state.tournament && state.tournament.size > 0){
        const v = normalizeForComparison(r.wedstrijdRaw || r.tournament);
        if(!state.tournament.has(v)) return false;
      }
      if(state.season && state.season.size > 0){
        const y = Number(r.season);
        if(!Number.isFinite(y) || !state.season.has(y)) return false;
      }
      if(state.distance && state.distance.size > 0){
        const v = normalizeForComparison(r.afstandRaw || r.distance);
        if(!state.distance.has(v)) return false;
      }
      if(state.locatie && state.locatie.size > 0){
        const v = normalizeForComparison(r.locatie);
        if(!state.locatie.has(v)) return false;
      }
      if(state.nat && state.nat.size > 0){
        const v = normalizeForComparison(r.nat);
        if(!state.nat.has(v)) return false;
      }
      if(state.name && state.name.size > 0){
        const v = normalizeForComparison(r.skaterName || r.nameRaw);
        if(!state.name.has(v)) return false;
      }
    } else if(viewMode === "toernooi"){
      // Toernooi filter logic
      if(state.pos && state.pos.size > 0){
        const p = Number(r.pos);
        if(!Number.isFinite(p) || !state.pos.has(p)) return false;
      }
      if(state.nat && state.nat.size > 0){
        const v = normalizeForComparison(r.nat);
        if(!state.nat.has(v)) return false;
      }
      if(state.tournament && state.tournament.size > 0){
        const v = normalizeForComparison(r.wedstrijdRaw || r.tournament);
        if(!state.tournament.has(v)) return false;
      }
      if(state.sex && state.sex.size > 0){
        const v = normalizeForComparison(r.sekseRaw || r.sex);
        if(!state.sex.has(v)) return false;
      }
      if(state.distance && state.distance.size > 0){
        const v = normalizeForComparison(r.afstandRaw || r.distance);
        if(!state.distance.has(v)) return false;
      }
      if(state.season && state.season.size > 0){
        const y = Number(r.season);
        if(!Number.isFinite(y) || !state.season.has(y)) return false;
      }
    }
    
    return true;
  }

  const tableWrap = el("div", { class:"pivotTableWrap" });
  const countEl = el("div", { class:"pivotCount" }, "");

  function toggleFilter(set, value){
    const normalized = typeof value === 'number' ? value : normalizeForComparison(value);
    if(set.has(normalized)){
      set.delete(normalized);
    }else{
      set.add(normalized);
    }
  }

  function renderTable(){
    const state = getCurrentState();
    
    clear(tableWrap);
    
    // Check if any filters are active for Rijder view
    if(viewMode === "rijder"){
      const hasFilters = state.sex.size > 0 || 
                        state.tournament.size > 0 || 
                        state.season.size > 0 || 
                        state.distance.size > 0 || 
                        state.locatie.size > 0 || 
                        state.nat.size > 0 || 
                        state.name.size > 0;
      
      if(!hasFilters){
        countEl.textContent = "Selecteer minimaal één filter om resultaten te zien";
        tableWrap.appendChild(el("div", { class:"notice", style:"margin-top:12px" },
          "Geen filters geselecteerd. Kies één of meer filters bovenaan om de draaitabel te vullen."
        ));
        return;
      }
    }
    
    // Check if any filters are active for Toernooi view
    if(viewMode === "toernooi"){
      const hasFilters = state.pos.size > 0 || 
                        state.nat.size > 0 || 
                        state.tournament.size > 0 || 
                        state.sex.size > 0 || 
                        state.distance.size > 0 || 
                        state.season.size > 0;
      
      if(!hasFilters){
        countEl.textContent = "Selecteer minimaal één filter om resultaten te zien";
        tableWrap.appendChild(el("div", { class:"notice", style:"margin-top:12px" },
          "Geen filters geselecteerd. Kies één of meer filters bovenaan om de draaitabel te vullen."
        ));
        return;
      }
    }

    const rows = sortNewestFirst(resultsAll.filter(pass));
    countEl.textContent = `${rows.length.toLocaleString("nl-NL")} resultaten`;

    const tbl = el("table", { class:"pivotTable" });
    const thead = el("thead");
    const trh = el("tr");
    
    // Different headers based on view mode
    const headers = viewMode === "rijder" 
      ? ["Run", "Pos", "Naam", "Nat.", "Opmerking", "Wedstrijd", "Locatie", "Afstand", "Datum", "Seizoen", "Sekse", "Winnaar"]
      : ["Datum", "Pos", "Opmerking", "Afstand", "Locatie", "Run", "Naam", "Nat."];
    
    for(const h of headers) trh.appendChild(el("th", {}, h));
    thead.appendChild(trh);
    tbl.appendChild(thead);

    const tbody = el("tbody");
    for(const r of rows){
      const tr = el("tr");
      
      // Different columns based on view mode
      const cells = viewMode === "rijder"
        ? [
            normalizeSpaces(r.runRaw),
            normalizeSpaces(r.posRaw || r.pos),
            normalizeSpaces(r.skaterName || r.nameRaw),
            normalizeSpaces(r.nat),
            normalizeSpaces(r.opmerking),
            normalizeSpaces(r.wedstrijdRaw || r.tournament),
            normalizeSpaces(r.locatie),
            normalizeSpaces(r.afstandRaw || r.distance),
            fmtDate(r.dateISO),
            r.season ?? "",
            normalizeSpaces(r.sekseRaw || r.sex),
            normalizeSpaces(r.winnaarRaw)
          ]
        : [
            fmtDate(r.dateISO),
            normalizeSpaces(r.posRaw || r.pos),
            normalizeSpaces(r.opmerking),
            normalizeSpaces(r.afstandRaw || r.distance),
            normalizeSpaces(r.locatie),
            normalizeSpaces(r.runRaw),
            normalizeSpaces(r.skaterName || r.nameRaw),
            normalizeSpaces(r.nat)
          ];
      
      for(const c of cells) tr.appendChild(el("td", {}, String(c ?? "")));
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    tableWrap.appendChild(tbl);
  }

  function renderFiltersRijder(){
    const state = stateRijder;
    const options = optionsRijder;
    const filterSections = [];

    // Sekse filter - button style
    filterSections.push(
      el("div", { class:"filterSection" }, [
        el("div", { class:"filterSection__label" }, "Sekse"),
        el("div", { class:"filterSection__options" }, 
          options.sex.map(opt => {
            const isActive = state.sex.has(normalizeForComparison(opt));
            const btn = el("button", { 
              type:"button", 
              class: isActive ? "filterOption filterOption--active" : "filterOption"
            }, opt);
            btn.addEventListener("click", ()=>{
              toggleFilter(state.sex, opt);
              renderTable();
              renderFilters();
            });
            return btn;
          })
        )
      ])
    );

    // Wedstrijd filter - button style
    filterSections.push(
      el("div", { class:"filterSection" }, [
        el("div", { class:"filterSection__label" }, "Wedstrijd"),
        el("div", { class:"filterSection__options" }, 
          options.tournament.map(opt => {
            const isActive = state.tournament.has(normalizeForComparison(opt));
            const btn = el("button", { 
              type:"button", 
              class: isActive ? "filterOption filterOption--active" : "filterOption"
            }, opt);
            btn.addEventListener("click", ()=>{
              toggleFilter(state.tournament, opt);
              renderTable();
              renderFilters();
            });
            return btn;
          })
        )
      ])
    );

    // Seizoen filter - button style
    filterSections.push(
      el("div", { class:"filterSection" }, [
        el("div", { class:"filterSection__label" }, "Seizoen"),
        el("div", { class:"filterSection__options" }, 
          options.season.map(opt => {
            const isActive = state.season.has(opt);
            const btn = el("button", { 
              type:"button", 
              class: isActive ? "filterOption filterOption--active" : "filterOption"
            }, String(opt));
            btn.addEventListener("click", ()=>{
              toggleFilter(state.season, opt);
              renderTable();
              renderFilters();
            });
            return btn;
          })
        )
      ])
    );

    // Afstand filter - button style
    filterSections.push(
      el("div", { class:"filterSection" }, [
        el("div", { class:"filterSection__label" }, "Afstand"),
        el("div", { class:"filterSection__options" }, 
          options.distance.map(opt => {
            const isActive = state.distance.has(normalizeForComparison(opt));
            const btn = el("button", { 
              type:"button", 
              class: isActive ? "filterOption filterOption--active" : "filterOption"
            }, opt);
            btn.addEventListener("click", ()=>{
              toggleFilter(state.distance, opt);
              renderTable();
              renderFilters();
            });
            return btn;
          })
        )
      ])
    );

    // Locatie filter - SEARCH FIELD STYLE
    filterSections.push(
      createSearchableFilter("Locatie", options.locatie, state.locatie, ()=>{
        renderTable();
        renderFilters();
      })
    );

    // Nationaliteit filter - button style
    filterSections.push(
      el("div", { class:"filterSection" }, [
        el("div", { class:"filterSection__label" }, "Nationaliteit"),
        el("div", { class:"filterSection__options" }, 
          options.nat.map(opt => {
            const isActive = state.nat.has(normalizeForComparison(opt));
            const btn = el("button", { 
              type:"button", 
              class: isActive ? "filterOption filterOption--active" : "filterOption"
            }, opt);
            btn.addEventListener("click", ()=>{
              toggleFilter(state.nat, opt);
              renderTable();
              renderFilters();
            });
            return btn;
          })
        )
      ])
    );

    // Naam filter - SEARCH FIELD STYLE
    filterSections.push(
      createSearchableFilter("Naam", options.name, state.name, ()=>{
        renderTable();
        renderFilters();
      })
    );

    return filterSections;
  }

  function renderFiltersToernooi(){
    const state = stateToernooi;
    const options = optionsToernooi;
    const filterSections = [];

    // Pos filter - button style (numbers 1-20 typically)
    filterSections.push(
      el("div", { class:"filterSection" }, [
        el("div", { class:"filterSection__label" }, "Pos."),
        el("div", { class:"filterSection__options" }, 
          options.pos.slice(0, 30).map(opt => {
            const isActive = state.pos.has(opt);
            const btn = el("button", { 
              type:"button", 
              class: isActive ? "filterOption filterOption--active" : "filterOption"
            }, String(opt));
            btn.addEventListener("click", ()=>{
              if(state.pos.has(opt)){
                state.pos.delete(opt);
              }else{
                state.pos.add(opt);
              }
              renderTable();
              renderFilters();
            });
            return btn;
          })
        )
      ])
    );

    // Nat filter - button style
    filterSections.push(
      el("div", { class:"filterSection" }, [
        el("div", { class:"filterSection__label" }, "Nat."),
        el("div", { class:"filterSection__options" }, 
          options.nat.map(opt => {
            const isActive = state.nat.has(normalizeForComparison(opt));
            const btn = el("button", { 
              type:"button", 
              class: isActive ? "filterOption filterOption--active" : "filterOption"
            }, opt);
            btn.addEventListener("click", ()=>{
              toggleFilter(state.nat, opt);
              renderTable();
              renderFilters();
            });
            return btn;
          })
        )
      ])
    );

    // Wedstrijd filter - button style
    filterSections.push(
      el("div", { class:"filterSection" }, [
        el("div", { class:"filterSection__label" }, "Wedstrijd"),
        el("div", { class:"filterSection__options" }, 
          options.tournament.map(opt => {
            const isActive = state.tournament.has(normalizeForComparison(opt));
            const btn = el("button", { 
              type:"button", 
              class: isActive ? "filterOption filterOption--active" : "filterOption"
            }, opt);
            btn.addEventListener("click", ()=>{
              toggleFilter(state.tournament, opt);
              renderTable();
              renderFilters();
            });
            return btn;
          })
        )
      ])
    );

    // Sekse filter - button style
    filterSections.push(
      el("div", { class:"filterSection" }, [
        el("div", { class:"filterSection__label" }, "Sekse"),
        el("div", { class:"filterSection__options" }, 
          options.sex.map(opt => {
            const isActive = state.sex.has(normalizeForComparison(opt));
            const btn = el("button", { 
              type:"button", 
              class: isActive ? "filterOption filterOption--active" : "filterOption"
            }, opt);
            btn.addEventListener("click", ()=>{
              toggleFilter(state.sex, opt);
              renderTable();
              renderFilters();
            });
            return btn;
          })
        )
      ])
    );

    // Afstand filter - button style
    filterSections.push(
      el("div", { class:"filterSection" }, [
        el("div", { class:"filterSection__label" }, "Afstand"),
        el("div", { class:"filterSection__options" }, 
          options.distance.map(opt => {
            const isActive = state.distance.has(normalizeForComparison(opt));
            const btn = el("button", { 
              type:"button", 
              class: isActive ? "filterOption filterOption--active" : "filterOption"
            }, opt);
            btn.addEventListener("click", ()=>{
              toggleFilter(state.distance, opt);
              renderTable();
              renderFilters();
            });
            return btn;
          })
        )
      ])
    );

    // Seizoen filter - button style
    filterSections.push(
      el("div", { class:"filterSection" }, [
        el("div", { class:"filterSection__label" }, "Seizoen"),
        el("div", { class:"filterSection__options" }, 
          options.season.map(opt => {
            const isActive = state.season.has(opt);
            const btn = el("button", { 
              type:"button", 
              class: isActive ? "filterOption filterOption--active" : "filterOption"
            }, String(opt));
            btn.addEventListener("click", ()=>{
              if(state.season.has(opt)){
                state.season.delete(opt);
              }else{
                state.season.add(opt);
              }
              renderTable();
              renderFilters();
            });
            return btn;
          })
        )
      ])
    );

    return filterSections;
  }

  function renderFilters(){
    clear(root);

    // View mode toggle
    const viewToggle = el("div", { class:"viewToggle" }, [
      el("button", {
        type:"button",
        class: viewMode === "rijder" ? "viewToggle__btn viewToggle__btn--active" : "viewToggle__btn",
        onclick: ()=>{
          if(viewMode !== "rijder"){
            viewMode = "rijder";
            renderFilters();
            renderTable();
          }
        }
      }, "Rijder"),
      el("button", {
        type:"button",
        class: viewMode === "toernooi" ? "viewToggle__btn viewToggle__btn--active" : "viewToggle__btn",
        onclick: ()=>{
          if(viewMode !== "toernooi"){
            viewMode = "toernooi";
            renderFilters();
            renderTable();
          }
        }
      }, "Toernooi")
    ]);

    // Get appropriate filters based on view mode
    const filterSections = viewMode === "rijder" ? renderFiltersRijder() : renderFiltersToernooi();

    const resetBtn = el("button", { class:"btn btn--sm", type:"button" }, "Reset alle filters");
    resetBtn.addEventListener("click", ()=>{
      const state = getCurrentState();
      // Clear all filter sets
      Object.values(state).forEach(set => {
        if(set instanceof Set) set.clear();
      });
      renderTable();
      renderFilters();
    });

    const filtersWrap = el("div", { class:"pivotFilters" }, [
      ...filterSections,
      el("div", { class:"pivotActions" }, [
        resetBtn,
        el("button", { class:"btn btn--ghost btn--sm", type:"button", onclick:()=>router.go("home") }, "Terug naar menu")
      ])
    ]);

    const subtitle = viewMode === "rijder" 
      ? "Rijder weergave: Klik op filteropties. Gebruik zoeken voor Locatie en Naam. Sortering: nieuwste seizoen bovenaan."
      : "Toernooi weergave: Klik op filteropties. Tabel toont: Datum, Pos, Opmerking, Afstand, Locatie, Run, Naam, Nat. Sortering: nieuwste seizoen bovenaan.";

    const card = sectionCard({
      title:"Sebastiaans Draaitabel",
      subtitle: subtitle,
      children:[
        viewToggle,
        filtersWrap,
        countEl,
        tableWrap
      ]
    });

    root.appendChild(card);
  }

  renderFilters();
  renderTable();
}
