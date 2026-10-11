"""Serves the agent workshop's 3D window on this machine alone, and takes its commands.

Started by the Claude Code session that opened the window, with the shared folder:

    python3 server.py ~/.claude/agent-workshop

It listens on 127.0.0.1 at a free port and prints the port. It makes a random token it never
prints and never puts in a page: a page gets it once, in exchange for a one-time key that the
session leaves in `claims/` (readable by the person alone) and hands the browser through a local
launcher file. Every other request needs the token in the X-Workshop-Token header: the sessions'
state, the settings, the recent projects, and the commands (POST /command) and files (POST
/upload) the page sends. While a page is using it, the server beats the heartbeat in `viewer`
that tells the sessions a window is open; when no page has asked for a while, it stops, and the
sessions stop sharing. It exits when the session that started it is gone.
"""

import hmac
import http.server
import json
import os
import re
import secrets
import socket
import sys
import threading
import time
import urllib.parse
import uuid

BASE = sys.argv[1]
TOKEN = secrets.token_hex(32)
NAME = re.compile(r"[A-Za-z0-9_-]{1,80}")
KEY = re.compile(r"[0-9a-f]{64}")
STATE = re.compile(r"/(index\.js|settings\.json|projects\.js|sessions/[A-Za-z0-9_-]{1,80}(\.more|\.cmds|\.files)?\.js)")
# The library files the page may load, exactly
SCRIPTS = (
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js",
    "https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js",
)
MAX_BODY = 64 * 1024
MAX_UPLOAD = 20 * 1024 * 1024
MAX_UPLOADS_TOTAL = 200 * 1024 * 1024
UPLOAD_DAYS = 7
CLAIM_SECONDS = 300
# How long after a page's last request the window still counts as open, and how often to beat
PAGE_SECONDS = 10
BEAT_SECONDS = 2
MAX_CONNECTIONS = 32
port = 0
page_seen = 0.0
parent = os.getppid()

os.umask(0o077)


