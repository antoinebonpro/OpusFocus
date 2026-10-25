"""
OpusFocus — bloqueur de distractions inspiré de « Deep Work » (Cal Newport).

Le moteur (ce fichier) applique les blocages et sert l'interface (dossier ui/) sur
127.0.0.1. L'interface s'ouvre dans une fenêtre Edge en mode application.

Pendant une session :
  - coupe les notifications Windows (toasts),
  - ferme automatiquement les applications cochées,
  - bloque les sites cochés via le fichier hosts : par le service installé une fois pour toutes
    (`--sites-helper`, tâche planifiée SYSTEM), sinon directement en mode administrateur.

Fermer la fenêtre n'arrête rien : le moteur reste actif avec une icône près de l'horloge et
rouvre la fenêtre à la fin d'une session. Après un plantage, tout est repris ou restauré au lancement.
"""

import ctypes
import datetime as dt
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import winreg
import winsound
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_NAME = "OpusFocus"
FROZEN = getattr(sys, "frozen", False)  # empaqueté en .exe par PyInstaller
# En .exe, les fichiers embarqués (ui/, scan_apps.ps1) sont extraits dans sys._MEIPASS.
ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
UI_DIR = ROOT / "ui"
# Application installée : la musique est dans « Musique\OpusFocus ». En développement : le dossier Music du projet.
MUSIC_DIR = Path.home() / "Music" / APP_NAME if FROZEN else Path(__file__).resolve().parent / "Music"
APP_DIR = Path(os.environ.get("APPDATA", Path.home())) / APP_NAME
# Dossier des versions nommées « Deep Work Focus » : repris au premier lancement, rien n'est perdu.
LEGACY_APP_DIR = APP_DIR.with_name("DeepWorkFocus")
CONFIG_FILE = APP_DIR / "config.json"
SESSIONS_FILE = APP_DIR / "sessions.json"
STATE_FILE = APP_DIR / "state.json"
APPS_CACHE = APP_DIR / "apps.json"
SERVER_FILE = APP_DIR / "server.json"
# Dernier port et jeton utilisés : un moteur relancé les reprend, et la fenêtre restée ouverte se reconnecte.
ENDPOINT_FILE = APP_DIR / "endpoint.json"
ERROR_LOG = APP_DIR / "erreurs.log"
WINDOW_PROFILE = APP_DIR / "fenetre"
HOSTS_FILE = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "drivers" / "etc" / "hosts"

HOSTS_START = "# >>> OpusFocus (ne pas modifier)"
HOSTS_END = "# <<< OpusFocus"
# Marqueurs des anciennes versions : un bloc laissé par l'une d'elles est retiré lui aussi.
HOSTS_MARKERS = ((HOSTS_START, HOSTS_END), ("# >>> DeepWorkFocus (ne pas modifier)", "# <<< DeepWorkFocus"))
CREATE_NO_WINDOW = 0x08000000
ABANDON_PHRASE = "j'abandonne ma session de deep work"  # par défaut, modifiable dans les réglages
PHRASE_MIN, PHRASE_MAX = 10, 150
IDLE_EXIT_SECONDS = 25
MUTEX_NAME = "Local\\OpusFocus"
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
AUDIO_TYPES = {".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".aac": "audio/aac",
               ".ogg": "audio/ogg", ".opus": "audio/ogg", ".wav": "audio/wav", ".flac": "audio/flac",
               ".webm": "audio/webm"}

NOTIF_KEYS = [
    (r"Software\Microsoft\Windows\CurrentVersion\PushNotifications", "ToastEnabled"),
    (r"Software\Microsoft\Windows\CurrentVersion\Notifications\Settings", "NOC_GLOBAL_SETTING_TOASTS_ENABLED"),
]

# Processus qu'on ne tue jamais.
PROTECTED = {"explorer.exe", "python.exe", "pythonw.exe", "opusfocus.exe", "svchost.exe", "csrss.exe", "winlogon.exe",
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
    "music_autoplay": False,
    "default_minutes": 90,
    "launch_at_startup": True,
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


def log_error() -> None:
    """Ajoute l'erreur en cours au journal (gardé court). Un .exe fenêtré n'a pas de console pour l'afficher."""
    try:
        APP_DIR.mkdir(parents=True, exist_ok=True)
        old = ERROR_LOG.read_text(encoding="utf-8")[-50_000:] if ERROR_LOG.exists() else ""
        stamp = time.strftime("%Y-%m-%d %H:%M:%S")
        ERROR_LOG.write_text(f"{old}\n[{stamp}]\n{traceback.format_exc()}", encoding="utf-8")
    except OSError:
        pass


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    cfg.update(load_json(CONFIG_FILE, {}))
    return cfg


# Fichiers de données repris des anciennes versions (le profil de navigateur « fenetre » est recréé).
LEGACY_FILES = ("config.json", "sessions.json", "state.json", "apps.json", "endpoint.json", "erreurs.log")


def migrate_legacy_data() -> bool:
    """Reprend les données des versions « Deep Work Focus » (réglages, historique, session en cours).

    Copie fichier par fichier, sans jamais écraser : l'ancien dossier peut être verrouillé par une fenêtre
    encore ouverte, et le nouveau peut déjà exister. L'ancien dossier reste en place comme sauvegarde.
    """
    if not LEGACY_APP_DIR.is_dir():
        return False
    copied = False
    APP_DIR.mkdir(parents=True, exist_ok=True)
    for name in LEGACY_FILES:
        src, dst = LEGACY_APP_DIR / name, APP_DIR / name
        if src.is_file() and not dst.exists():
            try:
                shutil.copy2(src, dst)
                copied = True
            except OSError:
                log_error()
    return copied


# --- Lancement au démarrage de Windows -------------------------------------------
def startup_command() -> str:
    if FROZEN:
        return f'"{sys.executable}" --startup'
    return f'"{pythonw()}" "{Path(__file__).resolve()}" --startup'


def set_launch_at_startup(enabled: bool) -> None:
    """Ajoute ou retire OpusFocus des programmes lancés à l'ouverture de session (sans droits admin)."""
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
        if enabled:
            winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, startup_command())
        else:
            try:
                winreg.DeleteValue(key, APP_NAME)
            except FileNotFoundError:
                pass


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
    if FROZEN:
        exe, args = sys.executable, "--replace"
    else:
        exe, args = pythonw(), f'"{Path(__file__).resolve()}" --replace'
    return ctypes.windll.shell32.ShellExecuteW(None, "runas", exe, args, str(Path(exe).parent), 1) > 32


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


