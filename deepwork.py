"""
Deep Work Focus — bloqueur de distractions inspiré de « Deep Work » (Cal Newport).

Le moteur (ce fichier) applique les blocages et sert l'interface (dossier ui/) sur
127.0.0.1. L'interface s'ouvre dans une fenêtre Edge en mode application.

Pendant une session :
  - coupe les notifications Windows (toasts),
  - ferme automatiquement les applications cochées,
  - bloque les sites cochés via le fichier hosts (nécessite les droits admin).

Fermer la fenêtre n'arrête pas la session : le moteur continue en arrière-plan et
rouvre la fenêtre à la fin. Après un plantage, tout est repris ou restauré au lancement.
"""

import ctypes
import datetime as dt
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
import winreg
import winsound
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_NAME = "Deep Work Focus"
ROOT = Path(__file__).resolve().parent
UI_DIR = ROOT / "ui"
APP_DIR = Path(os.environ.get("APPDATA", Path.home())) / "DeepWorkFocus"
CONFIG_FILE = APP_DIR / "config.json"
SESSIONS_FILE = APP_DIR / "sessions.json"
STATE_FILE = APP_DIR / "state.json"
APPS_CACHE = APP_DIR / "apps.json"
SERVER_FILE = APP_DIR / "server.json"
WINDOW_PROFILE = APP_DIR / "fenetre"
HOSTS_FILE = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "drivers" / "etc" / "hosts"

HOSTS_START = "# >>> DeepWorkFocus (ne pas modifier)"
HOSTS_END = "# <<< DeepWorkFocus"
CREATE_NO_WINDOW = 0x08000000
ABANDON_PHRASE = "j'abandonne ma session de deep work"
IDLE_EXIT_SECONDS = 25

NOTIF_KEYS = [
    (r"Software\Microsoft\Windows\CurrentVersion\PushNotifications", "ToastEnabled"),
    (r"Software\Microsoft\Windows\CurrentVersion\Notifications\Settings", "NOC_GLOBAL_SETTING_TOASTS_ENABLED"),
]

# Processus qu'on ne tue jamais.
PROTECTED = {"explorer.exe", "python.exe", "pythonw.exe", "svchost.exe", "csrss.exe", "winlogon.exe",
             "dwm.exe", "taskmgr.exe", "system", "lsass.exe", "msedgewebview2.exe",
             "conhost.exe", "powershell.exe", "searchhost.exe", "startmenuexperiencehost.exe"}
# Navigateurs pouvant afficher la fenêtre de l'application (par ordre de préférence).
WINDOW_BROWSERS = ("msedge.exe", "chrome.exe", "brave.exe")

DEFAULT_CONFIG = {
    "apps": ["discord.exe", "slack.exe", "whatsapp.exe", "telegram.exe", "steam.exe",
             "epicgameslauncher.exe", "spotify.exe", "messenger.exe"],
    "sites": ["facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com",
              "youtube.com", "reddit.com", "netflix.com", "twitch.tv", "linkedin.com",
              "snapchat.com", "pinterest.com"],
    "weekly_goal_hours": 15,
    "default_minutes": 90,
    "shutdown_checklist": [
        "J'ai vérifié mes e-mails et messages une dernière fois",
        "J'ai noté chaque tâche en suspens dans ma liste",
        "J'ai relu mon agenda des prochains jours",
        "J'ai planifié les blocs de deep work de demain",
    ],
}

