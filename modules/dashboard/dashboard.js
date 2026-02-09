import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { loadDataset } from "../../core/storage.js";

function normalizeSpaces(s){
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function multiSelectDropdown({ label, options, selectedSet, onChange }){
  const wrap = el("div", { class:"msel" });
  const btn = el("button", { type:"button", class:"btn btn--sm msel__btn" }, label);
  const panel = el("div", { class:"msel__panel" });
  let open = false;

  function updateLabel(){
    const n = selectedSet.size;
    btn.textContent = n ? `${label} (${n})` : label;
    // Add glow effect when filters are active
    if(n > 0){
      btn.classList.add("msel__btn--active");
    }else{
      btn.classList.remove("msel__btn--active");
    }
  }

  function render(){
    clear(panel);
    
    const header = el("div", { class:"msel__head" }, [
      el("div", { class:"muted" }, `Selecteer ${label.toLowerCase()}`),
      el("button", { type:"button", class:"btn btn--sm", onclick:()=>{
        if(selectedSet.size === options.length){
          selectedSet.clear();
        }else{
          selectedSet.clear();
          options.forEach(opt => selectedSet.add(opt));
        }
        updateLabel();
        render();
        onChange && onChange();
      }}, selectedSet.size === options.length ? "Deselecteer alles" : "Selecteer alles")
    ]);
    panel.appendChild(header);

    const list = el("div", { class:"msel__list" });
    for(const opt of options){
      const row = el("label", { class:"msel__row" });
      const cb = el("input", { type:"checkbox" });
      cb.checked = selectedSet.has(opt);
      cb.addEventListener("change", ()=>{
        if(cb.checked){
          selectedSet.add(opt);
        }else{
          selectedSet.delete(opt);
        }
        updateLabel();
        onChange && onChange();
      });
      row.appendChild(cb);
      row.appendChild(el("span", {}, String(opt)));
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
  updateLabel();
  return wrap;
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

  // State: multi-select Sets instead of single values
  const state = {
    sex: new Set(),
    tournament: new Set(),
    season: new Set(),
    distance: new Set(),
    locatie: new Set(),
    nat: new Set(),
    name: new Set()
  };

  const options = {
    sex: getOptions(resultsAll, r=>r.sekseRaw || r.sex),
    tournament: getOptions(resultsAll, r=>r.wedstrijdRaw || r.tournament),
    season: getSeasonOptions(resultsAll),
    distance: getOptions(resultsAll, r=>r.afstandRaw || r.distance),
    locatie: getOptions(resultsAll, r=>r.locatie),
    nat: getOptions(resultsAll, r=>r.nat),
    name: getOptions(resultsAll, r=>r.skaterName || r.nameRaw)
  };

  const cleanupFns = [];

  function pass(r){
    // Multi-select logic: if Set is not empty, value must be in Set
    if(state.sex.size > 0){
      const v = normalizeSpaces(r.sekseRaw || r.sex);
      if(!state.sex.has(v)) return false;
    }
    if(state.tournament.size > 0){
      const v = normalizeSpaces(r.wedstrijdRaw || r.tournament);
      if(!state.tournament.has(v)) return false;
    }
    if(state.season.size > 0){
      const y = Number(r.season);
      if(!Number.isFinite(y) || !state.season.has(y)) return false;
    }
    if(state.distance.size > 0){
      const v = normalizeSpaces(r.afstandRaw || r.distance);
      if(!state.distance.has(v)) return false;
    }
    if(state.locatie.size > 0){
      const v = normalizeSpaces(r.locatie);
      if(!state.locatie.has(v)) return false;
    }
    if(state.nat.size > 0){
      const v = normalizeSpaces(r.nat).toUpperCase();
      const matches = Array.from(state.nat).some(n => normalizeSpaces(n).toUpperCase() === v);
      if(!matches) return false;
    }
    if(state.name.size > 0){
      const v = normalizeSpaces(r.skaterName || r.nameRaw);
      if(!state.name.has(v)) return false;
    }
    return true;
  }

  const tableWrap = el("div", { class:"pivotTableWrap" });
  const countEl = el("div", { class:"pivotCount" }, "");

  function activeFiltersSummary(){
    const parts = [];
    if(state.sex.size) parts.push(`Sekse: ${Array.from(state.sex).join(", ")}`);
    if(state.tournament.size) parts.push(`Wedstrijd: ${Array.from(state.tournament).join(", ")}`);
    if(state.season.size) parts.push(`Seizoen: ${Array.from(state.season).sort((a,b)=>b-a).join(", ")}`);
    if(state.distance.size) parts.push(`Afstand: ${Array.from(state.distance).join(", ")}`);
    if(state.locatie.size) parts.push(`Locatie: ${Array.from(state.locatie).join(", ")}`);
    if(state.nat.size) parts.push(`Nationaliteit: ${Array.from(state.nat).join(", ")}`);
    if(state.name.size) parts.push(`Naam: ${Array.from(state.name).join(", ")}`);
    return parts.length > 0 ? parts.join(" • ") : "Geen filters actief";
  }

  function renderTable(){
    clear(tableWrap);
    
    // Check if any filters are active
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

  // Multi-select dropdowns
  const msSex = multiSelectDropdown({
    label: "Sekse",
    options: options.sex,
    selectedSet: state.sex,
    onChange: renderTable
  });
  cleanupFns.push(msSex.__cleanup || (()=>{}));

  const msTournament = multiSelectDropdown({
    label: "Wedstrijd",
    options: options.tournament,
    selectedSet: state.tournament,
    onChange: renderTable
  });
  cleanupFns.push(msTournament.__cleanup || (()=>{}));

  const msSeason = multiSelectDropdown({
    label: "Seizoen",
    options: options.season,
    selectedSet: state.season,
    onChange: renderTable
  });
  cleanupFns.push(msSeason.__cleanup || (()=>{}));

  const msDistance = multiSelectDropdown({
    label: "Afstand",
    options: options.distance,
    selectedSet: state.distance,
    onChange: renderTable
  });
  cleanupFns.push(msDistance.__cleanup || (()=>{}));

  const msLocatie = multiSelectDropdown({
    label: "Locatie",
    options: options.locatie,
    selectedSet: state.locatie,
    onChange: renderTable
  });
  cleanupFns.push(msLocatie.__cleanup || (()=>{}));

  const msNat = multiSelectDropdown({
    label: "Nationaliteit",
    options: options.nat,
    selectedSet: state.nat,
    onChange: renderTable
  });
  cleanupFns.push(msNat.__cleanup || (()=>{}));

  const msName = multiSelectDropdown({
    label: "Naam",
    options: options.name,
    selectedSet: state.name,
    onChange: renderTable
  });
  cleanupFns.push(msName.__cleanup || (()=>{}));

  const resetBtn = el("button", { class:"btn btn--sm", type:"button" }, "Reset alle filters");
  resetBtn.addEventListener("click", ()=>{
    state.sex.clear();
    state.tournament.clear();
    state.season.clear();
    state.distance.clear();
    state.locatie.clear();
    state.nat.clear();
    state.name.clear();
    
    // Re-render all dropdowns to update their labels
    const filterSection = root.querySelector(".pivotFilters");
    if(filterSection){
      clear(filterSection);
      filterSection.appendChild(msSex);
      filterSection.appendChild(msTournament);
      filterSection.appendChild(msSeason);
      filterSection.appendChild(msDistance);
      filterSection.appendChild(msLocatie);
      filterSection.appendChild(msNat);
      filterSection.appendChild(msName);
      filterSection.appendChild(el("div", { class:"pivotActions" }, 
        resetBtn, 
        el("button", { class:"btn btn--ghost btn--sm", type:"button", onclick:()=>router.go("home") }, "Terug naar menu")
      ));
    }
    
    renderTable();
  });

  const filtersGrid = el("div", { class:"pivotFilters" },
    msSex,
    msTournament,
    msSeason,
    msDistance,
    msLocatie,
    msNat,
    msName,
    el("div", { class:"pivotActions" }, 
      resetBtn, 
      el("button", { class:"btn btn--ghost btn--sm", type:"button", onclick:()=>router.go("home") }, "Terug naar menu")
    )
  );

  const filtersSummary = el("div", { class:"pivotSummary" });
  
  function updateSummary(){
    filtersSummary.textContent = activeFiltersSummary();
  }
  
  // Override renderTable to also update summary
  const originalRenderTable = renderTable;
  renderTable = function(){
    originalRenderTable();
    updateSummary();
  };

  const card = sectionCard({
    title:"Sebastiaans Draaitabel",
    subtitle:"Selecteer filters om resultaten te zien. Meerdere waarden per filter zijn mogelijk. Sortering is altijd nieuwste seizoen bovenaan.",
    children:[
      filtersGrid,
      filtersSummary,
      countEl,
      tableWrap
    ]
  });

  root.appendChild(card);
  updateSummary();
  renderTable();
}
