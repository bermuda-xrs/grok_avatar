const $ = id => document.getElementById(id);
const side = $('side'), avatar = $('avatar'), target = $('target'), msg = $('msg'), bubbles = $('bubbles'), usage = $('usage');

let gifs = {}, shown = null, bot = 'idle', hover = false, drag = null, hit = false;

// Priority: drag > processing > done > hover > standby.
function render(force) {
  const state = drag ? 'drag' : bot !== 'idle' ? bot : hover ? 'hover' : 'standby';
  if (state === shown && !force) return;
  shown = state;
  const files = gifs[state] || [];
  avatar.classList.toggle('empty', !files.length);
  if (files.length) avatar.src = `gifs/${state}/${encodeURIComponent(files[Math.random() * files.length | 0])}`;
  else avatar.removeAttribute('src');
}

function setPanel(open) {
  side.classList.toggle('open', open);
  if (open) msg.focus();
}

function setTargets(list) {
  const current = target.value;
  target.replaceChildren(...list.map(t => new Option(t.label, t.id)));
  if (list.some(t => t.id === current)) target.value = current;
}

function setGifs(map) {
  gifs = map;
  render(true);
}

function addBubble({ name, text }) {
  const el = document.createElement('div');
  el.className = 'bubble';
  el.append(Object.assign(document.createElement('b'), { textContent: name }),
            Object.assign(document.createElement('span'), { textContent: text }));
  el.onclick = () => { el.remove(); av.hit(hit = false); };
  bubbles.append(el);
}

function setUsage({ pct, reset }) {
  usage.hidden = false;
  usage.textContent = Math.round(pct) + '%';
  usage.style.color = pct < 70 ? '#9d9' : pct < 90 ? '#fb4' : '#f66';
  usage.title = 'Grok Bot usage · resets ' + new Date(reset).toLocaleDateString();
}

avatar.onerror = () => avatar.classList.add('empty');
avatar.onmouseenter = () => { hover = true; render(); };
avatar.onmouseleave = () => { hover = false; render(); };
avatar.oncontextmenu = () => av.menu();
avatar.onmousedown = e => {
  if (e.button !== 0) return;
  drag = { dx: e.screenX - window.screenX, dy: e.screenY - window.screenY, moved: false };
  render();
};

window.onmousemove = e => {
  if (drag) {
    drag.moved = true;
    av.move(e.screenX - drag.dx, e.screenY - drag.dy);
  }
  // Only the avatar, panel and bubbles take the mouse; the rest clicks through.
  const over = !!drag || !!e.target.closest('#avatar, #target, #msg, .bubble');
  if (over !== hit) av.hit(hit = over);
};

window.onmouseup = () => {
  if (drag && !drag.moved) setPanel(!side.classList.contains('open'));
  drag = null;
  render();
};

msg.onkeydown = e => {
  if (e.key === 'Escape') return setPanel(false);
  if (e.key !== 'Enter' || !msg.value.trim()) return;
  av.send(msg.value, target.value);
  msg.value = '';
  setPanel(false);
};

av.on('state', s => { bot = s; render(); });
av.on('usage', setUsage);
av.on('bubbles', list => list.forEach(addBubble));
av.on('targets', setTargets);
av.on('gifs', setGifs);
av.targets().then(setTargets);
av.gifs().then(setGifs);