DOMAIN_RE = re.compile(r"^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$")
APP_RE = re.compile(r'^[^\\/:*?"<>|\x00-\x1f]{1,80}\.exe$')
ICON_RE = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")
MAX_BODY = 256 * 1024


def clean_domain(site: str) -> str:
    """Domaine normalisé, ou "" s'il est invalide (protège le fichier hosts contre l'injection de lignes)."""
    site = site.strip().lower().removeprefix("https://").removeprefix("http://").split("/")[0].split(":")[0]
    site = site.removeprefix("www.")
    return site if DOMAIN_RE.match(site) else ""


def clean_phrase(text: str) -> str:
    """Phrase d'abandon comparable : minuscules, espaces superflus retirés, apostrophe typographique unifiée."""
    return " ".join(text.replace("’", "'").lower().split())


def clean_app(name: str) -> str:
    name = name.strip().lower()
    name = name if name.endswith(".exe") else name + ".exe"
    return name if APP_RE.match(name) and name not in PROTECTED else ""


def strip_hosts_block(content: str) -> str:
    starts, ends = {s for s, _ in HOSTS_MARKERS}, {e for _, e in HOSTS_MARKERS}
    out, skipping = [], False
    for line in content.splitlines():
        if line.strip() in starts:
            skipping = True
            continue
        if line.strip() in ends:
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
    if any(start in content for start, _ in HOSTS_MARKERS):
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


_kernel32.CreateMutexW.restype = ctypes.c_void_p
_kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
_user32 = ctypes.WinDLL("user32", use_last_error=True)
_WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
_user32.EnumWindows.argtypes = [_WNDENUMPROC, ctypes.c_void_p]
for _fn in ("IsWindowVisible", "IsIconic", "SetForegroundWindow", "GetWindowTextLengthW"):
    getattr(_user32, _fn).argtypes = [ctypes.c_void_p]
_user32.GetWindowTextW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_int]
_user32.ShowWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]
_user32.GetWindowThreadProcessId.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
_user32.AllowSetForegroundWindow.argtypes = [ctypes.c_ulong]


def acquire_single_instance(timeout: float = 0.0):
    """Verrou système détenu tant que le processus vit ; None si une autre instance le tient déjà."""
    end = time.time() + timeout
    while True:
        handle = _kernel32.CreateMutexW(None, False, MUTEX_NAME)
        # ERROR_ALREADY_EXISTS (183) ; une instance administrateur donne ERROR_ACCESS_DENIED et un handle nul.
        if handle and ctypes.get_last_error() != 183:
            return handle
        if handle:
            _kernel32.CloseHandle(handle)
        if time.time() >= end:
            return None
        time.sleep(0.2)


def app_window_pids(profile: Path | None = None) -> set[int]:
    """Processus principaux du navigateur lancé avec le profil dédié de l'application."""
    marker, pids = str(profile or WINDOW_PROFILE).lower(), set()
    for pid, name in list_processes():
        if name in WINDOW_BROWSERS:
            cmd = process_command_line(pid).lower()
            if marker in cmd and "--type=" not in cmd:
                pids.add(pid)
    return pids


def find_app_window():
    """Fenêtre de l'application, ou None. On la reconnaît à son navigateur dédié, pas à son titre :
    celui-ci change (minuteur, ancienne version) et ne doit jamais faire croire que la fenêtre est fermée."""
    pids = app_window_pids()
    if not pids:
        return None
    found = []

    def visit(hwnd, _):
        if _user32.IsWindowVisible(hwnd) and _user32.GetWindowTextLengthW(hwnd):
            pid = ctypes.c_ulong()
            _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value in pids:
                found.append(hwnd)
                return False
        return True

    _user32.EnumWindows(_WNDENUMPROC(visit), None)
    return found[0] if found else None


def close_app_window(profile: Path | None = None) -> None:
    """Ferme la fenêtre de l'application (et elle seule : profil de navigateur dédié)."""
    for pid in app_window_pids(profile):
        handle = _kernel32.OpenProcess(0x0001, False, pid)  # PROCESS_TERMINATE
        if handle:
            _kernel32.TerminateProcess(handle, 0)
            _kernel32.CloseHandle(handle)


def focus_window() -> bool:
    """Ramène au premier plan la fenêtre déjà ouverte."""
    hwnd = find_app_window()
    if not hwnd:
        return False
    if _user32.IsIconic(hwnd):
        _user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    _user32.SetForegroundWindow(hwnd)
    return True


# --- Service de blocage des sites ------------------------------------------------
# Installé une fois par l'installateur (tâche planifiée qui tourne en SYSTEM) : l'application,
# lancée sans droits, lui confie les sites à bloquer et l'heure de fin ; lui seul écrit dans hosts.
# Il ne lit qu'une liste de domaines revalidés et n'écrit que le bloc OpusFocus : rien d'autre à détourner.
HELPER_DIR = Path(os.environ.get("ProgramData", r"C:\ProgramData")) / APP_NAME
HELPER_REQUEST = HELPER_DIR / "sites.json"
HELPER_EVENT = "Global\\OpusFocusSites"  # existe tant que le service tourne
HELPER_MAX_BYTES = 64 * 1024
HELPER_MAX_SITES = 500
HELPER_MAX_SECONDS = 9 * 3600  # une session dure au plus 8 h : une demande plus longue est refusée
SYNCHRONIZE = 0x00100000

