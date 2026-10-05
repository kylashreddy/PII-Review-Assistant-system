// Main window: choose the two documents, see what the check found, answer each item.
// For every piece of PII in the raw original: the label it needs (the review site's own
// label names), whether the redacted work has that label, and whether it is redacted.
'use strict';
const api = window.evaratus || demoBridge();

const ui = {
  state: null,        // settings and environment from the app
  result: null,       // last check
  status: 'idle',     // idle | reading | permission | blank | error
  error: '',
  step: 0,           // page while reading the whole document
  taskKey: null,
  filter: null,       // section key shown alone, or null for all
  expanded: new Set(),
  palette: {},
};

// ------------------------------------------------------------------ small DOM helper (text only, no HTML strings)
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 3 ? 'just now' : s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
};
const size = (r) => `${Math.round(r.width)} × ${Math.round(r.height)} pt`;


// ------------------------------------------------------------------ render
function render() {
  const main = document.getElementById('main');
  const scrollTop = main.scrollTop;
  main.replaceChildren(...view().filter(Boolean));
  main.scrollTop = scrollTop;
  if (ui.result && ui.result.view && ui.state && ui.state.regions) announce(ui.result.view);
  renderLivePill();
  const s = ui.state;
  document.getElementById('engine').textContent = s ? `OCR: ${s.engine}` : '';
}

