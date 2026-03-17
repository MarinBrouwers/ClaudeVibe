# ClaudeVibe 🎣

A pixel art idle fishing game that reacts to [Claude Code](https://claude.ai/code) in real time.

Every time Claude uses a tool — reading a file, running a search, executing code — a fish appears and you reel it in. The harder Claude works, the more you catch.

![ClaudeVibe screenshot](screenshot.png)

---

## What is this?

ClaudeVibe sits in the corner of your screen while you work with Claude Code. It turns Claude's activity into a cozy fishing game:

- **Tool use** → a fish spawns and swims toward your line
- **Rare fish** → occasionally appear with a golden shimmer
- **Day/night cycle** → the sky and water change based on real time
- **Lures vs bobbers** → different gear, different fishing styles
- **Shop** → spend coins on hats, boats, rods, bobbers, and lures
- **Achievements & daily challenges** → keep you coming back

---

## Requirements

- [Claude Code](https://claude.ai/code) installed and running
- [Node.js](https://nodejs.org) (v18 or later)

That's it. No API key needed.

---

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/claudevibe.git
cd claudevibe

# 2. Install dependencies
npm install

# 3. Start the game
npm start
```

The window will appear in the top-right corner of your screen. Start chatting with Claude Code and watch the fish come in.

---

## How it works

ClaudeVibe uses [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) to listen for tool use events. Every tool call Claude makes (Read, Grep, Bash, Edit, etc.) triggers a fish spawn in the game.

The hook is configured in `hook-handler.js` and registered automatically when you run the app.

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

## Themes

ClaudeVibe comes with a dark theme (default) and a light theme. Toggle with the ☀️ button in the bottom bar. Your preference is saved.

---

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for personal and non-commercial use. Contact me for commercial licensing.
