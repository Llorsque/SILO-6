import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";

export async function mountAnalytics(root){
  clear(root);
  
  root.appendChild(sectionCard({
    title:"Analytics Module TEST",
    subtitle:"If you can see this, the module is loading correctly!",
    children:[
      el("div", { 
        style:"background:lime;color:black;padding:20px;font-size:24px;font-weight:900;text-align:center;border-radius:8px" 
      }, "✓✓✓ MODULE WORKS! ✓✓✓"),
      el("div", { style:"height:20px" }),
      el("div", { class:"notice" }, "The analytics.js file is in the correct location and loading properly."),
      el("div", { style:"height:10px" }),
      el("button", { class:"btn", type:"button", onclick:()=>router.go("home") }, "Back to Home")
    ]
  }));
}