# --- Classement des applications installées -----------------------------------
CATEGORY_WORDS = {
    "social": ["discord", "whatsapp", "telegram", "messenger", "signal", "instagram", "facebook", "snapchat",
               "tiktok", "twitter", "slack", "skype", "wechat", "viber", "threads", "reddit", "mastodon",
               "bluesky", "linkedin", "pinterest", "teams"],
    "games": ["steam", "epic games", "epicgameslauncher", "battle.net", "riot", "league of legends", "valorant",
              "xbox", "solitaire", "candy crush", "roblox", "minecraft", "ubisoft", "ea", "origin", "gog galaxy",
              "playnite", "fortnite", "itch", "rockstar", "game", "games", "jeu", "jeux", "overwolf"],
    "media": ["spotify", "netflix", "youtube", "prime video", "disney", "twitch", "deezer", "vlc", "plex",
              "kodi", "crunchyroll", "molotov", "apple tv", "apple music", "music", "musique", "films",
              "movies", "tv", "podcast"],
    "browsers": ["chrome", "firefox", "opera", "brave", "vivaldi", "tor browser", "arc", "navigation privée"],
}
SKIP_NAME = ("uninstall", "désinstall", "desinstall", "setup", "installer", "reset", "readme", "help",
             "aide", "documentation", "module docs", "command prompt", "invite de commandes",
             "release notes", "native tools", "cross tools", "developer powershell", "notifier")
SKIP_EXE = {"cmd.exe", "pwsh.exe", "msiexec.exe", "setup.exe", "uninstall.exe", "uninst.exe",
            "rundll32.exe", "appvlp.exe", "setlang.exe", "wscript.exe"}


def categorize(name: str, exe: str) -> str:
    haystack = f"{name} {exe.removesuffix('.exe')}".lower()
    for category, words in CATEGORY_WORDS.items():
        for word in words:
            if re.search(rf"(?<![a-z0-9]){re.escape(word)}(?![a-z0-9])", haystack):
                return category
    return "other"


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


def pythonw() -> str:
    exe = Path(sys.executable)
    alt = exe.with_name("pythonw.exe")
    return str(alt if alt.exists() else exe)


def relaunch_as_admin() -> bool:
    args = f'"{Path(__file__).resolve()}" --replace'
    return ctypes.windll.shell32.ShellExecuteW(None, "runas", pythonw(), args, str(ROOT), 1) > 32


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


def clean_domain(site: str) -> str:
    site = site.strip().lower().removeprefix("https://").removeprefix("http://").split("/")[0]
    return site.removeprefix("www.")


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
        site = clean_domain(site)
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


class _ProcessEntry(ctypes.Structure):
    _fields_ = [("dwSize", ctypes.c_ulong), ("cntUsage", ctypes.c_ulong), ("th32ProcessID", ctypes.c_ulong),
                ("th32DefaultHeapID", ctypes.c_size_t), ("th32ModuleID", ctypes.c_ulong),
                ("cntThreads", ctypes.c_ulong), ("th32ParentProcessID", ctypes.c_ulong),
                ("pcPriClassBase", ctypes.c_long), ("dwFlags", ctypes.c_ulong), ("szExeFile", ctypes.c_wchar * 260)]


class _UnicodeString(ctypes.Structure):
    _fields_ = [("Length", ctypes.c_ushort), ("MaximumLength", ctypes.c_ushort), ("Buffer", ctypes.c_void_p)]


_kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
_kernel32.CreateToolhelp32Snapshot.restype = ctypes.c_void_p
_kernel32.OpenProcess.restype = ctypes.c_void_p
_kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
_kernel32.TerminateProcess.argtypes = [ctypes.c_void_p, ctypes.c_uint]
_kernel32.Process32FirstW.argtypes = _kernel32.Process32NextW.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
_ntdll = ctypes.WinDLL("ntdll")
_ntdll.NtQueryInformationProcess.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_ulong,
                                             ctypes.POINTER(ctypes.c_ulong)]


def list_processes() -> list[tuple[int, str]]:
    """(pid, nom en minuscules) de tous les processus, sans lancer de commande externe."""
    snap = _kernel32.CreateToolhelp32Snapshot(0x2, 0)  # TH32CS_SNAPPROCESS
    if not snap or snap == ctypes.c_void_p(-1).value:
        return []
    out = []
    try:
        entry = _ProcessEntry()
        entry.dwSize = ctypes.sizeof(_ProcessEntry)
        ok = _kernel32.Process32FirstW(snap, ctypes.byref(entry))
        while ok:
            out.append((entry.th32ProcessID, entry.szExeFile.lower()))
            ok = _kernel32.Process32NextW(snap, ctypes.byref(entry))
    finally:
        _kernel32.CloseHandle(snap)
    return out


