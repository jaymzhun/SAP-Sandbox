# Game bridge

The sandbox's **Test Battle** button plays your two teams in Super Auto Pets itself, using the game's own battle
engine and animations. The site no longer simulates battles in the browser.

## Use it

1. Have Super Auto Pets installed through Steam (Windows). The game can be closed: the bridge starts it.
2. Double-click `start-bridge.bat` and keep its window open. The first run installs Frida (`pip install --user frida`).
3. Open the sandbox (https://jaymzhun.github.io/SAP-Sandbox/ or a local copy), set up both teams and press **Test Battle**.

The game window comes to the front and plays the battle.

## How it works

- `bridge.py` is a small web server on `http://127.0.0.1:47823`. It only answers this PC, and only the published site
  or a localhost copy of it may send battles.
- On a battle request it starts the game if needed, attaches Frida and loads `agent.js`.
- `agent.js` builds both boards with the game's own `BattleBuilder`, puts them in `Memory.DebugBoard` and loads the
  battle scene. The game then plays the debug battle **offline**: it's resolved and animated on this PC and nothing is
  sent to the game's servers.

Notes:

- Don't play online while the bridge is attached. Close the game, or the bridge window, before going online.
- Every battle gets a new random seed, so luck-based abilities can turn out differently each time you press the button.
- A game update can rename the classes the agent uses. If **Test Battle** reports an error after an update, the agent needs updating.
