const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('av', {
  move: (x, y) => ipcRenderer.send('move', x, y), quit: () => ipcRenderer.send('quit'),
  send: (t, s) => ipcRenderer.send('send', t, s), targets: () => ipcRenderer.invoke('targets'), menu: () => ipcRenderer.send('menu'), onTargets: f => ipcRenderer.on('targets', (_, t) => f(t)), hit: on => ipcRenderer.send('hit', on), onBubbles: f => ipcRenderer.on('bubbles', (_, b) => f(b)), onUsage: f => ipcRenderer.on('usage', (_, u) => f(u)), onState: f => ipcRenderer.on('state', (_, s) => f(s)),
});
