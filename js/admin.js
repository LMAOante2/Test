document.addEventListener("DOMContentLoaded", () => {
  const adminLogin = document.getElementById("adminLogin");
  const adminContent = document.getElementById("adminContent");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const addLinkBtn = document.getElementById("addLinkBtn");
  const addSponsorBtn = document.getElementById("addSponsorBtn");
  const adminContainer = document.getElementById("adminLinks");
  const sponsorContainer = document.getElementById("adminSponsors");
  const adminEmail = document.getElementById("adminEmail");
  const adminPassword = document.getElementById("adminPassword");

  let links = [];
  let sponsors = [];

  auth.onAuthStateChanged(user => {
    if (user) {
      adminLogin.style.display = "none";
      adminContent.style.display = "block";
      attachDbListener();
    } else {
      adminLogin.style.display = "flex";
      adminContent.style.display = "none";
      detachDbListener();
    }
  });

  function attachDbListener() {
    db.ref("links").on("value", snapshot => {
      links = normalizeLinks(snapshot.val());
      renderAdminLinks();
    });

    db.ref("sponsors").on("value", snapshot => {
      sponsors = normalizeLinks(snapshot.val());
      renderSponsors();
    });
  }

  function detachDbListener() {
    db.ref("links").off("value");
    db.ref("sponsors").off("value");
  }

  function normalizeLinks(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data.filter(Boolean);
    const keys = Object.keys(data).sort((a,b)=> Number(a)-Number(b));
    return keys.map(k => data[k]);
  }

  loginBtn.addEventListener("click", () => {
    const email = adminEmail.value.trim();
    const pw = adminPassword.value;
    if (!email || !pw) {
      document.getElementById("error-text").innerHTML = "Please enter email and password.";
      return;
    }
    auth.signInWithEmailAndPassword(email, pw)
      .catch(err => alert("Login failed: " + err.message));
  });

  logoutBtn.addEventListener("click", () => auth.signOut());

  function saveLinks() {
    const data = {};
    links.forEach((link,i)=>data[i]=link);
    db.ref("links").set(data);
  }

  function saveSponsors() {
    const data = {};
    sponsors.forEach((s,i)=>data[i]=s);
    db.ref("sponsors").set(data);
  }

  function renderAdminLinks() {
    adminContainer.innerHTML = "";
    links.forEach((link, i) => {
      const div = document.createElement("div");
      div.className = "admin-link";
      div.draggable = true;
      div.dataset.index = i;

      div.innerHTML = `
        <input class="icon" value="${link.icon || ''}" placeholder="Icon / Image URL">
        <input class="label" value="${link.name || ''}" placeholder="Label">
        <input class="url" value="${link.url || ''}" placeholder="URL">
        <button class="del">❌</button>
      `;

      const iconInput = div.querySelector(".icon");
      const labelInput = div.querySelector(".label");
      const urlInput = div.querySelector(".url");
      const delBtn = div.querySelector(".del");

      iconInput.addEventListener("blur", () => updateLink(i, "icon", iconInput.value));
      labelInput.addEventListener("blur", () => updateLink(i, "name", labelInput.value));
      urlInput.addEventListener("blur", () => updateLink(i, "url", urlInput.value));
      delBtn.addEventListener("click", () => deleteLink(i));

      div.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", i);
        div.classList.add("dragging");
      });
      div.addEventListener("dragend", () => div.classList.remove("dragging"));
      div.addEventListener("dragover", e => e.preventDefault());
      div.addEventListener("drop", e => {
        const fromIndex = Number(e.dataTransfer.getData("text/plain"));
        const toIndex = Number(div.dataset.index);
        swapLinks(fromIndex, toIndex);
        saveLinks();
      });

      adminContainer.appendChild(div);
    });
  }

  function renderSponsors() {
    sponsorContainer.innerHTML = "";
    sponsors.forEach((s, i) => {
      const div = document.createElement("div");
      div.className = "admin-link";

      div.innerHTML = `
        <input class="icon" value="${s.icon || ''}" placeholder="Sponsor Logo URL">
        <input class="label" value="${s.name || ''}" placeholder="Sponsor Name">
        <input class="url" value="${s.url || ''}" placeholder="Sponsor URL">
        <button class="del">❌</button>
      `;

      div.querySelector(".icon").addEventListener("blur", e => {
        sponsors[i].icon = e.target.value;
        saveSponsors();
      });
      div.querySelector(".label").addEventListener("blur", e => {
        sponsors[i].name = e.target.value;
        saveSponsors();
      });
      div.querySelector(".url").addEventListener("blur", e => {
        sponsors[i].url = e.target.value;
        saveSponsors();
      });
      div.querySelector(".del").addEventListener("click", () => {
        sponsors.splice(i,1);
        saveSponsors();
        renderSponsors();
      });

      sponsorContainer.appendChild(div);
    });
  }

  function updateLink(i,key,value){
    if (!links[i]) return;
    links[i][key] = value;
    saveLinks();
  }

  function deleteLink(i){
    links.splice(i,1);
    saveLinks();
    renderAdminLinks();
  }

  function swapLinks(from,to){
    if(from===to) return;
    const item = links.splice(from,1)[0];
    links.splice(to,0,item);
    renderAdminLinks();
  }

  function addLink(){
    links.push({ icon:"", name:"", url:"" });
    saveLinks();
    renderAdminLinks();
  }

  function addSponsor(){
    sponsors.push({ icon:"", name:"", url:"" });
    saveSponsors();
    renderSponsors();
  }

  addLinkBtn.addEventListener("click", addLink);
  addSponsorBtn.addEventListener("click", addSponsor);
});

const home = document.querySelector(".home");
home.addEventListener("click", () => {
  window.location.href = "index.html";
});
