import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { loadDataset, loadMeta } from "../../core/storage.js";

function normalizeSpaces(s){ return String(s ?? "").replace(/\s+/g, " ").trim(); }

function medalIcon(pos){
  if(pos === 1) return "🥇";
  if(pos === 2) return "🥈";
  if(pos === 3) return "🥉";
  return "";
}

function tourOrder(short){
  // tie-breaker ONLY when position is equal
  const map = { OS: 1, WK: 2, EK: 3, WC: 4, NK: 5 };
  return map[short] ?? 99;
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
      .slice(0, 120);

    if(!filtered.length){
      list.appendChild(el("div", { class:"dropdown__item dropdown__item--muted" }, "Geen resultaten"));
      return;
    }

    for(const o of filtered){
      const it = el("div", { class:"dropdown__item" }, o);
      it.addEventListener("click", () => {
        input.value = o;
        onChange?.(o);
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

function findSkaterRow(dataset, canonName){
  const target = normalizeSpaces(canonName);
  return (dataset?.skaters || []).find(r => normalizeSpaces(r.SKATERS ?? r["SKATERS"] ?? "") === target) || null;
}

function findNat(dataset, canonName){
  const row = findSkaterRow(dataset, canonName);
  return normalizeSpaces(row?.NAT ?? row?.["NAT"] ?? row?.["Nat."] ?? "");
}

function findWTTeamNameByNat(dataset, nat){
  const code = normalizeSpaces(nat).toUpperCase();
  if(!code) return "";
  const row = (dataset?.wtNames || []).find(r => String(r.NAT ?? r["NAT"] ?? r["Nat."] ?? "").toUpperCase() === code);
  if(!row) return "";
  // user: WT Name in column C; header varies -> pick best match
  // try common keys first
  const candidates = [
    row["WT NAME"], row["WT NAME "], row.WT_NAME, row["WT_NAME"], row["WT Name"], row["WT name"],
    // if sheet has generic columns like A/B/C, also try C
    row.C, row["C"], row["Team"], row["Team name"], row["Teamnaam"], row["TEAM"], row["TEAM NAME"]
  ].filter(v => v != null && String(v).trim() !== "");

  return candidates.length ? normalizeSpaces(candidates[0]) : "";
}

function parseBirthYearFromSkatersRow(skRow){
  if(!skRow) return null;
  const candidates = [
    skRow.DOB, skRow["DOB"], skRow["Geboortedatum"], skRow["Birthdate"], skRow["Birth date"], skRow["Birthyear"], skRow["Birth year"],
    skRow["BIRTH YEAR"], skRow["YEAR"], skRow["Year"], skRow["Geb. jaar"], skRow["Geboortejaar"],
    // sometimes people store ISU url in column I, ignore
  ].filter(v => v != null && String(v).trim() !== "");

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

function isEligibleTournament(short){
  return ["OS","WK","EK","WC","NK"].includes(short);
}

function isFinalRun(runKey){
  const rk = String(runKey || "").toLowerCase();
  return rk === "final a" || rk === "final";
}

function isOverallRun(runKey){
  const rk = String(runKey || "").toLowerCase();
  return rk === "eindklassement" || rk.includes("overall") || rk.includes("eind");
}

function computeTopResults(dataset, canonName){
  const rows = (dataset?.results || []).filter(r => normalizeSpaces(r.skaterName) === normalizeSpaces(canonName));

  const elig = rows.filter(r => {
    const pos = r.pos;
    if(!(pos >= 1 && pos <= 5)) return false;
    const t = r.tournamentShort;
    if(!isEligibleTournament(t)) return false;

    if(t === "WC"){
      // only overall / eindklassement for WC/WT
      return isOverallRun(r.runKey) || normalizeSpaces(r.distance).toLowerCase() === "eindklassement";
    }
    // OS/WK/EK/NK: only FINAL A / FINAL
    return isFinalRun(r.runKey);
  });

  // Merge duplicates that only differ in date/location: group on pos + tournamentShort + distance
  const map = new Map();
  for(const r of elig){
    const key = `${r.pos}||${r.tournamentShort}||${normalizeSpaces(r.distance)}`;
    const g = map.get(key) || { pos: r.pos, tShort: r.tournamentShort, distance: normalizeSpaces(r.distance), years: new Set() };
    if(r.season) g.years.add(r.season);
    map.set(key, g);
  }

  let list = Array.from(map.values()).map(g => ({
    ...g,
    years: Array.from(g.years).filter(Boolean).sort((a,b)=>b-a)
  }));

  // Sort: position first, tie by tournament priority, then latest year desc
  list.sort((a,b)=>{
    if(a.pos !== b.pos) return a.pos - b.pos;
    const ao = tourOrder(a.tShort);
    const bo = tourOrder(b.tShort);
    if(ao !== bo) return ao - bo;
    const ay = a.years[0] ?? -Infinity;
    const by = b.years[0] ?? -Infinity;
    return by - ay;
  });

  return list.slice(0, 5);
}

function computeTitles(dataset, canonName){
  // Titles = pos 1 only, only OS/WK/EK/NK, only FINAL A/FINAL
  const rows = (dataset?.results || []).filter(r => normalizeSpaces(r.skaterName) === normalizeSpaces(canonName));
  const counts = { OS:0, WK:0, EK:0, NK:0 };
  const seen = new Set();
  for(const r of rows){
    if(r.pos !== 1) continue;
    if(!["OS","WK","EK","NK"].includes(r.tournamentShort)) continue;
    if(!isFinalRun(r.runKey)) continue;
    if(!r.season) continue;

    // Unique per tournament+season+distance (avoid duplicates)
    const key = `${r.tournamentShort}||${r.season}||${normalizeSpaces(r.distance)}`;
    if(seen.has(key)) continue;
    seen.add(key);
    counts[r.tournamentShort]++;
  }
  return counts;
}

function riderCard({ slotIndex, canonName, dataset }){
  const posNumber = slotIndex + 1;

  if(!canonName){
    return el("div", { class:"fpCard fpCard--empty" },
      el("div", { class:"fpBadge" }, String(posNumber)),
      el("div", { class:"notice" }, "Geen rijder geselecteerd")
    );
  }

  const sk = findSkaterRow(dataset, canonName);
  const nat = findNat(dataset, canonName);
  const wtTeam = findWTTeamNameByNat(dataset, nat);
  const by = parseBirthYearFromSkatersRow(sk);
  const age = ageFromBirthYear(by);

  const top = computeTopResults(dataset, canonName);
  const titles = computeTitles(dataset, canonName);

  const topLines = top.map(t => {
    const years = t.years?.length ? t.years.join(", ") : "—";
    const m = medalIcon(t.pos);
    const prefix = m ? `${m} ` : "";
    return `${prefix}${t.pos} - ${t.tShort} - ${t.distance} - ${years}`;
  });

  return el("div", { class:"fpCard" },
    el("div", { class:"fpBadge" }, String(posNumber)),
    el("div", { class:"fpName" }, canonName),
    el("div", { class:"fpMeta" }, nat || "—"),
    el("div", { class:"fpMeta" }, wtTeam || "—"),
    el("div", { class:"fpMeta" }, age != null ? `${age} jaar` : "— jaar"),
    el("div", { class:"fpTitles" },
      el("div", { class:"fpTitleRow" }, `OS - ${titles.OS}`),
      el("div", { class:"fpTitleRow" }, `WK - ${titles.WK}`),
      el("div", { class:"fpTitleRow" }, `EK - ${titles.EK}`),
      el("div", { class:"fpTitleRow" }, `NK - ${titles.NK}`),
    ),
    el("div", { class:"fpResults" },
      ...(topLines.length ? topLines.map(s => el("div", { class:"fpResultRow" }, s))
        : [el("div", { class:"fpResultRow fpResultRow--muted" }, "Geen topresultaten binnen de voorwaarden (pos 1–5, juiste toernooi/run).")])
    )
  );
}

export async function mountFinalPresentation(root){
  clear(root);

  const meta = loadMeta?.() || null;
  const dataset = await loadDataset?.();

  if(!dataset?.results?.length || !dataset?.skaters?.length){
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

  // Canonical rider names come from Skaters tab (SKATERS)
  const skaterNames = Array.from(new Set(
    dataset.skaters
      .map(r => r.SKATERS ?? r["SKATERS"] ?? "")
      .map(normalizeSpaces)
      .filter(Boolean)
  )).sort((a,b)=>a.localeCompare(b));

  const slots = new Array(8).fill("");
  let windowStart = 0; // shows windowStart (A) and windowStart+1 (B)

  const selectorsGrid = el("div", { class:"fpSelectorsGrid" });
  const compareWrap = el("div", { class:"fpCompareWrap" });

  function renderSelectors(){
    clear(selectorsGrid);
    for(let i=0;i<8;i++){
      const dd = typeableDropdown({
        placeholder: `Startpositie ${i+1}`,
        value: slots[i] || "",
        options: skaterNames,
        onChange: (val)=>{
          slots[i] = val;
          renderCards();
        }
      });

      const cell = el("div", { class:"fpSelectorCell" }, dd.wrap);
      selectorsGrid.appendChild(cell);
    }
  }

  function renderCards(){
    clear(compareWrap);

    const leftIdx = windowStart;
    const rightIdx = windowStart + 1;

    const bar = el("div", { class:"fpNavBar" },
      el("button", {
        class:"btn btn--icon",
        type:"button",
        title:"Vorige startpositie",
        onclick: ()=>{ windowStart = Math.max(0, windowStart - 1); renderCards(); }
      }, "◀"),
      el("div", { class:"fpNavLabel" }, `Startpositie ${leftIdx+1} | ${rightIdx+1}`),
      el("button", {
        class:"btn btn--icon",
        type:"button",
        title:"Volgende startpositie",
        onclick: ()=>{ windowStart = Math.min(6, windowStart + 1); renderCards(); }
      }, "▶")
    );

    const cards = el("div", { class:"fpCardsGrid" },
      riderCard({ slotIndex:leftIdx, canonName: slots[leftIdx], dataset }),
      riderCard({ slotIndex:rightIdx, canonName: slots[rightIdx], dataset })
    );

    compareWrap.appendChild(bar);
    compareWrap.appendChild(cards);
  }

  root.appendChild(sectionCard({
    title:"A Final presentation",
    subtitle: meta?.datasetName ? `Dataset: ${meta.datasetName}` : "Selecteer rijders per startpositie.",
    children:[
      selectorsGrid,
      el("div", { style:"height:12px" }),
      compareWrap
    ]
  }));

  renderSelectors();
  renderCards();
}