def process_command_line(pid: int) -> str:
    handle = _kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
    if not handle:
        return ""
    try:
        size = ctypes.c_ulong(0)
        _ntdll.NtQueryInformationProcess(handle, 60, None, 0, ctypes.byref(size))  # ProcessCommandLineInformation
        if not size.value:
            return ""
        buf = ctypes.create_string_buffer(size.value)
        if _ntdll.NtQueryInformationProcess(handle, 60, buf, size, ctypes.byref(size)) != 0:
            return ""
        us = _UnicodeString.from_buffer(buf)
        return ctypes.wstring_at(us.Buffer, us.Length // 2) if us.Buffer else ""
    finally:
        _kernel32.CloseHandle(handle)


def running_processes() -> set[str]:
    return {name for _, name in list_processes()}


def kill_blocked(apps: list[str]) -> list[str]:
    targets = {a.strip().lower() for a in apps if a.strip()} - PROTECTED
    marker = str(WINDOW_PROFILE).lower()
    killed = set()
    for pid, name in list_processes():
        if name not in targets:
            continue
        # Le navigateur qui affiche Deep Work Focus est épargné : on reconnaît son profil dédié.
        if name in WINDOW_BROWSERS and marker in process_command_line(pid).lower():
            continue
        handle = _kernel32.OpenProcess(0x0001, False, pid)  # PROCESS_TERMINATE
        if handle:
            if _kernel32.TerminateProcess(handle, 1):
                killed.add(name)
            _kernel32.CloseHandle(handle)
    return sorted(killed)


def scan_installed_apps(refresh: bool = False) -> list[dict]:
    """Applications du menu Démarrer et du Microsoft Store, dédoublonnées par processus."""
    if not refresh:
        cached = load_json(APPS_CACHE, None)
        if cached:
            return cached
    result = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                             str(ROOT / "scan_apps.ps1")], capture_output=True, creationflags=CREATE_NO_WINDOW)
    try:
        raw = json.loads(result.stdout.decode("utf-8-sig", errors="ignore") or "[]")
    except ValueError:
        raw = []
    if isinstance(raw, dict):
        raw = [raw]
    sysroot = os.environ.get("SystemRoot", r"C:\Windows").lower()
    by_exe: dict[str, dict] = {}
    for item in raw:
        exe, name = (item.get("exe") or "").lower(), (item.get("name") or "").strip()
        if not exe or not name or exe in SKIP_EXE or exe in PROTECTED or exe.startswith("unins"):
            continue
        if any(word in name.lower() for word in SKIP_NAME):
            continue
        if (item.get("path") or "").lower().startswith(sysroot):
            continue
        current = by_exe.get(exe)
        if current is None or len(name) < len(current["name"]):
            by_exe[exe] = {"name": name, "exe": exe, "icon": item.get("icon") or (current or {}).get("icon", ""),
                           "category": categorize(name, exe)}
    apps = sorted(by_exe.values(), key=lambda a: a["name"].casefold())
    if apps:
        save_json(APPS_CACHE, apps)
    return apps


def find_window_browser() -> Path | None:
    """Un navigateur Chromium capable d'ouvrir une fenêtre en mode application."""
    for exe in WINDOW_BROWSERS:
        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            try:
                with winreg.OpenKey(hive, rf"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exe}") as key:
                    path = Path(winreg.QueryValueEx(key, "")[0].strip('"'))
                if path.is_file():
                    return path
            except OSError:
                pass
    roots = [os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
             os.environ.get("ProgramFiles", r"C:\Program Files"), os.environ.get("LOCALAPPDATA", "")]
    for sub in (r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe",
                r"BraveSoftware\Brave-Browser\Application\brave.exe"):
        for root in roots:
            path = Path(root) / sub
            if root and path.is_file():
                return path
    return None


def open_window(url: str) -> None:
    browser = find_window_browser()
    if browser:
        subprocess.Popen([str(browser), f"--app={url}", f"--user-data-dir={WINDOW_PROFILE}",
                          "--no-first-run", "--no-default-browser-check", "--window-size=1180,820",
                          "--disable-features=Translate", "--disable-sync"])
    else:
        webbrowser.open(url)


