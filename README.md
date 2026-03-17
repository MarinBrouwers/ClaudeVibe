# ClaudeVibe 🎣

A pixel art idle fishing game that reacts to [Claude Code](https://claude.ai/code) in real time.

Every time Claude uses a tool — reading a file, running a search, executing code — a fish appears and you reel it in. The harder Claude works, the more you catch.

---

## What is this?

ClaudeVibe sits in the corner of your screen while you work with Claude Code. It turns Claude's activity into a cozy fishing game:

- **Tool use** → a fish spawns and swims toward your line
- **Rare fish** → occasionally appear with a golden shimmer
- **Day/night cycle** → the sky and water change based on real time
- **Lures vs bobbers** → different gear, different fishing styles
- **Shop** → spend coins on hats, boats, rods, bobbers, and lures
- **Achievements & daily challenges** → keep you coming back
- **Dark & light theme** → toggle with the ☀️ button

---

## Requirements

- [Claude Code](https://claude.ai/code) installed and running
- [Node.js](https://nodejs.org) (v18 or later)

No API key needed. ClaudeVibe does not call the Anthropic API.

> ⚠️ **Security notice:** Only install from the official repo at `github.com/MarinBrouwers/ClaudeVibe`. Do not install from forks or third-party links. The hook runs on your machine after every Claude tool call — you should read [`hook-handler.js`](hook-handler.js) before installing. It's 27 lines and does exactly one thing: appends a tool name to a temp file.

---

## Installation

```bash
git clone https://github.com/MarinBrouwers/ClaudeVibe.git
cd ClaudeVibe
npm install
npm start
```

After the first install, just run `npm start` from the ClaudeVibe folder to open the game.

---

## Starting from Claude Code

On first launch, ClaudeVibe installs a `/claudevibe` slash command. After that you can type `/claudevibe` in any Claude Code session to launch the game directly.

---

## What ClaudeVibe does to your system

ClaudeVibe is transparent about what it touches on first launch:

### 1. `~/.claude/settings.json` — hook registration
ClaudeVibe adds two entries to your Claude Code hooks:

- **PostToolUse** — fires after each tool call (Read, Grep, Bash, Edit, etc.) → spawns a fish
- **Stop** — fires when Claude finishes a response → triggers a cast animation

These hooks run `node hook-handler.js` which only appends a small JSON line to a temp file and exits immediately. **Claude Code is never blocked or delayed.** No data is sent anywhere.

To remove the hooks, open `~/.claude/settings.json` and delete the entries containing `hook-handler`.

### 2. `~/.claude/commands/claudevibe.md` — slash command
Installs a `/claudevibe` slash command so you can launch the game from inside Claude Code. This is just a markdown file.

To remove it, delete `~/.claude/commands/claudevibe.md`.

### 3. A temp queue file
ClaudeVibe uses a file at `[system temp]/claudevibe-queue.jsonl` to pass events from the hook to the game. It is cleared on every launch and contains nothing sensitive — just tool names like `"Read"` or `"Bash"`.

### 4. Save data
Your progress (level, coins, fish caught, cosmetics) is saved to:
- Windows: `%APPDATA%\claudevibe\save.json`
- macOS: `~/Library/Application Support/claudevibe/save.json`
- Linux: `~/.config/claudevibe/save.json`

---

## Controls

| Action | Control |
|--------|---------|
| Zoom in/out | Scroll wheel |
| Open shop | SHOP button (top bar) |
| Toggle music | 🎵 button |
| Toggle FX | 🔊 button |
| Toggle theme | ☀️ / 🌙 button |
| Minimize | Yellow dot |
| Close | Red dot |

---

## Shop & Progression

Earn coins and XP by catching fish. Spend coins in the shop to unlock:

- **Hats** — cosmetic headwear for your fisher
- **Boats** — unique hull shapes (canoe, pirate ship, UFO, and more)
- **Rods** — fishing rods with different looks
- **Bobbers** — classic to crystal, or go bobber-free
- **Lures** — artificial lures replace the bobber and change fish behavior

Items unlock at higher levels — check the `LVL X` badge on each item.

---

## Uninstall

1. Delete the ClaudeVibe folder
2. Remove the hook entries from `~/.claude/settings.json`
3. Delete `~/.claude/commands/claudevibe.md`
4. Optionally delete your save data from the path listed above

---

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for personal and non-commercial use. Contact me for commercial licensing.
