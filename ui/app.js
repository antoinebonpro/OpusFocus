"use strict";
/* Deep Work Focus — interface. Le moteur Python fait foi : on l'interroge chaque seconde. */

const TOKEN = document.querySelector('meta[name="token"]').content;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// --- Icônes (tracés Lucide) ------------------------------------------------------
const ICONS = {
  timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  bellOff: '<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  sparkle: '<path d="M9.94 14.06 4 20"/><path d="m12 3 1.9 5.8L20 10l-5.4 2.6L12 18l-1.9-5.4L4 10l6.1-1.2z"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
};
const icon = (name, cls = "i") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// --- Données statiques --------------------------------------------------------------
const PAGES = [
  { id: "session", label: "Session", icon: "timer" },
  { id: "apps", label: "Applications", icon: "grid" },
  { id: "sites", label: "Sites web", icon: "globe" },
  { id: "progress", label: "Progrès", icon: "chart" },
  { id: "ritual", label: "Fin de journée", icon: "moon" },
  { id: "rules", label: "Principes", icon: "book" },
];
const CATEGORIES = {
  social: "Réseaux et messagerie", games: "Jeux", media: "Vidéo et musique", browsers: "Navigateurs", other: "Autres",
};
const SUGGESTED = new Set(["social", "games", "media"]);
const SITE_CATALOG = {
  "Réseaux sociaux": ["facebook.com", "instagram.com", "x.com", "twitter.com", "tiktok.com", "snapchat.com", "linkedin.com", "pinterest.com", "reddit.com", "threads.net", "bsky.app"],
  "Vidéo et streaming": ["youtube.com", "netflix.com", "twitch.tv", "primevideo.com", "disneyplus.com", "crunchyroll.com", "dailymotion.com"],
  "Messagerie web": ["web.whatsapp.com", "messenger.com", "discord.com", "web.telegram.org"],
  "Actualités": ["lemonde.fr", "lefigaro.fr", "bfmtv.com", "francetvinfo.fr", "20minutes.fr", "liberation.fr", "news.google.com"],
  "Shopping": ["amazon.fr", "amazon.com", "leboncoin.fr", "vinted.fr", "aliexpress.com", "temu.com", "shein.com"],
};
const DURATIONS = [25, 50, 90, 120, 180];
const DEPTH_LABELS = ["Dispersé", "Distrait", "Correct", "Concentré", "Immersion"];
const QUOTES = [
  "Une heure de travail profond vaut mieux qu'une journée de travail dispersé.",
  "Ce qu'on accomplit, c'est le temps passé multiplié par l'intensité de la concentration.",
  "Ne fais pas de pauses dans ta concentration : fais des pauses dans la distraction.",
  "L'ennui n'est pas l'ennemi : c'est l'entraînement de ta concentration.",
  "Quand tu travailles, travaille dur. Quand tu as fini, arrête.",
  "Le travail profond est à la fois rare et précieux.",
];
const QUOTE = QUOTES[Math.floor(Math.random() * QUOTES.length)];

// --- État ----------------------------------------------------------------------------
let S = null;               // dernier instantané du moteur
let clockOffset = 0;        // écart horloge moteur / navigateur
let page = PAGES.some((p) => p.id === location.hash.slice(1)) ? location.hash.slice(1) : "session";
let installed = null;       // applications installées
let scanning = false;
let failures = 0;
let lastSessionKey = null;
let reviewShownFor = null;
const draft = { intention: "", minutes: null, custom: false, notif: true, apps: true, sites: null, lock: false, error: "" };
const appFilter = { q: "", cat: "all" };
const siteFilter = { q: "" };
const ritual = { checked: new Set(), editing: false };

const now = () => Date.now() + clockOffset;
const fmtClock = (ts) => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const fmtHours = (min) => { const h = min / 60; return h >= 10 ? h.toFixed(0) : h.toFixed(1).replace(".", ","); };
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-Token": TOKEN, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur inattendue.");
  return data;
}

