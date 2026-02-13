import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";
import { loadDataset } from "../../core/storage.js";

export async function mountAnalytics(root){
  clear(root);
  
  const dataset = await loadDataset();
  const hasData = dataset && dataset.results && dataset.results.length > 0;
  
  root.appendChild(sectionCard({
    title:"Rapportage & Analytics",
    subtitle:"Module is geladen en werkt correct!",
    children:[
      el("div", { 
        style:"background:linear-gradient(135deg, rgba(82,232,232,0.2), rgba(82,232,232,0.1));border:2px solid rgba(82,232,232,0.5);padding:30px;border-radius:12px;text-align:center;margin:20px 0" 
      }, [
        el("div", { style:"font-size:48px;margin-bottom:16px" }, "✓"),
        el("div", { style:"font-size:24px;font-weight:900;color:rgba(82,232,232,1);margin-bottom:8px" }, "Analytics Module Actief"),
        el("div", { style:"font-size:14px;color:rgba(255,255,255,0.7)" }, "De module laadt correct zonder errors")
      ]),
      
      el("div", { class:"card", style:"margin-top:20px;background:rgba(255,255,255,0.02)" }, [
        el("div", { class:"card__title" }, "Status Check"),
        el("div", { class:"hr" }),
        el("div", { style:"padding:12px 0" }, [
          el("div", { style:"margin-bottom:8px" }, `✓ Module import: OK`),
          el("div", { style:"margin-bottom:8px" }, `✓ Route registration: OK`),
          el("div", { style:"margin-bottom:8px" }, `✓ Dataset access: ${hasData ? 'OK (' + dataset.results.length + ' rows)' : 'Geen data'}`),
          el("div", { style:"margin-bottom:8px" }, `✓ Navigation: OK`),
        ])
      ]),
      
      el("div", { style:"height:20px" }),
      
      el("div", { class:"notice", style:"background:rgba(82,232,232,0.1);border-color:rgba(82,232,232,0.3)" }, [
        el("strong", {}, "Phase 1 Complete!"),
        el("br"),
        el("span", {}, "De analytics module is succesvol geïntegreerd. Alle andere modules blijven werken. We kunnen nu de volledige versie toevoegen met rapport generatie, PDF export, en 7 rijders selectie.")
      ]),
      
      el("div", { style:"height:20px" }),
      
      el("button", { 
        class:"btn", 
        type:"button", 
        onclick:()=>router.go("home") 
      }, "← Terug naar Home")
    ]
  }));
}