_kernel32.OpenEventW.restype = ctypes.c_void_p
_kernel32.OpenEventW.argtypes = [ctypes.c_ulong, ctypes.c_bool, ctypes.c_wchar_p]
_kernel32.CreateEventW.restype = ctypes.c_void_p
_kernel32.CreateEventW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_bool, ctypes.c_wchar_p]
_kernel32.LocalFree.argtypes = [ctypes.c_void_p]
_advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)
_advapi32.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = [
    ctypes.c_wchar_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p]


class _SecurityAttributes(ctypes.Structure):
    _fields_ = [("nLength", ctypes.c_ulong), ("lpSecurityDescriptor", ctypes.c_void_p), ("bInheritHandle", ctypes.c_bool)]


def helper_alive() -> bool:
    handle = _kernel32.OpenEventW(SYNCHRONIZE, False, HELPER_EVENT)
    if handle:
        _kernel32.CloseHandle(handle)
    return bool(handle)


def request_sites(sites: list[str], until: float, path: Path = HELPER_REQUEST) -> None:
    """Demande au service de bloquer ces sites jusqu'à until (liste vide : tout débloquer)."""
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"sites": sites, "until": until}), encoding="utf-8")
    tmp.replace(path)


def read_site_request(path: Path = HELPER_REQUEST, now: float | None = None) -> list[str]:
    """Sites que le service doit bloquer ; [] si la demande est absente, invalide ou expirée.
    Le dossier est modifiable par l'utilisateur : on refuse liens et fichiers démesurés."""
    now = time.time() if now is None else now
    try:
        st = os.lstat(path)
        if st.st_file_attributes & 0x400 or st.st_nlink > 1 or st.st_size > HELPER_MAX_BYTES:  # point d'analyse
            return []
        data = json.loads(path.read_bytes()[:HELPER_MAX_BYTES])
    except (OSError, ValueError):
        return []
    if not isinstance(data, dict) or not isinstance(data.get("sites"), list):
        return []
    until = data.get("until")
    if isinstance(until, bool) or not isinstance(until, (int, float)) or not now < until <= now + HELPER_MAX_SECONDS:
        return []
    return sorted({d for d in (clean_domain(s) for s in data["sites"][:HELPER_MAX_SITES] if isinstance(s, str)) if d})


def run_sites_helper(path: Path = HELPER_REQUEST, hosts: Path = HOSTS_FILE,
                     stop: threading.Event | None = None) -> None:
    """Boucle du service : aligne le fichier hosts sur la demande de l'application."""
    sd = ctypes.c_void_p()
    # Tout le monde peut seulement attendre l'événement (pour savoir que le service tourne) ; SYSTEM a tout.
    if not _advapi32.ConvertStringSecurityDescriptorToSecurityDescriptorW(
            "D:(A;;0x00100000;;;WD)(A;;GA;;;SY)", 1, ctypes.byref(sd), None):
        return
    sa = _SecurityAttributes(ctypes.sizeof(_SecurityAttributes), sd, False)
    event = _kernel32.CreateEventW(ctypes.byref(sa), True, False, HELPER_EVENT)
    already = ctypes.get_last_error() == 183
    _kernel32.LocalFree(sd)
    if not event or already:  # déjà lancé
        return
    applied = None
    while not (stop and stop.is_set()):
        wanted = read_site_request(path)
        if wanted != applied:
            try:
                block_sites(wanted, hosts) if wanted else unblock_sites(hosts)
                applied = wanted
            except OSError:
                log_error()
        time.sleep(1)
    _kernel32.CloseHandle(event)


def apply_site_block(sites: list[str], until: float) -> None:
    if helper_alive():
        request_sites(sites, until)
    else:
        block_sites(sites)


def remove_site_block() -> None:
    if helper_alive():
        request_sites([], 0)
    else:
        unblock_sites()


# --- Barre des tâches et zone de notification -------------------------------------
def launch_command() -> str:
    return startup_command().removesuffix(" --startup")


class _GUID(ctypes.Structure):
    _fields_ = [("Data1", ctypes.c_ulong), ("Data2", ctypes.c_ushort), ("Data3", ctypes.c_ushort),
                ("Data4", ctypes.c_ubyte * 8)]

    @classmethod
    def parse(cls, text: str):
        h = text.replace("-", "")
        return cls(int(h[:8], 16), int(h[8:12], 16), int(h[12:16], 16),
                   (ctypes.c_ubyte * 8)(*bytes.fromhex(h[16:])))


class _PropertyKey(ctypes.Structure):
    _fields_ = [("fmtid", _GUID), ("pid", ctypes.c_ulong)]


class _PropVariant(ctypes.Structure):
    _fields_ = [("vt", ctypes.c_ushort), ("r1", ctypes.c_ushort), ("r2", ctypes.c_ushort), ("r3", ctypes.c_ushort),
                ("value", ctypes.c_void_p), ("pad", ctypes.c_void_p)]


_shell32 = ctypes.WinDLL("shell32", use_last_error=True)
_shell32.SHGetPropertyStoreForWindow.argtypes = [ctypes.c_void_p, ctypes.POINTER(_GUID), ctypes.POINTER(ctypes.c_void_p)]
_IID_PROPERTY_STORE = _GUID.parse("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99")
_AUMID_FMTID = "9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"
_STORE_SET = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.POINTER(_PropertyKey), ctypes.POINTER(_PropVariant))
_STORE_CALL = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p)


def window_properties() -> dict:
    """Identité de la fenêtre pour la barre des tâches : épinglée, elle relance OpusFocus et non le navigateur."""
    icon = sys.executable if FROZEN else ROOT / "build" / "icon.ico"
    return {2: launch_command(),  # RelaunchCommand
            3: f"{icon},0",       # RelaunchIconResource
            4: APP_NAME,          # RelaunchDisplayNameResource
            5: APP_NAME}          # AppUserModel.ID, en dernier : il active les trois autres