let toastTimer;
function toast(msg, kind = "") {
  const t = $("#toast");
  t.className = `toast show ${kind}`;
  t.innerHTML = (kind === "error" ? icon("alert") : icon("check")) + `<span>${esc(msg)}</span>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), kind === "error" ? 4500 : 2200);
}

// --- Synchronisation avec le moteur ------------------------------------------------
async function poll() {
  try {
    const next = await api("/api/state");
    clockOffset = next.now * 1000 - Date.now();
    const prev = S;
    S = next;
    failures = 0;
    $("#offline").hidden = true;
    if (next.notice) toast(next.notice);
    const key = S.session ? `live:${S.session.start}` : "idle";
    const adminChanged = prev && prev.admin !== S.admin;
    if (!prev || key !== lastSessionKey || adminChanged) {
      lastSessionKey = key;
      if (adminChanged && S.admin) { draft.sites = true; toast("Mode administrateur actif : les sites peuvent être bloqués."); }
      renderNav();
      render();
    } else {
      renderSideStatus();
      if (page === "session" && S.session) updateLive();
    }
    if (S.review && reviewShownFor !== S.review.id) openReview(S.review);
  } catch {
    if (++failures >= 6) $("#offline").hidden = false;
  }
}

// --- Navigation ------------------------------------------------------------------------
function renderNav() {
  const counts = { apps: S.config.apps.length, sites: S.config.sites.length };
  $("#nav").innerHTML = PAGES.map((p) => `
    <a href="#${p.id}" title="${p.label}" ${p.id === page ? 'aria-current="page"' : ""}>
      ${icon(p.icon)}<span class="lbl">${p.label}</span>
      ${counts[p.id] !== undefined ? `<span class="count" aria-label="${counts[p.id]} sélectionnés">${counts[p.id]}</span>` : ""}
    </a>`).join("");
  renderSideStatus();
}

function renderSideStatus() {
  const box = $("#side-status");
  if (S.session) {
    const left = Math.max(0, S.session.end * 1000 - now());
    box.innerHTML = `<a class="status-card active" href="#session">
      <div class="label"><span class="dot on"></span>Protection active</div>
      <div class="value" id="side-time">${fmtRemaining(left)}</div></a>`;
  } else {
    const week = weekStats();
    box.innerHTML = `<a class="status-card" href="#progress">
      <div class="label"><span class="dot"></span>Cette semaine</div>
      <div class="value">${fmtHours(week.total)} h <span style="font-size:14px;color:var(--muted);font-weight:400">/ ${S.config.weekly_goal_hours} h</span></div></a>`;
  }
}

window.addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (!PAGES.some((p) => p.id === id)) return;
  page = id;
  renderNav();
  render();
  $("#main").focus({ preventScroll: true });
  $("#main").scrollTop = 0;
});

function render() {
  if (!S) return;
  const views = { session: viewSession, apps: viewApps, sites: viewSites, progress: viewProgress, ritual: viewRitual, rules: viewRules };
  $("#main").innerHTML = `<div class="page">${views[page]()}</div>`;
  const binders = { session: bindSession, apps: bindApps, sites: bindSites, progress: bindProgress, ritual: bindRitual };
  binders[page]?.();
}

// --- Session ---------------------------------------------------------------------------
function fmtRemaining(ms) {
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function viewSession() {
  if (S.session) return viewLive();
  const c = S.config;
  const minutes = draft.minutes ?? c.default_minutes ?? 90;
  if (draft.sites === null) draft.sites = S.admin;
  const custom = draft.custom || !DURATIONS.includes(minutes);
  const row = (key, ico, title, desc, opts = {}) => `
    <div class="toggle-row ${draft[key] && !opts.disabled ? "on" : ""} ${opts.disabled ? "disabled" : ""}">
      <div class="ico">${icon(ico)}</div>
      <div class="txt"><div class="title" id="t-${key}">${title}</div><div class="desc">${desc}</div></div>
      <button class="switch" role="switch" data-toggle="${key}" aria-labelledby="t-${key}"
        aria-checked="${draft[key] && !opts.disabled}" ${opts.disabled ? "disabled" : ""}></button>
    </div>`;
  const sitesDesc = S.admin
    ? `${plural(c.sites.length, "site sélectionné", "sites sélectionnés")} · <a class="link" href="#sites">Modifier</a>`
    : `Nécessite les droits administrateur · <button class="link" data-elevate>Activer</button>`;
  return `
    <header class="page-head">
      <p class="eyebrow">Nouvelle session</p>
      <h1>Sur quoi vas-tu te concentrer ?</h1>
      <p class="quote">« ${QUOTE} »</p>
    </header>
    <div class="stack">
      <section class="card">
        <label class="field-label" for="intention">Ton intention</label>
        <input id="intention" class="input big ${draft.error ? "invalid" : ""}" maxlength="200" autocomplete="off"
          placeholder="Ex. : rédiger l'introduction du mémoire" value="${esc(draft.intention)}"
          aria-describedby="intention-help" ${draft.error ? 'aria-invalid="true"' : ""}>
        ${draft.error ? `<div class="error-text" id="intention-help">${icon("alert")}${esc(draft.error)}</div>`
                      : `<div class="helper" id="intention-help">Une seule tâche, précise et réalisable dans la session.</div>`}
      </section>
      <section class="card">
        <span class="field-label" id="dur-label">Durée</span>
        <div class="segmented" role="group" aria-labelledby="dur-label">
          ${DURATIONS.map((m) => `<button data-min="${m}" aria-pressed="${!custom && m === minutes}">${m}<small> min</small></button>`).join("")}
          <button data-custom aria-pressed="${custom}">Autre</button>
          ${custom ? `<span class="custom-min"><input id="custom-min" class="input" type="number" min="5" max="480" step="5" value="${minutes}" aria-label="Durée en minutes"> min</span>` : ""}
        </div>
        <div class="helper" id="end-hint"></div>
      </section>
      <section class="card">
        <span class="field-label">Protection</span>
        ${row("notif", "bellOff", "Couper les notifications", "Windows reste silencieux jusqu'à la fin.")}
        ${row("apps", "grid", "Fermer les applications", `${plural(c.apps.length, "application sélectionnée", "applications sélectionnées")} · <a class="link" href="#apps">Modifier</a>`)}
        ${row("sites", "globe", "Bloquer les sites web", sitesDesc, { disabled: !S.admin })}
        ${row("lock", "lock", "Mode engagement", "Pour arrêter avant la fin, il faudra taper une phrase d'abandon. Tu pourras ajouter des blocages, pas en retirer.")}
      </section>
    </div>
    <div class="cta-row">
      <button class="btn primary large" id="start">${icon("timer")}<span id="start-label">Commencer · ${minutes} min</span></button>
      <span class="helper">ou appuie sur <span class="kbd">Entrée</span></span>
    </div>`;
}

function bindSession() {
  if (S.session) return bindLive();
  const minutes = () => draft.minutes ?? S.config.default_minutes ?? 90;
  const refreshEnd = () => {
    const m = minutes();
    $("#end-hint").textContent = m >= 5 && m <= 480 ? `Fin prévue à ${fmtClock(now() + m * 60000)}` : "Entre 5 et 480 minutes.";
    $("#start-label").textContent = `Commencer · ${m} min`;
  };
  refreshEnd();
  const input = $("#intention");
  input.addEventListener("input", () => {
    draft.intention = input.value;
    if (draft.error && input.value.trim()) { draft.error = ""; input.classList.remove("invalid"); input.removeAttribute("aria-invalid"); }
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") startSession(); });
  if (!draft.intention) input.focus();
  $$("[data-min]").forEach((b) => b.addEventListener("click", () => { draft.minutes = +b.dataset.min; draft.custom = false; render(); }));
  $("[data-custom]").addEventListener("click", () => { draft.custom = true; render(); $("#custom-min")?.select(); });
  $("#custom-min")?.addEventListener("input", (e) => { draft.minutes = parseInt(e.target.value, 10) || 0; refreshEnd(); });
  $("#custom-min")?.addEventListener("keydown", (e) => { if (e.key === "Enter") startSession(); });
  $$("[data-toggle]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.toggle;
    draft[k] = !draft[k];
    b.setAttribute("aria-checked", draft[k]);
    b.closest(".toggle-row").classList.toggle("on", draft[k]);
  }));
  $("[data-elevate]")?.addEventListener("click", elevate);
  $("#start").addEventListener("click", startSession);
}

async function startSession() {
  const minutes = draft.minutes ?? S.config.default_minutes ?? 90;
  if (!draft.intention.trim()) {
    draft.error = "Écris ce que tu vas accomplir : une session sans objectif précis reste du travail superficiel.";
    render();
    $("#intention").focus();
    return;
  }
  if (!(minutes >= 5 && minutes <= 480)) { toast("Choisis une durée entre 5 et 480 minutes.", "error"); return; }
  $("#start").disabled = true;
  try {
    const res = await api("/api/start", { intention: draft.intention.trim(), minutes, notif: draft.notif, apps: draft.apps, sites: draft.sites && S.admin, lock: draft.lock });
    draft.intention = "";
    draft.custom = false;
    draft.minutes = null;
    if (res.warnings?.length) toast(res.warnings.join(" · "), "error");
    await poll();
  } catch (e) {
    toast(e.message, "error");
    $("#start") && ($("#start").disabled = false);
  }
}

async function elevate() {
  try {
    toast("Confirme la demande de Windows…");
    await api("/api/elevate", {});
  } catch (e) { toast(e.message, "error"); }
}

const RING = 2 * Math.PI * 92;
function viewLive() {
  const st = S.session;
  const pills = [];
  if (st.notif) pills.push(["bellOff", "Notifications coupées"]);
  if (st.apps) pills.push(["grid", plural(S.config.apps.length, "application bloquée", "applications bloquées")]);
  if (st.sites) pills.push(["globe", plural(S.config.sites.length, "site bloqué", "sites bloqués")]);
  if (st.lock) pills.push(["lock", "Mode engagement"]);
  return `
    <div class="live">
      <div class="ring" role="timer" aria-label="Temps restant">
        <svg viewBox="0 0 200 200" aria-hidden="true"><circle class="bg" cx="100" cy="100" r="92"/>
          <circle class="fg" id="ring-fg" cx="100" cy="100" r="92" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>
        <div class="ring-center"><div class="ring-time" id="live-time">--:--</div><div class="ring-sub">restantes</div></div>
      </div>
      <p class="eyebrow">En train de travailler sur</p>
      <h2>${esc(st.intention)}</h2>
      <p class="helper" style="margin:0">Commencée à ${fmtClock(st.start * 1000)} · fin à ${fmtClock(st.end * 1000)}</p>
      <div class="pills">${pills.map(([i, t]) => `<span class="pill">${icon(i)}${t}</span>`).join("") || '<span class="pill">Aucun blocage actif</span>'}</div>
      <div class="blocked-msg" id="blocked" aria-live="polite"></div>
      <button class="btn ghost" id="stop">${icon("x")}Arrêter la session</button>
      <p class="hint">Tu peux fermer cette fenêtre : la protection continue, et la fenêtre se rouvrira à la fin.</p>
    </div>`;
}

function bindLive() {
  $("#stop").addEventListener("click", () => (S.session.lock ? openAbandon() : openConfirmStop()));
  updateLive();
}

function appName(exe) {
  return installed?.find((a) => a.exe === exe)?.name ?? exe.replace(/\.exe$/, "");
}

function updateLive() {
  const st = S.session;
  if (!st || !$("#live-time")) return;
  const left = Math.max(0, st.end * 1000 - now());
  const total = (st.end - st.start) * 1000;
  $("#live-time").textContent = fmtRemaining(left);
  $("#ring-fg").style.strokeDashoffset = String(RING * (1 - left / total));
  const k = st.last_killed;
  const box = $("#blocked");
  const fresh = k && now() / 1000 - k.at < 10;
  const html = fresh ? `<span class="inner">${icon("shield")}<span><strong>${esc(k.names.map(appName).join(", "))}</strong> ${k.names.length > 1 ? "ont été fermées" : "a été fermée"}. Reviens à ta tâche.</span></span>`
    : st.blocked_count ? `<span class="hint">${plural(st.blocked_count, "distraction bloquée", "distractions bloquées")} pendant cette session</span>` : "";
  if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
}

setInterval(() => {
  if (!S?.session) {
    if (document.title !== "Deep Work Focus") document.title = "Deep Work Focus";
    return;
  }
  if (page === "session") updateLive();
  const side = $("#side-time");
  if (side) side.textContent = fmtRemaining(Math.max(0, S.session.end * 1000 - now()));
  document.title = `${fmtRemaining(Math.max(0, S.session.end * 1000 - now()))} · Deep Work Focus`;
}, 250);

// --- Fenêtres modales ---------------------------------------------------------------
function showDialog(html, onCancel) {
  const d = $("#dialog");
  d.innerHTML = html;
  d.oncancel = (e) => { e.preventDefault(); onCancel?.(); };
  if (!d.open) d.showModal();
  return d;
}
const closeDialog = () => { const d = $("#dialog"); if (d.open) d.close(); };

function openConfirmStop() {
  const d = showDialog(`
    <h2 id="dialog-title">Arrêter la session ?</h2>
    <p class="lead">Le temps déjà travaillé sera comptabilisé. Les blocages seront levés tout de suite.</p>
    <div class="dialog-actions">
      <button class="btn primary" data-keep>Continuer à travailler</button>
      <button class="btn danger" data-stop>Arrêter</button>
    </div>`, closeDialog);
  $("[data-keep]", d).addEventListener("click", closeDialog);
  $("[data-keep]", d).focus();
  $("[data-stop]", d).addEventListener("click", async () => {
    try { await api("/api/stop", {}); closeDialog(); await poll(); } catch (e) { toast(e.message, "error"); }
  });
}

function openAbandon() {
  const phrase = S.abandon_phrase;
  const d = showDialog(`
    <h2 id="dialog-title">Tu t'es engagé à aller jusqu'au bout</h2>
    <p class="lead">Respire. L'envie d'arrêter fait partie de l'entraînement. Pour abandonner quand même, tape la phrase ci-dessous.</p>
    <div class="phrase" aria-hidden="true">${esc(phrase)}</div>
    <label class="sr-only" for="phrase">Phrase d'abandon : ${esc(phrase)}</label>
    <input id="phrase" class="input" autocomplete="off" spellcheck="false" onpaste="return false">
    <div class="dialog-actions">
      <button class="btn danger" data-abandon disabled>Abandonner</button>
      <button class="btn primary" data-keep>Je reprends le travail</button>
    </div>`, closeDialog);
  const input = $("#phrase", d), btn = $("[data-abandon]", d);
  input.addEventListener("input", () => (btn.disabled = input.value.trim().toLowerCase() !== phrase));
  $("[data-keep]", d).addEventListener("click", closeDialog);
  $("[data-keep]", d).focus();
  btn.addEventListener("click", async () => {
    try { await api("/api/stop", { phrase: input.value }); closeDialog(); await poll(); } catch (e) { toast(e.message, "error"); }
  });
}

function openReview(s) {
  reviewShownFor = s.id;
  let depth = null;
  const d = showDialog(`
    <h2 id="dialog-title">${s.completed ? "Session terminée. Bien joué." : "Session interrompue"}</h2>
    <p class="lead">${Math.round(s.actual_min)} min sur « ${esc(s.intention)} »${s.blocked ? ` · ${plural(s.blocked, "distraction bloquée", "distractions bloquées")}` : ""}</p>
    <span class="field-label" id="depth-label">À quel point étais-tu concentré ?</span>
    <div class="depth-pick" role="group" aria-labelledby="depth-label">
      ${DEPTH_LABELS.map((l, i) => `<button data-depth="${i + 1}" aria-pressed="false">${i + 1}<small>${l}</small></button>`).join("")}
    </div>
    <label class="field-label" for="note" style="margin-top:18px">Note <span style="font-weight:400;color:var(--muted)">(facultatif)</span></label>
    <textarea id="note" class="input" maxlength="500" placeholder="Ce qui a marché, ce qui t'a distrait…"></textarea>
    <div class="dialog-actions">
      <button class="btn ghost" data-skip>Passer</button>
      <button class="btn primary" data-save>Enregistrer le bilan</button>
    </div>`, () => save(false));
  $$("[data-depth]", d).forEach((b) => b.addEventListener("click", () => {
    depth = +b.dataset.depth;
    $$("[data-depth]", d).forEach((x) => x.setAttribute("aria-pressed", x === b));
  }));
  async function save(withData = true) {
    try {
      await api("/api/review", { id: s.id, depth: withData ? depth : null, note: withData ? $("#note", d).value : "" });
      closeDialog();
      if (withData) toast("Bilan enregistré.");
      await poll();
      if (page === "session") location.hash = "progress";
    } catch (e) { toast(e.message, "error"); }
  }
  $("[data-save]", d).addEventListener("click", () => save(true));
  $("[data-skip]", d).addEventListener("click", () => save(false));
  $$("[data-depth]", d)[3].focus();
  playChime();
}

function playChime() {
  try {
    const ctx = new AudioContext();
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
      g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + i * 0.18 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 1.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 1.3);
    });
  } catch { /* son indisponible : sans importance */ }
}

// --- Enregistrement des listes ------------------------------------------------------
let saveTimer;
function saveList(key, values) {
  const before = S.config[key];
  S.config[key] = values;
  renderNav();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const res = await api("/api/config", { [key]: values });
      S.config = res.config;
      toast("Enregistré");
    } catch (e) {
      S.config[key] = before;
      toast(e.message, "error");
    }
    renderNav();
    if (page === "apps") refreshApps(); else if (page === "sites") refreshSites();
  }, 350);
}
const lockedRemoval = () => S.session?.lock;

function checkRow({ value, checked, title, sub, media, tag, disabled }) {
  return `<label class="check-row">
    <input type="checkbox" value="${esc(value)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
    <span class="box">${icon("check")}</span>
    ${media}
    <span class="meta"><span class="name">${esc(title)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</span>
    ${tag || ""}
  </label>`;
}

function avatar(text) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<span class="avatar" style="background:hsl(${h} 32% 42%)" aria-hidden="true">${esc(text.replace(/^www\./, "")[0]?.toUpperCase() ?? "?")}</span>`;
}

// --- Applications ----------------------------------------------------------------------
function viewApps() {
  return `
    <header class="page-head">
      <h1>Applications à bloquer</h1>
      <p>Coche les applications qui te distraient. Pendant une session, elles sont fermées dès qu'elles s'ouvrent.</p>
    </header>
    ${lockedRemoval() ? `<div class="banner">${icon("lock")}<div class="txt"><strong>Mode engagement actif</strong><span>Tu peux ajouter des applications, pas en retirer avant la fin de la session.</span></div></div>` : ""}
    <div class="toolbar">
      <div class="input-icon">${icon("search")}
        <input id="app-q" class="input" type="search" placeholder="Rechercher une application" aria-label="Rechercher une application" value="${esc(appFilter.q)}">
        <span class="kbd" aria-hidden="true">/</span></div>
      <button class="btn" id="rescan" ${scanning ? "disabled" : ""}>${icon("refresh")}Actualiser</button>
    </div>
    <div class="chips" id="app-chips" role="group" aria-label="Filtrer par catégorie"></div>
    <div id="app-suggest"></div>
    <div id="app-list"></div>
    <section>
      <h2 class="section-title">Une application manque ?</h2>
      <p class="helper" style="margin-top:-6px">Ajoute le nom de son processus, visible dans le Gestionnaire des tâches, onglet Détails.</p>
      <form class="add-row" id="app-add"><input class="input" id="app-add-input" placeholder="Ex. : notion.exe" aria-label="Nom du processus à ajouter">
        <button class="btn">${icon("plus")}Ajouter</button></form>
    </section>
    <div class="sticky-foot"><span class="grow" id="app-count"></span>
      <button class="btn small ghost" id="app-clear">Tout décocher</button></div>`;
}

async function loadInstalled(refresh = false) {
  scanning = true;
  if (page === "apps") refreshApps();
  try {
    installed = (await api(`/api/apps${refresh ? "?refresh=1" : ""}`)).apps;
    if (refresh) toast(`${installed.length} applications trouvées`);
  } catch (e) { toast(e.message, "error"); installed = installed ?? []; }
  scanning = false;
  if (page === "apps") { render(); }
}

function bindApps() {
  if (!installed && !scanning) loadInstalled();
  const q = $("#app-q");
  q.addEventListener("input", () => { appFilter.q = q.value; refreshApps(); });
  $("#rescan").addEventListener("click", () => loadInstalled(true));
  $("#app-add").addEventListener("submit", (e) => {
    e.preventDefault();
    let v = $("#app-add-input").value.trim().toLowerCase();
    if (!v) return;
    if (!v.endsWith(".exe")) v += ".exe";
    $("#app-add-input").value = "";
    if (!S.config.apps.includes(v)) saveList("apps", [...S.config.apps, v]);
  });
  $("#app-clear").addEventListener("click", () => {
    if (lockedRemoval()) return toast("Mode engagement : impossible de retirer des blocages pendant la session.", "error");
    if (S.config.apps.length) saveList("apps", []);
  });
  $("#app-list").addEventListener("change", (e) => {
    const cb = e.target.closest("input[type=checkbox]");
    if (!cb) return;
    const set = new Set(S.config.apps);
    if (cb.checked) set.add(cb.value);
    else if (lockedRemoval()) { cb.checked = true; return toast("Mode engagement : tu ne peux pas retirer de blocage maintenant.", "error"); }
    else set.delete(cb.value);
    saveList("apps", [...set]);
  });
  $("#app-chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (b) { appFilter.cat = b.dataset.cat; refreshApps(); }
  });
  $("#app-suggest").addEventListener("click", (e) => {
    if (!e.target.closest("[data-suggest]")) return;
    const set = new Set(S.config.apps);
    installed.filter((a) => SUGGESTED.has(a.category)).forEach((a) => set.add(a.exe));
    saveList("apps", [...set]);
  });
  refreshApps();
}

