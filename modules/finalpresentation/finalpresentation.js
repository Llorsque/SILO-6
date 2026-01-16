import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { loadDataset, loadMeta } from "../../core/storage.js";

function normalizeSpaces(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }

function typeableDropdown({ placeholder, value, options, onChange }){
  const wrap = el("div", { class:"dropdown dropdown--compact" });
  const input = el("input", { class:"input input--compact", placeholder, value: value || "" });
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
      it.addEventListener("mousedown", (e)=>{
        e.preventDefault();
        input.value = o;
        onChange?.(o);
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
  document.addEventListener("click", (e)=>{ if(!wrap.contains(e.target)) setOpen(false); });

  wrap.appendChild(input);
  wrap.appendChild(list);
  return wrap;
}

function medalIcon(pos){
  if(pos === 1) return "🥇";
  if(pos === 2) return "🥈";
  if(pos === 3) return "🥉";
  return "";
}

function tourOrder(short){
  // position is primary; this is tie-breaker
  const map = { "OS": 1, "WK": 2, "EK": 3, "WC": 4, "NK": 5 };
  return map[short] ?? 99;
}

function findWTNameByNat(dataset, nat){
  const code = normalizeSpaces(nat).toUpperCase();
  if(!code) return "";
  const row = (dataset.wtNames || []).find(r => String(r.NAT ?? r["NAT"] ?? "").toUpperCase() === code);
  if(!row) return "";
  return normalizeSpaces(row["WT NAME"] ?? row["WT NAME "] ?? row.WT_NAME ?? row["WT_NAME"] ?? "");
}

function findSkaterNat(dataset, name){
  const canon = normalizeSpaces(name);
  const row = (dataset.skaters || []).find(r => normalizeSpaces(r.SKATERS ?? r["SKATERS"] ?? "") === canon);
  if(!row) return "";
  return normalizeSpaces(row.NAT ?? row["NAT"] ?? row["Nat."] ?? "");
}

function findSkaterNote(dataset, name){
  const canon = normalizeSpaces(name);
  const row = (dataset.skaters || []).find(r => normalizeSpaces(r.SKATERS ?? r["SKATERS"] ?? "") === canon);
  if(!row) return "";
  return normalizeSpaces(row.OPMERKING ?? row["OPMERKING"] ?? row.Opmerking ?? row["Opmerking"] ?? row["Opmerking "] ?? row["H"] ?? "");
}

function parseBirthYear(dataset, name){
  const canon = normalizeSpaces(name);
  const row = (dataset.skaters || []).find(r => normalizeSpaces(r.SKATERS ?? r["SKATERS"] ?? "") === canon);
  if(!row) return null;

  // try common fields without assumptions
  const candidates = [
    row.DOB, row["DOB"], row["Date of Birth"], row["Geboortedatum"], row["Birthdate"], row["Birth year"], row["BIRTH YEAR"],
    row["BIRTHYEAR"], row["BirthYear"], row["YEAR"], row["Year"]
  ].filter(v => v !== undefined && v !== null && String(v).trim() !== "");

  for(const v of candidates){
    const s = String(v).trim();
    const m = s.match(/(19\d{2}|20\d{2})/);
    if(m) return Number(m[1]);
  }
  return null;
}

function ageFromBirthYear(by){
  if(!by || !Number.isFinite(by)) return null;
  const now = new Date();
  return now.getFullYear() - by;
}

function computeTopResults(dataset, skaterName){
  const rows = (dataset.results || []).filter(r => normalizeSpaces(r.name) === normalizeSpaces(skaterName));
  // Eligible:
  // - For OS/WK/EK/NK: FINAL A / FINAL only, pos 1..5
  // - For WC: ONLY eindklassement/overall (runKey === "eindklassement" OR distance === "Eindklassement"), pos 1..5
  const elig = rows.filter(r => {
    const pos = r.pos;
    if(!(pos >= 1 && pos <= 5)) return false;
    const t = r.tournamentShort;
    if(t === "WC"){
      return r.runKey === "eindklassement" || r.distance === "Eindklassement";
    }
    // OS/WK/EK/NK
    return r.runKey === "final a" || r.runKey === "final";
  });

  // Group by (pos, tournamentShort, distance) and merge seasons (years). Date differences ignored; location omitted.
  const groups = new Map();
  for(const r of elig){
    const key = `${r.pos}||${r.tournamentShort}||${r.distance}`;
    const g = groups.get(key) || { pos: r.pos, tShort: r.tournamentShort, tournament: r.tournament, distance: r.distance, years: new Set() };
    if(r.season) g.years.add(r.season);
    groups.set(key, g);
  }

  let list = Array.from(groups.values()).map(g => {
    const years = Array.from(g.years).filter(Boolean).sort((a,b)=>b-a);
    return { ...g, years };
  });

  // Sort: position first, then tournament priority, then latest year desc
  list.sort((a,b)=>{
    if(a.pos !== b.pos) return a.pos - b.pos;
    const ao = tourOrder(a.tShort);
    const bo = tourOrder(b.tShort);
    if(ao !== bo) return ao - bo;
    const ay = a.years[0] ?? -Infinity;
    const by = b.years[0] ?? -Infinity;
    return by - ay;
  });

  // Limit 5 lines
  return list.slice(0, 5);
}

function computeTitles(dataset, skaterName){
  const rows = (dataset.results || []).filter(r => normalizeSpaces(r.name) === normalizeSpaces(skaterName));
  const allowed = new Set(["OS","WK","EK","NK"]);
  // Only FINAL A/FINAL, pos=1
  const elig = rows.filter(r => (r.pos === 1) && (r.runKey === "final a" || r.runKey === "final") && allowed.has(r.tournamentShort));
  // Deduplicate per (tournamentShort, season, distance)
  const seen = new Set();
  const counts = { OS:0, WK:0, EK:0, NK:0 };
  for(const r of elig){
    const key = `${r.tournamentShort}||${r.season}||${r.distance}`;
    if(seen.has(key)) continue;
    seen.add(key);
    counts[r.tournamentShort]++;
  }
  return counts;
}

function riderCard({ slotIndex, skaterName, dataset }){
  const posNumber = slotIndex + 1;

  if(!skaterName){
    return el("div", { class:"fpCard fpCard--empty" },
      el("div", { class:"fpBadge" }, String(posNumber)),
      el("div", { class:"notice" }, "Geen rijder geselecteerd")
    );
  }

  const nat = findSkaterNat(dataset, skaterName) || "";
  const wt = findWTNameByNat(dataset, nat) || "";
  const by = parseBirthYear(dataset, skaterName);
  const age = ageFromBirthYear(by);
  const top = computeTopResults(dataset, skaterName);
  const titles = computeTitles(dataset, skaterName);

  const lines = top.map(t => {
    const years = t.years?.length ? t.years.join(", ") : "—";
    const m = medalIcon(t.pos);
    const prefix = m ? `${m} ` : "";
    return `${prefix}${t.pos} - ${t.tournamentShort} - ${t.distance} - ${years}`;
  });

  return el("div", { class:"fpCard" },
    el("div", { class:"fpBadge" }, String(posNumber)),
    el("div", { class:"fpName" }, skaterName),
    el("div", { class:"fpMeta" }, nat || "—"),
    el("div", { class:"fpMeta" }, wt || "—"),
    el("div", { class:"fpMeta" }, (age != null ? `${age} jaar` : "— jaar")),
    el("div", { class:"fpTitles" },
      el("div", { class:"fpTitleRow" }, `OS - ${titles.OS}`),
      el("div", { class:"fpTitleRow" }, `WK - ${titles.WK}`),
      el("div", { class:"fpTitleRow" }, `EK - ${titles.EK}`),
      el("div", { class:"fpTitleRow" }, `NK - ${titles.NK}`),
    ),
    el("div", { class:"fpResults" },
      ...lines.map(s => el("div", { class:"fpResultRow" }, s))
    )
  );
}

export async function mountFinalPresentation(root){
  clear(root);

  const meta = loadMeta();
  const dataset = await loadDataset();
  if(!dataset || !dataset.results?.length || !dataset.skaters?.length){
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

  // Rider options from Skaters sheet canonical names
  const riderOptions = Array.from(new Set(
    (dataset.skaters || [])
      .map(r => normalizeSpaces(r.SKATERS ?? r["SKATERS"] ?? ""))
      .filter(Boolean)
  )).sort((a,b)=>a.localeCompare(b));

  const slots = new Array(8).fill("");
  let windowStart = 0; // 0..6

  const selectorsGrid = el("div", { class:"fpSelectorsGrid" });
  const cardWrap = el("div", { class:"fpCompareGrid" });

  function renderSelectors(){
    clear(selectorsGrid);
    for(let i=0;i<8;i++){
      const dd = typeableDropdown({
        placeholder: `Startpositie ${i+1}`,
        value: slots[i] || "",
        options: riderOptions,
        onChange: (v)=>{ slots[i]=v; renderCards(); }
      });
      const cell = el("div", { class:"fpSelectorCell" }, dd);
      selectorsGrid.appendChild(cell);
    }
  }

  function renderCards(){
    clear(cardWrap);

    const leftIdx = windowStart;
    const rightIdx = windowStart + 1;

    const leftName = slots[leftIdx] || "";
    const rightName = slots[rightIdx] || "";

    const topBar = el("div", { class:"fpWindowBar" },
      el("button", { class:"btn btn--icon", type:"button", onclick:()=>{ windowStart = Math.max(0, windowStart-1); renderCards(); } }, "◀"),
      el("div", { class:"fpWindowLabel" }, `Startpositie ${leftIdx+1} & ${rightIdx+1}`),
      el("button", { class:"btn btn--icon", type:"button", onclick:()=>{ windowStart = Math.min(6, windowStart+1); renderCards(); } }, "▶"),
    );

    const grid = el("div", { class:"fpCardsGrid" },
      riderCard({ slotIndex:leftIdx, skaterName:leftName, dataset }),
      riderCard({ slotIndex:rightIdx, skaterName:rightName, dataset }),
    );

    cardWrap.appendChild(topBar);
    cardWrap.appendChild(grid);
  }

  root.appendChild(sectionCard({
    title:"A Final presentation",
    subtitle: meta?.datasetName ? `Dataset: ${meta.datasetName}` : "Selecteer rijders per startpositie.",
    children:[
      selectorsGrid,
      el("div", { style:"height:12px" }),
      cardWrap
    ]
  }));

  renderSelectors();
  renderCards();
}
