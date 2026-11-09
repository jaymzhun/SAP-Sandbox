# Records a spec list in chunks of 25 (run.py run); a chunk that fails is retried one battle at a time,
# restarting the game (Steam) after a crash. A battle that crashes the game twice is recorded as {"crash": true}.
# Usage: python -I run-chunks.py <specs.json> <out.json>
import json, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
specs = json.load(open(sys.argv[1], encoding="utf8")); outp = sys.argv[2]
tmp = os.path.join(HERE, "c4"); os.makedirs(tmp, exist_ok=True)
def alive():
    return b"Super Auto Pets.exe" in subprocess.run(["tasklist"], capture_output=True).stdout
def ensure():
    if alive(): return
    subprocess.run(["powershell", "-NoProfile", "-Command", "Start-Process 'steam://rungameid/1714040'"])
    for _ in range(40):
        time.sleep(3)
        if alive(): time.sleep(25); return
    sys.exit("game did not start")
def run(lst, tag):
    sp = os.path.join(tmp, f"in-{tag}.json"); op = os.path.join(tmp, f"out-{tag}.json")
    json.dump(lst, open(sp, "w", encoding="utf8"))
    if os.path.exists(op): os.remove(op)
    r = subprocess.run([PY, "-I", os.path.join(HERE, "run.py"), "run", sp, op], capture_output=True, text=True)
    if r.returncode == 0 and os.path.exists(op): return json.load(open(op, encoding="utf8"))
    return None
out = []
for lo in range(0, len(specs), 25):
    ensure(); res = run(specs[lo:lo + 25], f"{lo}")
    if res is None:
        res = []
        for i in range(lo, min(lo + 25, len(specs))):
            r = None
            for _ in range(2):
                ensure(); r = run([specs[i]], f"s{i}")
                if r is not None: break
                time.sleep(5)
            res.append(r[0] if r else {"crash": True})
            if not r: print("crash", i, specs[i].get("why"), flush=True)
    out += res; print("done", lo, len(out), flush=True)
json.dump(out, open(outp, "w", encoding="utf8"), indent=1); print("ALLDONE", len(out))