def tag_window(hwnd) -> bool:
    store = ctypes.c_void_p()
    if _shell32.SHGetPropertyStoreForWindow(hwnd, ctypes.byref(_IID_PROPERTY_STORE), ctypes.byref(store)) != 0:
        return False
    vtable = ctypes.cast(ctypes.cast(store, ctypes.POINTER(ctypes.c_void_p))[0], ctypes.POINTER(ctypes.c_void_p))
    set_value, commit, release = _STORE_SET(vtable[6]), _STORE_CALL(vtable[7]), _STORE_CALL(vtable[2])
    try:
        for pid, text in window_properties().items():
            buf = ctypes.create_unicode_buffer(text)
            value = _PropVariant(31, 0, 0, 0, ctypes.cast(buf, ctypes.c_void_p), None)  # VT_LPWSTR
            if set_value(store, ctypes.byref(_PropertyKey(_GUID.parse(_AUMID_FMTID), pid)), ctypes.byref(value)) != 0:
                return False
        return commit(store) == 0
    finally:
        release(store)


class _NotifyIconData(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_ulong), ("hWnd", ctypes.c_void_p), ("uID", ctypes.c_uint),
                ("uFlags", ctypes.c_uint), ("uCallbackMessage", ctypes.c_uint), ("hIcon", ctypes.c_void_p),
                ("szTip", ctypes.c_wchar * 128), ("dwState", ctypes.c_ulong), ("dwStateMask", ctypes.c_ulong),
                ("szInfo", ctypes.c_wchar * 256), ("uVersion", ctypes.c_uint), ("szInfoTitle", ctypes.c_wchar * 64),
                ("dwInfoFlags", ctypes.c_ulong), ("guidItem", _GUID), ("hBalloonIcon", ctypes.c_void_p)]


_WNDPROC = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, ctypes.c_void_p, ctypes.c_uint, ctypes.c_size_t, ctypes.c_ssize_t)


class _WndClass(ctypes.Structure):
    _fields_ = [("style", ctypes.c_uint), ("lpfnWndProc", _WNDPROC), ("cbClsExtra", ctypes.c_int),
                ("cbWndExtra", ctypes.c_int), ("hInstance", ctypes.c_void_p), ("hIcon", ctypes.c_void_p),
                ("hCursor", ctypes.c_void_p), ("hbrBackground", ctypes.c_void_p), ("lpszMenuName", ctypes.c_wchar_p),
                ("lpszClassName", ctypes.c_wchar_p)]


class _Point(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


_user32.DefWindowProcW.restype = ctypes.c_ssize_t
_user32.DefWindowProcW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_size_t, ctypes.c_ssize_t]
_user32.RegisterClassW.argtypes = [ctypes.POINTER(_WndClass)]
_user32.CreateWindowExW.restype = ctypes.c_void_p
_user32.CreateWindowExW.argtypes = [ctypes.c_ulong, ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_ulong, ctypes.c_int,
                                    ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p,
                                    ctypes.c_void_p, ctypes.c_void_p]
_user32.DestroyWindow.argtypes = [ctypes.c_void_p]
_user32.PostMessageW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_size_t, ctypes.c_ssize_t]
_user32.GetMessageW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint]
_user32.TranslateMessage.argtypes = _user32.DispatchMessageW.argtypes = [ctypes.c_void_p]
_user32.CreatePopupMenu.restype = ctypes.c_void_p
_user32.AppendMenuW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_size_t, ctypes.c_wchar_p]
_user32.TrackPopupMenu.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                   ctypes.c_void_p, ctypes.c_void_p]
_user32.DestroyMenu.argtypes = [ctypes.c_void_p]
_user32.GetCursorPos.argtypes = [ctypes.POINTER(_Point)]
_user32.LoadImageW.restype = _user32.LoadIconW.restype = ctypes.c_void_p
_user32.LoadImageW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_uint, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
_user32.LoadIconW.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
_user32.RegisterWindowMessageW.argtypes = [ctypes.c_wchar_p]
_shell32.Shell_NotifyIconW.argtypes = [ctypes.c_ulong, ctypes.POINTER(_NotifyIconData)]
_shell32.ExtractIconExW.argtypes = [ctypes.c_wchar_p, ctypes.c_int, ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p),
                                    ctypes.c_uint]
_kernel32.GetModuleHandleW.restype = ctypes.c_void_p
_kernel32.GetModuleHandleW.argtypes = [ctypes.c_wchar_p]


