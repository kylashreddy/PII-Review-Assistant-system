// Main window: choose the two documents, see what the check found, answer each item.
// The questions, answers and their meaning come from the extension's panel/decisions.js,
// so the desktop app and the extension ask reviewers exactly the same thing.
'use strict';
const P = window.PIIRA;
const D = P.decisions;
const api = window.evaratus || demoBridge();

const ui = {
  state: null,        // settings and environment from the app
  result: null,       // last check
  status: 'idle',     // idle | reading | permission | blank | error
  error: '',
  verdicts: new Map(),
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

// Black and white: the most serious statuses are bold, the done ones grey.
const STATUS_TONE = { LEAKAGE: 'bad', CRED_TODO: 'bad', DATATYPE: 'bad', IDENTIFIED: 'good', REDACTED_OK: 'good' };

// ------------------------------------------------------------------ render
function render() {
  const main = document.getElementById('main');
  const scrollTop = main.scrollTop;
  main.replaceChildren(...view().filter(Boolean));
  main.scrollTop = scrollTop;
  if (ui.result && ui.state && ui.state.regions) announce();
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
  if (!r) {
    out.push(ui.status === 'reading' || ui.status === 'idle' ? h('div', { class: 'skeleton' }) : null);
    return out;
  }
  out.push(doneCard(), summaryCard(), taskNotice(r), coloursCard(r), filterChips(), ...sections());
  return out;
}

function welcome() {
  return h('div', { class: 'card welcome' },
    h('span', { class: 'wordmark', role: 'img', 'aria-label': 'scaler ai labs' }),
    h('div', { class: 'kicker' }, 'Evaratus Review'),
    h('h1', {}, 'Check redactions on screen'),
    h('p', {}, 'Evaratus Review reads the original and the redacted document from your screen and shows what still needs fixing.'),
    h('ol', { class: 'howto' },
      h('li', {}, h('div', { class: 'n' }, '1'), h('div', {}, h('b', {}, 'Open a task'), h('span', {}, 'Any app or website, with both documents visible side by side.'))),
      h('li', {}, h('div', { class: 'n' }, '2'), h('div', {}, h('b', {}, 'Select the two documents'), h('span', {}, 'Drag a box around the original, then around the redacted work.'))),
      h('li', {}, h('div', { class: 'n' }, '3'), h('div', {}, h('b', {}, 'Review the findings'), h('span', {}, 'Problems are marked on the documents and listed here. Scroll — it keeps up.')))),
    h('button', { class: 'btn primary big', onclick: () => api.pickRegions() }, '⌖  Select documents on screen'));
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
  return h('div', { class: 'card' },
    h('h2', {}, 'Documents', h('span', { class: 'spacer' }), h('button', { class: 'btn ghost', onclick: () => api.showRegions() }, 'Show on screen')),
    h('div', { class: 'docs' },
      h('div', { class: 'doc-tile left' }, h('div', { class: 'k' }, h('i'), 'Original'),
        h('div', { class: 'v' }, r ? `${r.leftChars.toLocaleString()} characters read` : size(s.regions.left))),
      h('div', { class: 'doc-tile right' }, h('div', { class: 'k' }, h('i'), 'Redacted'),
        h('div', { class: 'v' }, r ? `${r.labels.length} label${r.labels.length === 1 ? '' : 's'} · ${r.rightChars.toLocaleString()} chars` : size(s.regions.right)))),
    h('div', { class: 'segmented' },
      stageButton('L1', 'L1 · Identify', 'Is it labeled?'),
      stageButton('L2', 'L2 · Verify', 'Is it redacted right?')),
    h('div', { class: 'controls' },
      h('button', { class: 'btn', onclick: () => api.pickRegions() }, '⌖ Reselect'),
      h('button', { class: 'btn', onclick: () => api.scan(), disabled: ui.status === 'reading' }, ui.status === 'reading' ? 'Reading…' : '⟳ Read'),
      h('button', { class: 'btn', onclick: () => api.newTask(), title: 'Forget what was read and start reading the next task' }, 'New task'),
      h('span', { class: 'spacer' }),
      toggle('Live', s.live, () => api.set({ live: !s.live }), 'Re-read the documents whenever they change (e.g. when you scroll)'),
      toggle('Marks', s.overlay, () => api.set({ overlay: !s.overlay }), 'Draw boxes around findings on the documents')),
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
    gap > 0 ? h('div', { class: 'meta strong' }, `${gap} line${gap === 1 ? '' : 's'} read on one side only — scroll the ${behind} document to the same place to compare them.`)
      : h('div', { class: 'meta' }, 'Scroll through both documents to read them in full; new lines are added as they appear.'));
}

function stageButton(stage, title, sub) {
  return h('button', { class: ui.state.stage === stage ? 'on' : '', onclick: () => api.set({ stage }) }, title, h('small', {}, sub));
}
function toggle(label, on, onclick, title) {
  return h('button', { class: 'switch' + (on ? ' on' : ''), onclick, title, 'aria-pressed': String(Boolean(on)) }, h('i'), label);
}

function statusNotice() {
  if (ui.status === 'blank') {
    return h('div', { class: 'notice warn' }, h('div', { class: 'ic' }, '⚠'),
      h('div', {}, h('b', {}, 'The selected areas look empty'), h('p', {}, 'Is the task still open where you selected it? Reselect the documents if the window moved.')));
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

function stageFindings() {
  return ui.result ? ui.result[ui.state.stage].findings : [];
}
function decidable(f) { return Boolean(D.question(f, ui.state.stage)); }

/**
 * Is the task done? (stage L2: the redaction on the right; L1: the labels.)
 *   'done'      nothing to fix was found
 *   'reviewed'  findings were raised, the reviewer answered all of them, and none needs a fix
 *   'fix'       the reviewer's answers say something must be fixed on the right
 *   'open'      findings still to look at
 * Task-level notes (other language, unstructured text) and text added or missing on the
 * right are problems in their own right, so they keep a task from being done.
 */
function completion() {
  const stage = ui.state.stage;
  const findings = stageFindings();
  const issues = findings.filter(D.isIssue);
  const blocking = issues.filter((f) => !decidable(f));          // nothing to answer: must be fixed
  const t = D.summary(findings, stage, ui.verdicts);
  const c = ui.result.coverage || {};
  const oneSided = Math.max(c.notComparedLeft || 0, c.notComparedRight || 0);
  const okCount = findings.length - issues.length;
  let state;
  if (!issues.length) state = 'done';
  else if (blocking.length || t.fix) state = 'fix';
  else if (issues.every((f) => ui.verdicts.has(f.id))) state = 'reviewed';
  else state = 'open';
  return { state, okCount, fixes: t.fix + blocking.length, oneSided, lines: c.comparedLeft || 0 };
}

function doneCard() {
  const c = completion();
  if (c.state !== 'done' && c.state !== 'reviewed') return null;
  const stage = ui.state.stage;
  const what = stage === 'L1' ? 'Identification done' : 'Redaction done';
  const detail = stage === 'L1'
    ? `All PII (personal and business) in the original is labeled — ${c.okCount} value${c.okCount === 1 ? '' : 's'}.`
    : `All PII and business PII on the right is redacted correctly — ${c.okCount} value${c.okCount === 1 ? '' : 's'} replaced consistently.`;
  return h('div', { class: 'done-card' },
    h('div', { class: 'done-mark' }, '✓'),
    h('div', {},
      h('div', { class: 'done-title' }, what + (c.state === 'reviewed' ? ' (after your review)' : '')),
      h('div', { class: 'done-text' }, detail),
      h('div', { class: 'done-scope' }, c.oneSided
        ? `Checked ${c.lines} lines. ${c.oneSided} more line${c.oneSided === 1 ? ' was' : 's were'} read on one side only — scroll both documents to the end before submitting.`
        : `Checked the ${c.lines} lines read on both sides. Make sure you scrolled both documents to the end, then submit on the site.`)));
}

function summaryCard() {
  const stage = ui.state.stage;
  const findings = stageFindings();
  const issues = findings.filter(D.isIssue);
  // Still to look at: issues not answered yet, and issues there is nothing to answer for.
  const open = issues.filter((f) => !decidable(f) || !ui.verdicts.has(f.id));
  const ok = findings.length - issues.length;
  const t = D.summary(findings, stage, ui.verdicts);
  const total = findings.filter(decidable).length;
  const answered = total - t.open;
  return h('div', { class: 'card' },
    h('div', { class: 'summary' },
      h('div', { class: 'big-num' + (open.length ? '' : ' zero') }, String(open.length)),
      h('div', {}, h('div', { style: 'font-weight:700' }, open.length ? 'left to check' : issues.length ? 'All checked' : 'Nothing to check'),
        h('div', { class: 'what' }, stage === 'L1' ? 'PII in the original, against the labels' : 'Redacted work, against the original')),
      h('div', { class: 'ok' }, h('b', {}, String(ok)), h('div', { class: 'what' }, stage === 'L1' ? 'identified' : 'redacted right'))),
    h('div', { class: 'progress' }, h('i', { style: `width:${total ? Math.round((answered / total) * 100) : 0}%` })),
    h('div', { class: 'decided-line' }, h('span', {}, `${answered} of ${total} answered`),
      h('span', {}, t.fix ? `${t.fix} to fix on the right` : answered ? 'No fixes so far' : '')));
}

// Tell the reviewer (and the marks on screen) when the task becomes done, once per task.
let announced = '';
function announce() {
  if (!ui.result || !ui.state) return;
  const c = completion();
  const done = c.state === 'done' || c.state === 'reviewed';
  api.setDone(done);
  const key = `${ui.taskKey}|${ui.state.stage}`;
  if (!done) { if (announced === key) announced = ''; return; }
  if (announced === key) return;
  announced = key;
  const title = ui.state.stage === 'L1' ? 'Identification done' : 'Redaction done';
  try {
    new Notification(title, { body: c.oneSided ? 'Scroll both documents to the end to be sure, then submit on the site.' : 'All PII is handled. You can submit on the site.', silent: false });
  } catch (e) { /* notifications not allowed: the card in the window still shows it */ }
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

function filterChips() {
  const stage = ui.state.stage;
  const findings = stageFindings();
  const count = (k) => findings.filter((f) => f.category === k).length;
  const chip = (key, label, n) => h('button', {
    class: 'chip' + (ui.filter === key ? ' on' : ''),
    onclick: () => { ui.filter = ui.filter === key ? null : key; render(); },
  }, label, h('b', {}, String(n)));
  return h('div', { class: 'chips' },
    chip(null, 'All', findings.length),
    // Only categories with something in them: an empty filter is just noise.
    D.sections(stage).filter((s) => count(s.key)).map((s) => chip(s.key, s.title.replace(/^PII – /, ''), count(s.key))));
}

function sections() {
  const stage = ui.state.stage;
  const findings = stageFindings();
  const out = [];
  for (const s of D.sections(stage)) {
    if (ui.filter && ui.filter !== s.key) continue;
    const items = findings.filter((f) => f.category === s.key);
    if (!items.length) continue;
    out.push(h('details', { class: 'section' + (s.ok ? ' ok' : ''), open: !s.ok || ui.filter === s.key },
      h('summary', {}, h('span', { class: 'dot' }), s.title.replace(/^PII – /, ''), h('span', { class: 'count' }, String(items.length))),
      h('div', { class: 'hint' }, s.hint),
      items.map(item)));
  }
  if (!out.length) {
    out.push(h('div', { class: 'card empty-state' }, h('b', {}, '✓ All clear'), 'Nothing found in the visible part of the documents.'));
  }
  return out;
}

function item(f) {
  const stage = ui.state.stage;
  const q = D.question(f, stage);
  const verdict = ui.verdicts.get(f.id);
  const outcome = q ? D.outcome(f, stage, verdict) : null;
  const sugg = D.suggested(f, stage);
  const open = ui.expanded.has(f.id);
  const quote = f.text.length > 70 ? f.text.slice(0, 70) + '…' : f.text;
  const choose = (key) => () => {
    if (ui.verdicts.get(f.id) === key) ui.verdicts.delete(f.id); else ui.verdicts.set(f.id, key);
    api.decided([...ui.verdicts.keys()]);
    render();
  };
  return h('div', { class: 'item' + (verdict ? ' done' : '') },
    h('div', { class: 'line1', title: 'Show on screen', onclick: () => api.flash(f.id) },
      h('span', { class: 'tag' + (f.label ? '' : ' outline') }, f.label || 'Text'),
      h('span', { class: 'quote' }, `“${quote}”`),
      h('span', { class: 'status ' + (STATUS_TONE[f.category] || '') }, D.short(f, stage))),
    h('div', { class: 'choices' },
      q ? [q.yes, q.no].map((c, i) => h('button', {
        class: `choice ${i === 0 ? 'yes' : 'no'}${verdict === c.key ? ' on' : ''}${sugg === c.key && !verdict ? ' suggested' : ''}`,
        title: c.title + (sugg === c.key ? ' (suggested)' : ''), onclick: choose(c.key),
      }, c.label)) : null,
      outcome ? h('span', { class: 'outcome ' + (outcome.fix ? 'fix' : 'ok') }, outcome.fix ? '✎ ' + outcome.text.replace(/^To do: /, '') : '✓ ' + outcome.text) : null,
      h('button', { class: 'btn ghost more', onclick: () => { open ? ui.expanded.delete(f.id) : ui.expanded.add(f.id); render(); } }, open ? 'Less ▴' : 'Details ▸')),
    open ? h('div', { class: 'details' },
      h('div', { class: 'full' }, f.text),
      f.note ? h('div', {}, f.note) : null,
      q ? h('div', {}, q.suggestion) : null,
      f.confidence != null ? h('div', {}, `${Math.round(f.confidence * 100)}% sure · ${f.source || 'rule'}`) : null) : null);
}

function renderLivePill() {
  const pill = document.getElementById('livePill');
  const s = ui.state;
  const reading = ui.status === 'reading';
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
  if (r.taskKey !== ui.taskKey) { ui.taskKey = r.taskKey; ui.verdicts.clear(); ui.expanded.clear(); }
  ui.result = r;
  render();
});
api.onStatus((st) => {
  ui.status = st.state;
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
    if (params.get('demo') === 'done') r.L2.findings = r.L2.findings.filter((f) => f.category === 'REDACTED_OK');
    emit('result', { ...r, readAt: Date.now(), coverage: { leftRows: 7, rightRows: 7, comparedLeft: 7, comparedRight: 7, notComparedLeft: 0, notComparedRight: 0 } });
  });
  return {
    ready() {
      if (params.get('demo') === 'result' || params.get('demo') === 'done') { state.regions = { left: { width: 620, height: 780 }, right: { width: 620, height: 780 } }; loadDemo(); }
      if (params.get('demo') === 'permission') state.access = 'denied';
      emit('state', { ...state });
    },
    pickRegions() { state.regions = { left: { width: 620, height: 780 }, right: { width: 620, height: 780 } }; emit('state', { ...state }); loadDemo(); },
    showRegions() {}, scan() { loadDemo(); }, newTask() { loadDemo(); }, setDone() {}, decided() {}, flash() {}, learnColour() {}, forgetColours() {}, openPermissions() {},
    set(patch) { Object.assign(state, patch); emit('state', { ...state }); },
    palette: async () => ({ 'Person Name': '#2563eb', 'Email Address': '#16a34a', 'Contact Number': '#f97316', 'Business Name': '#14b8a6' }),
    onState: (fn) => listeners.state.push(fn), onResult: (fn) => listeners.result.push(fn), onStatus: (fn) => listeners.status.push(fn),
  };
}
