// Click-through layer over one display: dashed frames around the two documents and
// a box around each finding (solid on the redacted side, dashed on the original).
'use strict';
const q = new URLSearchParams(location.search);
const origin = { x: +q.get('x') || 0, y: +q.get('y') || 0 };
let framesTimer = null;

function box(cls, r) {
  const el = document.createElement('div');
  el.className = cls;
  Object.assign(el.style, { left: r.x - origin.x + 'px', top: r.y - origin.y + 'px', width: r.width + 'px', height: r.height + 'px' });
  return el;
}

window.evaratus.onDraw(({ marks, frames, flashId }) => {
  document.querySelectorAll('.mark, .frame').forEach((e) => e.remove());
  for (const f of frames) {
    const el = box('frame ' + f.side, f);
    const tag = document.createElement('span');
    tag.textContent = f.side === 'left' ? 'Original' : 'Redacted';
    el.append(tag);
    document.body.append(el);
  }
  for (const m of marks) {
    const el = box(`mark ${m.side}${m.done ? ' done' : ''}${m.id === flashId ? ' flash' : ''}`, m);
    if (m.tag) {
      const tag = document.createElement('b');
      tag.textContent = m.tag;
      el.append(tag);
    }
    document.body.append(el);
  }
});

window.evaratus.onShowFrames(() => {
  document.body.classList.add('frames');
  clearTimeout(framesTimer);
  framesTimer = setTimeout(() => document.body.classList.remove('frames'), 2500);
});