# --- Moteur --------------------------------------------------------------------
class ApiError(Exception):
    pass


class Engine:
    def __init__(self):
        self.lock = threading.RLock()
        self.config = load_config()
        self.sessions = load_json(SESSIONS_FILE, [])
        self.admin = is_admin()
        self.session: dict | None = None
        self.review_id: str | None = None
        self.last_seen = time.time()
        self.url = ""
        self.on_idle = None
        self.notice = ""
        self._recover()

    # ----- Cycle de vie
    def _recover(self):
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
            self.session = st
            self._apply_blocks()
            self.notice = "Ta session n'était pas terminée : elle a repris là où tu l'avais laissée."
        else:
            self._release(st)
            self._log_session(st, completed=True)

    def run_forever(self):
        while True:
            time.sleep(1.5)
            with self.lock:
                st = self.session
                apps = list(self.config["apps"]) if st and st.get("apps") else []
                if st and time.time() >= st["end"]:
                    self._finish(completed=True)
                    continue
                idle = not st and not self.review_id and time.time() - self.last_seen > IDLE_EXIT_SECONDS
            if idle and self.on_idle:
                self.on_idle()
                return
            if apps:
                try:
                    killed = kill_blocked(apps)
                except OSError:
                    killed = []
                if killed:
                    with self.lock:
                        if self.session:
                            self.session["blocked_count"] += len(killed)
                            self.session["last_killed"] = {"names": killed, "at": time.time()}

    # ----- Blocages
    def _apply_blocks(self):
        st = self.session
        errors = []
        if st["notif"] and not st.get("notif_prev"):
            try:
                st["notif_prev"] = notifications_off()
            except OSError as e:
                errors.append(f"Notifications : {e}")
        save_json(STATE_FILE, st)  # écrit avant le hosts, pour pouvoir tout restaurer après un plantage
        if st["sites"]:
            try:
                block_sites(self.config["sites"])
            except OSError as e:
                st["sites"] = False
                errors.append(f"Sites : {e}")
        save_json(STATE_FILE, st)
        return errors

    def _release(self, st: dict):
        if st.get("notif_prev"):
            notifications_restore(st["notif_prev"])
        if st.get("sites"):
            try:
                unblock_sites()
            except OSError:
                return
        try:
            STATE_FILE.unlink()
        except FileNotFoundError:
            pass

    def _log_session(self, st: dict, completed: bool) -> dict:
        actual = max(0.0, min(st["planned_min"], (min(time.time(), st["end"]) - st["start"]) / 60))
        entry = {
            "id": st["id"], "start": dt.datetime.fromtimestamp(st["start"]).isoformat(timespec="minutes"),
            "planned_min": st["planned_min"], "actual_min": round(actual, 1), "intention": st["intention"],
            "completed": completed, "depth": None, "note": "", "blocked": st.get("blocked_count", 0),
        }
        self.sessions.append(entry)
        save_json(SESSIONS_FILE, self.sessions)
        return entry

    def _finish(self, completed: bool):
        st, self.session = self.session, None
        self._release(st)
        self._log_session(st, completed)
        self.review_id = st["id"]
        winsound.MessageBeep(winsound.MB_ICONASTERISK)
        if time.time() - self.last_seen > 4 and self.url:
            open_window(self.url)

    # ----- Actions de l'interface
    def snapshot(self) -> dict:
        self.last_seen = time.time()
        with self.lock:
            notice, self.notice = self.notice, ""
            session = None
            if self.session:
                session = {k: self.session.get(k) for k in
                           ("intention", "start", "end", "planned_min", "lock", "notif", "apps", "sites",
                            "blocked_count", "last_killed")}
            review = next((s for s in self.sessions if s["id"] == self.review_id), None) if self.review_id else None
            return {
                "now": time.time(), "admin": self.admin, "config": self.config, "session": session,
                "review": review, "sessions": self.sessions, "notice": notice,
                "today": dt.date.today().isoformat(), "abandon_phrase": ABANDON_PHRASE,
            }

    def start(self, data: dict):
        with self.lock:
            if self.session:
                raise ApiError("Une session est déjà en cours.")
            intention = str(data.get("intention", "")).strip()
            minutes = int(data.get("minutes", 0))
            if not intention:
                raise ApiError("Écris ton intention avant de commencer.")
            if not 5 <= minutes <= 480:
                raise ApiError("Choisis une durée entre 5 et 480 minutes.")
            now = time.time()
            self.session = {
                "id": secrets.token_hex(6), "active": True, "start": now, "end": now + minutes * 60,
                "planned_min": minutes, "intention": intention[:200],
                "notif": bool(data.get("notif")), "apps": bool(data.get("apps")),
                "sites": bool(data.get("sites")) and self.admin, "lock": bool(data.get("lock")),
                "notif_prev": {}, "blocked_count": 0, "last_killed": None,
            }
            self.review_id = None
            self.config["default_minutes"] = minutes
            save_json(CONFIG_FILE, self.config)
            errors = self._apply_blocks()
        if self.session.get("apps"):
            threading.Thread(target=kill_blocked, args=(list(self.config["apps"]),), daemon=True).start()
        return {"warnings": errors}

    def stop(self, data: dict):
        with self.lock:
            if not self.session:
                return {}
            if self.session["lock"] and str(data.get("phrase", "")).strip().lower() != ABANDON_PHRASE:
                raise ApiError("La phrase ne correspond pas. Ta session continue.")
            self._finish(completed=False)
        return {}

    def review(self, data: dict):
        with self.lock:
            for s in self.sessions:
                if s["id"] == data.get("id"):
                    depth = data.get("depth")
                    s["depth"] = int(depth) if depth in (1, 2, 3, 4, 5) else None
                    s["note"] = str(data.get("note", "")).strip()[:500]
            save_json(SESSIONS_FILE, self.sessions)
            self.review_id = None
        return {}

    def update_config(self, data: dict):
        with self.lock:
            cfg = self.config
            st = self.session
            if "apps" in data:
                apps = sorted({(a if a.endswith(".exe") else a + ".exe") for a in
                               (str(x).strip().lower() for x in data["apps"]) if a} - PROTECTED)
                if st and st["lock"] and not set(cfg["apps"]) <= set(apps):
                    raise ApiError("Mode engagement : tu peux ajouter des blocages, pas en retirer.")
                cfg["apps"] = apps
            if "sites" in data:
                sites = sorted({d for d in (clean_domain(str(x)) for x in data["sites"]) if "." in d})
                if st and st["lock"] and not set(cfg["sites"]) <= set(sites):
                    raise ApiError("Mode engagement : tu peux ajouter des blocages, pas en retirer.")
                cfg["sites"] = sites
                if st and st["sites"]:
                    block_sites(sites)
            if "weekly_goal_hours" in data:
                cfg["weekly_goal_hours"] = max(1, min(80, int(data["weekly_goal_hours"])))
            if "shutdown_checklist" in data:
                cfg["shutdown_checklist"] = [str(x).strip()[:160] for x in data["shutdown_checklist"] if str(x).strip()]
            if data.get("shutdown_done"):
                cfg["last_shutdown"] = dt.date.today().isoformat()
            save_json(CONFIG_FILE, cfg)
        return {"config": self.config}

    def elevate(self):
        with self.lock:
            if self.session:
                raise ApiError("Termine d'abord ta session en cours.")
        if not relaunch_as_admin():
            raise ApiError("Élévation annulée.")
        return {}


