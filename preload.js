const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claude', {
  onGameEvent: (cb) => ipcRenderer.on('game-event', (_e, event) => cb(event)),
  getSaveData: () => ipcRenderer.invoke('get-save-data'),
  setSaveData: (data) => ipcRenderer.invoke('set-save-data', data),
  minimize: () => ipcRenderer.send('minimize-window'),
  close: () => ipcRenderer.send('close-window'),
});
