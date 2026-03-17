const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const QUEUE = path.join(os.tmpdir(), 'claudevibe-queue.jsonl');

// Only one instance allowed
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 600,
    frame: false,
    alwaysOnTop: true,
    backgroundColor: '#0c0e1a',
    resizable: false,
    skipTaskbar: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  // Position bottom-right of screen
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow.setPosition(width - 476, height - 616);
}

// ── Hook auto-registration ────────────────────────────────────────────────────
// Automatically adds ClaudeVibe hooks to ~/.claude/settings.json on startup.

function registerHooks() {
  const hookScript = path.join(__dirname, 'hook-handler.js').replace(/\\/g, '/');
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch (_) {}

  if (!settings.hooks) settings.hooks = {};

  const makeHook = (eventType) => ({
    matcher: '',
    hooks: [{ type: 'command', command: `node "${hookScript}" ${eventType}` }],
  });

  // PreToolUse — fires before each tool call (cast the rod)
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  const hasPreTool = settings.hooks.PreToolUse.some(h =>
    h.hooks && h.hooks.some(hh => hh.command && hh.command.includes('claudevibe') || hh.command && hh.command.includes('hook-handler')));
  if (!hasPreTool) settings.hooks.PreToolUse.push(makeHook('cast'));

  // PostToolUse — fires after each tool call (fish bites)
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  const hasPostTool = settings.hooks.PostToolUse.some(h =>
    h.hooks && h.hooks.some(hh => hh.command && hh.command.includes('claudevibe') || hh.command && hh.command.includes('hook-handler')));
  if (!hasPostTool) settings.hooks.PostToolUse.push(makeHook('tool_use'));

  // Stop — fires when Claude finishes responding
  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  const hasStop = settings.hooks.Stop.some(h =>
    h.hooks && h.hooks.some(hh => hh.command && hh.command.includes('claudevibe') || hh.command && hh.command.includes('hook-handler')));
  if (!hasStop) settings.hooks.Stop.push(makeHook('done'));

  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (_) {}
}

// ── Slash command auto-install ────────────────────────────────────────────────
// Installs /claudevibe slash command into ~/.claude/commands/

function installSlashCommand() {
  const commandsDir = path.join(os.homedir(), '.claude', 'commands');
  const commandFile = path.join(commandsDir, 'claudevibe.md');
  const appDir = __dirname.replace(/\\/g, '/');

  const content = `Launch the ClaudeVibe fishing game — a pixel art idle game that reacts to your Claude Code activity in real time.

Run this command to start ClaudeVibe:

\`\`\`bash
cd "${appDir}" && npm start
\`\`\`

ClaudeVibe will open in the corner of your screen and start fishing whenever you use Claude Code tools.
`;

  try {
    fs.mkdirSync(commandsDir, { recursive: true });
    if (!fs.existsSync(commandFile)) {
      fs.writeFileSync(commandFile, content, 'utf-8');
    }
  } catch (_) {}
}

// ── Queue poller ──────────────────────────────────────────────────────────────
// Reads events appended by hook-handler.js. Hook exits instantly; no blocking.

function startQueuePoller() {
  // Clear any leftover queue from a previous session
  try { fs.writeFileSync(QUEUE, ''); } catch (_) {}

  setInterval(() => {
    let raw;
    try { raw = fs.readFileSync(QUEUE, 'utf-8'); } catch (_) { return; }
    if (!raw.trim()) return;

    // Clear the file atomically before processing
    try { fs.writeFileSync(QUEUE, ''); } catch (_) {}

    for (const line of raw.trim().split('\n')) {
      try {
        const event = JSON.parse(line);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('game-event', event);
        }
      } catch (_) {}
    }
  }, 200);
}

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.on('minimize-window', () => mainWindow && mainWindow.minimize());
ipcMain.on('close-window',    () => mainWindow && mainWindow.close());

ipcMain.handle('get-save-data', () => {
  const p = path.join(app.getPath('userData'), 'save.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
});

ipcMain.handle('set-save-data', (_e, data) => {
  const p = path.join(app.getPath('userData'), 'save.json');
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
  return true;
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  registerHooks();
  installSlashCommand();
  createWindow();
  startQueuePoller();
});

app.on('window-all-closed', () => app.quit());
