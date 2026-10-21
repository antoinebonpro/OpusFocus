"""
Deep Work Focus — bloqueur de distractions inspiré de « Deep Work » (Cal Newport).

Pendant une session :
  - coupe les notifications Windows (toasts),
  - ferme automatiquement les applications de la liste noire,
  - bloque les sites de la liste noire via le fichier hosts (nécessite les droits admin).

Tout est restauré à la fin de la session, y compris après un plantage (au prochain lancement).
"""

import ctypes
import datetime as dt
import json
import os
import queue
import random
import subprocess
import sys
import threading
import time
import tkinter as tk
import winreg
import winsound
from pathlib import Path
from tkinter import messagebox, ttk

APP_NAME = "Deep Work Focus"
APP_DIR = Path(os.environ.get("APPDATA", Path.home())) / "DeepWorkFocus"
CONFIG_FILE = APP_DIR / "config.json"
SESSIONS_FILE = APP_DIR / "sessions.json"
STATE_FILE = APP_DIR / "state.json"
HOSTS_FILE = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "drivers" / "etc" / "hosts"

HOSTS_START = "# >>> DeepWorkFocus (ne pas modifier)"
HOSTS_END = "# <<< DeepWorkFocus"
CREATE_NO_WINDOW = 0x08000000
ABANDON_PHRASE = "j'abandonne ma session de deep work"

NOTIF_KEYS = [
    (r"Software\Microsoft\Windows\CurrentVersion\PushNotifications", "ToastEnabled"),
    (r"Software\Microsoft\Windows\CurrentVersion\Notifications\Settings", "NOC_GLOBAL_SETTING_TOASTS_ENABLED"),
]

# Processus qu'on ne tue jamais, même s'ils sont ajoutés par erreur à la liste.
PROTECTED = {"explorer.exe", "python.exe", "pythonw.exe", "svchost.exe", "csrss.exe",
             "winlogon.exe", "dwm.exe", "taskmgr.exe", "system", "lsass.exe"}

DEFAULT_CONFIG = {
    "apps": ["discord.exe", "slack.exe", "whatsapp.exe", "telegram.exe", "steam.exe",
             "epicgameslauncher.exe", "spotify.exe", "messenger.exe"],
    "sites": ["facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com",
              "youtube.com", "reddit.com", "netflix.com", "twitch.tv", "linkedin.com",
              "snapchat.com", "pinterest.com"],
    "weekly_goal_hours": 15,
    "shutdown_checklist": [
        "J'ai vérifié mes e-mails une dernière fois",
        "J'ai noté chaque tâche en suspens dans ma liste",
        "J'ai relu mon agenda des prochains jours",
        "J'ai planifié les blocs de deep work de demain",
    ],
}

QUOTES = [
    "« Une heure de travail profond vaut mieux qu'une journée de travail dispersé. »",
    "« Le travail profond est à la fois rare et précieux. »",
    "« Ce qu'on accomplit est le produit du temps passé × l'intensité de la concentration. »",
    "« L'ennui n'est pas l'ennemi : c'est l'entraînement de ta concentration. »",
    "« Programme chaque minute de ta journée. »",
    "« Quand tu travailles, travaille dur. Quand tu as fini, arrête. »",
    "« Le cerveau a besoin de pauses de la distraction, pas de pauses de la concentration. »",
]

PRINCIPES = """RÈGLE N°1 — TRAVAILLER EN PROFONDEUR
Choisis ta philosophie :
  • Monastique : tu élimines presque toutes les distractions, en permanence.
  • Bimodale : tu alternes des périodes entières de deep work (des jours, des semaines) et le reste.
  • Rythmique : un bloc de deep work chaque jour, à la même heure. C'est la plus simple à tenir.
  • Journalistique : tu te glisses en deep work dès qu'un créneau se libère (demande de l'entraînement).
Ritualise : un lieu fixe, une durée fixe, des règles fixes (pas d'Internet, pas de téléphone).
Applique la 4DX : vise un objectif ambitieux, mesure tes heures (le Tableau de score), rends des comptes chaque semaine.

RÈGLE N°2 — ACCEPTER L'ENNUI
Ne fais pas des pauses dans ta concentration : fais des pauses dans la distraction.
Programme à l'avance les moments où tu as le droit d'aller sur Internet, et respecte-les.
Si tu ne tiens pas l'ennui cinq minutes dans une file d'attente, tu ne tiendras pas une heure de réflexion.

RÈGLE N°3 — QUITTER LES RÉSEAUX SOCIAUX
Garde un outil seulement si ses bénéfices pour ce qui compte vraiment dépassent clairement ses coûts.
Fais le test des 30 jours : arrête. Est-ce que ça t'a manqué ? Est-ce que quelqu'un l'a remarqué ?

RÈGLE N°4 — ASSÉCHER LES EAUX PEU PROFONDES
Programme chaque minute de ta journée en blocs.
Demande-toi combien de mois un jeune diplômé brillant mettrait à apprendre à faire cette tâche : plus c'est court, plus elle est superficielle.
Fixe un budget pour le travail superficiel, et termine ta journée par un rituel de fin.
"""

