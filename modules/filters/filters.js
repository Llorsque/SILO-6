import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { getExcel } from "../../core/excel.js";

// NOTE: Deze module vervangt 'Filters & parameters' inhoudelijk en wordt later
// gevuld met echte WT-klassementen. UI is alvast volgens repo-huisstijl.

const state = {
  gender: "men",
  tab: "overall",
  searchName: "",
  rows: [], // wordt later gevuld vanuit Excel (klassementen)
};

function normalize(str){
  return String(str ?? "").toLowerCase().trim();
}

function applySearch(rows){
  const q = normalize(state.searchName);
  if(!q) return rows;
  return rows.filter(r => normalize(r.name).includes(q));
}

function renderTable(tbody){
  tbody.innerHTML = "";
  const rows = applySearch(state.rows);

  if(!rows.length){
    tbody.appendChild(el("tr", {},
      el("td", { colspan:"4", style:"padding:18px 10px; color: rgba(255,255,255,.65); font-weight:800;" },
        state.rows.length
          ? "Geen resultaten voor je zoekopdracht."
          : "Klassementen worden nog aangeleverd."
      )
    ));
    return;
  }

  for(const r of rows){
    tbody.appendChild(el("tr", {},
      el("td", {}, r.rank ?? "—"),
      el("td", {}, r.name ?? "—"),
      el("td", {}, r.nat ?? "—"),
      el("td", {}, r.points ?? "—"),
    ));
  }
}

function mountUI(root){
  const excel = getExcel();
  const hasDataset = !!excel?.workbook;

  const searchInput = el("input", {
    class:"input",
    type:"search",
    placeholder:"Zoek rijder…",
    value: state.searchName,
    autocomplete:"off",
    oninput: (e)=>{
      state.searchName = e.target.value;
      renderTable(tbody);
    }
  });

  const genderRow = el("div", { class:"chipRow" },
    el("button", {
      class: `chip ${state.gender === "men" ? "chip--on" : ""}`,
      type:"button",
      onclick: ()=>{ state.gender = "men"; rerender(); }
    }, "Men"),
    el("button", {
      class: `chip ${state.gender === "women" ? "chip--on" : ""}`,
      type:"button",
      onclick: ()=>{ state.gender = "women"; rerender(); }
    }, "Women")
  );

  const tabs = [
    ["overall","Overall"],
    ["500","500m"],
    ["1000","1000m"],
    ["1500","1500m"],
    ["relay","Relay"],
    ["mixed","Mixed Relay"],
  ];

  const tabRow = el("div", { class:"chipRow" },
    ...tabs.map(([key,label]) =>
      el("button", {
        class: `chip ${state.tab === key ? "chip--on" : ""}`,
        type:"button",
        onclick: ()=>{ state.tab = key; rerender(); }
      }, label)
    )
  );

  const status = el("div", {
    class:"notice",
    style: hasDataset ? "" : "opacity:.85;"
  }, hasDataset
    ? "Dataset gekoppeld. Klassementen volgen zodra ze zijn aangeleverd."
    : "Upload eerst een Excel op Home om klassementen te kunnen tonen."
  );

  const thead = el("thead", {},
    el("tr", {},
      el("th", {}, "Rank"),
      el("th", {}, "Naam"),
      el("th", {}, "Nat."),
      el("th", {}, "Punten")
    )
  );

  const tbody = el("tbody", {});
  renderTable(tbody);

  const table = el("div", { class:"tableWrap wt-tableWrap" },
    el("table", { class:"dataTable wt-table" }, thead, tbody)
  );

  function rerender(){
    // Later: tab/gender wissel triggert data load; nu alleen UI update.
    mountFilters(root);
  }

  root.appendChild(sectionCard({
    title: "World Tour klassementen",
    subtitle: "Overall toont World Tour Classification. Kies Men/Women, afstand, en zoek op rijder.",
    children: [
      el("div", { class:"wt-header" },
        el("div", { class:"wt-left" }, genderRow, el("div", { style:"height:10px" }), tabRow),
        el("div", { class:"wt-right" },
          el("div", { class:"filterLabel" }, "Zoeken"),
          searchInput,
          el("div", { style:"height:10px" }),
          el("button", {
            class:"btn btn--ghost",
            type:"button",
            onclick: ()=>router.go("home")
          }, "Terug naar menu")
        )
      ),
      el("div", { style:"height:12px" }),
      status,
      el("div", { style:"height:12px" }),
      table
    ]
  }));
}

export function mountFilters(root){
  clear(root);
  mountUI(root);
}
