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

function hasAnyFilters(state){
  return state.sex.size > 0 || 
         state.tournament.size > 0 || 
         state.season.size > 0 || 
         state.distance.size > 0 || 
         state.locatie.size > 0 || 
         state.nat.size > 0 || 
         state.name.size > 0;
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

  // State: Sets with normalized (lowercase) values for case-insensitive matching
  const state = {
    sex: new Set(),
    tournament: new Set(),
    season: new Set(),
    distance: new Set(),
    locatie: new Set(),
    nat: new Set(),
    name: new Set()
  };

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

  const options = {
    sex: getUniqueOptions(resultsAll, r=>r.sekseRaw || r.sex),
    tournament: getUniqueOptions(resultsAll, r=>r.wedstrijdRaw || r.tournament),
    season: getSeasonOptions(resultsAll),
    distance: getUniqueOptions(resultsAll, r=>r.afstandRaw || r.distance),
    locatie: getUniqueOptions(resultsAll, r=>r.locatie),
    nat: getUniqueOptions(resultsAll, r=>r.nat),
    name: getUniqueOptions(resultsAll, r=>r.skaterName || r.nameRaw)
  };

  function pass(r){
    // Case-insensitive matching for all filters
    if(state.sex.size > 0){
      const v = normalizeForComparison(r.sekseRaw || r.sex);
      if(!state.sex.has(v)) return false;
    }
    if(state.tournament.size > 0){
      const v = normalizeForComparison(r.wedstrijdRaw || r.tournament);
      if(!state.tournament.has(v)) return false;
    }
    if(state.season.size > 0){
      const y = Number(r.season);
      if(!Number.isFinite(y) || !state.season.has(y)) return false;
    }
    if(state.distance.size > 0){
      const v = normalizeForComparison(r.afstandRaw || r.distance);
      if(!state.distance.has(v)) return false;
    }
    if(state.locatie.size > 0){
      const v = normalizeForComparison(r.locatie);
      if(!state.locatie.has(v)) return false;
    }
    if(state.nat.size > 0){
      const v = normalizeForComparison(r.nat);
      if(!state.nat.has(v)) return false;
    }
    if(state.name.size > 0){
      const v = normalizeForComparison(r.skaterName || r.nameRaw);
      if(!state.name.has(v)) return false;
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
    clear(tableWrap);
    
    if(!hasAnyFilters(state)){
      countEl.textContent = "Selecteer minimaal één filter om resultaten te zien";
      tableWrap.appendChild(el("div", { class:"notice", style:"margin-top:12px" },
        "Geen filters geselecteerd. Kies één of meer filters bovenaan om de draaitabel te vullen."
      ));
      return;
    }

    const rows = sortNewestFirst(resultsAll.filter(pass));
    countEl.textContent = `${rows.length.toLocaleString("nl-NL")} resultaten`;

    const tbl = el("table", { class:"pivotTable" });
    const thead = el("thead");
    const trh = el("tr");
    const headers = [
      "Run",
      "Pos",
      "Naam",
      "Nat.",
      "Opmerking",
      "Wedstrijd",
      "Locatie",
      "Afstand",
      "Datum",
      "Seizoen",
      "Sekse",
      "Winnaar"
    ];
    for(const h of headers) trh.appendChild(el("th", {}, h));
    thead.appendChild(trh);
    tbl.appendChild(thead);

    const tbody = el("tbody");
    for(const r of rows){
      const tr = el("tr");
      const cells = [
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
      ];
      for(const c of cells) tr.appendChild(el("td", {}, String(c ?? "")));
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    tableWrap.appendChild(tbl);
  }

  function renderFilters(){
    clear(root);

    const filterSections = [];

    // Sekse filter
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

    // Wedstrijd filter
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

    // Seizoen filter
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

    // Afstand filter
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

    // Locatie filter
    filterSections.push(
      el("div", { class:"filterSection" }, [
        el("div", { class:"filterSection__label" }, "Locatie"),
        el("div", { class:"filterSection__options" }, 
          options.locatie.map(opt => {
            const isActive = state.locatie.has(normalizeForComparison(opt));
            const btn = el("button", { 
              type:"button", 
              class: isActive ? "filterOption filterOption--active" : "filterOption"
            }, opt);
            btn.addEventListener("click", ()=>{
              toggleFilter(state.locatie, opt);
              renderTable();
              renderFilters();
            });
            return btn;
          })
        )
      ])
    );

    // Nationaliteit filter
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

    // Naam filter
    filterSections.push(
      el("div", { class:"filterSection" }, [
        el("div", { class:"filterSection__label" }, "Naam"),
        el("div", { class:"filterSection__options" }, 
          options.name.map(opt => {
            const isActive = state.name.has(normalizeForComparison(opt));
            const btn = el("button", { 
              type:"button", 
              class: isActive ? "filterOption filterOption--active" : "filterOption"
            }, opt);
            btn.addEventListener("click", ()=>{
              toggleFilter(state.name, opt);
              renderTable();
              renderFilters();
            });
            return btn;
          })
        )
      ])
    );

    const resetBtn = el("button", { class:"btn btn--sm", type:"button" }, "Reset alle filters");
    resetBtn.addEventListener("click", ()=>{
      state.sex.clear();
      state.tournament.clear();
      state.season.clear();
      state.distance.clear();
      state.locatie.clear();
      state.nat.clear();
      state.name.clear();
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

    const card = sectionCard({
      title:"Sebastiaans Draaitabel",
      subtitle:"Klik op filteropties (zoals Excel draaitabel). Meerdere selecties mogelijk. Sortering: nieuwste seizoen bovenaan.",
      children:[
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