def csp(nonce):
    scripts = " ".join(SCRIPTS + (PURIFY,))
    return (
        f"default-src 'none'; script-src 'nonce-{nonce}' {scripts}; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; connect-src 'self'; font-src 'none'; media-src 'none'; object-src 'none'; "
        "frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    )


PURIFY = "https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.4.16/purify.min.js"


def write_atomically(path, text):
    os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
    # A name of its own for each write, so two at once never step on each other
    temporary = os.path.join(os.path.dirname(path), "." + uuid.uuid4().hex)
    with open(temporary, "w", encoding="utf-8") as file:
        file.write(text)
    os.replace(temporary, path)


def read_plain(path):
    """Reads a file of the folder's own, never through a symbolic link planted in its place."""
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as file:
        return file.read()


def folder_size(folder):
    total = 0
    for root, _, names in os.walk(folder):
        for name in names:
            try:
                total += os.lstat(os.path.join(root, name)).st_size
            except OSError:
                pass
    return total


def forget_old(folder, seconds):
    cutoff = time.time() - seconds
    for root, _, names in os.walk(folder):
        for name in names:
            path = os.path.join(root, name)
            try:
                if os.lstat(path).st_mtime < cutoff:
                    os.remove(path)
            except OSError:
                pass


def keep_house():
    """The heartbeat while a page is using the window, the folder kept private, old uploads and
    unused keys cleared, and an exit when the session that started the server is gone."""
    last_sweep = 0.0
    while True:
        now = time.time()
        if os.getppid() != parent:
            try:
                write_atomically(os.path.join(BASE, "viewer"), json.dumps({"at": 0}))
            finally:
                os._exit(0)
        if now - page_seen < PAGE_SECONDS:
            beat = {"at": int(now * 1000), "port": port, "pid": os.getpid(), "canControl": True}
            write_atomically(os.path.join(BASE, "viewer"), json.dumps(beat))
        try:
            os.chmod(BASE, 0o700)
        except OSError:
            pass
        if now - last_sweep > 600:
            last_sweep = now
            forget_old(os.path.join(BASE, "uploads"), UPLOAD_DAYS * 86400)
            forget_old(os.path.join(BASE, "claims"), CLAIM_SECONDS)
        time.sleep(BEAT_SECONDS)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    slots = threading.BoundedSemaphore(MAX_CONNECTIONS)

    def process_request(self, request, client_address):
        # Too many at once: the newest is turned away rather than starving the page
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        super().process_request(request, client_address)

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()

    def handle_error(self, request, client_address):
        # Nothing on stderr: a bad request is just dropped
        pass


class Handler(http.server.SimpleHTTPRequestHandler):
    # A connection that stalls is dropped, and so is one that sends too many headers
    timeout = 15
    server_version = "workshop"
    sys_version = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE, **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self, policy=None):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", policy or "default-src 'none'; frame-ancestors 'none'")
        super().end_headers()

    def is_ours(self):
        if self.headers.get("Host", "") != f"127.0.0.1:{port}":
            return False
        # A browser says where a request comes from; only the page itself may ask
        return self.headers.get("Sec-Fetch-Site") in (None, "same-origin", "none")

    def has_token(self):
        given = self.headers.get("X-Workshop-Token", "").encode("utf-8", "surrogateescape")
        if not hmac.compare_digest(given, TOKEN.encode()):
            return False
        global page_seen
        page_seen = time.time()
        return True

    def length(self):
        try:
            return int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            return -1

    def body_json(self):
        length = self.length()
        if length <= 0 or length > MAX_BODY:
            return None
        try:
            value = json.loads(self.rfile.read(length))
        except (ValueError, RecursionError):
            return None
        return value if isinstance(value, dict) else None

    def reply(self, code, body=b"", kind="text/plain; charset=utf-8", policy=None):
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers(policy)
        self.wfile.write(body)

    def do_HEAD(self):
        return self.reply(405)

    def do_GET(self):
        if not self.is_ours():
            return self.reply(403)
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            # The page, without the token: it has to claim it with a one-time key
            try:
                page = read_plain(os.path.join(BASE, "index.html")).decode("utf-8")
            except (OSError, UnicodeDecodeError):
                return self.reply(503)
            nonce = secrets.token_urlsafe(18)
            page = page.replace("__WORKSHOP_NONCE__", nonce)
            return self.reply(200, page.encode("utf-8"), "text/html; charset=utf-8", csp(nonce))
        # Everything else is the sessions' own words: for the page that holds the token alone
        if not self.has_token():
            return self.reply(403)
        if not STATE.fullmatch(path):
            return self.reply(404)
        try:
            body = read_plain(os.path.join(BASE, path.lstrip("/")))
        except OSError:
            return self.reply(404)
        kind = "application/json" if path.endswith(".json") else "text/javascript; charset=utf-8"
        return self.reply(200, body, kind)

    def do_POST(self):
        if not self.is_ours():
            return self.reply(403)
        if self.path == "/claim":
            return self.claim()
        if not self.has_token():
            return self.reply(403)
        if self.path.startswith("/upload?"):
            return self.upload()
        if self.path != "/command":
            return self.reply(404)
        command = self.body_json()
        if command is None:
            return self.reply(400)
        session = str(command.get("session", ""))
        if not NAME.fullmatch(session):
            return self.reply(400)
        # A permission decision goes where the session waiting on it looks; the rest to its inbox
        if command.get("type") == "permission":
            request = str(command.get("id", ""))
            decision = command.get("decision")
            answers = command.get("answers")
            if not NAME.fullmatch(request) or decision not in ("allow", "deny"):
                return self.reply(400)
            if answers is not None and not (isinstance(answers, dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in answers.items())):
                return self.reply(400)
            answer = {"decision": decision, "always": command.get("always") is True, "mode": "acceptEdits" if command.get("mode") == "acceptEdits" else None}
            if answers is not None:
                answer["answers"] = answers
            write_atomically(os.path.join(BASE, "decisions", request), json.dumps(answer))
        else:
            write_atomically(os.path.join(BASE, "inbox", session, f"{time.time_ns()}.json"), json.dumps(command))
        return self.reply(204)

    def claim(self):
        """Swaps a one-time key the session left in claims/ for the token; the key is gone after."""
        asked = self.body_json()
        key = str((asked or {}).get("key", ""))
        if not KEY.fullmatch(key):
            return self.reply(403)
        path = os.path.join(BASE, "claims", key)
        try:
            found = os.lstat(path)
            os.remove(path)
        except OSError:
            return self.reply(403)
        if not (found.st_mode & 0o170000 == 0o100000) or time.time() - found.st_mtime > CLAIM_SECONDS:
            return self.reply(403)
        global page_seen
        page_seen = time.time()
        return self.reply(200, json.dumps({"token": TOKEN}).encode("utf-8"), "application/json")

    def upload(self):
        """Keeps a file the page attaches to a prompt, and answers where it is, for the prompt to name."""
        query = urllib.parse.parse_qs(self.path.split("?", 1)[1])
        session = query.get("session", [""])[0]
        name = re.sub(r"\.{2,}", "_", re.sub(r"[^A-Za-z0-9._-]", "_", query.get("name", ["file"])[0]))[-100:].lstrip(".") or "file"
        length = self.length()
        if not NAME.fullmatch(session) or length <= 0 or length > MAX_UPLOAD:
            return self.reply(400)
        folder = os.path.join(BASE, "uploads")
        if folder_size(folder) + length > MAX_UPLOADS_TOTAL:
            return self.reply(507)
        folder = os.path.join(folder, session)
        os.makedirs(folder, mode=0o700, exist_ok=True)
        path = os.path.join(folder, f"{time.time_ns()}-{name}")
        remaining = length
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
        with os.fdopen(descriptor, "wb") as file:
            while remaining > 0:
                chunk = self.rfile.read(min(remaining, 1 << 16))
                if not chunk:
                    break
                file.write(chunk)
                remaining -= len(chunk)
        # A cut-off upload is no file
        if remaining > 0:
            os.remove(path)
            return self.reply(400)
        return self.reply(200, json.dumps({"path": path}).encode("utf-8"), "application/json")


os.makedirs(BASE, mode=0o700, exist_ok=True)
os.chmod(BASE, 0o700)
forget_old(os.path.join(BASE, "uploads"), UPLOAD_DAYS * 86400)
server = Server(("127.0.0.1", 0), Handler)
server.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
port = server.server_address[1]
threading.Thread(target=keep_house, daemon=True).start()
print(port, flush=True)
server.serve_forever()