# --- Palette -------------------------------------------------------------------
BG = "#0f1115"
SURFACE = "#171a21"
SURFACE_2 = "#1f232c"
TEXT = "#e8e6e1"
MUTED = "#8b909c"
ACCENT = "#d4a256"
ACCENT_DIM = "#8a6a3a"
DANGER = "#c9605a"
OK = "#6fae7f"


# --- Persistance ---------------------------------------------------------------
def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def save_json(path: Path, data) -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    cfg.update(load_json(CONFIG_FILE, {}))
    return cfg


# --- Blocage système -----------------------------------------------------------
def is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except OSError:
        return False


def relaunch_as_admin() -> bool:
    exe = Path(sys.executable)
    pythonw = exe.with_name("pythonw.exe")
    if pythonw.exists():
        exe = pythonw
    rc = ctypes.windll.shell32.ShellExecuteW(None, "runas", str(exe), f'"{Path(__file__).resolve()}"', None, 1)
    return rc > 32


def _read_dword(path: str, name: str):
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_READ) as key:
            return winreg.QueryValueEx(key, name)[0]
    except OSError:
        return None


def notifications_off() -> dict:
    """Coupe les toasts Windows et renvoie les valeurs précédentes pour pouvoir les restaurer."""
    previous = {}
    for path, name in NOTIF_KEYS:
        previous[f"{path}|{name}"] = _read_dword(path, name)
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, name, 0, winreg.REG_DWORD, 0)
    return previous


def notifications_restore(previous: dict) -> None:
    for ident, value in previous.items():
        path, name = ident.split("|", 1)
        try:
            with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_SET_VALUE) as key:
                if value is None:
                    try:
                        winreg.DeleteValue(key, name)
                    except FileNotFoundError:
                        pass
                else:
                    winreg.SetValueEx(key, name, 0, winreg.REG_DWORD, int(value))
        except OSError:
            pass


def strip_hosts_block(content: str) -> str:
    out, skipping = [], False
    for line in content.splitlines():
        if line.strip() == HOSTS_START:
            skipping = True
            continue
        if line.strip() == HOSTS_END:
            skipping = False
            continue
        if not skipping:
            out.append(line)
    return "\n".join(out).rstrip("\n") + "\n"


def build_hosts_block(sites: list[str]) -> str:
    lines = [HOSTS_START]
    for site in sites:
        site = site.strip().lower().removeprefix("https://").removeprefix("http://").split("/")[0]
        site = site.removeprefix("www.")
        if not site:
            continue
        for host in (site, f"www.{site}", f"m.{site}"):
            lines.append(f"0.0.0.0 {host}")
            lines.append(f"::1 {host}")
    lines.append(HOSTS_END)
    return "\n".join(lines) + "\n"


def flush_dns() -> None:
    subprocess.run(["ipconfig", "/flushdns"], capture_output=True, creationflags=CREATE_NO_WINDOW)


def block_sites(sites: list[str], hosts: Path = HOSTS_FILE) -> None:
    content = strip_hosts_block(hosts.read_text(encoding="utf-8", errors="ignore"))
    hosts.write_text(content + build_hosts_block(sites), encoding="utf-8")
    flush_dns()


def unblock_sites(hosts: Path = HOSTS_FILE) -> None:
    content = hosts.read_text(encoding="utf-8", errors="ignore")
    if HOSTS_START in content:
        hosts.write_text(strip_hosts_block(content), encoding="utf-8")
        flush_dns()


def running_processes() -> set[str]:
    result = subprocess.run(["tasklist", "/FO", "CSV", "/NH"], capture_output=True, text=True,
                            errors="ignore", creationflags=CREATE_NO_WINDOW)
    names = set()
    for line in result.stdout.splitlines():
        if line.startswith('"'):
            names.add(line.split('","', 1)[0].strip('"').lower())
    return names


def kill_blocked(apps: list[str]) -> list[str]:
    targets = {a.strip().lower() for a in apps if a.strip()} - PROTECTED
    killed = []
    for name in sorted(running_processes() & targets):
        subprocess.run(["taskkill", "/F", "/IM", name], capture_output=True, creationflags=CREATE_NO_WINDOW)
        killed.append(name)
    return killed