class Tray:
    """Icône près de l'horloge : OpusFocus reste actif quand la fenêtre est fermée."""
    WM_TRAY, WM_CLOSE, WM_DESTROY, WM_LBUTTONUP, WM_RBUTTONUP = 0x0401, 0x0010, 0x0002, 0x0202, 0x0205
    OPEN, QUIT = 1, 2

    def __init__(self, on_open, on_quit):
        self.on_open, self.on_quit = on_open, on_quit
        self.hwnd = self.icon = self.taskbar_created = None
        self.ready = threading.Event()
        self._proc = _WNDPROC(self._wndproc)  # gardé en vie : Windows l'appelle jusqu'à la fin

    def start(self) -> bool:
        threading.Thread(target=self._run, daemon=True).start()
        return self.ready.wait(5) and bool(self.hwnd)

    def stop(self):
        if self.hwnd:
            _user32.PostMessageW(self.hwnd, self.WM_CLOSE, 0, 0)

    def _load_icon(self):
        if FROZEN:
            small = ctypes.c_void_p()
            if _shell32.ExtractIconExW(sys.executable, 0, None, ctypes.byref(small), 1) and small.value:
                return small.value
        else:
            icon = _user32.LoadImageW(None, str(ROOT / "build" / "icon.ico"), 1, 16, 16, 0x10)  # LR_LOADFROMFILE
            if icon:
                return icon
        return _user32.LoadIconW(None, ctypes.c_void_p(32512))  # IDI_APPLICATION

    def _data(self) -> _NotifyIconData:
        nid = _NotifyIconData(cbSize=ctypes.sizeof(_NotifyIconData), hWnd=self.hwnd, uID=1,
                              uFlags=0x1 | 0x2 | 0x4, uCallbackMessage=self.WM_TRAY, hIcon=self.icon)
        nid.szTip = f"{APP_NAME} — une seule chose à la fois"
        return nid

    def _run(self):
        try:
            hinst = _kernel32.GetModuleHandleW(None)
            wc = _WndClass(lpfnWndProc=self._proc, hInstance=hinst, lpszClassName="OpusFocusTray")
            _user32.RegisterClassW(ctypes.byref(wc))
            # Fenêtre jamais affichée (pas « message-only » : elle doit recevoir TaskbarCreated).
            self.hwnd = _user32.CreateWindowExW(0, "OpusFocusTray", APP_NAME, 0, 0, 0, 0, 0, None, None, hinst, None)
            self.taskbar_created = _user32.RegisterWindowMessageW("TaskbarCreated")
            self.icon = self._load_icon()
            if self.hwnd and not _shell32.Shell_NotifyIconW(0, ctypes.byref(self._data())):  # NIM_ADD
                _user32.DestroyWindow(self.hwnd)
                self.hwnd = None
        finally:
            self.ready.set()
        if not self.hwnd:
            return
        msg = ctypes.create_string_buffer(64)
        while _user32.GetMessageW(msg, None, 0, 0) > 0:
            _user32.TranslateMessage(msg)
            _user32.DispatchMessageW(msg)

    def _menu(self) -> int:
        menu = _user32.CreatePopupMenu()
        _user32.AppendMenuW(menu, 0, self.OPEN, f"Ouvrir {APP_NAME}")
        _user32.AppendMenuW(menu, 0x800, 0, None)  # séparateur
        _user32.AppendMenuW(menu, 0, self.QUIT, "Quitter")
        pt = _Point()
        _user32.GetCursorPos(ctypes.byref(pt))
        _user32.SetForegroundWindow(self.hwnd)  # sinon le menu ne se ferme pas quand on clique ailleurs
        choice = _user32.TrackPopupMenu(menu, 0x0100 | 0x0020, pt.x, pt.y, 0, self.hwnd, None)  # RETURNCMD|BOTTOMALIGN
        _user32.DestroyMenu(menu)
        return choice

    def _wndproc(self, hwnd, msg, wparam, lparam):
        try:
            if msg == self.WM_TRAY:
                action = None
                if lparam == self.WM_LBUTTONUP:
                    action = self.on_open
                elif lparam == self.WM_RBUTTONUP:
                    action = {self.OPEN: self.on_open, self.QUIT: self.on_quit}.get(self._menu())
                if action:
                    threading.Thread(target=action, daemon=True).start()
                return 0
            if msg == self.taskbar_created:  # l'Explorateur a redémarré : on remet l'icône
                _shell32.Shell_NotifyIconW(0, ctypes.byref(self._data()))
                return 0
            if msg == self.WM_CLOSE:
                _shell32.Shell_NotifyIconW(2, ctypes.byref(self._data()))  # NIM_DELETE
                _user32.DestroyWindow(hwnd)
                return 0
            if msg == self.WM_DESTROY:
                _user32.PostQuitMessage(0)
                return 0
        except Exception:  # noqa: BLE001 — une exception ne doit pas traverser la frontière avec Windows
            log_error()
        return _user32.DefWindowProcW(hwnd, msg, wparam, lparam)


def running_processes() -> set[str]:
    return {name for _, name in list_processes()}


def kill_blocked(apps: list[str]) -> list[str]:
    targets = {a.strip().lower() for a in apps if a.strip()} - PROTECTED
    marker = str(WINDOW_PROFILE).lower()
    killed = set()
    for pid, name in list_processes():
        if name not in targets:
            continue
        # Le navigateur qui affiche OpusFocus est épargné : on reconnaît son profil dédié.
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
            if not ICON_RE.match(by_exe[exe]["icon"] or "="):
                by_exe[exe]["icon"] = ""
    apps = sorted(by_exe.values(), key=lambda a: a["name"].casefold())
    if apps:
        save_json(APPS_CACHE, apps)
    return apps


# --- Musique focus -------------------------------------------------------------
def track_title(stem: str) -> str:
    # Les titres téléchargés remplacent souvent « | » par « _ » : on les rend lisibles.
    return re.sub(r"\s+_\s+", " · ", stem).strip(" -_") or stem


def list_music(folder: Path | None = None) -> list[dict]:
    folder = folder or MUSIC_DIR
    try:
        files = [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in AUDIO_TYPES]
    except OSError:
        return []
    return [{"file": p.name, "title": track_title(p.stem)} for p in sorted(files, key=lambda p: p.name.casefold())]


def music_file(name: str, folder: Path | None = None) -> Path | None:
    """Seuls les fichiers réellement listés sont servis : aucun chemin arbitraire (../) n'est accepté."""
    folder = folder or MUSIC_DIR
    return folder / name if any(t["file"] == name for t in list_music(folder)) else None


def parse_range(header: str, size: int) -> tuple[int, int] | None:
    """En-tête Range « bytes=début-fin » → (début, fin) inclus, ou None s'il est invalide."""
    m = re.fullmatch(r"bytes=(\d*)-(\d*)", header.strip())
    if not m or not (m[1] or m[2]) or size <= 0:
        return None
    if m[1]:
        start, end = int(m[1]), min(int(m[2]), size - 1) if m[2] else size - 1
    else:
        start, end = max(0, size - int(m[2])), size - 1
    return (start, end) if start <= end and start < size else None


def open_music_folder() -> None:
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    os.startfile(MUSIC_DIR)


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
                          "--disable-features=Translate", "--disable-sync",
                          "--autoplay-policy=no-user-gesture-required"])
    else:
        webbrowser.open(url)