function view() {
  const s = ui.state;
  if (!s) return [h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' })];
  if (s.access === 'denied' || ui.status === 'permission') return [permissionCard()];
  if (!s.regions) return [welcome()];
  const out = [documentsCard(), statusNotice()];
  const r = ui.result;
  if (!r || !r.view) {
    out.push(['reading', 'idle', 'finding', 'reading-all'].includes(ui.status) ? h('div', { class: 'skeleton' }) : null);
    return out;
  }
  const v = r.view;
  out.push(doneCard(v), summaryCard(v), taskNotice(r), coloursCard(r), filterChips(v), ...labelGroups(v));
  return out;
}

function welcome() {
  return h('div', { class: 'card welcome' },
    h('span', { class: 'wordmark', role: 'img', 'aria-label': 'scaler ai labs' }),
    h('div', { class: 'kicker' }, 'Evaratus Review'),
    h('h1', {}, 'Check redactions on screen'),
    h('p', {}, 'Evaratus Review reads the two documents of a task from your screen and shows what still needs fixing.'),
    h('ol', { class: 'howto' },
      h('li', {}, h('div', { class: 'n' }, '1'), h('div', {}, h('b', {}, 'Open a task'),
        h('span', {}, 'Left: the raw original (no labels). Right: the PII-redacted work, with its labels. Side by side, in any app or website.'))),
      h('li', {}, h('div', { class: 'n' }, '2'), h('div', {}, h('b', {}, 'Find the documents'),
        h('span', {}, 'Let the app detect them automatically, or draw the two boxes yourself.'))),
      h('li', {}, h('div', { class: 'n' }, '3'), h('div', {}, h('b', {}, 'Scroll and review'),
        h('span', {}, 'Problems are marked on the documents and listed here. When nothing is left, it says Redaction done.')))),
    h('div', { class: 'welcome-actions' },
      h('button', { class: 'btn primary big', onclick: () => api.findDocuments(), disabled: ui.status === 'finding' },
        ui.status === 'finding' ? 'Looking for the documents…' : '◎  Detect documents automatically'),
      h('button', { class: 'btn big', onclick: () => api.pickRegions() }, '⌖  Select manually')),
    ui.status === 'notfound' ? h('p', { class: 'welcome-note' },
      'No pair of documents found. Open the task so both documents are visible side by side, then try again — or select them manually.') : null);
}

function permissionCard() {
  return h('div', { class: 'card welcome' },
    h('span', { class: 'wordmark', role: 'img', 'aria-label': 'scaler ai labs' }),
    h('div', { class: 'kicker' }, 'Evaratus Review'),
    h('h1', {}, 'Allow screen reading'),
    h('p', {}, 'macOS needs your permission before Evaratus Review can read the documents on screen. ' +
      'Turn on Electron (Evaratus Review once installed) under Privacy & Security → Screen Recording, then quit and start the app again.'),
    h('button', { class: 'btn primary big', onclick: () => api.openPermissions() }, 'Open Screen Recording settings'),
    h('p', { style: 'margin-top:14px;font-size:12px' }, 'The screen is only read inside the two boxes you select, and nothing leaves this computer.'));
}

function documentsCard() {
  const s = ui.state;
  const r = ui.result;
  const busy = ['finding', 'reading-all'].includes(ui.status);
  return h('div', { class: 'card' },
    h('h2', {}, 'Documents', h('span', { class: 'from' }, s.regionsFrom === 'auto' ? 'found automatically' : s.regionsFrom === 'manual' ? 'selected by you' : ''),
      h('span', { class: 'spacer' }), h('button', { class: 'btn ghost', onclick: () => api.showRegions() }, 'Show on screen')),
    h('div', { class: 'docs' },
      h('div', { class: 'doc-tile left' }, h('div', { class: 'k' }, h('i'), 'Original'), h('div', { class: 'sub' }, 'raw · no labels'),
        h('div', { class: 'v' }, r && r.coverage ? `${r.coverage.leftRows} lines read` : size(s.regions.left))),
      h('div', { class: 'doc-tile right' }, h('div', { class: 'k' }, h('i'), 'Redacted'), h('div', { class: 'sub' }, 'PII replaced · labeled'),
        h('div', { class: 'v' }, r && r.coverage ? `${r.coverage.rightRows} lines · ${r.labels.length} label${r.labels.length === 1 ? '' : 's'}` : size(s.regions.right)))),
    h('div', { class: 'controls' },
      h('button', { class: 'btn primary', onclick: () => api.readAll(), disabled: busy, title: 'Scroll both documents from top to bottom and read them in full' },
        ui.status === 'reading-all' ? `Reading… page ${ui.step || 1}` : '⇣ Read whole document'),
      h('button', { class: 'btn', onclick: () => api.findDocuments(), disabled: busy, title: 'Find the two documents on screen automatically' },
        ui.status === 'finding' ? 'Finding…' : '◎ Detect'),
      h('button', { class: 'btn', onclick: () => api.pickRegions(), disabled: busy, title: 'Draw the two boxes yourself' }, '⌖ Select'),
      h('button', { class: 'btn', onclick: () => api.newTask(), disabled: busy, title: 'Forget what was read and start reading the next task' }, 'New task')),
    h('div', { class: 'controls' },
      toggle('Live', s.live, () => api.set({ live: !s.live }), 'Re-read the documents whenever they change (e.g. when you scroll)'),
      toggle('Marks', s.overlay, () => api.set({ overlay: !s.overlay }), 'Show the labels and problems on the documents'),
      toggle('Auto-find', s.autoFind, () => api.set({ autoFind: !s.autoFind }), 'Find the documents again automatically when the task moves on screen')),
    r ? coverage(r) : null);
}

/** How much of each document has been read, and how much of it could be compared. */
function coverage(r) {
  const c = r.coverage;
  if (!c) return h('div', { class: 'meta' }, `Read ${ago(r.readAt)}`);
  const behind = c.notComparedLeft > c.notComparedRight ? 'redacted' : 'original';
  const gap = Math.max(c.notComparedLeft, c.notComparedRight);
  return h('div', { class: 'coverage' },
    h('div', { class: 'meta' }, `Read so far: original ${c.leftRows} lines · redacted ${c.rightRows} lines · compared ${c.comparedLeft} lines · ${ago(r.readAt)}`),
    c.movedRows ? h('div', { class: 'meta' }, `The redacted document is laid out differently: ${c.movedRows} of its lines were lined up with the original before comparing.`) : null,
    gap > 0 ? h('div', { class: 'meta strong' }, `${gap} line${gap === 1 ? '' : 's'} read on one side only — scroll the ${behind} document to the same place to compare them.`)
      : h('div', { class: 'meta' }, 'Scroll through both documents to read them in full; new lines are added as they appear.'));
}

function toggle(label, on, onclick, title) {
  return h('button', { class: 'switch' + (on ? ' on' : ''), onclick, title, 'aria-pressed': String(Boolean(on)) }, h('i'), label);
}

function statusNotice() {
  if (ui.status === 'blank') {
    return h('div', { class: 'notice warn' }, h('div', { class: 'ic' }, '⚠'),
      h('div', {}, h('b', {}, 'The selected areas look empty'), h('p', {}, 'Is the task still open where you selected it? Reselect the documents if the window moved.')));
  }
  if (ui.status === 'accessibility') {
    return h('div', { class: 'notice' }, h('div', { class: 'ic' }, '⇣'),
      h('div', {}, h('b', {}, 'Allow scrolling to read the whole document'),
        h('p', {}, 'To page through the documents by itself, the app needs Accessibility permission: System Settings → Privacy & Security → Accessibility → turn on Electron (Evaratus Review once installed). Then press “Read whole document” again.')));
  }
  if (ui.status === 'reading-all') {
    return h('div', { class: 'notice' }, h('div', { class: 'ic' }, '⇣'),
      h('div', {}, h('b', {}, `Reading the whole document… page ${ui.step || 1}`),
        h('p', {}, 'Both documents are being scrolled from top to bottom. Please don\u2019t scroll or switch windows until it finishes.')));
  }
  if (ui.status === 'notfound') {
    return h('div', { class: 'notice' }, h('div', { class: 'ic' }, '◎'),
      h('div', {}, h('b', {}, 'No pair of documents found on screen'), h('p', {}, 'Bring the task to the front with both documents visible, then press Detect — or Select them manually.')));
  }
  if (ui.status === 'away') {
    return h('div', { class: 'notice' }, h('div', { class: 'ic' }, '◌'),
      h('div', {}, h('b', {}, 'The boxes don\u2019t show the task right now'), h('p', {}, 'Bring the task back in front. The last result is kept; a new task is picked up automatically after a few reads.')));
  }
  if (ui.status === 'error') {
    return h('div', { class: 'notice error' }, h('div', { class: 'ic' }, '⚠'),
      h('div', {}, h('b', {}, 'Could not read the screen'), h('p', {}, ui.error)));
  }
  return null;
}


// ------------------------------------------------------------------ the labels

const LABEL_STATUS = {
  yes: (i) => ['✓ Labeled', 'good'],
  no: (i) => ['✗ Not labeled', 'bad'],
  other: (i) => [`≠ Labeled ${i.rightSite}`, 'bad'],
};
const REDACTION_STATUS = {
  redacted: ['✓ Redacted', 'good'],
  visible: ['⚠ Still visible', 'bad'],
  partly: ['⚠ Partly visible', 'bad'],
  replacement: ['⚠ Fix the replacement', 'bad'],
};

function doneCard(v) {
  if (!v.done || !v.items.length) return null;
  const c = ui.result.coverage || {};
  const oneSided = Math.max(c.notComparedLeft || 0, c.notComparedRight || 0);
  return h('div', { class: 'done-card' },
    h('div', { class: 'done-mark' }, '✓'),
    h('div', {},
      h('div', { class: 'done-title' }, 'Redaction done'),
      h('div', { class: 'done-text' }, `All ${v.counts.pii} PII value${v.counts.pii === 1 ? ' is' : 's are'} labeled correctly and redacted on the right.`),
      h('div', { class: 'done-scope' }, oneSided
        ? `${oneSided} line${oneSided === 1 ? ' was' : 's were'} read on one side only — read the whole document before submitting.`
        : `Checked the ${c.comparedLeft || 0} lines read. Use “Read whole document” to be sure everything was read, then submit on the site.`)));
}

function summaryCard(v) {
  const c = v.counts;
  const stat = (n, label, bad) => h('div', { class: 'stat' + (bad && n ? ' bad' : '') }, h('b', {}, String(n)), h('span', {}, label));
  return h('div', { class: 'card summary-grid' },
    stat(c.pii, 'PII found'),
    stat(c.labeled, 'labeled right'),
    stat(c.pii - c.labeled, 'label missing', true),
    stat(c.visible, 'still visible', true));
}

function filterChips(v) {
  const problems = v.items.filter((i) => !i.ok).length + v.other.filter((o) => !o.ok).length;
  const chip = (key, label, n) => h('button', {
    class: 'chip' + (ui.filter === key ? ' on' : ''), onclick: () => { ui.filter = key; render(); },
  }, label, h('b', {}, String(n)));
  return h('div', { class: 'chips' }, chip(null, 'All', v.items.length + v.other.length), chip('problems', 'Problems only', problems));
}

function labelGroups(v) {
  const show = (x) => ui.filter !== 'problems' || !x.ok;
  const groups = new Map();
  for (const it of v.items) if (show(it)) (groups.get(it.site) || groups.set(it.site, []).get(it.site)).push(it);
  const out = [];
  for (const [site, items] of groups) {
    const bad = items.filter((i) => !i.ok).length;
    out.push(h('details', { class: 'section' + (bad ? '' : ' ok'), open: true },
      h('summary', {}, h('span', { class: 'dot' }), site, h('span', { class: 'count' }, bad ? `${bad} to fix · ${items.length}` : `✓ ${items.length}`)),
      items.map(labelRow)));
  }
  const other = v.other.filter(show);
  if (other.length) {
    out.push(h('details', { class: 'section' + (other.some((o) => !o.ok) ? '' : ' ok'), open: true },
      h('summary', {}, h('span', { class: 'dot' }), 'Changed on the right, but not PII', h('span', { class: 'count' }, String(other.length))),
      h('div', { class: 'hint' }, 'Words replaced on the right that are not PII. Keep the original words, or mark them Overscrubbed.'),
      other.map(otherRow)));
  }
  if (!out.length) {
    out.push(h('div', { class: 'card empty-state' }, v.items.length ? h('b', {}, '✓ No problems') : h('b', {}, 'No PII found yet'),
      v.items.length ? 'Everything read so far is labeled and redacted.' : 'Nothing that looks like PII in what was read so far.'));
  }
  return out;
}

function labelRow(it) {
  const [lt, lc] = LABEL_STATUS[it.labeled](it);
  const red = it.redaction && REDACTION_STATUS[it.redaction];
  const open = ui.expanded.has(it.id);
  return h('div', { class: 'item' + (it.ok ? ' done' : '') },
    h('div', { class: 'line1', title: 'Show on the documents', onclick: () => api.flash(it.id) },
      h('span', { class: 'quote' }, `“${it.text.length > 60 ? it.text.slice(0, 60) + '…' : it.text}”`)),
    h('div', { class: 'choices' },
      h('span', { class: 'pill ' + lc }, lt),
      red ? h('span', { class: 'pill ' + red[1] }, red[0]) : null,
      it.note ? h('button', { class: 'btn ghost more', onclick: () => { open ? ui.expanded.delete(it.id) : ui.expanded.add(it.id); render(); } }, open ? 'Less ▴' : 'Why ▸') : null),
    open ? h('div', { class: 'details' }, h('div', { class: 'full' }, it.text), h('div', {}, it.note)) : null);
}

function otherRow(o) {
  const open = ui.expanded.has(o.id);
  const status = o.ok ? ['✓ Marked Overscrubbed', 'good'] : o.kind === 'text' ? ['Text changed', 'bad']
    : o.rightSite && !o.marked ? [`Labeled ${o.rightSite}`, 'bad'] : ['Not PII — keep it, or label Overscrubbed', 'bad'];
  return h('div', { class: 'item' + (o.ok ? ' done' : '') },
    h('div', { class: 'line1', onclick: () => api.flash(o.id) }, h('span', { class: 'quote' }, `“${o.text}”`)),
    h('div', { class: 'choices' }, h('span', { class: 'pill ' + status[1] }, status[0]),
      o.knownName ? h('span', { class: 'pill' }, 'Known company') : null,
      o.note ? h('button', { class: 'btn ghost more', onclick: () => { open ? ui.expanded.delete(o.id) : ui.expanded.add(o.id); render(); } }, open ? 'Less ▴' : 'Why ▸') : null),
    open ? h('div', { class: 'details' }, h('div', {}, o.note)) : null);
}

// Tell the reviewer once per task when nothing is left to fix.
let announced = '';
function announce(v) {
  const done = v.done && v.items.length > 0;
  api.setDone(done);
  if (!done) { if (announced === ui.taskKey) announced = ''; return; }
  if (announced === ui.taskKey) return;
  announced = ui.taskKey;
  try {
    new Notification('Redaction done', { body: `All ${v.counts.pii} PII values are labeled and redacted. You can submit on the site.` });
  } catch (e) { /* notifications off: the card in the window still shows it */ }
}

function taskNotice(r) {
  const { language, structure } = r.taskCheck || {};
  const notes = [];
  if (language && language.verdict !== 'english') notes.push(['Other language', language.summary || language.reason || '']);
  if (structure) notes.push(['Unstructured text', structure.reason || structure.summary || 'The original looks like data rather than prose.']);
  if (!notes.length) return null;
  const text = notes.map(([t, d]) => `${t}: ${d}`).join('\n');
  return h('div', { class: 'notice warn' }, h('div', { class: 'ic' }, '⚑'),
    h('div', {}, ...notes.map(([t, d]) => h('div', {}, h('b', {}, t), h('p', {}, d))),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => navigator.clipboard.writeText(text) }, 'Copy reason'))));
}