# --- Serveur HTTP local --------------------------------------------------------
STATIC = {"/": ("index.html", "text/html; charset=utf-8"),
          "/style.css": ("style.css", "text/css; charset=utf-8"),
          "/app.js": ("app.js", "text/javascript; charset=utf-8")}


def make_handler(engine: Engine, token: str, port_ref: list):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, code: int, body: bytes, ctype: str):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _json(self, code: int, data):
            self._send(code, json.dumps(data, ensure_ascii=False).encode("utf-8"), "application/json")

        def _host_ok(self) -> bool:
            # Protège contre le DNS rebinding : seule l'adresse locale exacte est acceptée.
            return self.headers.get("Host") in (f"127.0.0.1:{port_ref[0]}", f"localhost:{port_ref[0]}")

        def _api_ok(self) -> bool:
            return self._host_ok() and secrets.compare_digest(self.headers.get("X-Token", ""), token)

        def do_GET(self):
            path = self.path.split("?", 1)[0]
            if path in STATIC and self._host_ok():
                name, ctype = STATIC[path]
                body = (UI_DIR / name).read_bytes()
                if name == "index.html":
                    body = body.replace(b"__TOKEN__", token.encode())
                return self._send(200, body, ctype)
            if not self._api_ok():
                return self._json(403, {"error": "Accès refusé."})
            if path == "/api/ping":
                return self._json(200, {"ok": True})
            if path == "/api/state":
                return self._json(200, engine.snapshot())
            if path == "/api/apps":
                return self._json(200, {"apps": scan_installed_apps(refresh="refresh=1" in self.path)})
            self._json(404, {"error": "Introuvable."})

        def do_POST(self):
            if not self._api_ok():
                return self._json(403, {"error": "Accès refusé."})
            length = int(self.headers.get("Content-Length") or 0)
            try:
                data = json.loads(self.rfile.read(length) or b"{}")
            except ValueError:
                data = {}
            actions = {"/api/start": engine.start, "/api/stop": engine.stop, "/api/review": engine.review,
                       "/api/config": engine.update_config}
            try:
                if self.path == "/api/elevate":
                    result = engine.elevate()
                elif self.path == "/api/quit":
                    self._json(200, {})
                    threading.Thread(target=self.server.shutdown, daemon=True).start()
                    return
                elif self.path in actions:
                    result = actions[self.path](data)
                else:
                    return self._json(404, {"error": "Introuvable."})
            except ApiError as e:
                return self._json(400, {"error": str(e)})
            except (OSError, ValueError, TypeError) as e:
                return self._json(500, {"error": f"Erreur : {e}"})
            self._json(200, result or {})

    return Handler


