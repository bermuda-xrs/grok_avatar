const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, globalShortcut, screen } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs'), path = require('path');

const DIR = path.join(process.env.APPDATA, 'Grok Bot', 'sand-client-persistence');
const BUSY_MS = 3000;   // blob rewritten within this window = bot is working
const DONE_MS = 5000;   // how long the done gif shows
const SETTINGS = path.join(app.getPath('userData'), 'settings.json');
let settings = { minimize: true };
try { settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) }; } catch {}
const saveSettings = () => fs.writeFileSync(SETTINGS, JSON.stringify(settings));
let win_ready_usage, win, tray, busy = false, doneUntil = 0, last = '';

const mt = () => { try { return Object.fromEntries(fs.readdirSync(DIR).map(f => [f, fs.statSync(path.join(DIR, f)).mtimeMs])); } catch { return {}; } };
const base = mt();      // ignore the startup rewrite burst; only react to changes after launch

function poll() {
  if (win.isDestroyed()) return;   // interval can fire once while quitting
  const now = Date.now(), cur = mt();
  const nowBusy = Object.entries(cur).some(([f, t]) => t > (base[f] || 0) && now - t < BUSY_MS);
  if (busy && !nowBusy) doneUntil = now + DONE_MS;
  busy = nowBusy;
  const st = busy ? 'processing' : now < doneUntil ? 'done' : 'idle';
  if (st !== last) { last = st; if (process.env.AV_DEBUG) fs.appendFileSync(process.env.AV_DEBUG, new Date().toISOString() + ' ' + st + '\n'); }
  win.webContents.send('state', st);
  bubbles(); usage();
}

app.whenReady().then(() => {
  win = new BrowserWindow({ width: 420, height: 240, transparent: true, frame: false,
    alwaysOnTop: true, resizable: false, skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile('index.html');
  win.webContents.on('did-finish-load', () => win_ready_usage());
  win.setIgnoreMouseEvents(true, { forward: true });   // transparent areas click through; renderer reports hits
  setInterval(poll, 1000);

  // On/off: tray icon (click = toggle) + Ctrl+Shift+X. "Show" also re-centers it if it ended up off-screen.
  const px = Buffer.alloc(16 * 16 * 4);   // 16x16 blue dot, BGRA
  for (let i = 0; i < 256; i++) { const x = i % 16 - 7.5, y = (i >> 4) - 7.5; if (x * x + y * y < 49) px.set([255, 162, 122, 255], i * 4); }
  tray = new Tray(nativeImage.createFromBitmap(px, { width: 16, height: 16 }));
  tray.setToolTip('Floating avatar');
  const toggle = () => { if (win.isVisible()) win.hide(); else { const a = screen.getPrimaryDisplay().workArea; win.setPosition(a.x + a.width - 440, a.y + a.height - 280); win.show(); } };
  tray.on('click', toggle);
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Show / hide  (Ctrl+Shift+X)', click: toggle }, { label: 'Quit', click: () => app.quit() }]));
  globalShortcut.register('Control+Shift+X', toggle);
});

// setBounds, not setPosition: at 125% display scaling setPosition rounds the size and the window grows ~1px per call while dragging.
ipcMain.on('move', (_, x, y) => win.setBounds({ x: Math.round(x), y: Math.round(y), width: 420, height: 240 }));
ipcMain.on('quit', () => app.quit());
ipcMain.on('hit', (_, on) => win.setIgnoreMouseEvents(!on, { forward: true }));

// Send: send.ps1 opens the bot by deep link, pastes, Enter (steals focus ~2 s).
ipcMain.on('send', (_, text, id) => {
  sent.add(text.trim());
  const b64 = t => Buffer.from(t, 'utf8').toString('base64');
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'send.ps1'), '-Msg', b64(text)];
  if (id) args.push('-AgentId', id);
  if (settings.minimize) args.push('-Minimize');
  execFile('powershell', args);
});
// Roster = the blob with value.rows[].isGroup (file name is an encoded key, so find it by content).
let rosterFile = null;
function readRows() {
  try {
    if (rosterFile) { const r = JSON.parse(fs.readFileSync(rosterFile, 'utf8')).value?.rows; if (r?.length) return r; }
  } catch {}
  rosterFile = null;
  try {
    for (const f of fs.readdirSync(DIR)) {
      const p = path.join(DIR, f), t = fs.readFileSync(p, 'utf8');
      if (!t.startsWith('{"schemaVersion"') || !t.includes('"isGroup"')) continue;
      const r = JSON.parse(t).value?.rows;
      if (Array.isArray(r) && r.length) { rosterFile = p; return r; }
    }
  } catch {}
  return [];
}

