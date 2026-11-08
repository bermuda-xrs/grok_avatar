const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['state', 'usage', 'bubbles', 'targets', 'gifs'];

contextBridge.exposeInMainWorld('av', {
  move: (x, y) => ipcRenderer.send('move', x, y),
  hit: over => ipcRenderer.send('hit', over),
  menu: () => ipcRenderer.send('menu'),
  send: (text, agentId) => ipcRenderer.send('send', text, agentId),
  targets: () => ipcRenderer.invoke('targets'),
  gifs: () => ipcRenderer.invoke('gifs'),
  on: (event, fn) => EVENTS.includes(event) && ipcRenderer.on(event, (_, value) => fn(value)),
});
