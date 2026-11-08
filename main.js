const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, globalShortcut, screen } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const DATA = path.join(process.env.APPDATA, 'Grok Bot', 'sand-client-persistence');
const SETTINGS = path.join(app.getPath('userData'), 'settings.json');
const W = 420, H = 240;
const BUSY_MS = 3000, DONE_MS = 5000;
const STATES = ['standby', 'hover', 'drag', 'processing', 'done'];
const SEND_ERRORS = { 1: 'Grok Bot did not open.', 2: 'Unknown bot.', 3: 'Grok Bot lost focus, nothing was typed.' };

const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const settings = { minimize: true, defaultBot: '', ...readJson(SETTINGS) };
const saveSettings = patch => fs.writeFileSync(SETTINGS, JSON.stringify(Object.assign(settings, patch)));

let win;
const send = (channel, value) => win && !win.isDestroyed() && win.webContents.send(channel, value);

// Grok Bot data: blobs have opaque names, so each is classified once by content.

const kinds = new Map();
const mtimes = new Map();
const lastMessage = new Map();
const sentTexts = new Set();
let roster = [], usage = null, botState = 'idle', lastActivity = 0, booted = false;

function kindOf(file) {
  if (kinds.has(file)) return kinds.get(file);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return 'other'; }
  const kind = text.includes('"isGroup":') ? 'roster'
    : text.includes('"percentUsed":') ? 'usage'
    : text.includes('"entries":[') ? 'thread' : 'other';
  kinds.set(file, kind);
  return kind;
}

function readRoster(file) {
  const rows = readJson(file)?.value?.rows;
  if (!Array.isArray(rows)) return false;
  roster = rows;
  const fresh = [];
  for (const r of rows) {
    const prev = lastMessage.get(r.id), text = r.lastEntry?.text;
    lastMessage.set(r.id, r.lastMessageId);
    if (prev === undefined || prev === r.lastMessageId || !text || sentTexts.delete(text.trim())) continue;
    fresh.push({ name: r.name, text: text.length > 160 ? text.slice(0, 159) + '…' : text });
  }
  if (fresh.length) send('bubbles', fresh);
  return true;
}

function readUsage(file) {
  const u = readJson(file)?.value?.reading?.usage;
  if (typeof u?.percentUsed !== 'number') return false;
  usage = { pct: u.percentUsed, reset: u.nextResetMs };
  send('usage', usage);
  return true;
}

function tick() {
  let files;
  try { files = fs.readdirSync(DATA); } catch { return; }
  for (const name of files) {
    const file = path.join(DATA, name);
    let mtime;
    try { mtime = fs.statSync(file).mtimeMs; } catch { continue; }
    if (mtimes.get(file) === mtime) continue;
    const kind = kindOf(file);
    const ok = kind === 'roster' ? readRoster(file) : kind === 'usage' ? readUsage(file) : true;
    if (!ok) continue;   // caught mid-write: retry next tick
    mtimes.set(file, mtime);
    if (booted && (kind === 'thread' || kind === 'roster')) lastActivity = Math.max(lastActivity, mtime);
  }
  booted = true;

  const age = Date.now() - lastActivity;
  const state = age < BUSY_MS ? 'processing' : age < BUSY_MS + DONE_MS ? 'done' : 'idle';
  if (state !== botState) {
    botState = state;
    send('state', state);
  }
}

function targets() {
  const isDefault = r => !!settings.defaultBot && r.name.startsWith(settings.defaultBot);
  const rows = roster
    .filter(r => !r.isHiddenFromSidebar && !r.isRemovedFromSidebar)
    .sort((a, b) => isDefault(b) - isDefault(a)
      || (isDefault(a) ? a.createdAt - b.createdAt : (b.lastActivityAt || 0) - (a.lastActivityAt || 0)));
  const original = new Map();
  for (const r of rows) if (!original.has(r.name) || r.createdAt < original.get(r.name).createdAt) original.set(r.name, r);
  return rows.map(r => ({
    id: r.id,
    label: (r.isGroup ? '👥 ' : '') + r.name + (original.get(r.name) === r ? '' : ` (copy ${new Date(r.createdAt).toLocaleDateString()})`),
  }));
}

function gifs() {
  return Object.fromEntries(STATES.map(s => {
    try { return [s, fs.readdirSync(path.join(__dirname, 'gifs', s)).filter(f => /\.(gif|webp|png)$/i.test(f))]; }
    catch { return [s, []]; }
  }));
}

// Window

function trayIcon() {
  const px = Buffer.alloc(16 * 16 * 4);
  for (let i = 0; i < 256; i++) {
    const x = i % 16 - 7.5, y = (i >> 4) - 7.5;
    if (x * x + y * y < 49) px.set([255, 162, 122, 255], i * 4);   // BGRA
  }
  return nativeImage.createFromBitmap(px, { width: 16, height: 16 });
}

function cornerBounds() {
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - W - 20, y: a.y + a.height - H - 40, width: W, height: H };
}

function toggle() {
  if (win.isVisible()) return win.hide();
  const b = win.getBounds(), a = screen.getDisplayMatching(b).workArea;
  const onScreen = b.x < a.x + a.width && b.x + W > a.x && b.y < a.y + a.height && b.y + H > a.y;
  if (!onScreen) win.setBounds(cornerBounds());
  win.show();
}

if (!app.requestSingleInstanceLock()) process.exit(0);
app.on('second-instance', () => win && !win.isVisible() && toggle());

app.whenReady().then(() => {
  win = new BrowserWindow({
    ...cornerBounds(), transparent: true, frame: false, resizable: false, skipTaskbar: true, hasShadow: false,
    alwaysOnTop: true, webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile('index.html');
  win.webContents.on('did-finish-load', () => { send('state', botState); if (usage) send('usage', usage); });

  const tray = new Tray(trayIcon());
  tray.setToolTip('Grok avatar');
  tray.on('click', toggle);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show / hide (Ctrl+Shift+X)', click: toggle },
    { label: 'Quit', click: () => app.quit() },
  ]));
  globalShortcut.register('Control+Shift+X', toggle);

  tick();
  setInterval(tick, 1000);
});

// IPC

// setBounds, not setPosition: at fractional display scaling setPosition grows the window on every call.
ipcMain.on('move', (_, x, y) => win.setBounds({ x: Math.round(x), y: Math.round(y), width: W, height: H }));
ipcMain.on('hit', (_, over) => win.setIgnoreMouseEvents(!over, { forward: true }));
ipcMain.handle('targets', targets);
ipcMain.handle('gifs', gifs);

ipcMain.on('send', (_, text, agentId) => {
  const key = text.trim();
  sentTexts.add(key);
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'send.ps1'),
    '-Msg', Buffer.from(text).toString('base64')];
  if (agentId) args.push('-AgentId', agentId);
  if (settings.minimize) args.push('-Minimize');
  execFile('powershell', args, err => {
    if (!err) return;
    sentTexts.delete(key);
    send('bubbles', [{ name: 'Not sent', text: SEND_ERRORS[err.code] || err.message }]);
  });
});

ipcMain.on('menu', () => Menu.buildFromTemplate([
  { label: 'Refresh bots', click: () => send('targets', targets()) },
  { label: 'Reload GIFs', click: () => send('gifs', gifs()) },
  { type: 'separator' },
  { label: 'Keep Grok Bot minimized', type: 'checkbox', checked: settings.minimize, click: i => saveSettings({ minimize: i.checked }) },
  { type: 'separator' },
  { label: 'Quit', click: () => app.quit() },
]).popup({ window: win }));