function refreshApps() {
  const list = $("#app-list");
  if (!list) return;
  const selected = new Set(S.config.apps);
  $("#app-count").innerHTML = `<strong>${selected.size}</strong> ${selected.size > 1 ? "applications bloquées" : "application bloquée"} pendant les sessions`;
  if (!installed) {
    $("#app-chips").innerHTML = "";
    list.innerHTML = `<p class="helper" style="margin:0 0 12px">Recherche des applications installées…</p><div class="check-grid">${'<div class="skeleton"></div>'.repeat(8)}</div>`;
    return;
  }
  const known = new Set(installed.map((a) => a.exe));
  const pretty = (exe) => { const n = exe.replace(/\.exe$/, ""); return n.charAt(0).toUpperCase() + n.slice(1); };
  const manual = [...selected].filter((exe) => !known.has(exe)).map((exe) => ({ name: pretty(exe), exe, icon: "", category: "manual" }));
  const all = [...manual, ...installed];
  const counts = { all: all.length, suggested: all.filter((a) => SUGGESTED.has(a.category)).length, selected: selected.size };
  for (const k of Object.keys(CATEGORIES)) counts[k] = all.filter((a) => a.category === k).length;
  const chips = [["all", "Toutes"], ["suggested", "Suggérées"], ["selected", "Cochées"], ...Object.entries(CATEGORIES)].filter(([k]) => counts[k] || k === "all" || k === "selected");
  $("#app-chips").innerHTML = chips.map(([k, l]) => `<button class="chip" data-cat="${k}" aria-pressed="${appFilter.cat === k}">${l} <span class="n">${counts[k] ?? 0}</span></button>`).join("");

  const missing = installed.filter((a) => SUGGESTED.has(a.category) && !selected.has(a.exe));
  $("#app-suggest").innerHTML = missing.length && !appFilter.q ? `<div class="banner">${icon("sparkle")}
    <div class="txt"><strong>${plural(missing.length, "distraction détectée", "distractions détectées")} sur ton ordinateur</strong>
    <span>${esc(missing.slice(0, 4).map((a) => a.name).join(", "))}${missing.length > 4 ? "…" : ""}</span></div>
    <button class="btn small primary" data-suggest>Tout cocher</button></div>` : "";

  const q = appFilter.q.trim().toLowerCase();
  const items = all.filter((a) => {
    if (q && !a.name.toLowerCase().includes(q) && !a.exe.includes(q)) return false;
    if (appFilter.cat === "suggested") return SUGGESTED.has(a.category);
    if (appFilter.cat === "selected") return selected.has(a.exe);
    return appFilter.cat === "all" || a.category === appFilter.cat;
  });
  if (!items.length) {
    list.innerHTML = `<div class="empty">${icon("search")}<div>Aucune application ne correspond${q ? ` à « ${esc(appFilter.q)} »` : ""}.</div></div>`;
    return;
  }
  // Sur « Toutes », les suggestions passent en premier : c'est ce qu'on cherche le plus souvent.
  const rank = (a) => (appFilter.cat === "all" && !q ? (selected.has(a.exe) ? 0 : SUGGESTED.has(a.category) ? 1 : 2) : 0);
  items.sort((a, b) => rank(a) - rank(b));
  const locked = lockedRemoval();
  list.innerHTML = `<div class="check-grid">${items.map((a) => checkRow({
    value: a.exe, checked: selected.has(a.exe), title: a.name, sub: a.exe,
    media: a.icon ? `<img class="app-ico" alt="" src="data:image/png;base64,${a.icon}">` : avatar(a.name),
    tag: a.category === "manual" ? '<span class="tag" title="Bloquée si elle est installée un jour">Non détectée</span>' : SUGGESTED.has(a.category) ? `<span class="tag suggest">${CATEGORIES[a.category].split(" ")[0]}</span>` : "",
    disabled: locked && selected.has(a.exe),
  })).join("")}</div>`;
}

