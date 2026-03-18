# ClaudeVibe 🎣

A pixel art idle fishing game that reacts to [Claude Code](https://claude.ai/code) in real time.

Every time Claude uses a tool — reading a file, running a search, executing code — a fish appears and you reel it in. The harder Claude works, the more you catch.

---

https://github.com/user-attachments/assets/a575eeeb-807a-43c2-aeb1-0205cb193721


## What is this?

ClaudeVibe sits in the corner of your screen while you work with Claude Code. It turns Claude's activity into a cozy fishing game:

- **Tool use** → a fish spawns and swims toward your line
- **Rare fish** → occasionally appear with a golden shimmer
- **Day/night cycle** → the sky and water change based on real time
- **Lures vs bobbers** → different gear, different fishing styles
- **Shop** → spend coins on hats, boats, rods, bobbers, and lures
- **Achievements & daily challenges** → keep you coming back
- **Dark & light theme** → toggle with the ☀️ button

<img width="460" height="600" alt="image" src="https://github.com/user-attachments/assets/bddd087f-c983-4e41-92fb-0e6ff6c745e5" />

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

## Changelog

### v1.3.0 — Cosmetics overhaul, buddies & polish

**New cosmetics — 30+ items across all categories, redistributed across levels 1–20:**
- **Hats:** Bucket Hat, Party Hat, Sombrero, Beret, Tinfoil Hat
- **Boats:** Rubber Duck, Bathtub, Cardboard Box, Log Raft, Submarine
- **Rods:** Pool Noodle, Magic Wand, Selfie Stick, Plunger, Lightsaber, Trident
- **Bobbers:** Pizza Slice, Heart, Rubber Duck, Skull, Gem, Ring
- **Lures:** Hotdog, Shiny Coin, Mini Duck, Ghost, Sausage, Cheese

**New shop categories:**
- **BUDDY** — a companion that swims near your boat (Cat, Dog, Duck, Garden Gnome, Parrot). Each has unique animations: dog paddles, duck floats, parrot hovers with flapping wings, cat reluctantly swims, gnome clings to a log
- **WATER** — reskin the pond: Earl Grey, Lava Pond, Slime Pit, Galaxy Water

**Fisherman chat bubbles** — occasionally mutters a tool-specific quip above his head ("ctrl+F irl" for Grep, "yolo..." for Bash, etc.)

**Shop UX fixes:**
- Can't-afford items now show clearly in red with exact shortfall ("need 42 more 🪙") instead of greying everything out

**Night & lighting fixes:**
- Moon brightness toned down at midnight
- Bow lamp intensity reduced (was blowing out the scene)
- Lamp repositioned for Duck boat (mounts on stern); skipped entirely for Bathtub, Cardboard, UFO

**Dinghy fixes:**
- Hull widened to 36px with `ctx.clip()` — fish pile no longer overflows the sides
- Fish pile cap removed — pile grows as tall as needed

### v1.2.0 — Dinghy & polish update
- **Dinghy trailing boat** — a small boat hangs on a rope behind you; caught fish pile up inside it
- **Session fish pile** — fish accumulate in the dinghy during your session and clear on restart; the pile grows upward above the rim as more fish are caught
- **Fish queue system** — tool calls are queued so no fish are ever lost; cast → fish → fish → cast order is preserved
- **Thinking phrases** — funny fishing synonyms appear underwater while Claude is working (one per fish): *"hook diplomacy"*, *"underwater cold outreach"*, *"fish whispering"*, and more
- **Full rig animation** — line, bobber, and lure all reel in together toward the rod tip on catch
- **Fish facing direction** — fish now always face the correct direction and don't flip while reeling
- **Bobber stays at waterline** — fish reel in from depth, never pulled out of the water
- **Doubled reel speed** — fish come in faster
- **Brighter lamp** — the bow lamp now illuminates a wider area at night
- **Ripple cap** — boat ripples no longer overlap the dinghy

### v1.1.0 — Initial public release
- Pixel art fishing game reacting to Claude Code tool use
- Day/night cycle, shop, achievements, daily challenges
- Lures, bobbers, hats, boats, rods cosmetics
- Dark/light theme toggle

---

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for personal and non-commercial use. Contact me for commercial licensing.