function coloursCard(r) {
  if (!r.unknownColours || !r.unknownColours.length) return null;
  const names = Object.keys(ui.palette);
  return h('div', { class: 'card' },
    h('h2', {}, 'Teach label colours'),
    h('p', { style: 'margin:-4px 0 10px;color:var(--muted);font-size:12.5px' },
      'These highlight colours on the redacted document are not recognised yet. Pick the label each one stands for — it is remembered.'),
    h('div', { class: 'swatches' }, r.unknownColours.slice(0, 6).map((u) =>
      h('div', { class: 'swatch-row' },
        h('div', { class: 'sw', style: `background:${u.hex}` }),
        h('div', { class: 'ex' }, h('b', {}, `${u.count} word${u.count === 1 ? '' : 's'}`), ` · “${u.example}”`),
        h('select', { onchange: (e) => e.target.value && api.learnColour(u.hex, e.target.value) },
          h('option', { value: '' }, 'Which label?'), names.map((n) => h('option', { value: n }, n)))))));
}

function renderLivePill() {
  const pill = document.getElementById('livePill');
  const s = ui.state;
  const reading = ui.status === 'reading' || ui.status === 'finding';
  pill.className = 'live-pill' + (reading ? ' busy' : s && s.live && s.regions ? ' on' : '');
  pill.lastChild.textContent = reading ? 'Reading' : s && s.live && s.regions ? 'Live' : 'Paused';
}

