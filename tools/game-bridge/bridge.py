"""Game bridge: lets the sandbox's "Test Battle" button play a battle in Super Auto Pets itself.

Runs a small web server on http://127.0.0.1:47823 for the sandbox page. On a battle request it starts the game
through Steam if it isn't running, attaches Frida, and plays the two teams in the game's own debug battle
(offline: the battle is resolved and animated by the game on this PC; nothing is sent to the game's servers).

Usage:  python bridge.py          (needs:  pip install frida)
"""
import ctypes
import json
import os
import re
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import frida
except ImportError:
    sys.exit("Frida is missing. Install it with:  python -m pip install frida")

PORT = 47823
GAME_EXE = "Super Auto Pets.exe"
STEAM_URL = "steam://rungameid/1714040"
HERE = os.path.dirname(os.path.abspath(__file__))
# pages allowed to use the bridge: the published site and local copies of it
ORIGINS = re.compile(r"^(https://jaymzhun\.github\.io|https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?|null)$")

lock = threading.Lock()
state = {"session": None, "script": None, "status": "idle"}


def game_pid():
    out = subprocess.run(["tasklist", "/FI", f"IMAGENAME eq {GAME_EXE}", "/FO", "CSV", "/NH"], capture_output=True, text=True).stdout
    m = re.search(r'"' + re.escape(GAME_EXE) + r'","(\d+)"', out)
    return int(m.group(1)) if m else None


def detach():
    try:
        if state["session"]:
            state["session"].detach()
    except Exception:
        pass
    state["session"] = state["script"] = None


def agent():
    """The loaded agent, attaching (and starting the game) when needed."""
    if state["script"] and state["session"] and not state["session"].is_detached:
        return state["script"].exports_sync
    detach()
    pid = game_pid()
    if not pid:
        state["status"] = "starting the game"
        os.startfile(STEAM_URL)
        t = time.time()
        while not pid and time.time() - t < 120:
            time.sleep(2)
            pid = game_pid()
        if not pid:
            raise RuntimeError("The game didn't start. Is Steam running?")
        time.sleep(5)
    state["status"] = "attaching"
    session = frida.attach(pid)
    script = session.create_script(open(os.path.join(HERE, "agent.js"), encoding="utf8").read())
    script.on("message", lambda m, d: print("[game]", m.get("description") or m, flush=True))
    script.load()
    state["session"], state["script"] = session, script
    return script.exports_sync


def scene(api, timeout):
    """The current scene name, waiting for a frame to run it (None if no frame ran in time).
    Raises frida.InvalidOperationError if the game was closed."""
    box = {}

    def run():
        try:
            box["v"] = api.scene()
        except Exception as e:
            box["e"] = e
    th = threading.Thread(target=run, daemon=True)
    th.start()
    th.join(timeout)
    if "e" in box:
        raise box["e"]
    return box.get("v")


def wait_ready(api):
    """Waits until the game has finished starting up (the menu or a battle is showing)."""
    t = time.time()
    while time.time() - t < 150:
        if state["session"] is None or state["session"].is_detached:
            raise frida.InvalidOperationError("the game was closed")
        s = scene(api, 5)
        if s in ("Menu", "Battle", "Build"):
            return s
        state["status"] = "waiting for the game to load"
        time.sleep(2)
    raise RuntimeError("The game didn't reach its menu in time.")


def focus_game():
    """Brings the game window to the front."""
    pid = game_pid()
    if not pid:
        return
    user32 = ctypes.windll.user32
    found = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    def cb(hwnd, _):
        p = ctypes.c_ulong()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(p))
        if p.value == pid and user32.IsWindowVisible(hwnd):
            found.append(hwnd)
        return True

    user32.EnumWindows(cb, 0)
    for hwnd in found[:1]:
        user32.ShowWindow(hwnd, 9)  # SW_RESTORE
        user32.keybd_event(0x12, 0, 0, 0)  # a key event lets this process move the foreground window
        user32.keybd_event(0x12, 0, 2, 0)
        user32.SetForegroundWindow(hwnd)


def clean_pet(p):
    out = {"enum": int(p["enum"]), "level": max(1, min(3, int(p.get("level") or 1)))}
    for k in ("attack", "health", "exp", "mana", "perk", "spells"):
        if p.get(k) is not None:
            out[k] = int(p[k])
    for k in ("attack", "health"):
        if k in out:
            out[k] = max(1, min(100, out[k]))
    if "spells" in out:
        out["spells"] = max(0, min(99, out["spells"]))
    return out


# BoardModel counters abilities read; each team's go on its own board
BOARD_KEYS = ("RollsThisTurn", "TransformationsThisTurn", "GoldSpent", "MaxLevelMinionsSold", "MinionsSummonedThisTurn", "Victories")


def clean_board(b):
    return {k: max(0, min(99, int(v))) for k, v in (b or {}).items() if k in BOARD_KEYS and isinstance(v, (int, float))}


def play(spec):
    teams = [[clean_pet(p) for p in spec.get(side) or []][:5] for side in ("player", "opponent")]
    if not teams[0] or not teams[1]:
        raise ValueError("Both teams need at least one pet")
    battle = {"player": teams[0], "opponent": teams[1], "turn": max(1, min(30, int(spec.get("turn") or 1))),
              "seed": int(time.time() * 1000) & 0x7FFFFFFF,
              # "boards": {player, opponent}; an older page sends one "board" for both
              "boards": {side: clean_board((spec.get("boards") or {}).get(side, spec.get("board"))) for side in ("player", "opponent")}}
    with lock:
        try:
            api = agent()
            wait_ready(api)
            state["status"] = "starting the battle"
            api.play_battle(battle)
        except (frida.InvalidOperationError, frida.ProcessNotFoundError):
            detach()  # the game was closed; try once more with a fresh start
            api = agent()
            wait_ready(api)
            api.play_battle(battle)
        state["status"] = "battle playing"
    focus_game()


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        origin = self.headers.get("Origin") or ""
        if ORIGINS.match(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Vary", "Origin")
        return bool(ORIGINS.match(origin))

    def reply(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/status"):
            return self.reply(200, {"bridge": True, "game": bool(game_pid()), "status": state["status"]})
        self.reply(404, {"error": "not found"})

    def do_POST(self):
        if not ORIGINS.match(self.headers.get("Origin") or ""):
            return self.reply(403, {"error": "This page can't use the game bridge"})
        if not self.path.startswith("/battle"):
            return self.reply(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 100000:
                raise ValueError("request too large")
            play(json.loads(self.rfile.read(n) or b"{}"))
            self.reply(200, {"ok": True})
        except Exception as e:
            state["status"] = "error"
            print("battle failed:", e, flush=True)
            self.reply(500, {"error": str(e)})

    def log_message(self, fmt, *args):
        pass


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Game bridge running on http://127.0.0.1:{PORT}  (Ctrl+C to stop)")
    print("Press 'Test Battle' in the sandbox to play the teams in Super Auto Pets.", flush=True)
    if "--open" in sys.argv:
        webbrowser.open("https://jaymzhun.github.io/SAP-Sandbox/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        detach()


if __name__ == "__main__":
    main()
