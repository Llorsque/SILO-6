import { el, clear } from "../../core/dom.js";
import { router } from "../../core/router.js";
import * as storage from "../../core/storage.js";

// --- Helpers ---
function normStr(s){ return (s ?? "").toString().trim(); }
function toLower(s){ return normStr(s).toLowerCase(); }
function num(v){
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function getRows(fn){
  try { return (typeof fn === "function" ? fn() : []) || []; }
  catch { return []; }
}

function getResults(){
  // Prefer explicit helpers if present
  return getRows(storage.loadResults);
}

function getSkaters(){
  // Some repos used loadSkaters; others may expose a generic loader.
  if (typeof storage.loadSkaters === "function") return getRows(storage.loadSkaters);
  if (typeof storage.loadSheet === "function") return getRows(() => storage.loadSheet("Skaters"));
  return [];
}

function getWTNames(){
  if (typeof storage.loadWTNames === "function") return getRows(storage.loadWTNames);
  if (typeof storage.loadSheet === "function") return getRows(() => storage.loadSheet("WT Name"));
  return [];
}

function buildNameCanonicalMap(skaters){
  // Skaters tab: user said consistent format is column D (Naam). We'll accept multiple likely keys.
  const map = new Map();
  for (const r of skaters){
    const d = normStr(r.D ?? r.Naam ?? r.Name ?? r["Naam"] ?? r["Name"]);
    const raw = normStr(r.C ?? r["Naam raw"] ?? r["Raw"] ?? r.Raw ?? "");
    if (d) map.set(toLower(d), d);
    if (raw) map.set(toLower(raw), d);
  }
  return map;
}

function canonicalizeName(name, nameMap){
  const key = toLower(name);
  return nameMap.get(key) || normStr(name);
}

function buildWTTeamMap(wtRows){
  // WT Name sheet: team name is column C. We'll try a few keys.
  const map = new Map();
  for (const r of wtRows){
    const sk = normStr(r.Naam ?? r.Name ?? r.Skater ?? r["Skater"] ?? r.A ?? r.B ?? "");
    const team = normStr(r.C ?? r.Team ?? r["WT team"] ?? r["WT Team"] ?? r["Team name"] ?? "");
    if(sk && team) map.set(toLower(sk), team);
  }
  return map;
}

function buildSkaterMetaMap(skaters){
  // Attempt to read Nat and DOB/BirthYear if present.
  const map = new Map();
  for (const r of skaters){
    const nm = normStr(r.D ?? r.Naam ?? r.Name ?? r["Naam"] ?? r["Name"]);
    if(!nm) continue;
    const nat = normStr(r.E ?? r.Nat ?? r["Nat."] ?? r.Nationality ?? r["Nationaliteit"] ?? "");
    const dob = normStr(r.DOB ?? r.Geboortedatum ?? r["Geboortedatum"] ?? r["Birth"] ?? r["Birthdate"] ?? r.I ?? "");
    // Some users put ISU URL in I; if dob is actually a URL, ignore for now.
    const dobClean = /https?:\/\//i.test(dob) ? "" : dob;
    const birthYear = (() => {
      // Accept YYYY or DD-MM-YYYY
      const m = dobClean.match(/(19\d{2}|20\d{2})/);
      if(m) return Number(m[1]);
      const y = num(r.BirthYear ?? r["Birth year"]);
      return y;
    })();
    map.set(toLower(nm), { nat, birthYear });
  }
  return map;
}

function computeAge(birthYear){
  if(!birthYear || !Number.isFinite(birthYear)) return null;
  const now = new Date();
  return now.getFullYear() - birthYear;
}

function tournamentBucket(wedstrijd){
  const w = toLower(wedstrijd);
  // Priority for displaying + sorting (position first, then this order)
  if (w.includes("olym") || w.includes("olympische")) return { key:"OS", rank:0, label:"Olympische Spelen" };
  if (w.includes("wereld") || w.includes("world championship") || w.includes("wereldkamp")) return { key:"WK", rank:1, label:"Wereldkampioenschap" };
  if (w.includes("europe") || w.includes("europ") ) return { key:"EK", rank:2, label:"Europees kampioenschap" };
  if (w.includes("world cup") || w.includes("world tour") || w.includes("worldcup") || w.includes("world tour")) return { key:"WCWT", rank:3, label:"Eindklassement WC/WT" };
  if (w.includes("neder") || w.includes("dutch") ) return { key:"NK", rank:4, label:"Nederlands kampioenschap" };
  return { key:"OTHER", rank:99, label:normStr(wedstrijd) || "Onbekend" };
}

function isEligibleRun(row, bucketKey){
  const run = toLower(row.Run ?? row.Race ?? row["Run"] ?? row["Race"]);
  if(bucketKey === "WCWT"){
    return run.includes("overall") || run.includes("eindklassement") || run.includes("ranking") || run.includes("final") && run.includes("overall");
  }
  // For OS/WK/EK/NK: Final A or Final
  return run.includes("final a") || run === "final" || run.includes("final");
}

function parsePos(row){
  const p = num(row.Pos ?? row.Ranking ?? row["Pos."] ?? row["Pos"] ?? row["Ranking"]);
  return p;
}

function parseSeason(row){
  return num(row.Seizoen ?? row.Season ?? row["Seizoen"] ?? row["Season"]);
}

function parseDistance(row){
  // Distance must be read exactly from Results col H in your data.
  const raw = normStr(row.Afstand ?? row.Distance ?? row["Afstand"] ?? row["Distance"]);
  // Keep the cleaned string but do not infer values; we only normalize common spacing.
  return raw.replace(/\s+/g," ").trim();
}

function getRiderResults(resultsRows, skaterName, nameMap){
  const canon = canonicalizeName(skaterName, nameMap);
  const canonKey = toLower(canon);

  // Match by canonicalized names on both sides.
  return resultsRows
    .map(r => {
      const nm = canonicalizeName(normStr(r.Naam ?? r.Name ?? r["Naam"] ?? r["Name"]), nameMap);
      return { ...r, __canonName: nm, __canonKey: toLower(nm) };
    })
    .filter(r => r.__canonKey === canonKey);
}

function buildHighlights(rows){
  // Filter to pos 1-5, eligible runs by tournament bucket.
  const candidates = [];
  for (const r of rows){
    const pos = parsePos(r);
    if(pos == null || pos < 1 || pos > 5) continue;
    const bucket = tournamentBucket(r.Wedstrijd ?? r.Toernooi ?? r["Wedstrijd"] ?? r["Toernooi"]);
    if(bucket.key === "OTHER") continue;
    if(!isEligibleRun(r, bucket.key)) continue;

    const season = parseSeason(r);
    const dist = parseDistance(r);
    if(!season || !dist) continue;

    candidates.push({
      pos,
      bucket,
      season,
      dist,
      raw: r,
    });
  }

  // Group by (pos, bucket.key, dist) and merge years.
  const grp = new Map();
  for (const c of candidates){
    const k = `${c.pos}||${c.bucket.key}||${c.dist}`;
    const g = grp.get(k) || { pos:c.pos, bucket:c.bucket, dist:c.dist, years:new Set() };
    g.years.add(c.season);
    grp.set(k, g);
  }

  // Convert to list with sorted years (desc)
  let list = Array.from(grp.values()).map(g => {
    const years = Array.from(g.years).filter(Boolean).sort((a,b)=>b-a);
    return { ...g, years };
  });

  // Sort: position first, then tournament priority, then latest year desc.
  list.sort((a,b)=>{
    if(a.pos !== b.pos) return a.pos - b.pos;
    if(a.bucket.rank !== b.bucket.rank) return a.bucket.rank - b.bucket.rank;
    const ay = a.years[0] || 0;
    const by = b.years[0] || 0;
    return by - ay;
  });

  // Max 5 lines
  list = list.slice(0,5);

  // Format lines
  const medal = (pos)=> pos===1?"🥇":pos===2?"🥈":pos===3?"🥉":"";
  const lines = list.map(x => {
    const yearsTxt = x.years.join(", ");
    const posTxt = `${x.pos}`;
    return `${medal(x.pos)} ${posTxt} - ${x.bucket.label} - ${x.dist} - ${yearsTxt}`.trim();
  });

  // Titles summary (pos=1) for OS/WK/EK/NK; dedupe by (bucket, season, dist)
  const titleBuckets = ["OS","WK","EK","NK"];
  const titleSets = { OS:new Set(), WK:new Set(), EK:new Set(), NK:new Set() };
  for (const c of candidates){
    if(c.pos !== 1) continue;
    if(!titleBuckets.includes(c.bucket.key)) continue;
    const key = `${c.bucket.key}||${c.season}||${c.dist}`;
    titleSets[c.bucket.key].add(key);
  }
  const titles = [
    { key:"OS", label:"OS", count:titleSets.OS.size },
    { key:"WK", label:"WK", count:titleSets.WK.size },
    { key:"EK", label:"EK", count:titleSets.EK.size },
    { key:"NK", label:"NK", count:titleSets.NK.size },
  ];

  return { lines, titles };
}

function makeDatalist(id, options){
  const dl = el("datalist", { id });
  const seen = new Set();
  for (const o of options){
    const v = normStr(o);
    if(!v) continue;
    const k = toLower(v);
    if(seen.has(k)) continue;
    seen.add(k);
    dl.appendChild(el("option", { value:v }));
  }
  return dl;
}

function smallSelectInput(label, listId, value, onChange, placeholder){
  const wrap = el("div", { class:"fpPick" }, [
    el("div", { class:"fpPick__label" }, label),
    el("input", {
      class:"fpPick__input",
      type:"text",
      list:listId,
      value: value || "",
      placeholder: placeholder || "Typ om te zoeken…",
      autocomplete:"off",
    })
  ]);
  const inp = wrap.querySelector("input");
  inp.addEventListener("input", ()=> onChange(inp.value));
  inp.addEventListener("change", ()=> onChange(inp.value));
  return wrap;
}

function riderCard(startPos, riderName, meta, highlights){
  const posCircle = el("div", { class:"fpPos" }, String(startPos));
  const nameEl = el("div", { class:"fpName" }, riderName || "—");
  const natEl = el("div", { class:"fpMeta" }, meta?.nat ? meta.nat : "—");
  const teamEl = el("div", { class:"fpMeta" }, meta?.team ? meta.team : "—");
  const ageEl = el("div", { class:"fpMeta" }, (meta?.age != null) ? `${meta.age} jaar` : "— jaar");

  const titlesRow = el("div", { class:"fpTitles" }, (highlights?.titles || []).map(t =>
    el("div", { class:"fpTitleChip" }, `${t.label} ${t.count}`)
  ));

  const lines = (highlights?.lines || []);
  const list = el("div", { class:"fpLines" }, lines.length
    ? lines.map(l => el("div", { class:"fpLine" }, l))
    : [el("div", { class:"fpLine fpLine--muted" }, "Geen topresultaten binnen de criteria.")]
  );

  return el("div", { class:"fpCard" }, [
    el("div", { class:"fpCard__top" }, [
      posCircle,
      el("div", { class:"fpCard__info" }, [nameEl, natEl, teamEl, ageEl])
    ]),
    titlesRow,
    list,
  ]);
}

export function mountFinalPresentation(root){
  clear(root);

  const results = getResults();
  const skaters = getSkaters();
  const wtNames = getWTNames();

  const nameMap = buildNameCanonicalMap(skaters);
  const metaMap = buildSkaterMetaMap(skaters);
  const wtTeamMap = buildWTTeamMap(wtNames);

  // Build skater list from Skaters (preferred), else from Results.
  const skaterList = (()=>{
    const fromSkaters = skaters
      .map(r => normStr(r.D ?? r.Naam ?? r.Name ?? r["Naam"] ?? r["Name"]))
      .filter(Boolean);
    if(fromSkaters.length) return fromSkaters;
    // fallback from results
    return results
      .map(r => canonicalizeName(normStr(r.Naam ?? r.Name ?? r["Naam"] ?? r["Name"]), nameMap))
      .filter(Boolean);
  })();

  const dlId = "fpSkatersList";
  const datalist = makeDatalist(dlId, skaterList);

  const state = {
    picks: Array.from({length:8}, ()=> ""),
    viewStart: 0, // 0..6 showing [i, i+1]
  };

  function getCardMeta(riderName){
    const canon = canonicalizeName(riderName, nameMap);
    const key = toLower(canon);
    const meta = metaMap.get(key) || {};
    const team = wtTeamMap.get(key) || "";
    const age = computeAge(meta.birthYear);
    return { nat: meta.nat, team, age };
  }

  function getHighlightsFor(riderName){
    if(!riderName) return { lines:[], titles:[{label:"OS",count:0},{label:"WK",count:0},{label:"EK",count:0},{label:"NK",count:0}] };
    const rows = getRiderResults(results, riderName, nameMap);
    return buildHighlights(rows);
  }

  const header = el("div", { class:"fpHeader" }, [
    el("div", { class:"fpHeader__title" }, "A Final presentation"),
  ]);

  const picksGrid = el("div", { class:"fpPicksGrid" });
  for(let i=0;i<8;i++){
    const lab = `Start ${i+1}`;
    const pick = smallSelectInput(lab, dlId, state.picks[i], (v)=>{ state.picks[i] = v; render(); }, "Typ om te zoeken…");
    picksGrid.appendChild(pick);
  }

  const nav = el("div", { class:"fpNav" });
  const btnPrev = el("button", { class:"btn fpNav__btn", type:"button" }, "←");
  const btnNext = el("button", { class:"btn fpNav__btn", type:"button" }, "→");
  const navText = el("div", { class:"fpNav__text" }, "");
  btnPrev.addEventListener("click", ()=>{ state.viewStart = Math.max(0, state.viewStart - 1); render(); });
  btnNext.addEventListener("click", ()=>{ state.viewStart = Math.min(6, state.viewStart + 1); render(); });
  nav.appendChild(btnPrev);
  nav.appendChild(navText);
  nav.appendChild(btnNext);

  const cardsRow = el("div", { class:"fpCardsRow" });

  function render(){
    // nav text
    const a = state.viewStart + 1;
    const b = state.viewStart + 2;
    navText.textContent = `Startpositie ${a} & ${b}`;

    // cards
    clear(cardsRow);
    const leftIdx = state.viewStart;
    const rightIdx = state.viewStart + 1;

    const riderLeft = state.picks[leftIdx];
    const riderRight = state.picks[rightIdx];

    const leftCanon = riderLeft ? canonicalizeName(riderLeft, nameMap) : "";
    const rightCanon = riderRight ? canonicalizeName(riderRight, nameMap) : "";

    const leftCard = riderCard(leftIdx+1, leftCanon || "—", getCardMeta(leftCanon), getHighlightsFor(leftCanon));
    const rightCard = riderCard(rightIdx+1, rightCanon || "—", getCardMeta(rightCanon), getHighlightsFor(rightCanon));

    cardsRow.appendChild(leftCard);
    cardsRow.appendChild(rightCard);

    // button disabled states
    btnPrev.disabled = state.viewStart === 0;
    btnNext.disabled = state.viewStart === 6;
  }

  root.appendChild(header);
  root.appendChild(datalist);
  root.appendChild(picksGrid);
  root.appendChild(nav);
  root.appendChild(cardsRow);

  render();
}

// Backwards-compatible export names (router variations)
export const mountFinalpresentation = mountFinalPresentation;
export const mountFinal = mountFinalPresentation;