// --- Sites web -------------------------------------------------------------------------
function viewSites() {
  return `
    <header class="page-head">
      <h1>Sites web à bloquer</h1>
      <p>Coche les sites qui te happent. Pendant une session, ils ne s'ouvrent plus, dans aucun navigateur.</p>
    </header>
    ${S.admin ? "" : `<div class="banner">${icon("shield")}<div class="txt"><strong>Droits administrateur nécessaires</strong>
      <span>Windows protège le fichier qui permet de bloquer les sites. Tu peux préparer ta liste maintenant.</span></div>
      <button class="btn small primary" data-elevate>Activer</button></div>`}
    ${lockedRemoval() ? `<div class="banner">${icon("lock")}<div class="txt"><strong>Mode engagement actif</strong><span>Tu peux ajouter des sites, pas en retirer avant la fin de la session.</span></div></div>` : ""}
    <div class="toolbar">
      <div class="input-icon">${icon("search")}
        <input id="site-q" class="input" type="search" placeholder="Rechercher un site" aria-label="Rechercher un site" value="${esc(siteFilter.q)}">
        <span class="kbd" aria-hidden="true">/</span></div>
    </div>
    <div id="site-list"></div>
    <section>
      <h2 class="section-title">Ajouter un site</h2>
      <form class="add-row" id="site-add"><input class="input" id="site-add-input" placeholder="Ex. : lequipe.fr" aria-label="Adresse du site à ajouter">
        <button class="btn">${icon("plus")}Ajouter</button></form>
      <p class="helper">Si un site reste accessible, ferme et rouvre son onglet. Si le « DNS sécurisé » est activé dans ton navigateur, désactive-le.</p>
    </section>
    <div class="sticky-foot"><span class="grow" id="site-count"></span>
      <button class="btn small ghost" id="site-clear">Tout décocher</button></div>`;
}

