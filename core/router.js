class Router{
  constructor(){
    this.routes = new Map();
    window.addEventListener("hashchange", () => this._render());
  }
  register(name, fn){ this.routes.set(name, fn); }
  go(name){
    const target = name || "home";
    if(location.hash.replace("#","") === target) this._render();
    else location.hash = target;
  }
  start(){
    // Global access gate (client-side): require login before any page.
    // NOTE: This is a UI gate only (GitHub Pages is static), not a secure auth system.
    if(!location.hash) location.hash = "home";
    const key = location.hash.replace("#", "") || "home";
    if(!this._isAuthed() && key !== "login") location.hash = "login";
    if(this._isAuthed() && key === "login") location.hash = "home";
    this._render();
  }
  _render(){
    const key = location.hash.replace("#","") || "home";

    // Gate everything behind login, except the login route itself.
    if(!this._isAuthed() && key !== "login"){
      if(location.hash !== "#login") location.hash = "login";
      return;
    }
    if(this._isAuthed() && key === "login"){
      if(location.hash !== "#home") location.hash = "home";
      return;
    }

    const fn = this.routes.get(key) || this.routes.get("home");
    if(fn) fn();
  }

  _isAuthed(){
    try{
      return sessionStorage.getItem("silo_auth") === "1";
    }catch{
      return false;
    }
  }
}
export const router = new Router();