def ping(port: int, token: str) -> bool:
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/ping", headers={"X-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=1.5) as r:
            return r.status == 200
    except OSError:
        return False


def main():
    APP_DIR.mkdir(parents=True, exist_ok=True)
    replace = "--replace" in sys.argv
    previous = load_json(SERVER_FILE, {})

    if previous and ping(previous["port"], previous["token"]):
        if not replace:
            open_window(f"http://127.0.0.1:{previous['port']}/")
            return
        # Relance en administrateur : on prend la place de l'instance existante sur le même port,
        # pour que la fenêtre déjà ouverte se reconnecte toute seule.
        req = urllib.request.Request(f"http://127.0.0.1:{previous['port']}/api/quit", data=b"{}", method="POST",
                                     headers={"X-Token": previous["token"], "Content-Type": "application/json"})
        try:
            urllib.request.urlopen(req, timeout=2).close()
        except OSError:
            pass
        time.sleep(1.0)

    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("DeepWorkFocus")
    except (AttributeError, OSError):
        pass

    engine = Engine()
    port_ref = [0]
    token = previous.get("token") if replace and previous else secrets.token_urlsafe(24)
    server = None
    if replace and previous:
        try:
            server = ThreadingHTTPServer(("127.0.0.1", previous["port"]), make_handler(engine, token, port_ref))
        except OSError:
            server = None
    reopen = server is None
    if server is None:
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(engine, token, port_ref))
    port_ref[0] = server.server_address[1]
    engine.url = f"http://127.0.0.1:{port_ref[0]}/"
    save_json(SERVER_FILE, {"port": port_ref[0], "token": token, "pid": os.getpid()})

    engine.on_idle = lambda: threading.Thread(target=server.shutdown, daemon=True).start()
    threading.Thread(target=engine.run_forever, daemon=True).start()
    if reopen:
        open_window(engine.url)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()
        with engine.lock:
            current = load_json(SERVER_FILE, {})
            if current.get("pid") == os.getpid():
                SERVER_FILE.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
