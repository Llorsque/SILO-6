import { el, clear } from "../../core/dom.js";
import { sectionCard } from "../../core/layout.js";
import { router } from "../../core/router.js";

const VALID_USER = "Justin";
const VALID_PASS = "Welkom01!";

function setAuthed(){
  try{ sessionStorage.setItem("silo_auth", "1"); }catch{}
}

export function mountLogin(root){
  clear(root);

  const user = el("input", { class:"input", type:"text", autocomplete:"username", placeholder:"Gebruikersnaam" });
  const pass = el("input", { class:"input", type:"password", autocomplete:"current-password", placeholder:"Wachtwoord" });
  const msg = el("div", { class:"notice", style:"display:none" });

  const submit = () => {
    const u = (user.value || "").trim();
    const p = (pass.value || "");

    if(u === VALID_USER && p === VALID_PASS){
      setAuthed();
      router.go("home");
      return;
    }

    msg.style.display = "block";
    msg.textContent = "Onjuiste inloggegevens.";
  };

  const btn = el("button", { class:"btn", type:"button" }, "Inloggen");
  btn.addEventListener("click", submit);

  [user, pass].forEach(inp => {
    inp.addEventListener("keydown", (e) => {
      if(e.key === "Enter") submit();
    });
  });

  root.appendChild(sectionCard({
    title: "Inloggen",
    subtitle: "Voer je gebruikersnaam en wachtwoord in om SILO te openen.",
    children: [
      el("div", { class:"loginForm" }, [
        el("label", { class:"label" }, "Gebruikersnaam"),
        user,
        el("div", { style:"height:10px" }),
        el("label", { class:"label" }, "Wachtwoord"),
        pass,
        el("div", { style:"height:14px" }),
        el("div", { class:"row" }, [btn]),
        el("div", { style:"height:10px" }),
        msg
      ])
    ]
  }));
}
