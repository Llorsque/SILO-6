import { router } from "./router.js";
import { el, clear } from "./dom.js";
import { unloadAllModuleCss, ensureModuleCss } from "./module_css.js";

import { mountHome } from "../modules/home/home.js";
import { mountLogin } from "../modules/login/login.js";
import { mountDashboard } from "../modules/dashboard/dashboard.js";
import { mountFilters } from "../modules/filters/filters.js";
import { mountHeadToHead } from "../modules/headtohead/headtohead.js";
import { mountChampions } from "../modules/champions/champions.js";
import { mountBiography } from "../modules/biography/biography.js";
import { mountSettings } from "../modules/settings/settings.js";
import { mountFinalPresentation } from "../modules/finalpresentation/finalpresentation.js";

const appRoot = document.getElementById("appRoot");

function mountIntoShell(routeKey, mountFn){
  // Hard isolation rule: module changes must not affect other modules.
  // We enforce this by:
  // 1) Clearing the mount root
  // 2) Mounting into a scoped wrapper `.mod--<routeKey>`
  // 3) Unloading previous module css and loading only this module css
  unloadAllModuleCss();
  ensureModuleCss(routeKey);

  clear(appRoot);
  const modRoot = el("div", { class: `mod mod--${routeKey}`, "data-module": routeKey });
  appRoot.appendChild(modRoot);

  return mountFn(modRoot);
}

function showCrash(routeKey, err){
  console.error("[SILO] Module crash:", routeKey, err);
  clear(appRoot);
  appRoot.appendChild(el("div", { class:"card" }, [
    el("div", { class:"card__title" }, "Module crash"),
    el("div", { class:"card__sub" }, `Route: ${routeKey}`),
    el("div", { class:"hr" }),
    el("pre", { class:"notice", style:"white-space:pre-wrap" }, (err?.stack || String(err)))
  ]));
}

function safeMount(mountFn, routeKey){
  return () => {
    try{
      const out = mountIntoShell(routeKey, mountFn);
      if(out && typeof out.then === "function"){
        out.catch((err) => showCrash(routeKey, err));
      }
    }catch(err){
      showCrash(routeKey, err);
    }
  };
}

router.register("home", safeMount(mountHome, "home"));
router.register("login", safeMount(mountLogin, "login"));
router.register("dashboard", safeMount(mountDashboard, "dashboard"));
router.register("filters", safeMount(mountFilters, "filters"));
router.register("headtohead", safeMount(mountHeadToHead, "headtohead"));
router.register("champions", safeMount(mountChampions, "champions"));
router.register("biography", safeMount(mountBiography, "biography"));
router.register("finalpresentation", safeMount(mountFinalPresentation, "finalpresentation"));
router.register("settings", safeMount(mountSettings, "settings"));

document.getElementById("btnGoHome")?.addEventListener("click", () => router.go("home"));
document.getElementById("btnGoSettings")?.addEventListener("click", () => router.go("settings"));

router.start();
