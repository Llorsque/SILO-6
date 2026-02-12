import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { loadDataset, loadMeta } from "../../core/storage.js";

function chip(label, active, onClick){
  const b = el("button", { type:"button", class: active ? "chip chip--on" : "chip" }, label);
  b.addEventListener("click", onClick);
  return b;
}

function normalizeSpaces(s){ return String(s ?? "").replace(/\s+/g, " ").trim(); }

function uniqSorted(arr){
  return Array.from(new Set(arr.filter(Boolean))).sort((a,b) => 
    typeof a === "string" ? a.localeCompare(b) : a - b
  );
}

function normalizeSetToggle(set, key){
  if(set.has(key)) set.delete(key);
  else set.add(key);
}

function normalizeRunName(run){
  const str = String(run).toLowerCase().trim();
  if(str === "eindklassement") return null;
  if(str === "final a") return "Final A";
  if(str === "final b") return "Final B";
  return run;
}

function typeableDropdown({placeholder, value, options, onChange}){
  const wrap = el("div", { class:"dropdown" });
  const input = el("input", { class:"input", placeholder, value: value || "" });
  const list = el("div", { class:"dropdown__list" });

  let open = false;
  function renderList(){
    clear(list);
    const q = (input.value || "").toLowerCase().trim();
    const filtered = options.filter(o => o.toLowerCase().includes(q)).slice(0, 80);
    if(!filtered.length){
      list.appendChild(el("div", { class:"dropdown__item dropdown__item--muted" }, "Geen resultaten"));
      return;
    }
    for(const o of filtered){
      const it = el("div", { class:"dropdown__item" }, o);
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
  input.addEventListener("blur", ()=> setTimeout(()=>setOpen(false), 200));

  wrap.appendChild(input);
  wrap.appendChild(list);

  const cleanup = ()=>{ input.removeEventListener("blur", setOpen); };
  wrap.__cleanup = cleanup;

  return { wrap, cleanup };
}

export async function mountAnalytics(root){
  clear(root);

  const dataset = await loadDataset();
  const meta = loadMeta();

  if(!dataset || !dataset.results || !dataset.results.length){
    root.appendChild(sectionCard({
      title:"Rapportage & Analytics",
      subtitle:"Upload eerst een Excel met tabblad 'Results' en 'Skaters'.",
      children:[
        el("div", { class:"notice" }, "Geen dataset gekoppeld (of leeg). Ga terug naar Menu en upload je Excel."),
        el("div", { style:"height:10px" }),
        el("button", { class:"btn", type:"button", onclick:()=>router.go("home") }, "Terug naar menu")
      ]
    }));
    return;
  }

  const allRiders = uniqSorted((dataset.skaters || [])
    .map(r => (r.SKATERS ?? r["SKATERS"] ?? ""))
    .filter(Boolean));

  const allSeasons = uniqSorted(dataset.results.map(r => r.season).filter(Boolean));

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
  
  const runFilterOptions = [
    { key: "none", label: "None" },
    { key: "all", label: "All" },
    { key: "Final A", label: "Final A" },
    { key: "Final B", label: "Final B" }
  ];

  // State
  let reportType = "rider"; // "rider" or future: "distance", "season"
  let riderCount = 1;
  const selectedRiders = Array(7).fill("");
  const tSet = new Set();
  const dSet = new Set();
  const ySet = new Set();
  let runFilter = "none";
  const cleanupFns = [];

  const configWrap = el("div", { class:"analytics-config" });
  const previewWrap = el("div", { class:"analytics-preview" });

  function hasAnyFilters(){
    return tSet.size > 0 || dSet.size > 0 || ySet.size > 0 || runFilter !== "none";
  }

  function activeFiltersSummary(){
    const t = tSet.size ? Array.from(tSet).map(k => (k==="WC" ? "WC/WT" : k)).join(", ") : "Geen";
    const d = dSet.size ? Array.from(dSet).join(", ") : "Geen";
    const y = ySet.size ? Array.from(ySet).sort((a,b)=>b-a).join(", ") : "Geen";
    const r = runFilter !== "none" ? runFilter : "Geen";
    return `Toernooi: ${t}  |  Afstand: ${d}  |  Seizoen: ${y}  |  Run: ${r}`;
  }

  function filterData(){
    return dataset.results.filter(r => {
      // Tournament
      if(tSet.size > 0 && !tSet.has(r.tournamentShort)) return false;
      // Distance
      if(dSet.size > 0 && !dSet.has(r.distance)) return false;
      // Season
      if(ySet.size > 0 && !ySet.has(r.season)) return false;
      // Run
      if(runFilter !== "none"){
        const normalized = normalizeRunName(r.runKey);
        if(runFilter === "all" && normalized === null) return false;
        if(runFilter === "Final A" && normalized !== "Final A") return false;
        if(runFilter === "Final B" && normalized !== "Final B") return false;
      }
      return true;
    });
  }

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
    
    // Consistency score (inverse of standard deviation, scaled 0-10)
    const consistency = (() => {
      if(positions.length < 3) return null;
      const mean = avgPos;
      const variance = positions.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / positions.length;
      const stdDev = Math.sqrt(variance);
      const score = Math.max(0, 10 - stdDev);
      return score;
    })();

    // Recent form (last 5 races)
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
      name: riderName,
      totalRaces,
      podiums,
      golds,
      silvers,
      bronzes,
      bestPos,
      avgPos,
      podiumRate,
      consistency,
      recentForm: recent,
      results: riderResults
    };
  }

  function generateRiderReport(){
    clear(previewWrap);

    const chosen = selectedRiders.slice(0, riderCount).filter(Boolean);
    
    if(chosen.length === 0){
      previewWrap.appendChild(el("div", { class:"notice" }, "Selecteer minimaal 1 rijder om een rapport te genereren."));
      return;
    }

    if(!hasAnyFilters()){
      previewWrap.appendChild(el("div", { class:"notice" }, "Selecteer minimaal één filter om een rapport te genereren."));
      return;
    }

    const filteredData = filterData();
    const stats = chosen.map(name => calculateRiderStats(name, filteredData));

    // Generate report HTML
    const reportContent = el("div", { class:"report-content", id:"report-content" }, [
      // Header
      el("div", { class:"report-header" }, [
        el("h1", { class:"report-title" }, "📊 Rijder Performance Analyse"),
        el("div", { class:"report-meta" }, [
          el("div", {}, `Gegenereerd: ${new Date().toLocaleDateString("nl-NL")}`),
          el("div", {}, `Dataset: ${meta?.name || "SILO-6"}`),
          el("div", {}, activeFiltersSummary())
        ])
      ]),

      el("div", { class:"report-divider" }),

      // Executive Summary
      el("div", { class:"report-section" }, [
        el("h2", { class:"report-section-title" }, "1. Samenvatting"),
        el("div", { class:"report-riders-list" }, 
          chosen.map((name, i) => el("div", {}, `• ${name} (${stats[i].totalRaces} races)`))
        )
      ]),

      el("div", { class:"report-divider" }),

      // Statistics for each rider
      ...stats.map((s, idx) => [
        el("div", { class:"report-section" }, [
          el("h2", { class:"report-section-title" }, `${idx + 2}. ${s.name}`),
          
          // Key stats grid
          el("div", { class:"report-stats-grid" }, [
            el("div", { class:"report-stat-card" }, [
              el("div", { class:"report-stat-label" }, "Totaal Races"),
              el("div", { class:"report-stat-value" }, String(s.totalRaces))
            ]),
            el("div", { class:"report-stat-card" }, [
              el("div", { class:"report-stat-label" }, "Podium Finishes"),
              el("div", { class:"report-stat-value" }, `${s.podiums} (${s.podiumRate.toFixed(1)}%)`)
            ]),
            el("div", { class:"report-stat-card" }, [
              el("div", { class:"report-stat-label" }, "🥇 Goud"),
              el("div", { class:"report-stat-value" }, String(s.golds))
            ]),
            el("div", { class:"report-stat-card" }, [
              el("div", { class:"report-stat-label" }, "🥈 Zilver"),
              el("div", { class:"report-stat-value" }, String(s.silvers))
            ]),
            el("div", { class:"report-stat-card" }, [
              el("div", { class:"report-stat-label" }, "🥉 Brons"),
              el("div", { class:"report-stat-value" }, String(s.bronzes))
            ]),
            el("div", { class:"report-stat-card" }, [
              el("div", { class:"report-stat-label" }, "Beste Positie"),
              el("div", { class:"report-stat-value" }, s.bestPos ? String(s.bestPos) : "—")
            ]),
            el("div", { class:"report-stat-card" }, [
              el("div", { class:"report-stat-label" }, "Gemiddelde Positie"),
              el("div", { class:"report-stat-value" }, s.avgPos ? s.avgPos.toFixed(1) : "—")
            ]),
            el("div", { class:"report-stat-card" }, [
              el("div", { class:"report-stat-label" }, "Consistentie"),
              el("div", { class:"report-stat-value" }, s.consistency ? `${s.consistency.toFixed(1)}/10` : "—")
            ])
          ]),

          // Recent form
          el("div", { class:"report-subsection" }, [
            el("h3", { class:"report-subsection-title" }, "Recente Vorm (laatste 5 races)"),
            el("div", { class:"report-recent-form" }, s.recentForm.join(" — "))
          ]),

          // Detailed results table
          el("div", { class:"report-subsection" }, [
            el("h3", { class:"report-subsection-title" }, "Gedetailleerde Resultaten"),
            createResultsTable(s.results)
          ])
        ]),

        el("div", { class:"report-divider" })
      ]).flat()
    ]);

    // Action buttons
    const actions = el("div", { class:"report-actions" }, [
      el("button", { 
        class:"btn btn--primary", 
        type:"button",
        onclick: () => downloadPDF()
      }, "📥 Download PDF"),
      el("button", { 
        class:"btn", 
        type:"button",
        onclick: () => window.print()
      }, "🖨️ Print")
    ]);

    previewWrap.appendChild(actions);
    previewWrap.appendChild(el("div", { style:"height:16px" }));
    previewWrap.appendChild(reportContent);
  }

  function createResultsTable(results){
    const sorted = results.sort((a, b) => {
      const da = a.dateISO ? new Date(a.dateISO).getTime() : 0;
      const db = b.dateISO ? new Date(b.dateISO).getTime() : 0;
      return db - da;
    });

    const table = el("table", { class:"report-table" });
    
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

      const row = el("tr", { class: isPodium ? "report-table-podium" : "" }, [
        el("td", null, r.datum || "—"),
        el("td", null, r.tournamentShort || "—"),
        el("td", null, r.locatie || "—"),
        el("td", null, r.distance || "—"),
        el("td", null, r.runKey || "—"),
        el("td", null, pos ? `${medalIcon} ${pos}` : "—"),
        el("td", null, r.opmerking && r.opmerking !== "-" ? r.opmerking : "")
      ]);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    return table;
  }

  function downloadPDF(){
    // Check if jsPDF is available
    if(typeof window.jspdf === "undefined"){
      alert("PDF bibliotheek wordt geladen. Probeer het opnieuw over 2 seconden.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    const content = document.getElementById("report-content");
    if(!content){
      alert("Rapport niet gevonden. Genereer eerst een rapport.");
      return;
    }

    doc.html(content, {
      callback: function(doc){
        doc.save(`SILO6-Rapport-${new Date().toISOString().split('T')[0]}.pdf`);
      },
      x: 10,
      y: 10,
      width: 190,
      windowWidth: 800
    });
  }

  function render(){
    // Cleanup prior dropdowns
    for(const fn of cleanupFns.splice(0)) try{ fn(); }catch(_){}

    clear(configWrap);

    // Report type selection (future expansion)
    const typeSelector = el("div", { class:"report-type-selector" }, [
      el("div", { class:"filter-label", style:"margin-bottom:8px" }, "Rapport Type"),
      el("div", { class:"chip-row" }, [
        chip("Rijder Analyse", reportType === "rider", () => {
          reportType = "rider";
          render();
        }),
        chip("Afstand Analyse", reportType === "distance", () => {
          alert("Nog niet beschikbaar");
        }, true),
        chip("Seizoen Overzicht", reportType === "season", () => {
          alert("Nog niet beschikbaar");
        }, true)
      ])
    ]);

    // Rider count selector
    const countSel = el("select", { class:"input input--sm" });
    [1,2,3,4,5,6,7].forEach(n => countSel.appendChild(el("option", { value:String(n) }, String(n))));
    countSel.value = String(riderCount);
    countSel.addEventListener("change", ()=>{
      riderCount = Number(countSel.value) || 1;
      render();
    });

    const riderCountRow = el("div", { class:"config-row" }, [
      el("div", { class:"filter-label" }, "Aantal Rijders"),
      countSel
    ]);

    // Rider selection dropdowns
    const riderRow = el("div", { class:"rider-select-grid" });
    for(let i = 0; i < riderCount; i++){
      const dd = typeableDropdown({
        placeholder: `Rijder ${i+1}...`,
        value: selectedRiders[i] || "",
        options: ["", ...allRiders],
        onChange: (v)=>{ selectedRiders[i] = v === "" ? "" : v; generateRiderReport(); }
      });
      cleanupFns.push(dd.cleanup);
      riderRow.appendChild(dd.wrap);
    }

    // Filters
    const filtersCard = el("div", { class:"filters-card" }, [
      el("div", { class:"filter-label", style:"margin-bottom:12px" }, "Filters"),

      // Tournament
      el("div", { class:"filter-group", style:"margin-top:10px" }, [
        el("div", { class:"filter-label" }, "Toernooi"),
        el("div", { class:"chip-row" }, [
          chip("All", tSet.size === tournaments.length, ()=>{
            if(tSet.size === tournaments.length){
              tSet.clear();
            }else{
              tSet.clear();
              tournaments.forEach(t => tSet.add(t.key));
            }
            render();
            generateRiderReport();
          }),
          ...tournaments.map(t =>
            chip(t.label, tSet.has(t.key), ()=>{
              normalizeSetToggle(tSet, t.key);
              render();
              generateRiderReport();
            })
          )
        ])
      ]),

      // Distance
      el("div", { class:"filter-group", style:"margin-top:10px" }, [
        el("div", { class:"filter-label" }, "Afstand"),
        el("div", { class:"chip-row" }, [
          chip("All", dSet.size === distances.length, ()=>{
            if(dSet.size === distances.length){
              dSet.clear();
            }else{
              dSet.clear();
              distances.forEach(d => dSet.add(d.key));
            }
            render();
            generateRiderReport();
          }),
          ...distances.map(d =>
            chip(d.label, dSet.has(d.key), ()=>{
              normalizeSetToggle(dSet, d.key);
              render();
              generateRiderReport();
            })
          )
        ])
      ]),

      // Season
      el("div", { class:"filter-group", style:"margin-top:10px" }, [
        el("div", { class:"filter-label" }, "Seizoen"),
        el("div", { class:"chip-row" }, [
          chip("All", ySet.size === allSeasons.length, ()=>{
            if(ySet.size === allSeasons.length){
              ySet.clear();
            }else{
              ySet.clear();
              allSeasons.forEach(y => ySet.add(y));
            }
            render();
            generateRiderReport();
          }),
          ...allSeasons.slice().sort((a,b)=>b-a).map(y =>
            chip(String(y), ySet.has(y), ()=>{
              normalizeSetToggle(ySet, y);
              render();
              generateRiderReport();
            })
          )
        ])
      ]),

      // Run filter
      el("div", { class:"filter-group", style:"margin-top:10px" }, [
        el("div", { class:"filter-label" }, "Run"),
        el("div", { class:"chip-row" }, runFilterOptions.map(opt =>
          chip(opt.label, runFilter === opt.key, ()=>{
            runFilter = opt.key;
            render();
            generateRiderReport();
          })
        ))
      ])
    ]);

    // Generate button
    const generateBtn = el("button", {
      class:"btn btn--primary btn--large",
      type:"button",
      onclick: generateRiderReport
    }, "🔍 Genereer Rapport");

    configWrap.appendChild(typeSelector);
    configWrap.appendChild(el("div", { style:"height:16px" }));
    configWrap.appendChild(riderCountRow);
    configWrap.appendChild(el("div", { style:"height:12px" }));
    configWrap.appendChild(riderRow);
    configWrap.appendChild(el("div", { style:"height:16px" }));
    configWrap.appendChild(filtersCard);
    configWrap.appendChild(el("div", { style:"height:16px" }));
    configWrap.appendChild(generateBtn);
  }

  root.appendChild(sectionCard({
    title:"Rapportage & Analytics",
    subtitle:"Genereer gedetailleerde performance rapporten voor individuele rijders.",
    children:[
      configWrap,
      el("div", { style:"height:24px" }),
      previewWrap
    ]
  }));

  // Load jsPDF library dynamically
  if(typeof window.jspdf === "undefined"){
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    document.head.appendChild(script);
  }

  render();
}
