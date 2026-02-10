import { el, clear } from "../../core/dom.js";
import { router } from "../../core/router.js";

// Hardcoded users (not secure, just for the feeling)
const USERS = [
  { username: "Cees", password: "Stomwijk" },
  { username: "Sebas", password: "Opdemoter" },
  { username: "Justin", password: "Welkom01!" }
];

const SESSION_KEY = "silo6_session";

export function isLoggedIn(){
  const session = localStorage.getItem(SESSION_KEY);
  if(!session) return false;
  
  try {
    const data = JSON.parse(session);
    return data && data.username;
  } catch(e){
    return false;
  }
}

export function getCurrentUser(){
  const session = localStorage.getItem(SESSION_KEY);
  if(!session) return null;
  
  try {
    const data = JSON.parse(session);
    return data.username || null;
  } catch(e){
    return null;
  }
}

export function logout(){
  localStorage.removeItem(SESSION_KEY);
  router.go("login");
}

function authenticate(username, password){
  const user = USERS.find(u => 
    u.username.toLowerCase() === username.toLowerCase() && 
    u.password === password
  );
  
  if(user){
    localStorage.setItem(SESSION_KEY, JSON.stringify({ username: user.username }));
    return true;
  }
  
  return false;
}

export function mountLogin(root){
  clear(root);
  
  const container = el("div", { class:"login-container" });
  
  const card = el("div", { class:"login-card" }, [
    el("div", { class:"login-header" }, [
      el("h1", { class:"login-title" }, "SILO"),
      el("p", { class:"login-subtitle" }, "Sebastiaan's Information Layer & Orchestrationsystem")
    ]),
    
    el("div", { class:"login-form" }, [
      el("div", { class:"login-field" }, [
        el("label", { class:"login-label" }, "Gebruikersnaam"),
        el("input", { 
          type:"text", 
          class:"login-input", 
          id:"login-username",
          placeholder:"Voer gebruikersnaam in",
          autocomplete:"username"
        })
      ]),
      
      el("div", { class:"login-field" }, [
        el("label", { class:"login-label" }, "Wachtwoord"),
        el("input", { 
          type:"password", 
          class:"login-input", 
          id:"login-password",
          placeholder:"Voer wachtwoord in",
          autocomplete:"current-password"
        })
      ]),
      
      el("div", { class:"login-error", id:"login-error", style:"display:none;" }, "Onjuiste gebruikersnaam of wachtwoord"),
      
      el("button", { 
        type:"button", 
        class:"login-button",
        id:"login-submit"
      }, "Inloggen")
    ]),
    
    el("div", { class:"login-footer" }, [
      el("p", { class:"login-hint" }, "Tip: Probeer Cees, Sebas of Justin")
    ])
  ]);
  
  container.appendChild(card);
  root.appendChild(container);
  
  // Event handlers
  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const submitBtn = document.getElementById("login-submit");
  const errorDiv = document.getElementById("login-error");
  
  function attemptLogin(){
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    if(!username || !password){
      errorDiv.textContent = "Vul beide velden in";
      errorDiv.style.display = "block";
      return;
    }
    
    if(authenticate(username, password)){
      errorDiv.style.display = "none";
      router.go("home");
    } else {
      errorDiv.textContent = "Onjuiste gebruikersnaam of wachtwoord";
      errorDiv.style.display = "block";
      passwordInput.value = "";
      passwordInput.focus();
    }
  }
  
  submitBtn.addEventListener("click", attemptLogin);
  
  usernameInput.addEventListener("keypress", (e) => {
    if(e.key === "Enter"){
      passwordInput.focus();
    }
  });
  
  passwordInput.addEventListener("keypress", (e) => {
    if(e.key === "Enter"){
      attemptLogin();
    }
  });
  
  // Focus username field on load
  setTimeout(() => usernameInput.focus(), 100);
}