function bindSites() {
  $("[data-elevate]")?.addEventListener("click", elevate);
  const q = $("#site-q");
  q.addEventListener("input", () => { siteFilter.q = q.value; refreshSites(); });
  $("#site-add").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#site-add-input").value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
    if (!v.includes(".")) return toast("Écris une adresse complète, par exemple lequipe.fr", "error");
    $("#site-add-input").value = "";
    if (!S.config.sites.includes(v)) saveList("sites", [...S.config.sites, v]);
  });
  $("#site-clear").addEventListener("click", () => {
    if (lockedRemoval()) return toast("Mode engagement : impossible de retirer des blocages pendant la session.", "error");
    if (S.config.sites.length) saveList("sites", []);
  });
  $("#site-list").addEventListener("change", (e) => {
    const cb = e.target.closest("input[type=checkbox]");
    if (!cb) return;
    const set = new Set(S.config.sites);
    if (cb.checked) set.add(cb.value);
    else if (lockedRemoval()) { cb.checked = true; return toast("Mode engagement : tu ne peux pas retirer de blocage maintenant.", "error"); }
    else set.delete(cb.value);
    saveList("sites", [...set]);
  });
  refreshSites();
}

function refreshSites() {
  const list = $("#site-list");
  if (!list) return;
  const selected = new Set(S.config.sites);
  $("#site-count").innerHTML = `<strong>${selected.size}</strong> ${selected.size > 1 ? "sites bloqués" : "site bloqué"} pendant les sessions`;
  const catalog = new Set(Object.values(SITE_CATALOG).flat());
  const groups = { "Mes sites": [...selected].filter((s) => !catalog.has(s)), ...SITE_CATALOG };
  const q = siteFilter.q.trim().toLowerCase();
  const locked = lockedRemoval();
  const html = Object.entries(groups).map(([title, sites]) => {
    const shown = sites.filter((s) => !q || s.includes(q));
    if (!shown.length) return "";
    const n = shown.filter((s) => selected.has(s)).length;
    return `<h2 class="section-title">${esc(title)} <span class="n">${n}/${shown.length}</span></h2>
      <div class="check-grid">${shown.map((s) => checkRow({ value: s, checked: selected.has(s), title: s, media: avatar(s), disabled: locked && selected.has(s) })).join("")}</div>`;
  }).join("");
  list.innerHTML = html || `<div class="empty">${icon("search")}<div>Aucun site ne correspond. Ajoute-le ci-dessous.</div></div>`;
}