// Chat bubbles: a roster row whose lastMessageId changed after launch = new message. Text comes from row.lastEntry.
const sent = new Set(), lastMsg = new Map();
let rosterM = 0;
function bubbles() {
  if (!rosterFile) return;
  let m; try { m = fs.statSync(rosterFile).mtimeMs; } catch { return; }
  if (m === rosterM) return;
  rosterM = m;
  const rows = readRows(), out = [];
  for (const r of rows) {
    const prev = lastMsg.get(r.id), text = r.lastEntry?.text;
    lastMsg.set(r.id, r.lastMessageId);
    if (prev === undefined || prev === r.lastMessageId || !text) continue;   // first sight / unchanged / empty
    if (sent.delete(text.trim())) continue;                                   // our own outgoing message
    out.push({ id: r.id + r.lastMessageId, name: r.name, text: text.length > 160 ? text.slice(0, 157) + '…' : text });
  }
  if (out.length) win.webContents.send('bubbles', out);
}
// Usage % = reading.usage.percentUsed in a small blob; found by content, re-read when its mtime changes.
let usageFile = null, usageM = 0;
function usage() {
  try {
    if (!usageFile) for (const f of fs.readdirSync(DIR)) {
      const p = path.join(DIR, f);
      if (fs.statSync(p).size < 2000 && fs.readFileSync(p, 'utf8').includes('"percentUsed"')) { usageFile = p; break; }
    }
    if (!usageFile) return;
    const m = fs.statSync(usageFile).mtimeMs; if (m === usageM) return;
    const u = JSON.parse(fs.readFileSync(usageFile, 'utf8')).value?.reading?.usage;
    usageM = m;
    if (typeof u?.percentUsed === 'number') win.webContents.send('usage', { pct: u.percentUsed, reset: u.nextResetMs });
  } catch { usageFile = null; }
}
win_ready_usage = () => { usageM = 0; usage(); };
readRows(); for (const r of readRows()) lastMsg.set(r.id, r.lastMessageId);   // baseline at launch
function loadTargets() {
  const seren = r => /^Seren/.test(r.name);   // default target = first option (oldest Seren if duplicated)
  const rows = readRows()
    .filter(r => !r.isHiddenFromSidebar && !r.isRemovedFromSidebar)
    .sort((a, b) => seren(b) - seren(a) || (seren(a) ? a.createdAt - b.createdAt : (b.lastActivityAt || 0) - (a.lastActivityAt || 0)));
  const oldest = new Map();   // same-name bots are distinct: the oldest keeps the plain name, newer copies get their date
  for (const r of rows) if (!oldest.has(r.name) || r.createdAt < oldest.get(r.name).createdAt) oldest.set(r.name, r);
  return rows.map(r => ({ id: r.id,
    label: (r.isGroup ? '👥 ' : '') + r.name + (oldest.get(r.name) === r ? '' : ` (copy ${new Date(r.createdAt).toLocaleDateString()})`) }));
}
let targets = loadTargets();
ipcMain.handle('targets', () => targets);
ipcMain.on('menu', () => Menu.buildFromTemplate([
  { label: 'Refresh bots', click: () => { targets = loadTargets(); win.webContents.send('targets', targets); } },
  { label: 'Keep Grok Bot minimized', type: 'checkbox', checked: settings.minimize, click: mi => { settings.minimize = mi.checked; saveSettings(); } },
  { label: 'Quit', click: () => app.quit() },
]).popup({ window: win }));
