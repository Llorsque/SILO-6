import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { importExcelFile } from "../../core/excel.js";
import { loadMeta, clearDataset } from "../../core/storage.js";

function menuBtn(title, desc, route){
  const children = [el("div", { class:"menuBtn__title" }, title)];
  if(desc) children.push(el("div", { class:"menuBtn__desc" }, desc));
  const b = el("div", { class:"menuBtn", role:"button", tabindex:"0" }, children);
  const go = () => router.go(route);
  b.addEventListener("click", go);
  b.addEventListener("keydown", (e)=>{ if(e.key==="Enter"||e.key===" ") go(); });
  return b;
}

export function mountHome(root){
  clear(root);

  const meta = loadMeta();

  const hasDataset = !!(meta && meta.rowCounts && meta.rowCounts.results);

  const fileInput = el("input", { type:"file", accept:".xlsx,.xls", class:"input" });
  const btnUpload = el("button", { class:"btn", type:"button" }, "Upload Excel (results)");
  const btnClear = el("button", { class:"btn", type:"button" }, "Ontkoppel / verwijderen");

  const statusText = hasDataset
    ? `Dataset gekoppeld: ${meta.fileName || "(onbekend bestand)"}`
    : "Geen dataset gekoppeld.";
  const status = el("div", { style:"color:var(--muted); font-size:12px" }, statusText);

  btnUpload.addEventListener("click", ()=> fileInput.click());
  fileInput.addEventListener("change", async ()=>{
    const f = fileInput.files?.[0];
    if(!f) return;
    try{
      await importExcelFile(f);
      router.go("home");
    }catch(err){
      alert(err?.message || String(err));
    }finally{
      fileInput.value = "";
    }
  });

  btnClear.addEventListener("click", async ()=>{
    await clearDataset();
    router.go("home");
  });

  const controls = el("div", { class:"card", style:"margin-bottom:14px" }, [
    el("div", { class:"card__title" }, "Dataset"),
    el("div", { class:"card__sub" }, "Upload/ontkoppel (modules vullen we later)."),
    el("div", { class:"hr" }),
    el("div", { class:"row" }, [
      fileInput,
      el("div", { class:"row" }, [btnUpload, btnClear]),
      el("div", { class:"spacer" }),
    ]),
    el("div", { style:"height:8px" }),
    status
  ]);

  const btnDesc = hasDataset ? "" : "Nog leeg";

  const grid = el("div", { class:"menuGrid" }, [
    menuBtn("Dashboard", btnDesc, "dashboard"),
    menuBtn("Filters & parameters", btnDesc, "filters"),
    menuBtn("Head-to-Head", btnDesc, "headtohead"),
    menuBtn("Kampioenen", btnDesc, "champions"),
    menuBtn("Biografie", btnDesc, "biography"),
    menuBtn("A Final presentation", btnDesc, "finalpresentation"),
  ]);

  root.appendChild(controls);
  root.appendChild(sectionCard({
    title:"Modules",
    subtitle:"Klik om naar een module te gaan (inhoud volgt later).",
    children:[grid]
  }));
}