// --- Progrès ---------------------------------------------------------------------------
function dayKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

function weekStats() {
  const today = new Date(now());
  const monday = new Date(today); monday.setHours(0, 0, 0, 0); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const perDay = Array(7).fill(0);
  for (const s of S.sessions) {
    const d = new Date(s.start);
    const idx = Math.floor((d - monday) / 86400000);
    if (idx >= 0 && idx < 7) perDay[idx] += s.actual_min;
  }
  return { perDay, total: perDay.reduce((a, b) => a + b, 0), todayIdx: (today.getDay() + 6) % 7 };
}

function streak() {
  const days = new Set(S.sessions.filter((s) => s.actual_min >= 5).map((s) => dayKey(new Date(s.start))));
  const d = new Date(now());
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function viewProgress() {
  const goal = S.config.weekly_goal_hours;
  const w = weekStats();
  const pct = Math.min(100, (w.total / 60 / goal) * 100);
  const rated = S.sessions.filter((s) => s.depth).slice(-20);
  const avgDepth = rated.length ? rated.reduce((a, s) => a + s.depth, 0) / rated.length : null;
  const done = S.sessions.filter((s) => s.completed).length;
  const st = streak();
  return `
    <header class="page-head">
      <h1>Tableau de score</h1>
      <p>Mesure tes heures de travail profond, pas tes résultats : c'est l'indicateur que tu contrôles vraiment.</p>
    </header>
    <div class="kpis">
      <div class="kpi"><div class="k-label">${icon("timer")}Cette semaine</div>
        <div class="k-value">${fmtHours(w.total)} h <small>/ ${goal} h</small></div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="Progression vers l'objectif"><span style="width:${pct}%"></span></div></div>
      <div class="kpi"><div class="k-label">${icon("flame")}Série</div>
        <div class="k-value">${st} <small>${st > 1 ? "jours" : "jour"}</small></div>
        <div class="k-sub">${st ? "Jours consécutifs avec du deep work" : "Fais une session aujourd'hui pour la lancer"}</div></div>
      <div class="kpi"><div class="k-label">${icon("layers")}Profondeur moyenne</div>
        <div class="k-value">${avgDepth ? avgDepth.toFixed(1).replace(".", ",") : "–"} <small>/ 5</small></div>
        <div class="k-sub">${rated.length ? `Sur ${rated.length > 1 ? `tes ${rated.length} dernières sessions notées` : "ta session notée"}` : "Note tes sessions à la fin"}</div></div>
      <div class="kpi"><div class="k-label">${icon("check")}Sessions</div>
        <div class="k-value">${S.sessions.length}</div>
        <div class="k-sub">${S.sessions.length ? `${Math.round((done / S.sessions.length) * 100)} % menées à terme` : "Aucune pour l'instant"}</div></div>
    </div>
    <section class="card chart-card">
      <div class="chart-head"><h2>Heures par jour</h2>
        <div class="stepper"><span>Objectif hebdomadaire</span>
          <button id="goal-minus" aria-label="Diminuer l'objectif">${icon("minus")}</button>
          <strong id="goal-val">${goal} h</strong>
          <button id="goal-plus" aria-label="Augmenter l'objectif">${icon("plus")}</button></div></div>
      <div class="chart">${weekChart(w, goal)}</div>
    </section>
    <h2 class="section-title">Historique <span class="n">${S.sessions.length}</span></h2>
    <section class="card" style="padding:6px 18px">
      ${S.sessions.length ? `<div class="history">${S.sessions.slice(-40).reverse().map(historyRow).join("")}</div>`
        : `<div class="empty">${icon("timer")}<div>Ta première session apparaîtra ici.</div><p><a class="btn primary" href="#session">Commencer une session</a></p></div>`}
    </section>`;
}

function weekChart(w, goal) {
  const W = 700, H = 220, top = 26, bottom = 30, left = 8;
  const daily = (goal * 60) / 5;   // objectif indicatif réparti sur 5 jours
  const max = Math.max(...w.perDay, daily, 60);
  const slot = (W - left * 2) / 7, bw = Math.min(52, slot * 0.55);
  const y = (v) => H - bottom - ((H - top - bottom) * v) / max;
  const days = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const bars = w.perDay.map((m, i) => {
    const cx = left + slot * i + slot / 2, h = H - bottom - y(m);
    const fill = m >= daily ? "var(--accent)" : "color-mix(in srgb, var(--accent) 55%, var(--surface-3))";
    return `<g>${m > 0 ? `<rect x="${cx - bw / 2}" y="${y(m)}" width="${bw}" height="${Math.max(h, 2)}" rx="5" fill="${fill}"><title>${days[i]} : ${fmtHours(m)} h</title></rect>
      <text class="val" x="${cx}" y="${y(m) - 8}" text-anchor="middle">${fmtHours(m)} h</text>` : `<rect x="${cx - bw / 2}" y="${H - bottom - 2}" width="${bw}" height="2" rx="1" fill="var(--surface-3)"/>`}
      <text x="${cx}" y="${H - 8}" text-anchor="middle" class="${i === w.todayIdx ? "today" : ""}">${days[i]}</text></g>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Heures de deep work par jour cette semaine">
    <line x1="0" x2="${W}" y1="${y(daily)}" y2="${y(daily)}" stroke="var(--accent-line)" stroke-dasharray="4 5"/>
    <text x="${W}" y="${y(daily) - 6}" text-anchor="end">Objectif du jour ${fmtHours(daily)} h</text>${bars}</svg>`;
}

function historyRow(s) {
  const d = new Date(s.start);
  const date = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const depth = s.depth ? `<span class="depth" aria-label="Profondeur ${s.depth} sur 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= s.depth ? "on" : ""}"></i>`).join("")}</span>` : "non notée";
  return `<div class="h-row">
    <span class="st ${s.completed ? "ok" : "ko"}" aria-label="${s.completed ? "Terminée" : "Interrompue"}">${icon(s.completed ? "check" : "x")}</span>
    <div><div class="h-title">${esc(s.intention)}</div>
      <div class="h-sub">${date} à ${fmtClock(d)} · profondeur ${depth}</div>
      ${s.note ? `<div class="h-note">${esc(s.note)}</div>` : ""}</div>
    <div class="h-right">${Math.round(s.actual_min)} min</div></div>`;
}

function bindProgress() {
  const change = async (delta) => {
    const v = Math.max(1, Math.min(80, S.config.weekly_goal_hours + delta));
    S.config.weekly_goal_hours = v;
    render();
    try { S.config = (await api("/api/config", { weekly_goal_hours: v })).config; renderSideStatus(); } catch (e) { toast(e.message, "error"); }
  };
  $("#goal-minus").addEventListener("click", () => change(-1));
  $("#goal-plus").addEventListener("click", () => change(1));
}

// --- Fin de journée ------------------------------------------------------------------
function viewRitual() {
  const items = S.config.shutdown_checklist;
  const doneToday = S.config.last_shutdown === S.today;
  const head = `<header class="page-head"><h1>Rituel de fin de journée</h1>
    <p>Ton cerveau ne lâche prise que s'il sait que rien n'est oublié. Fais le tour, puis déclare ta journée terminée.</p></header>`;
  if (doneToday && !ritual.editing) {
    return head + `<section class="card done-card"><div class="big-ico">${icon("check")}</div>
      <h2>Shutdown complete</h2><p>Ta journée de travail est terminée. Déconnecte-toi vraiment : le repos fait partie du travail profond.</p>
      <p style="margin-top:20px"><button class="btn ghost small" id="ritual-again">Refaire le rituel</button></p></section>`;
  }
  if (ritual.editing) {
    return head + `<section class="card stack" id="ritual-edit">
      ${items.map((t, i) => `<div class="edit-item"><input class="input" data-idx="${i}" value="${esc(t)}" aria-label="Étape ${i + 1}">
        <button class="btn ghost" data-del="${i}" aria-label="Supprimer l'étape ${i + 1}">${icon("trash")}</button></div>`).join("")}
      <button class="btn" id="ritual-add">${icon("plus")}Ajouter une étape</button></section>
      <div class="cta-row"><button class="btn primary" id="ritual-save">Enregistrer</button><button class="btn ghost" id="ritual-cancel">Annuler</button></div>`;
  }
  const n = items.filter((_, i) => ritual.checked.has(i)).length;
  return head + `
    <div class="ritual-progress"><span>${n} / ${items.length}</span><div class="bar"><span style="width:${items.length ? (n / items.length) * 100 : 0}%"></span></div>
      <button class="btn ghost small" id="ritual-edit-btn">${icon("pencil")}Modifier les étapes</button></div>
    <div class="stack ritual" id="ritual-list">${items.map((t, i) => checkRow({ value: String(i), checked: ritual.checked.has(i), title: t, media: "" })).join("")}</div>
    <div class="cta-row"><button class="btn primary large" id="shutdown" ${n === items.length && items.length ? "" : "disabled"}>${icon("moon")}Shutdown complete</button>
      ${n < items.length ? `<span class="helper">Coche toutes les étapes pour terminer ta journée.</span>` : ""}</div>`;
}

function bindRitual() {
  $("#ritual-again")?.addEventListener("click", () => { S.config.last_shutdown = null; ritual.checked.clear(); render(); });
  $("#ritual-edit-btn")?.addEventListener("click", () => { ritual.editing = true; render(); });
  $("#ritual-cancel")?.addEventListener("click", () => { ritual.editing = false; render(); });
  $("#ritual-add")?.addEventListener("click", () => {
    const vals = $$("#ritual-edit input").map((i) => i.value);
    S.config.shutdown_checklist = [...vals, ""];
    render();
    $$("#ritual-edit input").at(-1).focus();
  });
  $$("[data-del]").forEach((b) => b.addEventListener("click", () => {
    const vals = $$("#ritual-edit input").map((i) => i.value);
    vals.splice(+b.dataset.del, 1);
    S.config.shutdown_checklist = vals;
    render();
  }));
  $("#ritual-save")?.addEventListener("click", async () => {
    const vals = $$("#ritual-edit input").map((i) => i.value.trim()).filter(Boolean);
    try {
      S.config = (await api("/api/config", { shutdown_checklist: vals })).config;
      ritual.editing = false; ritual.checked.clear(); toast("Rituel enregistré"); render();
    } catch (e) { toast(e.message, "error"); }
  });
  $("#ritual-list")?.addEventListener("change", (e) => {
    const i = +e.target.value;
    e.target.checked ? ritual.checked.add(i) : ritual.checked.delete(i);
    render();
    $(`#ritual-list input[value="${i}"]`)?.focus();
  });
  $("#shutdown")?.addEventListener("click", async () => {
    try { S.config = (await api("/api/config", { shutdown_done: true })).config; ritual.checked.clear(); render(); } catch (e) { toast(e.message, "error"); }
  });
}