# --- Application ---------------------------------------------------------------
class DeepWorkApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.config = load_config()
        self.sessions = load_json(SESSIONS_FILE, [])
        self.admin = is_admin()
        self.state: dict | None = None
        self.events: queue.Queue = queue.Queue()
        self.enforcer: threading.Thread | None = None
        self.stop_flag = threading.Event()

        root.title(APP_NAME + ("  ·  administrateur" if self.admin else ""))
        root.geometry("760x640")
        root.minsize(680, 580)
        root.configure(bg=BG)
        root.protocol("WM_DELETE_WINDOW", self.on_close)

        self._style()
        self._build()
        self._recover()
        self._tick()

    # ----- Style
    def _style(self):
        s = ttk.Style(self.root)
        s.theme_use("clam")
        s.configure(".", background=BG, foreground=TEXT, font=("Segoe UI", 10), borderwidth=0)
        s.configure("TNotebook", background=BG, tabmargins=(12, 10, 12, 0))
        s.configure("TNotebook.Tab", background=SURFACE, foreground=MUTED, padding=(16, 8), font=("Segoe UI", 10))
        s.map("TNotebook.Tab", background=[("selected", SURFACE_2)], foreground=[("selected", ACCENT)])
        s.configure("TFrame", background=BG)
        s.configure("Card.TFrame", background=SURFACE)
        s.configure("TLabel", background=BG, foreground=TEXT)
        s.configure("Card.TLabel", background=SURFACE, foreground=TEXT)
        s.configure("Muted.TLabel", background=BG, foreground=MUTED)
        s.configure("CardMuted.TLabel", background=SURFACE, foreground=MUTED)
        s.configure("H1.TLabel", background=BG, foreground=TEXT, font=("Segoe UI Semibold", 16))
        s.configure("Timer.TLabel", background=BG, foreground=ACCENT, font=("Segoe UI Light", 64))
        s.configure("TCheckbutton", background=SURFACE, foreground=TEXT, focuscolor=SURFACE)
        s.map("TCheckbutton", background=[("active", SURFACE)], foreground=[("disabled", MUTED)])
        s.configure("TRadiobutton", background=SURFACE, foreground=TEXT, focuscolor=SURFACE)
        s.map("TRadiobutton", background=[("active", SURFACE)])
        s.configure("TButton", background=SURFACE_2, foreground=TEXT, padding=(14, 8))
        s.map("TButton", background=[("active", "#2a2f3a"), ("disabled", SURFACE)], foreground=[("disabled", MUTED)])
        s.configure("Accent.TButton", background=ACCENT, foreground="#1a1408", font=("Segoe UI Semibold", 11), padding=(20, 10))
        s.map("Accent.TButton", background=[("active", "#e0b56c"), ("disabled", ACCENT_DIM)])
        s.configure("Danger.TButton", background=SURFACE_2, foreground=DANGER)
        s.configure("Horizontal.TProgressbar", troughcolor=SURFACE, background=ACCENT, thickness=6)
        s.configure("TEntry", fieldbackground=SURFACE_2, foreground=TEXT, insertcolor=TEXT, padding=6)
        s.configure("TSpinbox", fieldbackground=SURFACE_2, foreground=TEXT, arrowcolor=TEXT, padding=4)

    def _text(self, parent, height=10):
        return tk.Text(parent, height=height, bg=SURFACE_2, fg=TEXT, insertbackground=TEXT, relief="flat",
                       font=("Consolas", 10), padx=8, pady=6, highlightthickness=0, wrap="word")

    # ----- Construction
    def _build(self):
        nb = ttk.Notebook(self.root)
        nb.pack(fill="both", expand=True)
        self.nb = nb
        self.tab_session = ttk.Frame(nb, padding=20)
        self.tab_block = ttk.Frame(nb, padding=20)
        self.tab_score = ttk.Frame(nb, padding=20)
        self.tab_ritual = ttk.Frame(nb, padding=20)
        self.tab_rules = ttk.Frame(nb, padding=20)
        nb.add(self.tab_session, text="Session")
        nb.add(self.tab_block, text="Listes de blocage")
        nb.add(self.tab_score, text="Tableau de score")
        nb.add(self.tab_ritual, text="Rituel de fin")
        nb.add(self.tab_rules, text="Les 4 règles")
        nb.bind("<<NotebookTabChanged>>", lambda e: self.refresh_score())
        self._build_session()
        self._build_block()
        self._build_score()
        self._build_ritual()
        self._build_rules()

    def _build_session(self):
        f = self.tab_session
        # Vue « préparation »
        self.setup = ttk.Frame(f)
        self.setup.pack(fill="both", expand=True)

        ttk.Label(self.setup, text="Nouvelle session de travail profond", style="H1.TLabel").pack(anchor="w")
        ttk.Label(self.setup, text=random.choice(QUOTES), style="Muted.TLabel", wraplength=680).pack(anchor="w", pady=(4, 16))

        card = ttk.Frame(self.setup, style="Card.TFrame", padding=16)
        card.pack(fill="x")
        ttk.Label(card, text="Intention : que vas-tu accomplir précisément ?", style="Card.TLabel").pack(anchor="w")
        self.intention = tk.StringVar()
        ttk.Entry(card, textvariable=self.intention, font=("Segoe UI", 11)).pack(fill="x", pady=(6, 14))

        ttk.Label(card, text="Durée", style="Card.TLabel").pack(anchor="w")
        row = ttk.Frame(card, style="Card.TFrame")
        row.pack(fill="x", pady=(6, 14))
        self.duration = tk.IntVar(value=90)
        for m in (25, 50, 90, 120, 180):
            ttk.Radiobutton(row, text=f"{m} min", value=m, variable=self.duration).pack(side="left", padx=(0, 14))
        ttk.Label(row, text="ou", style="CardMuted.TLabel").pack(side="left", padx=(0, 8))
        ttk.Spinbox(row, from_=5, to=480, increment=5, width=5, textvariable=self.duration).pack(side="left")
        ttk.Label(row, text="min", style="CardMuted.TLabel").pack(side="left", padx=4)

        ttk.Label(card, text="Protection", style="Card.TLabel").pack(anchor="w")
        self.opt_notif = tk.BooleanVar(value=True)
        self.opt_apps = tk.BooleanVar(value=True)
        self.opt_sites = tk.BooleanVar(value=self.admin)
        self.opt_lock = tk.BooleanVar(value=False)
        ttk.Checkbutton(card, text="Couper les notifications Windows", variable=self.opt_notif).pack(anchor="w", pady=2)
        ttk.Checkbutton(card, text="Fermer les applications de la liste noire", variable=self.opt_apps).pack(anchor="w", pady=2)
        site_row = ttk.Frame(card, style="Card.TFrame")
        site_row.pack(fill="x", pady=2)
        cb = ttk.Checkbutton(site_row, text="Bloquer les sites de la liste noire", variable=self.opt_sites)
        cb.pack(side="left")
        if not self.admin:
            cb.state(["disabled"])
            ttk.Label(site_row, text="  (nécessite les droits administrateur)", style="CardMuted.TLabel").pack(side="left")
            ttk.Button(site_row, text="Relancer en admin", command=self.elevate).pack(side="right")
        ttk.Checkbutton(card, text="Mode engagement : impossible d'arrêter avant la fin sans taper une phrase d'abandon",
                        variable=self.opt_lock).pack(anchor="w", pady=(8, 2))

        ttk.Button(self.setup, text="Commencer la session", style="Accent.TButton", command=self.start).pack(pady=20)

        # Vue « en cours »
        self.live = ttk.Frame(f)
        ttk.Label(self.live, text="Travail profond en cours", style="Muted.TLabel").pack(pady=(30, 0))
        self.lbl_intention = ttk.Label(self.live, text="", style="H1.TLabel", wraplength=640, justify="center")
        self.lbl_intention.pack(pady=(6, 10))
        self.lbl_timer = ttk.Label(self.live, text="00:00", style="Timer.TLabel")
        self.lbl_timer.pack()
        self.progress = ttk.Progressbar(self.live, length=460, mode="determinate")
        self.progress.pack(pady=(8, 16))
        self.lbl_status = ttk.Label(self.live, text="", style="Muted.TLabel", justify="center")
        self.lbl_status.pack()
        self.lbl_blocked = ttk.Label(self.live, text="", style="Muted.TLabel", wraplength=600, justify="center")
        self.lbl_blocked.pack(pady=(10, 0))
        ttk.Button(self.live, text="Arrêter la session", style="Danger.TButton", command=self.request_stop).pack(pady=30)

    def _build_block(self):
        f = self.tab_block
        ttk.Label(f, text="Ce qui est bloqué pendant une session", style="H1.TLabel").pack(anchor="w")
        ttk.Label(f, text="Une entrée par ligne. Applications : le nom du processus (ex. discord.exe). Sites : le domaine (ex. youtube.com).",
                  style="Muted.TLabel", wraplength=680).pack(anchor="w", pady=(4, 12))
        cols = ttk.Frame(f)
        cols.pack(fill="both", expand=True)
        cols.columnconfigure(0, weight=1)
        cols.columnconfigure(1, weight=1)
        cols.rowconfigure(1, weight=1)
        ttk.Label(cols, text="Applications").grid(row=0, column=0, sticky="w")
        ttk.Label(cols, text="Sites web").grid(row=0, column=1, sticky="w", padx=(12, 0))
        self.txt_apps = self._text(cols)
        self.txt_apps.grid(row=1, column=0, sticky="nsew", pady=6)
        self.txt_sites = self._text(cols)
        self.txt_sites.grid(row=1, column=1, sticky="nsew", pady=6, padx=(12, 0))
        self.txt_apps.insert("1.0", "\n".join(self.config["apps"]))
        self.txt_sites.insert("1.0", "\n".join(self.config["sites"]))

        btns = ttk.Frame(f)
        btns.pack(fill="x", pady=(8, 0))
        ttk.Button(btns, text="Enregistrer", style="Accent.TButton", command=self.save_lists).pack(side="left")
        ttk.Button(btns, text="Choisir parmi les applications ouvertes…", command=self.pick_running).pack(side="left", padx=10)
        self.lbl_saved = ttk.Label(btns, text="", style="Muted.TLabel")
        self.lbl_saved.pack(side="left", padx=10)

    def _build_score(self):
        f = self.tab_score
        top = ttk.Frame(f)
        top.pack(fill="x")
        ttk.Label(top, text="Tableau de score (4DX)", style="H1.TLabel").pack(side="left")
        ttk.Label(top, text="h / semaine", style="Muted.TLabel").pack(side="right")
        self.goal = tk.IntVar(value=self.config["weekly_goal_hours"])
        sp = ttk.Spinbox(top, from_=1, to=60, width=4, textvariable=self.goal, command=self.save_goal)
        sp.pack(side="right", padx=6)
        sp.bind("<FocusOut>", lambda e: self.save_goal())
        ttk.Label(top, text="Objectif :", style="Muted.TLabel").pack(side="right")

        self.lbl_week = ttk.Label(f, text="", style="Muted.TLabel")
        self.lbl_week.pack(anchor="w", pady=(6, 8))
        self.canvas = tk.Canvas(f, height=220, bg=SURFACE, highlightthickness=0)
        self.canvas.pack(fill="x")
        self.canvas.bind("<Configure>", lambda e: self.refresh_score())
        ttk.Label(f, text="Dernières sessions", style="Muted.TLabel").pack(anchor="w", pady=(16, 4))
        self.txt_history = self._text(f, height=8)
        self.txt_history.pack(fill="both", expand=True)

    def _build_ritual(self):
        f = self.tab_ritual
        ttk.Label(f, text="Rituel de fin de journée", style="H1.TLabel").pack(anchor="w")
        ttk.Label(f, text="Ton cerveau ne lâche prise que s'il sait que rien n'est oublié. Coche chaque étape, puis dis-le : « Shutdown complete ».",
                  style="Muted.TLabel", wraplength=680).pack(anchor="w", pady=(4, 14))
        card = ttk.Frame(f, style="Card.TFrame", padding=16)
        card.pack(fill="x")
        self.ritual_vars = []
        for item in self.config["shutdown_checklist"]:
            v = tk.BooleanVar()
            ttk.Checkbutton(card, text=item, variable=v, command=self._ritual_check).pack(anchor="w", pady=4)
            self.ritual_vars.append(v)
        self.btn_shutdown = ttk.Button(f, text="Shutdown complete", style="Accent.TButton", command=self.shutdown_complete)
        self.btn_shutdown.pack(pady=20)
        self.btn_shutdown.state(["disabled"])
        self.lbl_ritual = ttk.Label(f, text="", style="Muted.TLabel", wraplength=680, justify="center")
        self.lbl_ritual.pack()
        if self.config.get("last_shutdown") == dt.date.today().isoformat():
            self.lbl_ritual.configure(text="Rituel déjà accompli aujourd'hui. Ta journée de travail est terminée.")

    def _build_rules(self):
        t = self._text(self.tab_rules, height=30)
        t.configure(font=("Segoe UI", 10), spacing1=2, spacing3=2)
        t.pack(fill="both", expand=True)
        t.insert("1.0", PRINCIPES)
        t.tag_configure("h", foreground=ACCENT, font=("Segoe UI Semibold", 11))
        for i, line in enumerate(PRINCIPES.splitlines(), start=1):
            if line.startswith("RÈGLE"):
                t.tag_add("h", f"{i}.0", f"{i}.end")
        t.configure(state="disabled")

    # ----- Session
    def start(self):
        try:
            minutes = int(self.duration.get())
        except (tk.TclError, ValueError):
            minutes = 0
        if not 5 <= minutes <= 480:
            messagebox.showwarning(APP_NAME, "Choisis une durée entre 5 et 480 minutes.")
            return
        intention = self.intention.get().strip()
        if not intention:
            messagebox.showwarning(APP_NAME, "Écris ton intention. Une session sans objectif précis, c'est du travail superficiel.")
            return
        now = time.time()
        self.state = {
            "active": True, "start": now, "end": now + minutes * 60, "planned_min": minutes,
            "intention": intention, "notif": self.opt_notif.get(), "apps": self.opt_apps.get(),
            "sites": self.opt_sites.get() and self.admin, "lock": self.opt_lock.get(),
            "notif_prev": {}, "blocked_count": 0,
        }
        self._apply_blocks()
        self._show_live()

    def _apply_blocks(self):
        errors = []
        st = self.state
        if st["notif"] and not st["notif_prev"]:
            try:
                st["notif_prev"] = notifications_off()
            except OSError as e:
                errors.append(f"notifications : {e}")
        save_json(STATE_FILE, st)  # sauvegardé avant de toucher au hosts, pour pouvoir tout restaurer
        if st["sites"]:
            try:
                block_sites(self.config["sites"])
            except OSError as e:
                st["sites"] = False
                errors.append(f"sites : {e}")
        save_json(STATE_FILE, st)
        if st["apps"]:
            self.stop_flag.clear()
            self.enforcer = threading.Thread(target=self._enforce, daemon=True)
            self.enforcer.start()
        if errors:
            messagebox.showwarning(APP_NAME, "Certains blocages n'ont pas pu être activés :\n" + "\n".join(errors))

    def _enforce(self):
        apps = list(self.config["apps"])
        while not self.stop_flag.is_set():
            try:
                killed = kill_blocked(apps)
                if killed:
                    self.events.put(killed)
            except OSError:
                pass
            self.stop_flag.wait(2)

    def _show_live(self):
        st = self.state
        self.setup.pack_forget()
        self.live.pack(fill="both", expand=True)
        self.lbl_intention.configure(text=st["intention"])
        parts = []
        if st["notif"]:
            parts.append("notifications coupées")
        if st["apps"]:
            parts.append(f"{len(self.config['apps'])} applications bloquées")
        if st["sites"]:
            parts.append(f"{len(self.config['sites'])} sites bloqués")
        if st["lock"]:
            parts.append("mode engagement")
        self.lbl_status.configure(text="  ·  ".join(parts) or "aucun blocage actif")
        self.lbl_blocked.configure(text="")

    def _tick(self):
        if self.state:
            while not self.events.empty():
                killed = self.events.get()
                self.state["blocked_count"] += len(killed)
                self.lbl_blocked.configure(
                    text=f"Fermé : {', '.join(killed)}. Reviens à ta tâche.\n"
                         f"Tentatives de distraction bloquées : {self.state['blocked_count']}")
            remaining = self.state["end"] - time.time()
            if remaining <= 0:
                self.finish(completed=True)
            else:
                m, s = divmod(int(remaining), 60)
                h, m = divmod(m, 60)
                self.lbl_timer.configure(text=f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}")
                total = self.state["end"] - self.state["start"]
                self.progress["value"] = 100 * (1 - remaining / total)
        self.root.after(500, self._tick)

    def request_stop(self):
        if not self.state:
            return
        if self.state["lock"]:
            self._abandon_dialog()
        elif messagebox.askyesno(APP_NAME, "Arrêter la session maintenant ?\nLe temps déjà travaillé sera comptabilisé."):
            self.finish(completed=False)

    def _abandon_dialog(self):
        win = tk.Toplevel(self.root, bg=BG, padx=20, pady=20)
        win.title("Mode engagement")
        win.transient(self.root)
        win.grab_set()
        ttk.Label(win, text="Tu t'es engagé à aller jusqu'au bout.", style="H1.TLabel").pack(anchor="w")
        ttk.Label(win, text=f"Pour abandonner quand même, tape exactement :\n« {ABANDON_PHRASE} »",
                  style="Muted.TLabel").pack(anchor="w", pady=10)
        v = tk.StringVar()
        e = ttk.Entry(win, textvariable=v, width=46)
        e.pack(fill="x")
        e.focus_set()

        def confirm():
            if v.get().strip().lower() == ABANDON_PHRASE:
                win.destroy()
                self.finish(completed=False)
            else:
                e.delete(0, "end")

        row = ttk.Frame(win)
        row.pack(fill="x", pady=(14, 0))
        ttk.Button(row, text="Je reprends le travail", style="Accent.TButton", command=win.destroy).pack(side="left")
        ttk.Button(row, text="Abandonner", style="Danger.TButton", command=confirm).pack(side="right")
        e.bind("<Return>", lambda _: confirm())

    def _release(self, st: dict):
        """Retire tous les blocages décrits par un état de session."""
        self.stop_flag.set()
        if st.get("notif_prev"):
            notifications_restore(st["notif_prev"])
        if st.get("sites"):
            try:
                unblock_sites()
            except OSError:
                messagebox.showerror(APP_NAME, "Impossible de nettoyer le fichier hosts.\nRelance l'application en administrateur.")
                return
        try:
            STATE_FILE.unlink()
        except FileNotFoundError:
            pass

    def finish(self, completed: bool):
        st, self.state = self.state, None
        self._release(st)
        actual = min(st["planned_min"], (time.time() - st["start"]) / 60)
        self.live.pack_forget()
        self.setup.pack(fill="both", expand=True)
        winsound.MessageBeep(winsound.MB_ICONASTERISK)
        self.root.deiconify()
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.root.after(300, lambda: self.root.attributes("-topmost", False))
        self._review_dialog(st, actual, completed)

    def _review_dialog(self, st, actual, completed):
        win = tk.Toplevel(self.root, bg=BG, padx=20, pady=20)
        win.title("Bilan de la session")
        win.transient(self.root)
        win.grab_set()
        title = "Session terminée. Bravo." if completed else "Session interrompue."
        ttk.Label(win, text=title, style="H1.TLabel").pack(anchor="w")
        ttk.Label(win, text=f"{actual:.0f} min de travail sur « {st['intention']} »", style="Muted.TLabel",
                  wraplength=420).pack(anchor="w", pady=(4, 12))
        ttk.Label(win, text="Profondeur de ta concentration (1 = dispersé, 5 = immersion totale)").pack(anchor="w")
        depth = tk.IntVar(value=4)
        row = ttk.Frame(win)
        row.pack(anchor="w", pady=6)
        for i in range(1, 6):
            tk.Radiobutton(row, text=str(i), value=i, variable=depth, bg=BG, fg=TEXT, selectcolor=SURFACE_2,
                           activebackground=BG, activeforeground=ACCENT, font=("Segoe UI", 11)).pack(side="left", padx=6)
        ttk.Label(win, text="Note (ce qui a marché, ce qui t'a distrait)").pack(anchor="w", pady=(8, 2))
        note = tk.StringVar()
        ttk.Entry(win, textvariable=note, width=50).pack(fill="x")

        def save():
            self.sessions.append({
                "start": dt.datetime.fromtimestamp(st["start"]).isoformat(timespec="minutes"),
                "planned_min": st["planned_min"], "actual_min": round(actual, 1),
                "intention": st["intention"], "completed": completed, "depth": depth.get(),
                "note": note.get().strip(), "blocked": st.get("blocked_count", 0),
            })
            save_json(SESSIONS_FILE, self.sessions)
            win.destroy()
            self.intention.set("")
            self.nb.select(self.tab_score)

        ttk.Button(win, text="Enregistrer", style="Accent.TButton", command=save).pack(pady=(14, 0))
        win.protocol("WM_DELETE_WINDOW", save)

    def _recover(self):
        """Après un plantage ou une fermeture forcée : reprend ou nettoie la session laissée ouverte."""
        st = load_json(STATE_FILE, None)
        if not st or not st.get("active"):
            return
        if st["end"] > time.time():
            if st.get("sites") and not self.admin:
                st["sites"] = False
                try:
                    unblock_sites()
                except OSError:
                    pass
            self.state = st
            self._apply_blocks()
            self._show_live()
            messagebox.showinfo(APP_NAME, "Ta session de deep work n'était pas terminée : elle reprend.")
        else:
            self._release(st)

    def on_close(self):
        if self.state:
            if self.state["lock"]:
                self._abandon_dialog()
                return
            if not messagebox.askyesno(APP_NAME, "Une session est en cours. Arrêter et quitter ?"):
                return
            st, self.state = self.state, None
            self._release(st)
        self.root.destroy()

    def elevate(self):
        if relaunch_as_admin():
            self.root.destroy()

    # ----- Listes
    def save_lists(self):
        def lines(t):
            return [l.strip() for l in t.get("1.0", "end").splitlines() if l.strip()]
        self.config["apps"] = [a.lower() if a.lower().endswith(".exe") else a.lower() + ".exe" for a in lines(self.txt_apps)]
        self.config["sites"] = [s.lower() for s in lines(self.txt_sites)]
        save_json(CONFIG_FILE, self.config)
        self.txt_apps.delete("1.0", "end")
        self.txt_apps.insert("1.0", "\n".join(self.config["apps"]))
        msg = "Enregistré."
        if self.state:
            msg += " Les changements s'appliqueront à la prochaine session."
        self.lbl_saved.configure(text=msg)
        self.root.after(4000, lambda: self.lbl_saved.configure(text=""))

    def pick_running(self):
        win = tk.Toplevel(self.root, bg=BG, padx=16, pady=16)
        win.title("Applications ouvertes")
        win.transient(self.root)
        ttk.Label(win, text="Double-clique pour ajouter à la liste noire").pack(anchor="w", pady=(0, 6))
        lb = tk.Listbox(win, bg=SURFACE_2, fg=TEXT, selectbackground=ACCENT_DIM, relief="flat",
                        highlightthickness=0, width=40, height=20, font=("Consolas", 10))
        lb.pack(fill="both", expand=True)
        for name in sorted(running_processes() - PROTECTED):
            lb.insert("end", name)

        def add(_):
            sel = lb.curselection()
            if sel:
                name = lb.get(sel[0])
                current = self.txt_apps.get("1.0", "end").split()
                if name not in current:
                    self.txt_apps.insert("end", ("\n" if current else "") + name)
                lb.delete(sel[0])

        lb.bind("<Double-Button-1>", add)

    # ----- Rituel
    def _ritual_check(self):
        if all(v.get() for v in self.ritual_vars):
            self.btn_shutdown.state(["!disabled"])
        else:
            self.btn_shutdown.state(["disabled"])

    def shutdown_complete(self):
        self.config["last_shutdown"] = dt.date.today().isoformat()
        save_json(CONFIG_FILE, self.config)
        for v in self.ritual_vars:
            v.set(False)
        self.btn_shutdown.state(["disabled"])
        self.lbl_ritual.configure(text="Shutdown complete.\nTa journée de travail est terminée : déconnecte-toi vraiment. "
                                       "Le repos fait partie du travail profond.")

    # ----- Score
    def save_goal(self):
        try:
            self.config["weekly_goal_hours"] = max(1, int(self.goal.get()))
        except (tk.TclError, ValueError):
            return
        save_json(CONFIG_FILE, self.config)
        self.refresh_score()

    def refresh_score(self):
        if not hasattr(self, "canvas"):
            return
        today = dt.date.today()
        monday = today - dt.timedelta(days=today.weekday())
        per_day = [0.0] * 7
        days_with_work = set()
        for s in self.sessions:
            d = dt.datetime.fromisoformat(s["start"]).date()
            days_with_work.add(d)
            if monday <= d <= today:
                per_day[(d - monday).days] += s["actual_min"]

        streak, d = 0, today
        if d not in days_with_work:
            d -= dt.timedelta(days=1)
        while d in days_with_work:
            streak += 1
            d -= dt.timedelta(days=1)

        week_h = sum(per_day) / 60
        goal = self.config["weekly_goal_hours"]
        self.lbl_week.configure(text=f"Cette semaine : {week_h:.1f} h sur {goal} h  ({min(100, 100 * week_h / goal):.0f} %)"
                                     f"    ·    Série : {streak} jour{'s' if streak > 1 else ''}"
                                     f"    ·    Total : {len(self.sessions)} sessions")

        c = self.canvas
        c.delete("all")
        w, h = max(c.winfo_width(), 400), 220
        pad_l, pad_b, pad_t = 40, 30, 20
        daily_goal = goal * 60 / 5  # objectif journalier indicatif sur 5 jours ouvrés
        top = max(max(per_day), daily_goal, 60)
        slot = (w - pad_l - 20) / 7
        y_goal = h - pad_b - (h - pad_b - pad_t) * daily_goal / top
        c.create_line(pad_l, y_goal, w - 20, y_goal, fill=ACCENT_DIM, dash=(4, 4))
        c.create_text(pad_l - 6, y_goal, text=f"{daily_goal / 60:.0f}h", fill=MUTED, anchor="e", font=("Segoe UI", 8))
        for i, label in enumerate(["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]):
            x0 = pad_l + i * slot + slot * 0.25
            x1 = x0 + slot * 0.5
            bh = (h - pad_b - pad_t) * per_day[i] / top
            colour = ACCENT if per_day[i] >= daily_goal else "#a07a42"
            if per_day[i] > 0:
                c.create_rectangle(x0, h - pad_b - bh, x1, h - pad_b, fill=colour, width=0)
                c.create_text((x0 + x1) / 2, h - pad_b - bh - 9, text=f"{per_day[i] / 60:.1f}h", fill=TEXT, font=("Segoe UI", 8))
            is_today = monday + dt.timedelta(days=i) == today
            c.create_text((x0 + x1) / 2, h - pad_b + 14, text=label, fill=ACCENT if is_today else MUTED,
                          font=("Segoe UI Semibold" if is_today else "Segoe UI", 9))

        t = self.txt_history
        t.configure(state="normal")
        t.delete("1.0", "end")
        if not self.sessions:
            t.insert("1.0", "Aucune session pour l'instant. Lance ta première session dans l'onglet Session.")
        for s in reversed(self.sessions[-30:]):
            mark = "✓" if s["completed"] else "✗"
            t.insert("end", f"{mark} {s['start'].replace('T', ' ')}  {s['actual_min']:>5.0f} min  "
                            f"profondeur {s['depth']}/5  {s['intention']}\n")
            if s.get("note"):
                t.insert("end", f"    ↳ {s['note']}\n")
        t.configure(state="disabled")


def main():
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except (AttributeError, OSError):
        pass
    root = tk.Tk()
    DeepWorkApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
