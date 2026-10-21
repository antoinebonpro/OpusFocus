"""
Batterie de tests de Deep Work Focus (bibliothèque standard uniquement).

    python -m unittest discover -s tests -v

Les tests n'écrivent jamais dans le vrai %APPDATA%, le vrai fichier hosts ni le registre :
tout est redirigé vers un dossier temporaire ou simulé. Seuls les tests « système »
touchent Windows (un processus factice tué, la clé de notifications lue puis restaurée).
"""

import http.client
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
TMP = Path(tempfile.mkdtemp(prefix="dwtest_"))
os.environ["APPDATA"] = str(TMP / "appdata")  # avant l'import : APP_DIR en dépend
sys.path.insert(0, str(ROOT))

import deepwork as dw  # noqa: E402

FAKE_HOSTS = TMP / "hosts"


class Sandbox(unittest.TestCase):
    """Isole chaque test : données vides, hosts factice, aucun effet sur Windows."""

    def setUp(self):
        shutil.rmtree(dw.APP_DIR, ignore_errors=True)
        dw.APP_DIR.mkdir(parents=True)
        FAKE_HOSTS.write_text("127.0.0.1 localhost\n# ligne de l'utilisateur\n", encoding="utf-8")
        self.notif_state = {}
        real_block, real_unblock = dw.block_sites, dw.unblock_sites
        patches = [
            mock.patch.object(dw, "flush_dns", lambda: None),
            mock.patch.object(dw, "block_sites", lambda sites, hosts=FAKE_HOSTS: real_block(sites, hosts)),
            mock.patch.object(dw, "unblock_sites", lambda hosts=FAKE_HOSTS: real_unblock(hosts)),
            mock.patch.object(dw, "notifications_off", self._notif_off),
            mock.patch.object(dw, "notifications_restore", self._notif_restore),
            mock.patch.object(dw, "kill_blocked", lambda apps: []),
            mock.patch.object(dw, "open_window", lambda url: None),
            mock.patch.object(dw, "relaunch_as_admin", lambda: False),
            mock.patch.object(dw.winsound, "MessageBeep", lambda *a: None),
            mock.patch.object(dw, "is_admin", lambda: True),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def _notif_off(self):
        self.notif_state["off"] = True
        return {"k|v": 1}

    def _notif_restore(self, previous):
        self.notif_state["restored"] = previous

    def hosts(self) -> str:
        return FAKE_HOSTS.read_text(encoding="utf-8")


# --- Fonctions pures ---------------------------------------------------------------------
class TestCategorize(unittest.TestCase):
    def test_categories(self):
        self.assertEqual(dw.categorize("Discord", "discord.exe"), "social")
        self.assertEqual(dw.categorize("Steam", "steam.exe"), "games")
        self.assertEqual(dw.categorize("Spotify", "spotify.exe"), "media")
        self.assertEqual(dw.categorize("Google Chrome", "chrome.exe"), "browsers")
        self.assertEqual(dw.categorize("Visual Studio Code", "code.exe"), "other")

    def test_word_boundaries(self):
        # « ea » ou « tv » ne doivent pas attraper des mots qui les contiennent.
        self.assertEqual(dw.categorize("Excel", "excel.exe"), "other")
        self.assertEqual(dw.categorize("Paint", "mspaint.exe"), "other")
        self.assertEqual(dw.categorize("Notepad", "notepad.exe"), "other")


class TestDomains(unittest.TestCase):
    def test_clean_domain(self):
        self.assertEqual(dw.clean_domain("https://www.YouTube.com/watch?v=1"), "youtube.com")
        self.assertEqual(dw.clean_domain("  reddit.com/r/x "), "reddit.com")
        self.assertEqual(dw.clean_domain("http://m.facebook.com"), "m.facebook.com")
        self.assertEqual(dw.clean_domain("twitch.tv:443"), "twitch.tv")

    def test_rejects_invalid_domains(self):
        for bad in ["", "localhost", "a b.com", "evil.com\n0.0.0.0 bank.com", "x.com\r\n1.2.3.4 y.com",
                    "<script>.com", "a..com", ".com", "evil.com#", "-a.com", "a" * 300 + ".com"]:
            with self.subTest(bad=bad):
                self.assertEqual(dw.clean_domain(bad), "", f"domaine accepté à tort : {bad!r}")


class TestHostsFile(unittest.TestCase):
    def test_block_is_idempotent_and_preserves_user_lines(self):
        base = "127.0.0.1 localhost\r\n# perso\r\n10.0.0.1 nas.local\r\n"
        once = dw.strip_hosts_block(base) + dw.build_hosts_block(["youtube.com"])
        twice = dw.strip_hosts_block(once) + dw.build_hosts_block(["youtube.com"])
        self.assertEqual(once, twice)
        self.assertIn("10.0.0.1 nas.local", once)
        self.assertEqual(dw.strip_hosts_block(twice).strip(), base.replace("\r\n", "\n").strip())

    def test_block_covers_variants(self):
        block = dw.build_hosts_block(["youtube.com"])
        for host in ("youtube.com", "www.youtube.com", "m.youtube.com"):
            self.assertIn(f"0.0.0.0 {host}", block)
            self.assertIn(f"::1 {host}", block)

    def test_block_cannot_inject_lines(self):
        # config.json peut être modifié à la main : le bloc hosts revalide chaque domaine.
        block = dw.build_hosts_block(["ok.com", "evil.com\n6.6.6.6 bank.com", "x.com\r1.1.1.1 y.com"])
        lines = [l for l in block.splitlines() if not l.startswith("#")]
        self.assertTrue(lines)
        for line in lines:
            ip, host = line.split(" ")
            self.assertIn(ip, ("0.0.0.0", "::1"))
            self.assertNotIn("bank", host)
            self.assertNotIn("1.1.1.1", line)

    def test_unblock_without_block_does_not_touch_file(self):
        f = TMP / "hosts_untouched"
        f.write_text("127.0.0.1 localhost\n", encoding="utf-8")
        before = f.stat().st_mtime_ns
        with mock.patch.object(dw, "flush_dns", lambda: None):
            dw.unblock_sites(f)
        self.assertEqual(f.stat().st_mtime_ns, before)


# --- Moteur ------------------------------------------------------------------------------
class TestEngine(Sandbox):
    def start(self, engine, **kw):
        data = {"intention": "Écrire", "minutes": 25, "notif": True, "apps": True, "sites": True, "lock": False}
        data.update(kw)
        return engine.start(data)

    def test_start_validation(self):
        e = dw.Engine()
        for bad in [{"intention": ""}, {"intention": "   "}, {"minutes": 4}, {"minutes": 481},
                    {"minutes": "abc"}, {"minutes": None}, {"minutes": [1]}, {"intention": {"a": 1}}]:
            with self.subTest(bad=bad):
                with self.assertRaises(dw.ApiError):
                    self.start(e, **bad)
        self.assertIsNone(e.session)

    def test_start_applies_blocks_and_stop_restores(self):
        e = dw.Engine()
        self.start(e)
        self.assertTrue(self.notif_state.get("off"))
        self.assertIn("0.0.0.0 youtube.com", self.hosts())
        self.assertTrue(dw.STATE_FILE.exists())
        e.stop({})
        self.assertEqual(self.notif_state.get("restored"), {"k|v": 1})
        self.assertNotIn("youtube.com", self.hosts())
        self.assertIn("# ligne de l'utilisateur", self.hosts())
        self.assertFalse(dw.STATE_FILE.exists())
        self.assertEqual(len(e.sessions), 1)
        self.assertFalse(e.sessions[0]["completed"])

    def test_double_start_refused(self):
        e = dw.Engine()
        self.start(e)
        with self.assertRaises(dw.ApiError):
            self.start(e)

    def test_sites_require_admin(self):
        with mock.patch.object(dw, "is_admin", lambda: False):
            e = dw.Engine()
        self.start(e, sites=True)
        self.assertFalse(e.session["sites"])
        self.assertNotIn("youtube.com", self.hosts())

    def test_intention_truncated(self):
        e = dw.Engine()
        self.start(e, intention="x" * 5000)
        self.assertEqual(len(e.session["intention"]), 200)

    def test_lock_mode(self):
        e = dw.Engine()
        self.start(e, lock=True)
        with self.assertRaises(dw.ApiError):
            e.stop({"phrase": "stop"})
        with self.assertRaises(dw.ApiError):
            e.update_config({"apps": []})
        with self.assertRaises(dw.ApiError):
            e.update_config({"sites": ["youtube.com"]})
        e.update_config({"apps": e.config["apps"] + ["notepad.exe"]})  # ajouter reste permis
        self.assertIn("notepad.exe", e.config["apps"])
        with self.assertRaises(dw.ApiError):
            e.elevate()
        self.assertIsNotNone(e.session)
        e.stop({"phrase": "  J'abandonne ma session de DEEP WORK "})
        self.assertIsNone(e.session)

    def test_live_site_update_rewrites_hosts(self):
        e = dw.Engine()
        self.start(e)
        e.update_config({"sites": e.config["sites"] + ["lemonde.fr"]})
        self.assertIn("0.0.0.0 lemonde.fr", self.hosts())

    def test_config_sanitizes_apps(self):
        e = dw.Engine()
        e.update_config({"apps": ["Discord", "EXPLORER.EXE", "svchost.exe", "taskmgr", "  ", "Steam.exe",
                                  "../../evil", "a" * 500, ".exe"]})
        self.assertIn("discord.exe", e.config["apps"])
        self.assertIn("steam.exe", e.config["apps"])
        for bad in ("explorer.exe", "svchost.exe", "taskmgr.exe", ".exe"):
            self.assertNotIn(bad, e.config["apps"])
        self.assertFalse(any("/" in a or "\\" in a or len(a) > 100 for a in e.config["apps"]))

    def test_config_sanitizes_sites_and_values(self):
        e = dw.Engine()
        e.update_config({"sites": ["https://www.YouTube.com/x", "evil.com\n6.6.6.6 bank.com", "nodot"],
                         "weekly_goal_hours": 999, "shutdown_checklist": ["  a  ", "", "b" * 500]})
        self.assertEqual(e.config["sites"], ["youtube.com"])
        self.assertEqual(e.config["weekly_goal_hours"], 80)
        self.assertEqual(e.config["shutdown_checklist"], ["a", "b" * 160])

    def test_config_rejects_wrong_types(self):
        e = dw.Engine()
        for bad in [{"apps": "discord.exe"}, {"sites": "youtube.com"}, {"weekly_goal_hours": "abc"},
                    {"shutdown_checklist": "abc"}, {"apps": None}]:
            with self.subTest(bad=bad):
                with self.assertRaises(dw.ApiError):
                    e.update_config(bad)

    def test_review(self):
        e = dw.Engine()
        self.start(e)
        e.stop({})
        sid = e.sessions[0]["id"]
        self.assertEqual(e.review_id, sid)
        for depth, expected in [(4, 4), (0, None), (6, None), ("5", None), (True, None), (None, None)]:
            with self.subTest(depth=depth):
                e.review({"id": sid, "depth": depth, "note": "n" * 900})
                self.assertEqual(e.sessions[0]["depth"], expected)
                self.assertEqual(len(e.sessions[0]["note"]), 500)
        self.assertIsNone(e.review_id)

    def test_session_ends_by_itself(self):
        e = dw.Engine()
        self.start(e)
        e.session["end"] = time.time() - 1
        with e.lock:
            e._finish(completed=True)
        self.assertTrue(e.sessions[-1]["completed"])
        self.assertNotIn("youtube.com", self.hosts())

    def test_crash_recovery_resumes_running_session(self):
        e = dw.Engine()
        self.start(e)
        del e  # « plantage » : state.json et hosts restent en place
        e2 = dw.Engine()
        self.assertIsNotNone(e2.session)
        self.assertTrue(e2.notice)
        self.assertIn("youtube.com", self.hosts())

    def test_crash_recovery_releases_finished_session(self):
        e = dw.Engine()
        self.start(e)
        st = json.loads(dw.STATE_FILE.read_text(encoding="utf-8"))
        st["end"] = time.time() - 60
        dw.STATE_FILE.write_text(json.dumps(st), encoding="utf-8")
        e2 = dw.Engine()
        self.assertIsNone(e2.session)
        self.assertNotIn("youtube.com", self.hosts())
        self.assertFalse(dw.STATE_FILE.exists())
        self.assertEqual(self.notif_state.get("restored"), {"k|v": 1})

    def test_corrupted_files_do_not_crash(self):
        for f in (dw.CONFIG_FILE, dw.SESSIONS_FILE, dw.STATE_FILE):
            f.write_text("{pas du json", encoding="utf-8")
        e = dw.Engine()
        self.assertEqual(e.config["weekly_goal_hours"], 15)
        self.assertEqual(e.sessions, [])
        self.assertIsNone(e.session)


# --- Liste des applications ----------------------------------------------------------------
class TestScan(Sandbox):
    def scan(self, raw):
        out = subprocess.CompletedProcess([], 0, stdout=json.dumps(raw).encode("utf-8"), stderr=b"")
        with mock.patch.object(dw.subprocess, "run", lambda *a, **k: out):
            return dw.scan_installed_apps(refresh=True)

    def test_filters_and_dedup(self):
        sysroot = os.environ.get("SystemRoot", r"C:\Windows")
        apps = self.scan([
            {"name": "Discord", "exe": "Discord.exe", "path": r"C:\x\Discord.exe", "icon": "iVBORw0KGgo="},
            {"name": "Discord (beta)", "exe": "discord.exe", "path": r"C:\x\Discord.exe"},
            {"name": "Uninstall Steam", "exe": "uninstall.exe", "path": r"C:\x\u.exe"},
            {"name": "Steam", "exe": "unins000.exe", "path": r"C:\x\u.exe"},
            {"name": "Registry", "exe": "regedit.exe", "path": sysroot + r"\regedit.exe"},
            {"name": "Explorer", "exe": "explorer.exe", "path": r"C:\x\explorer.exe"},
            {"name": "", "exe": "a.exe"}, {"exe": None}, {},
        ])
        self.assertEqual([a["exe"] for a in apps], ["discord.exe"])
        self.assertEqual(apps[0]["name"], "Discord")
        self.assertEqual(apps[0]["category"], "social")
        self.assertEqual(apps[0]["icon"], "iVBORw0KGgo=")

    def test_rejects_malicious_icon(self):
        apps = self.scan([{"name": "Evil", "exe": "evil.exe", "path": r"C:\x\e.exe",
                           "icon": '" onerror="alert(1)'}])
        self.assertEqual(apps[0]["icon"], "")

    def test_bad_output_returns_empty(self):
        bad = subprocess.CompletedProcess([], 1, stdout=b"not json", stderr=b"")
        with mock.patch.object(dw.subprocess, "run", lambda *a, **k: bad):
            self.assertEqual(dw.scan_installed_apps(refresh=True), [])


# --- Serveur HTTP --------------------------------------------------------------------------
class TestHttp(Sandbox):
    TOKEN = "jeton-de-test-0123456789"

    def setUp(self):
        super().setUp()
        self.engine = dw.Engine()
        self.port_ref = [0]
        self.server = dw.ThreadingHTTPServer(("127.0.0.1", 0), dw.make_handler(self.engine, self.TOKEN, self.port_ref))
        self.port_ref[0] = self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def req(self, method, path, body=None, token=True, host=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        h = {"Host": host if host is not None else f"127.0.0.1:{self.port}"}
        if token:
            h["X-Token"] = self.TOKEN if token is True else token
        if body is not None and not isinstance(body, bytes):
            body = json.dumps(body).encode()
        h.update(headers or {})
        c.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
        for k, v in h.items():
            c.putheader(k, v)
        if body is not None and "Content-Length" not in h:
            c.putheader("Content-Length", str(len(body)))
        c.endheaders(body)
        r = c.getresponse()
        data = r.read()
        c.close()
        return r, data

    def test_api_requires_token(self):
        for method, path in [("GET", "/api/state"), ("GET", "/api/apps"), ("POST", "/api/start"),
                             ("POST", "/api/stop"), ("POST", "/api/config"), ("POST", "/api/quit")]:
            with self.subTest(path=path):
                body = {} if method == "POST" else None
                self.assertEqual(self.req(method, path, body, token=False)[0].status, 403)
                self.assertEqual(self.req(method, path, body, token="mauvais")[0].status, 403)

    def test_dns_rebinding_blocked(self):
        for host in ("evil.com", f"evil.com:{self.port}", "127.0.0.1", f"127.0.0.1:{self.port + 1}"):
            with self.subTest(host=host):
                r, body = self.req("GET", "/", token=False, host=host)
                self.assertEqual(r.status, 403)
                self.assertNotIn(self.TOKEN.encode(), body)
                self.assertEqual(self.req("GET", "/api/state", host=host)[0].status, 403)

    def test_index_injects_token_and_security_headers(self):
        r, body = self.req("GET", "/", token=False)
        self.assertEqual(r.status, 200)
        self.assertIn(self.TOKEN.encode(), body)
        self.assertNotIn(b"__TOKEN__", body)
        csp = r.getheader("Content-Security-Policy") or ""
        self.assertIn("frame-ancestors 'none'", csp, "la page peut être intégrée dans une iframe (clickjacking)")
        self.assertIn("script-src 'self'", csp)
        self.assertEqual(r.getheader("X-Content-Type-Options"), "nosniff")
        self.assertEqual(r.getheader("Cache-Control"), "no-store")
        self.assertEqual(self.req("GET", "/", token=False, host=f"localhost:{self.port}")[0].status, 200)

    def test_no_cors(self):
        r, _ = self.req("GET", "/api/state", headers={"Origin": "https://evil.com"})
        self.assertIsNone(r.getheader("Access-Control-Allow-Origin"))
        r, _ = self.req("OPTIONS", "/api/start", token=False,
                        headers={"Origin": "https://evil.com", "Access-Control-Request-Method": "POST"})
        self.assertIsNone(r.getheader("Access-Control-Allow-Origin"))
        self.assertNotEqual(r.status, 200)

    def test_path_traversal(self):
        for path in ("/../deepwork.py", "/..%2fdeepwork.py", "/ui/../deepwork.py", "/%2e%2e/deepwork.py",
                     "/index.html", "/deepwork.py", "//etc/hosts", "/C:/Windows/win.ini"):
            with self.subTest(path=path):
                r, body = self.req("GET", path, token=False)
                self.assertIn(r.status, (403, 404))
                self.assertNotIn(b"import ctypes", body)

    def test_static_files(self):
        for path, ctype in [("/style.css", "text/css"), ("/app.js", "text/javascript")]:
            r, _ = self.req("GET", path, token=False)
            self.assertEqual(r.status, 200)
            self.assertTrue(r.getheader("Content-Type").startswith(ctype))

    def test_state_and_session_flow(self):
        r, body = self.req("GET", "/api/state")
        self.assertEqual(r.status, 200)
        self.assertIsNone(json.loads(body)["session"])
        r, body = self.req("POST", "/api/start", {"intention": "Test", "minutes": 25, "lock": True})
        self.assertEqual(r.status, 200, body)
        r, body = self.req("POST", "/api/stop", {"phrase": "non"})
        self.assertEqual(r.status, 400)
        self.assertIn("phrase", json.loads(body)["error"])
        self.assertEqual(self.req("POST", "/api/stop", {"phrase": dw.ABANDON_PHRASE})[0].status, 200)

    def test_malformed_bodies(self):
        cases = [
            (b"{pas du json", None),
            (b"[1, 2, 3]", None),
            (b'"texte"', None),
            (b"null", None),
            (b"{}", {"Content-Length": "abc"}),
            (json.dumps({"intention": "x", "minutes": "abc"}).encode(), None),
            (json.dumps({"intention": {"a": 1}, "minutes": 25}).encode(), None),
        ]
        for body, headers in cases:
            with self.subTest(body=body, headers=headers):
                r, data = self.req("POST", "/api/start", body, headers=headers)
                self.assertIn(r.status, (400, 413), data)
                self.assertIn("error", json.loads(data))
        self.assertIsNone(self.engine.session)
        self.assertEqual(self.req("GET", "/api/ping")[0].status, 200)  # le serveur répond toujours

    def test_bad_lengths_refused(self):
        # Le serveur refuse sans lire le corps annoncé ; Windows peut alors couper la connexion
        # avant que le client lise la réponse, ce qui reste un refus.
        for length, code in [(str(50 * 1024 * 1024), 413), ("-5", 400)]:
            with self.subTest(length=length):
                try:
                    r, _ = self.req("POST", "/api/config", b"{}", headers={"Content-Length": length})
                    self.assertEqual(r.status, code)
                except ConnectionError:
                    pass
        self.assertEqual(self.req("GET", "/api/ping")[0].status, 200)

    def test_unknown_routes(self):
        self.assertEqual(self.req("GET", "/api/nope")[0].status, 404)
        self.assertEqual(self.req("POST", "/api/nope", {})[0].status, 404)

    def test_hosts_failure_degrades_gracefully(self):
        with mock.patch.object(dw, "block_sites", side_effect=PermissionError(13, "Accès refusé")):
            r, data = self.req("POST", "/api/start", {"intention": "x", "minutes": 25, "sites": True})
        self.assertEqual(r.status, 200, data)
        self.assertTrue(json.loads(data)["warnings"])
        self.assertFalse(self.engine.session["sites"])

    def test_listens_on_loopback_only(self):
        self.assertEqual(self.server.server_address[0], "127.0.0.1")


# --- Interface (contrôles statiques) ---------------------------------------------------------
class TestFrontend(unittest.TestCase):
    JS = (ROOT / "ui" / "app.js").read_text(encoding="utf-8")
    HTML = (ROOT / "ui" / "index.html").read_text(encoding="utf-8")

    def test_no_inline_handlers_or_eval(self):
        self.assertIsNone(re.search(r"\son[a-z]+=", self.JS + self.HTML), "gestionnaire inline bloqué par la CSP")
        self.assertNotIn("eval(", self.JS)
        self.assertNotIn("new Function", self.JS)
        self.assertNotIn("<script>", self.HTML)

    def test_user_fields_are_escaped(self):
        # Toute donnée venant de l'utilisateur ou du système passe par esc() avant d'aller dans le HTML.
        for field in ("intention", "note", "name", "exe", "icon"):
            for m in re.finditer(r"\$\{([^}]*\." + field + r")\}", self.JS):
                self.fail(f"interpolation non échappée : ${{{m.group(1)}}}")

    def test_token_sent_in_header(self):
        self.assertIn('"X-Token"', self.JS)
        self.assertIn('meta[name="token"]', self.JS)

    def test_node_syntax(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node absent")
        r = subprocess.run([node, "--check", str(ROOT / "ui" / "app.js")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_esc_function(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node absent")
        line = next(l for l in self.JS.splitlines() if l.startswith("const esc"))
        code = line + "\nconsole.log(esc(`<img src=x onerror=\"a('1')\">&`) + '|' + esc(null) + '|' + esc(0));"
        out = subprocess.run([node, "-e", code], capture_output=True, text=True).stdout.strip()
        self.assertEqual(out, "&lt;img src=x onerror=&quot;a(&#39;1&#39;)&quot;&gt;&amp;||0")


# --- Système (touche Windows de façon contrôlée) ---------------------------------------------
class TestSystem(unittest.TestCase):
    def test_kill_blocked_kills_only_targets(self):
        src = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "PING.EXE"
        dummy = TMP / "dwtest_dummy.exe"
        shutil.copy(src, dummy)
        proc = subprocess.Popen([str(dummy), "-n", "60", "127.0.0.1"], stdout=subprocess.DEVNULL,
                                creationflags=dw.CREATE_NO_WINDOW)
        try:
            time.sleep(0.5)
            self.assertIn("dwtest_dummy.exe", dw.running_processes())
            killed = dw.kill_blocked(["DWTEST_DUMMY.EXE", "explorer.exe", "pythonw.exe", "python.exe"])
            self.assertEqual(killed, ["dwtest_dummy.exe"])
            proc.wait(timeout=5)
        finally:
            if proc.poll() is None:
                proc.kill()

    def test_kill_blocked_never_targets_protected(self):
        with mock.patch.object(dw, "list_processes", lambda: [(4, "explorer.exe"), (5, "svchost.exe")]), \
             mock.patch.object(dw._kernel32, "OpenProcess", side_effect=AssertionError("ne doit pas ouvrir")):
            self.assertEqual(dw.kill_blocked(list(dw.PROTECTED)), [])

    def test_app_window_spared(self):
        marker = str(dw.WINDOW_PROFILE)
        cmd = {10: f"chrome.exe --app=http://127.0.0.1:1/ --user-data-dir={marker}", 11: "chrome.exe"}
        opened = []
        with mock.patch.object(dw, "list_processes", lambda: [(10, "chrome.exe"), (11, "chrome.exe")]), \
             mock.patch.object(dw, "process_command_line", lambda pid: cmd[pid]), \
             mock.patch.object(dw._kernel32, "OpenProcess", side_effect=lambda a, b, pid: opened.append(pid) or 0):
            dw.kill_blocked(["chrome.exe"])
        self.assertEqual(opened, [11])

    def test_command_line_of_self(self):
        self.assertIn("python", dw.process_command_line(os.getpid()).lower())

    def test_notifications_roundtrip(self):
        before = {k: dw._read_dword(*k) for k in dw.NOTIF_KEYS}
        prev = dw.notifications_off()
        try:
            for k in dw.NOTIF_KEYS:
                self.assertEqual(dw._read_dword(*k), 0)
        finally:
            dw.notifications_restore(prev)
        self.assertEqual({k: dw._read_dword(*k) for k in dw.NOTIF_KEYS}, before)


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