// --- Principes ---------------------------------------------------------------------------
function viewRules() {
  return `
    <header class="page-head"><h1>Les 4 règles du Deep Work</h1>
      <p>L'essentiel du livre de Cal Newport, à relire quand la motivation flanche.</p></header>
    <div class="rules">
      <article class="card rule"><div class="num">Règle 1</div><h2>Travailler en profondeur</h2>
        <p>Choisis une philosophie et ritualise : un lieu, une durée, des règles fixes.</p>
        <ul><li><strong>Rythmique</strong> : un bloc chaque jour à la même heure. La plus simple à tenir.</li>
          <li><strong>Bimodale</strong> : des jours ou des semaines entières consacrés au deep work.</li>
          <li><strong>Journalistique</strong> : tu plonges dès qu'un créneau se libère (demande de l'entraînement).</li>
          <li><strong>Monastique</strong> : tu élimines presque toutes les distractions, en permanence.</li></ul></article>
      <article class="card rule"><div class="num">Règle 2</div><h2>Accepter l'ennui</h2>
        <p>Ne fais pas de pauses dans ta concentration : fais des pauses dans la distraction.</p>
        <ul><li>Programme à l'avance tes moments d'Internet, et respecte-les.</li>
          <li>Pratique la méditation productive : réfléchis à un problème pendant une marche.</li>
          <li>Si tu ne supportes pas cinq minutes d'ennui, tu ne tiendras pas une heure de réflexion.</li></ul></article>
      <article class="card rule"><div class="num">Règle 3</div><h2>Quitter les réseaux sociaux</h2>
        <p>Garde un outil seulement si ses bénéfices pour ce qui compte vraiment dépassent clairement ses coûts.</p>
        <ul><li>Fais le test des 30 jours : arrête. Ça t'a manqué ? Quelqu'un l'a remarqué ?</li>
          <li>Prévois tes loisirs à l'avance plutôt que de te laisser happer par un fil.</li></ul></article>
      <article class="card rule"><div class="num">Règle 4</div><h2>Assécher les eaux peu profondes</h2>
        <p>Programme chaque minute de ta journée en blocs et fixe un budget au travail superficiel.</p>
        <ul><li>Demande-toi combien de mois un jeune diplômé mettrait à apprendre à faire cette tâche : plus c'est court, plus elle est superficielle.</li>
          <li>Termine chaque journée par un <a class="link" href="#ritual">rituel de fin</a>.</li></ul></article>
    </div>`;
}

// --- Raccourcis clavier ------------------------------------------------------------------
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) && !$("#dialog").open) {
    const q = $("#app-q") || $("#site-q");
    if (q) { e.preventDefault(); q.focus(); }
  }
});

poll();
setInterval(poll, 1000);
