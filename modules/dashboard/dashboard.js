import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { loadDataset } from "../../core/storage.js";

function normalizeSpaces(s){
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function typeableDropdown({ placeholder, value, options, onChange }){
  const wrap = el("div", { class:"dropdown" });
  const input = el("input", { class:"input", placeholder, value: value || "" });
  const list = el("div", { class:"dropdown__list" });
  let open = false;

  function renderList(){
    clear(list);
    const q = (input.value || "").toLowerCase().trim();
    const filtered = options
      .filter(o => String(o).toLowerCase().includes(q))
      .slice(0, 80);
    if(!filtered.length){
      list.appendChild(el("div", { class:"dropdown__item dropdown__item--muted" }, "Geen resultaten"));
      return;
    }
    for(const o of filtered){
      const it = el("div", { class:"dropdown__item" }, String(o));
      it.addEventListener("click", () => {
        onChange(o);
        open = false;
        list.classList.remove("dropdown__list--open");
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
  document.addEventListener("click", (e)=>{ if(!wrap.contains(e.target)) setOpen(false); });

  wrap.appendChild(input);
  wrap.appendChild(list);
  return { wrap, input };
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

  const state = {
    sex: "",
    tournament: "",
    season: "",
    distance: "",
    locatie: "",
    nat: "",
    name: ""
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

  function pass(r){
    if(state.sex){
      const v = normalizeSpaces(r.sekseRaw || r.sex);
      if(v !== state.sex) return false;
    }
    if(state.tournament){
      const v = normalizeSpaces(r.wedstrijdRaw || r.tournament);
      if(v !== state.tournament) return false;
    }
    if(state.season){
      const y = Number(r.season);
      if(!Number.isFinite(y) || String(y) !== String(state.season)) return false;
    }
    if(state.distance){
      const v = normalizeSpaces(r.afstandRaw || r.distance);
      if(v !== state.distance) return false;
    }
    if(state.locatie){
      const v = normalizeSpaces(r.locatie);
      if(v !== state.locatie) return false;
    }
    if(state.nat){
      const v = normalizeSpaces(r.nat).toUpperCase();
      if(v !== normalizeSpaces(state.nat).toUpperCase()) return false;
    }
    if(state.name){
      const v = normalizeSpaces(r.skaterName || r.nameRaw);
      if(v !== state.name) return false;
    }
    return true;
  }

  const tableWrap = el("div", { class:"pivotTableWrap" });
  const countEl = el("div", { class:"pivotCount" }, "");

  function clearBtn(onClick){
    return el("button", { type:"button", class:"btn btn--ghost btn--sm", onclick:onClick }, "Wis");
  }

  function filterRow(label, ddWrap, clearButton){
    return el("div", { class:"pivotFilter" },
      el("div", { class:"pivotFilter__label" }, label),
      el("div", { class:"pivotFilter__ctrl" }, ddWrap, clearButton)
    );
  }

  function renderTable(){
    const rows = sortNewestFirst(resultsAll.filter(pass));
    countEl.textContent = `${rows.length.toLocaleString("nl-NL")} resultaten (kolom A t/m L)`;

    clear(tableWrap);

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

  // Dropdowns
  const ddSex = typeableDropdown({
    placeholder:"Alle",
    value:state.sex,
    options: options.sex,
    onChange:(v)=>{ state.sex = normalizeSpaces(v); ddSex.input.value = state.sex; renderTable(); }
  });
  const ddTournament = typeableDropdown({
    placeholder:"Alle",
    value:state.tournament,
    options: options.tournament,
    onChange:(v)=>{ state.tournament = normalizeSpaces(v); ddTournament.input.value = state.tournament; renderTable(); }
  });
  const ddSeason = typeableDropdown({
    placeholder:"Alle",
    value:state.season,
    options: options.season.map(String),
    onChange:(v)=>{ state.season = String(v); ddSeason.input.value = state.season; renderTable(); }
  });
  const ddDistance = typeableDropdown({
    placeholder:"Alle",
    value:state.distance,
    options: options.distance,
    onChange:(v)=>{ state.distance = normalizeSpaces(v); ddDistance.input.value = state.distance; renderTable(); }
  });
  const ddLocatie = typeableDropdown({
    placeholder:"Alle",
    value:state.locatie,
    options: options.locatie,
    onChange:(v)=>{ state.locatie = normalizeSpaces(v); ddLocatie.input.value = state.locatie; renderTable(); }
  });
  const ddNat = typeableDropdown({
    placeholder:"Alle",
    value:state.nat,
    options: options.nat,
    onChange:(v)=>{ state.nat = normalizeSpaces(v); ddNat.input.value = state.nat; renderTable(); }
  });
  const ddName = typeableDropdown({
    placeholder:"Alle",
    value:state.name,
    options: options.name,
    onChange:(v)=>{ state.name = normalizeSpaces(v); ddName.input.value = state.name; renderTable(); }
  });

  const resetBtn = el("button", { class:"btn btn--sm", type:"button" }, "Reset filters");
  resetBtn.addEventListener("click", ()=>{
    state.sex = ""; state.tournament = ""; state.season = ""; state.distance = ""; state.locatie = ""; state.nat = ""; state.name = "";
    ddSex.input.value = "";
    ddTournament.input.value = "";
    ddSeason.input.value = "";
    ddDistance.input.value = "";
    ddLocatie.input.value = "";
    ddNat.input.value = "";
    ddName.input.value = "";
    renderTable();
  });

  const filtersGrid = el("div", { class:"pivotFilters" },
    filterRow("Sekse", ddSex.wrap, clearBtn(()=>{ state.sex=""; ddSex.input.value=""; renderTable(); })),
    filterRow("Wedstrijd", ddTournament.wrap, clearBtn(()=>{ state.tournament=""; ddTournament.input.value=""; renderTable(); })),
    filterRow("Seizoen", ddSeason.wrap, clearBtn(()=>{ state.season=""; ddSeason.input.value=""; renderTable(); })),
    filterRow("Afstand", ddDistance.wrap, clearBtn(()=>{ state.distance=""; ddDistance.input.value=""; renderTable(); })),
    filterRow("Locatie", ddLocatie.wrap, clearBtn(()=>{ state.locatie=""; ddLocatie.input.value=""; renderTable(); })),
    filterRow("Nationaliteit", ddNat.wrap, clearBtn(()=>{ state.nat=""; ddNat.input.value=""; renderTable(); })),
    filterRow("Naam", ddName.wrap, clearBtn(()=>{ state.name=""; ddName.input.value=""; renderTable(); })),
    el("div", { class:"pivotActions" }, resetBtn, el("button", { class:"btn btn--ghost btn--sm", type:"button", onclick:()=>router.go("home") }, "Terug naar menu"))
  );

  const card = sectionCard({
    title:"Sebastiaans Draaitabel",
    subtitle:"Filters (Results tabblad) bovenin, daaronder kolom A t/m L. Sortering is altijd nieuwste seizoen bovenaan.",
    children:[
      filtersGrid,
      countEl,
      tableWrap
    ]
  });

  root.appendChild(card);
  renderTable();
}