# --- Moteur --------------------------------------------------------------------
class ApiError(Exception):
    pass


def _list_of_str(data: dict, key: str) -> list[str]:
    value = data[key]
    if not isinstance(value, list):
        raise ApiError("Liste attendue.")
    return [str(x) for x in value]


def _int(value, message: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ApiError(message)
    try:
        return int(value)
    except ValueError:
        raise ApiError(message) from None


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
        self.window_opened_at = 0.0
        self.ui_seen = False  # une fenêtre a interrogé ce moteur depuis son démarrage
        self._recover()

    def can_block_sites(self) -> bool:
        """Les sites se bloquent par le service installé, ou directement si l'app tourne en administrateur."""
        return helper_alive() or self.admin

    # ----- Cycle de vie
    def _recover(self):
        st = load_json(STATE_FILE, None)
        if not st or not st.get("active"):
            return
        if st["end"] > time.time():
            if st.get("sites") and not self.can_block_sites():
                st["sites"] = False
                try:
                    remove_site_block()
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
            try:
                if self._tick():
                    return
            except Exception:  # noqa: BLE001 — une erreur imprévue ne doit jamais arrêter la surveillance
                log_error()

    def _tick(self) -> bool:
        """Un tour de surveillance. Renvoie True quand le moteur doit s'arrêter (aucune fenêtre ouverte)."""
        with self.lock:
            st = self.session
            apps = list(self.config["apps"]) if st and st.get("apps") else []
            if st and time.time() >= st["end"]:
                self._finish(completed=True)
                return False
            # Avec l'icône près de l'horloge, le moteur reste actif : on ne surveille l'inactivité que sans elle.
            idle = bool(self.on_idle) and not st and not self.review_id and time.time() - self.last_seen > IDLE_EXIT_SECONDS
        if idle and find_app_window():
            # Fenêtre réduite ou en arrière-plan : le navigateur ralentit ses appels, mais elle est toujours là.
            self.last_seen, idle = time.time(), False
        if idle and self.on_idle:
            self.on_idle()
            return True
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
        return False

    def ensure_window(self):
        """Au démarrage : une fenêtre restée ouverte se reconnecte seule (même port, même jeton).
        Si elle n'y arrive pas (port changé), on la remplace au lieu de ramener une fenêtre morte."""
        # Une fenêtre des versions « Deep Work Focus » ne peut plus se reconnecter : on la remplace.
        close_app_window(LEGACY_APP_DIR / "fenetre")
        if find_app_window():
            end = time.time() + 5
            while time.time() < end:
                if self.ui_seen:
                    focus_window()
                    self._tag_new_window()
                    return
                time.sleep(0.25)
            close_app_window()
            end = time.time() + 3
            while find_app_window() and time.time() < end:  # sinon show_window ramènerait la fenêtre fermée
                time.sleep(0.2)
        self.show_window()

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
                apply_site_block(self.config["sites"], st["end"])
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
                remove_site_block()
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
        if self.url:
            self.show_window()  # le bilan doit être visible : on montre la fenêtre, ou on la rouvre

    def show_window(self):
        """Seul le serveur ouvre la fenêtre : aucun doublon, même si l'app est lancée plusieurs fois d'affilée."""
        with self.lock:
            if focus_window():
                self.window_opened_at = 0.0  # la fenêtre est apparue : plus rien n'est en attente
                return
            if time.time() - self.window_opened_at < 10:
                return  # une fenêtre est déjà en train de s'ouvrir
            self.window_opened_at = time.time()
        open_window(self.url)
        threading.Thread(target=self._tag_new_window, daemon=True).start()

    def _tag_new_window(self):
        """Donne à la fenêtre l'identité d'OpusFocus dans la barre des tâches, dès qu'elle apparaît."""
        end = time.time() + 15
        while time.time() < end:
            hwnd = find_app_window()
            if hwnd:
                tag_window(hwnd)
                return
            time.sleep(0.3)

    def quit(self) -> bool:
        """Quitter depuis l'icône : refusé pendant une session (le blocage doit tenir jusqu'à la fin)."""
        with self.lock:
            if self.session:
                self.notice = "Une session est en cours : OpusFocus reste actif jusqu'à la fin."
                busy = True
            else:
                busy = False
        if busy:
            self.show_window()
            return False
        close_app_window()
        return True

    # ----- Actions de l'interface
    def snapshot(self) -> dict:
        self.last_seen = time.time()
        self.ui_seen = True
        with self.lock:
            notice, self.notice = self.notice, ""
            session = None
            if self.session:
                session = {k: self.session.get(k) for k in
                           ("intention", "start", "end", "planned_min", "lock", "notif", "apps", "sites",
                            "blocked_count", "last_killed")}
            review = next((s for s in self.sessions if s["id"] == self.review_id), None) if self.review_id else None
            return {
                "now": time.time(), "admin": self.can_block_sites(), "sites_helper": helper_alive(),
                "config": self.config, "session": session,
                "review": review, "sessions": self.sessions, "notice": notice,
                "today": dt.date.today().isoformat(), "abandon_phrase": self.abandon_phrase(),
            }

    def abandon_phrase(self) -> str:
        """Phrase à taper pour arrêter : celle de la session en cours (fixée au départ), sinon celle des réglages."""
        if self.session and self.session.get("phrase"):
            return self.session["phrase"]
        return clean_phrase(self.config.get("abandon_phrase", "")) or ABANDON_PHRASE

    def start(self, data: dict):
        with self.lock:
            if self.session:
                raise ApiError("Une session est déjà en cours.")
            intention = data.get("intention", "")
            intention = intention.strip() if isinstance(intention, str) else ""
            minutes = _int(data.get("minutes"), "Choisis une durée entre 5 et 480 minutes.")
            if not intention:
                raise ApiError("Écris ton intention avant de commencer.")
            if not 5 <= minutes <= 480:
                raise ApiError("Choisis une durée entre 5 et 480 minutes.")
            now = time.time()
            self.session = {
                "id": secrets.token_hex(6), "active": True, "start": now, "end": now + minutes * 60,
                "planned_min": minutes, "intention": intention[:200],
                "notif": bool(data.get("notif")), "apps": bool(data.get("apps")),
                "sites": bool(data.get("sites")) and self.can_block_sites(), "lock": bool(data.get("lock")),
                "notif_prev": {}, "blocked_count": 0, "last_killed": None,
                "phrase": self.abandon_phrase(),
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
            if self.session["lock"] and clean_phrase(str(data.get("phrase", ""))) != self.abandon_phrase():
                raise ApiError("La phrase ne correspond pas. Ta session continue.")
            self._finish(completed=False)
        return {}

    def review(self, data: dict):
        with self.lock:
            for s in self.sessions:
                if s["id"] == data.get("id"):
                    depth = data.get("depth")
                    ok = isinstance(depth, int) and not isinstance(depth, bool) and 1 <= depth <= 5
                    s["depth"] = depth if ok else None
                    s["note"] = str(data.get("note", "")).strip()[:500]
            save_json(SESSIONS_FILE, self.sessions)
            self.review_id = None
        return {}

    def update_config(self, data: dict):
        with self.lock:
            cfg = self.config
            st = self.session
            if "apps" in data:
                apps = sorted({a for a in map(clean_app, _list_of_str(data, "apps")) if a})
                if st and st["lock"] and not set(cfg["apps"]) <= set(apps):
                    raise ApiError("Mode engagement : tu peux ajouter des blocages, pas en retirer.")
                cfg["apps"] = apps
            if "sites" in data:
                sites = sorted({d for d in map(clean_domain, _list_of_str(data, "sites")) if d})
                if st and st["lock"] and not set(cfg["sites"]) <= set(sites):
                    raise ApiError("Mode engagement : tu peux ajouter des blocages, pas en retirer.")
                cfg["sites"] = sites
                if st and st["sites"]:
                    apply_site_block(sites, st["end"])
            if "music_autoplay" in data:
                cfg["music_autoplay"] = bool(data["music_autoplay"])
            if "abandon_phrase" in data:
                if st and st["lock"]:
                    raise ApiError("Mode engagement : la phrase d'abandon se change après la session.")
                phrase = clean_phrase(str(data["abandon_phrase"]))
                if not PHRASE_MIN <= len(phrase) <= PHRASE_MAX:
                    raise ApiError(f"La phrase doit faire entre {PHRASE_MIN} et {PHRASE_MAX} caractères.")
                cfg["abandon_phrase"] = phrase
            if "launch_at_startup" in data:
                set_launch_at_startup(bool(data["launch_at_startup"]))
                cfg["launch_at_startup"] = bool(data["launch_at_startup"])
            if "weekly_goal_hours" in data:
                cfg["weekly_goal_hours"] = max(1, min(80, _int(data["weekly_goal_hours"], "Objectif invalide.")))
            if "shutdown_checklist" in data:
                cfg["shutdown_checklist"] = [x.strip()[:160] for x in _list_of_str(data, "shutdown_checklist")
                                             if x.strip()]
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


# La page n'exécute que ses propres scripts et ne peut pas être intégrée dans une iframe (clickjacking).
CSP = ("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
       "media-src 'self'; "
       "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")


def make_handler(engine: Engine, token: str, port_ref: list):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, code: int, body: bytes, ctype: str):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _json(self, code: int, data):
            self._send(code, json.dumps(data, ensure_ascii=False).encode("utf-8"), "application/json")

        def _drain(self):
            # Lit (sans le garder) ce que le client a déjà envoyé, dans une limite de taille et de temps :
            # sinon Windows coupe la connexion avant que la réponse d'erreur n'arrive.
            self.connection.settimeout(0.2)
            try:
                for _ in range(16):
                    if not self.rfile.read1(65536):
                        break
            except OSError:
                pass

        def _host_ok(self) -> bool:
            # Protège contre le DNS rebinding : seule l'adresse locale exacte est acceptée.
            return self.headers.get("Host") in (f"127.0.0.1:{port_ref[0]}", f"localhost:{port_ref[0]}")

        def _api_ok(self) -> bool:
            return self._host_ok() and secrets.compare_digest(self.headers.get("X-Token", ""), token)

        def _music(self, name: str, query: str):
            # L'élément <audio> ne peut pas envoyer d'en-tête : le jeton passe dans l'URL.
            given = urllib.parse.parse_qs(query).get("t", [""])[0]
            if not (self._host_ok() and secrets.compare_digest(given.encode(), token.encode())):
                return self._json(403, {"error": "Accès refusé."})
            file = music_file(name)
            if not file:
                return self._json(404, {"error": "Introuvable."})
            size = file.stat().st_size
            start, end, code = 0, size - 1, 200
            if self.headers.get("Range"):
                rng = parse_range(self.headers["Range"], size)
                if rng is None:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                (start, end), code = rng, 206
            self.send_response(code)
            self.send_header("Content-Type", AUDIO_TYPES[file.suffix.lower()])
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("X-Content-Type-Options", "nosniff")
            if code == 206:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            try:
                with file.open("rb") as f:
                    f.seek(start)
                    left = end - start + 1
                    while left > 0:
                        chunk = f.read(min(256 * 1024, left))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        left -= len(chunk)
            except OSError:
                pass  # le lecteur a changé de position ou de piste : il coupe la connexion

        def do_GET(self):
            path, _, query = self.path.partition("?")
            if path.startswith("/music/"):
                return self._music(urllib.parse.unquote(path[len("/music/"):]), query)
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
            if path == "/api/music":
                return self._json(200, {"tracks": list_music(), "folder": str(MUSIC_DIR)})
            self._json(404, {"error": "Introuvable."})

        def do_POST(self):
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = -1
            if not 0 <= length <= MAX_BODY:
                self._drain()
                self.close_connection = True
                return self._json(413 if length > MAX_BODY else 400, {"error": "Requête invalide."})
            raw = self.rfile.read(length)
            if not self._api_ok():
                return self._json(403, {"error": "Accès refusé."})
            try:
                data = json.loads(raw or b"{}")
            except ValueError:
                data = None
            if not isinstance(data, dict):
                return self._json(400, {"error": "Requête invalide."})
            actions = {"/api/start": engine.start, "/api/stop": engine.stop, "/api/review": engine.review,
                       "/api/config": engine.update_config}
            try:
                if self.path == "/api/elevate":
                    result = engine.elevate()
                elif self.path == "/api/music/open":
                    result = open_music_folder()
                elif self.path == "/api/show":
                    result = engine.show_window()
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


class Server(ThreadingHTTPServer):
    # Sous Windows, SO_REUSEADDR permettrait de prendre un port déjà utilisé par un autre programme.
    allow_reuse_address = False


def ping(port: int, token: str) -> bool:
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/ping", headers={"X-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=1.5) as r:
            return r.status == 200
    except OSError:
        return False