// ------------------------------------------------------------------ wiring
api.onState((s) => {
  ui.state = s;
  document.body.classList.toggle('win', s.platform !== 'darwin');
  render();
});
api.onResult((r) => {
  if (r.taskKey !== ui.taskKey) { ui.taskKey = r.taskKey; ui.expanded.clear(); }
  ui.result = r;
  render();
});
api.onStatus((st) => {
  ui.status = st.state;
  ui.step = st.step || 0;
  ui.error = st.message || '';
  render();
});
api.palette().then((p) => { ui.palette = p; });
api.ready();
setInterval(() => { if (ui.result) { const m = document.querySelector('.meta'); if (m) render(); } }, 10000);

// ------------------------------------------------------------------ demo (opened outside the app, for design work)
function demoBridge() {
  const listeners = { state: [], result: [], status: [] };
  const state = { regions: null, stage: 'L2', live: true, overlay: true, learnedColours: {}, engine: 'Apple Vision (demo)', platform: 'darwin', access: 'granted' };
  const emit = (k, v) => listeners[k].forEach((fn) => fn(v));
  const params = new URLSearchParams(location.search);
  const loadDemo = () => fetch('demo-data.json').then((r) => r.json()).then((r) => {
    // ?demo=done: the same task with every redaction correct.
    if (params.get('demo') === 'done') { r.view.items.forEach((i) => { i.ok = true; i.labeled = 'yes'; i.redaction = 'redacted'; }); r.view.other = []; r.view.done = true; r.view.counts = { ...r.view.counts, labeled: r.view.counts.pii, visible: 0, problems: 0 }; }
    emit('result', { ...r, readAt: Date.now(), coverage: { leftRows: 7, rightRows: 7, comparedLeft: 7, comparedRight: 7, notComparedLeft: 0, notComparedRight: 0 } });
  });
  return {
    ready() {
      if (params.get('demo') === 'result' || params.get('demo') === 'done') { state.regions = { left: { width: 620, height: 780 }, right: { width: 620, height: 780 } }; loadDemo(); }
      if (params.get('demo') === 'permission') state.access = 'denied';
      emit('state', { ...state });
    },
    findDocuments() { state.regionsFrom = 'auto'; this.pickRegions(); },
    pickRegions() { state.regions = { left: { width: 620, height: 780 }, right: { width: 620, height: 780 } }; emit('state', { ...state }); loadDemo(); },
    showRegions() {}, scan() { loadDemo(); }, newTask() { loadDemo(); }, setDone() {}, readAll() { loadDemo(); }, decided() {}, flash() {}, learnColour() {}, forgetColours() {}, openPermissions() {},
    set(patch) { Object.assign(state, patch); emit('state', { ...state }); },
    palette: async () => ({ 'Person Name': '#2563eb', 'Email Address': '#16a34a', 'Contact Number': '#f97316', 'Business Name': '#14b8a6' }),
    onState: (fn) => listeners.state.push(fn), onResult: (fn) => listeners.result.push(fn), onStatus: (fn) => listeners.status.push(fn),
  };
}
