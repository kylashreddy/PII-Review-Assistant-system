// Region picker: drag a box around the original, then around the redacted work.
// One of these windows covers each display; rectangles are reported in screen points.
'use strict';
const q = new URLSearchParams(location.search);
const origin = { x: +q.get('x') || 0, y: +q.get('y') || 0 };
const api = window.evaratus;
const SIDES = [
  { key: 'left', name: '1 · Original', title: 'Drag around the ORIGINAL document', sub: 'The raw document, usually on the left' },
  { key: 'right', name: '2 · Redacted', title: 'Now drag around the REDACTED document', sub: 'The reviewed work with labels, usually on the right' },
];
let step = 0;
let drag = null;
let live = null;

function boxEl(side, rect) {
  const el = document.createElement('div');
  el.className = 'box ' + side.key;
  const tag = document.createElement('span');
  tag.textContent = side.name;
  const size = document.createElement('div');
  size.className = 'size';
  el.append(tag, size);
  place(el, rect);
  document.body.append(el);
  return el;
}
function place(el, r) {
  Object.assign(el.style, { left: r.x - origin.x + 'px', top: r.y - origin.y + 'px', width: r.width + 'px', height: r.height + 'px' });
  el.querySelector('.size').textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
}

function render(state) {
  step = state.step;
  document.querySelectorAll('.box').forEach((b) => b.remove());
  if (state.picked.left) boxEl(SIDES[0], state.picked.left);
  const s = SIDES[Math.min(step, 1)];
  document.getElementById('title').textContent = s.title;
  document.getElementById('sub').textContent = s.sub;
  document.getElementById('d0').className = 'dot ' + (step > 0 ? 'done' : 'on');
  document.getElementById('d1').className = 'dot ' + (step === 1 ? 'on' : '');
  document.getElementById('d0').textContent = step > 0 ? '✓' : '1';
  document.getElementById('back').hidden = step === 0;
}

const rectOf = (a, b) => ({
  x: Math.min(a.x, b.x) + origin.x, y: Math.min(a.y, b.y) + origin.y,
  width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y),
});

window.addEventListener('mousedown', (e) => {
  if (e.target.closest('.guide') || e.button !== 0) return;
  drag = { x: e.clientX, y: e.clientY };
  live = boxEl(SIDES[step], rectOf(drag, drag));
});
window.addEventListener('mousemove', (e) => { if (drag) place(live, rectOf(drag, { x: e.clientX, y: e.clientY })); });
window.addEventListener('mouseup', (e) => {
  if (!drag) return;
  const r = rectOf(drag, { x: e.clientX, y: e.clientY });
  drag = null;
  if (r.width < 60 || r.height < 40) { live.remove(); return; } // a click, not a box
  api.pickRect(r);
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.pickCancel(); });
document.getElementById('cancel').onclick = () => api.pickCancel();
document.getElementById('back').onclick = () => api.pickBack();
api.onPickStep(render);
render({ step: 0, picked: {} });