def show_existing_instance(timeout: float = 15.0) -> None:
    """Demande à l'instance déjà lancée de montrer sa fenêtre (en attendant qu'elle ait fini de démarrer)."""
    end = time.time() + timeout
    while time.time() < end:
        s = load_json(SERVER_FILE, {})
        if s and ping(s["port"], s["token"]):
            # Windows ne laisse passer une fenêtre au premier plan que si le processus actif l'y autorise.
            if s.get("pid"):
                _user32.AllowSetForegroundWindow(int(s["pid"]))
            req = urllib.request.Request(f"http://127.0.0.1:{s['port']}/api/show", data=b"{}", method="POST",
                                         headers={"X-Token": s["token"], "Content-Type": "application/json"})
            try:
                urllib.request.urlopen(req, timeout=5).close()
            except urllib.error.HTTPError:
                open_window(f"http://127.0.0.1:{s['port']}/")  # ancienne version sans /api/show
            except OSError:
                pass
            return
        time.sleep(0.3)


def main():
    if "--sites-helper" in sys.argv:
        # Lancé en SYSTEM par la tâche planifiée de l'installateur : pas de fenêtre, pas de données utilisateur.
        run_sites_helper()
        return
    if "--sites-cleanup" in sys.argv:  # désinstallation : aucun site ne doit rester bloqué
        try:
            unblock_sites()
        except OSError:
            log_error()
        return
    migrate_legacy_data()
    APP_DIR.mkdir(parents=True, exist_ok=True)
    replace = "--replace" in sys.argv
    previous = load_json(SERVER_FILE, {})
    alive = bool(previous) and ping(previous["port"], previous["token"])

    if replace and alive:
        # Relance en administrateur : on prend la place de l'instance existante sur le même port,
        # pour que la fenêtre déjà ouverte se reconnecte toute seule.
        req = urllib.request.Request(f"http://127.0.0.1:{previous['port']}/api/quit", data=b"{}", method="POST",
                                     headers={"X-Token": previous["token"], "Content-Type": "application/json"})
        try:
            urllib.request.urlopen(req, timeout=2).close()
        except OSError:
            pass
    mutex = acquire_single_instance(timeout=8 if replace else 0)  # gardé jusqu'à la fin du processus
    if mutex is None or (alive and not replace):
        # Une instance tourne déjà : on montre sa fenêtre au lieu d'en lancer une seconde.
        show_existing_instance()
        return
    if replace and alive:
        time.sleep(0.3)  # laisse au système le temps de libérer le port

    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("OpusFocus")
    except (AttributeError, OSError):
        pass

    engine = Engine()
    if FROZEN:
        # L'application installée suit le réglage (le script de développement ne s'inscrit jamais seul).
        try:
            set_launch_at_startup(engine.config.get("launch_at_startup", True))
        except OSError:
            log_error()
    port_ref = [0]
    # Port et jeton repris de la dernière fois : une fenêtre restée ouverte se reconnecte d'elle-même.
    last = previous if replace and previous else load_json(ENDPOINT_FILE, {})
    token = last.get("token") if isinstance(last.get("token"), str) and len(last["token"]) >= 24 else secrets.token_urlsafe(24)
    server = None
    if isinstance(last.get("port"), int):
        try:
            server = Server(("127.0.0.1", last["port"]), make_handler(engine, token, port_ref))
        except OSError:
            server = None  # port pris entre-temps : on en prend un autre, la fenêtre sera remplacée
    if server is None:
        # Le jeton ne suit que son port : sur un nouveau port, la fenêtre est remplacée de toute façon.
        token = secrets.token_urlsafe(24)
        server = Server(("127.0.0.1", 0), make_handler(engine, token, port_ref))
    port_ref[0] = server.server_address[1]
    engine.url = f"http://127.0.0.1:{port_ref[0]}/"
    save_json(SERVER_FILE, {"port": port_ref[0], "token": token, "pid": os.getpid()})
    save_json(ENDPOINT_FILE, {"port": port_ref[0], "token": token})

    def shutdown():
        threading.Thread(target=server.shutdown, daemon=True).start()

    tray = Tray(on_open=engine.show_window, on_quit=lambda: engine.quit() and shutdown())
    if not tray.start():
        engine.on_idle = shutdown  # sans icône, on ne garderait qu'un processus invisible : il s'arrête seul
    threading.Thread(target=engine.run_forever, daemon=True).start()
    # À l'ouverture de session, OpusFocus démarre discrètement près de l'horloge (sauf session à reprendre).
    if "--startup" not in sys.argv or engine.session or not tray.hwnd:
        threading.Thread(target=engine.ensure_window, daemon=True).start()
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        tray.stop()
        server.server_close()
        with engine.lock:
            current = load_json(SERVER_FILE, {})
            if current.get("pid") == os.getpid():
                SERVER_FILE.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
