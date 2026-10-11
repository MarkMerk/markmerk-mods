"""Tests for the 3D window's server: run with `python3 -m unittest discover -s tests -p 'test_*.py'`
from the plugin's folder. Each test starts the real server on a folder of its own."""

import http.client
import json
import os
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import unittest

SERVER = os.path.join(os.path.dirname(__file__), "..", "web", "server.py")


class ServerTest(unittest.TestCase):
    def setUp(self):
        self.base = tempfile.mkdtemp(prefix="workshop-test-")
        with open(os.path.join(self.base, "index.html"), "w") as page:
            page.write('<html><script nonce="__WORKSHOP_NONCE__">1</script></html>')
        with open(os.path.join(self.base, "index.js"), "w") as index:
            index.write("window.workshopIndex([])")
        self.process = subprocess.Popen([sys.executable, SERVER, self.base], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.port = int(self.process.stdout.readline().split()[0])
        self.token = self.claim()

    def tearDown(self):
        self.process.kill()
        self.process.wait()
        self.process.stdout.close()
        self.process.stderr.close()
        shutil.rmtree(self.base, ignore_errors=True)

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        all_headers = {"Host": f"127.0.0.1:{self.port}", **(headers or {})}
        connection.request(method, path, body=body, headers=all_headers)
        response = connection.getresponse()
        data = response.read()
        connection.close()
        return response, data

    def claim(self):
        key = secrets.token_hex(32)
        os.makedirs(os.path.join(self.base, "claims"), exist_ok=True)
        open(os.path.join(self.base, "claims", key), "w").close()
        response, data = self.request("POST", "/claim", json.dumps({"key": key}))
        self.assertEqual(response.status, 200)
        return json.loads(data)["token"]

    def with_token(self, extra=None):
        return {"X-Workshop-Token": self.token, **(extra or {})}

    def test_the_page_carries_no_token_and_a_nonce_its_policy_names(self):
        response, data = self.request("GET", "/")
        self.assertEqual(response.status, 200)
        self.assertNotIn(self.token.encode(), data)
        nonce = data.split(b'nonce="')[1].split(b'"')[0].decode()
        policy = response.getheader("Content-Security-Policy")
        self.assertIn(f"'nonce-{nonce}'", policy)
        self.assertNotIn("unsafe-inline' https", policy.split("style-src")[0])
        self.assertEqual(response.getheader("X-Frame-Options"), "DENY")

    def test_a_key_is_good_once(self):
        key = secrets.token_hex(32)
        open(os.path.join(self.base, "claims", key), "w").close()
        first, _ = self.request("POST", "/claim", json.dumps({"key": key}))
        second, _ = self.request("POST", "/claim", json.dumps({"key": key}))
        made_up, _ = self.request("POST", "/claim", json.dumps({"key": secrets.token_hex(32)}))
        self.assertEqual((first.status, second.status, made_up.status), (200, 403, 403))

    def test_state_needs_the_token(self):
        self.assertEqual(self.request("GET", "/index.js")[0].status, 403)
        self.assertEqual(self.request("GET", "/index.js", headers={"X-Workshop-Token": "x" * 64})[0].status, 403)
        self.assertEqual(self.request("GET", "/index.js", headers=self.with_token())[0].status, 200)

    def test_other_hosts_and_other_sites_are_refused(self):
        self.assertEqual(self.request("GET", "/", headers={"Host": "evil.example"})[0].status, 403)
        self.assertEqual(self.request("GET", "/", headers={"Host": f"localhost:{self.port}"})[0].status, 403)
        cross = self.with_token({"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(self.request("GET", "/index.js", headers=cross)[0].status, 403)
        self.assertEqual(self.request("HEAD", "/index.js", headers=self.with_token())[0].status, 405)

    def test_the_launcher_may_open_the_page_but_not_fetch_it(self):
        opened = {"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document"}
        self.assertEqual(self.request("GET", "/", headers=opened)[0].status, 200)
        fetched = {"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty"}
        self.assertEqual(self.request("GET", "/", headers=fetched)[0].status, 403)
        self.assertEqual(self.request("GET", "/index.js", headers=self.with_token(opened))[0].status, 403)

    def test_only_the_state_files_are_served(self):
        for path in ("/../etc/passwd", "/%2e%2e/x", "/inbox/x/1.json", "/decisions/x", "/claims/x", "/uploads/x", "/viewer", "/sessions/../index.js"):
            self.assertIn(self.request("GET", path, headers=self.with_token())[0].status, (403, 404), path)

    def test_a_link_is_never_followed(self):
        os.symlink("/etc/hosts", os.path.join(self.base, "sessions-link"))
        os.makedirs(os.path.join(self.base, "sessions"), exist_ok=True)
        os.symlink("/etc/hosts", os.path.join(self.base, "sessions", "s1.js"))
        self.assertEqual(self.request("GET", "/sessions/s1.js", headers=self.with_token())[0].status, 404)

    def test_commands_are_checked_and_kept_private(self):
        good = json.dumps({"session": "s1", "type": "prompt", "text": "hi"})
        self.assertEqual(self.request("POST", "/command", good, self.with_token())[0].status, 204)
        for body in ("[1]", "null", "[" * 60000, json.dumps({"session": "s1\n", "type": "stop"}), json.dumps({"session": "../x"})):
            self.assertEqual(self.request("POST", "/command", body, self.with_token())[0].status, 400)
        self.assertEqual(self.request("POST", "/command", good)[0].status, 403)
        folder = os.path.join(self.base, "inbox", "s1")
        written = os.path.join(folder, os.listdir(folder)[0])
        self.assertEqual(stat.S_IMODE(os.stat(folder).st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(os.stat(written).st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(os.stat(self.base).st_mode), 0o700)

    def test_uploads_stay_in_their_folder(self):
        response, data = self.request("POST", "/upload?session=s1&name=../../.bashrc", b"x", self.with_token())
        self.assertEqual(response.status, 200)
        path = json.loads(data)["path"]
        self.assertTrue(path.startswith(os.path.join(self.base, "uploads", "s1") + os.sep))
        self.assertNotIn("..", os.path.basename(path))
        self.assertEqual(self.request("POST", "/upload?session=../x&name=a", b"x", self.with_token())[0].status, 400)

    def test_the_heartbeat_follows_the_page(self):
        self.request("GET", "/index.js", headers=self.with_token())
        time.sleep(2.5)
        with open(os.path.join(self.base, "viewer")) as viewer:
            beat = json.load(viewer)
        self.assertEqual(beat["port"], self.port)
        self.assertTrue(beat["canControl"])
        self.assertLess(time.time() * 1000 - beat["at"], 5000)


if __name__ == "__main__":
    unittest.main()
