const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const QUEUE = path.join(os.tmpdir(), 'claude-fisher-queue.jsonl');

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
  createWindow();
  startQueuePoller();
});

app.on('window-all-closed', () => app.quit());
