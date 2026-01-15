// Module CSS isolation: load only the active module stylesheet (if present).
// Any module CSS MUST be scoped under `.mod--<moduleKey>` to avoid bleeding,
// but we also physically unload previous module stylesheets as an extra safety net.

export function unloadAllModuleCss(){
  document.querySelectorAll('link[data-silo-module-css="1"]').forEach(l => l.remove());
}

export function ensureModuleCss(moduleKey){
  const id = `silo-modcss-${moduleKey}`;
  if(document.getElementById(id)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `./modules/${moduleKey}/${moduleKey}.css`;
  link.id = id;
  link.setAttribute("data-silo-module-css", "1");
  link.setAttribute("data-module", moduleKey);

  // If the file doesn't exist, GitHub Pages will 404 – that's OK; it won't crash the app.
  document.head.appendChild(link);
}
