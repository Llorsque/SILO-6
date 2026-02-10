class Router{
  constructor(){
    this.routes = new Map();
    this.authGuard = null; // Function to check if user is logged in
    window.addEventListener("hashchange", () => this._render());
  }
  register(name, fn){ this.routes.set(name, fn); }
  setAuthGuard(fn){ this.authGuard = fn; }
  go(name){
    const target = name || "home";
    if(location.hash.replace("#","") === target) this._render();
    else location.hash = target;
  }
  start(){
    if(!location.hash) location.hash = "home";
    this._render();
  }
  _render(){
    const key = location.hash.replace("#","") || "home";
    
    // Check authentication for non-login routes
    if(key !== "login" && this.authGuard && !this.authGuard()){
      location.hash = "login";
      return;
    }
    
    // If logged in and trying to access login page, redirect to home
    if(key === "login" && this.authGuard && this.authGuard()){
      location.hash = "home";
      return;
    }
    
    const fn = this.routes.get(key) || this.routes.get("home");
    if(fn) fn();
  }
}
export const router = new Router();
