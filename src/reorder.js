// The redacted document is often laid out differently from the original: a PDF re-made
// after redaction can place blocks in another order (a project description before the
// skills list, a heading block further down). Compared top to bottom, a moved block reads
// as "missing" on one side and "added" on the other, and the PII in it is not compared.
//
// So, before comparing, the redacted document's lines are put in the original's order:
// each line goes next to its counterpart in the original; lines with no counterpart
// (a replaced value, a bullet) travel with the line before them.
'use strict';

const words = (t) => new Set(t.toLowerCase().split(/[^\p{L}\p{N}@.]+/u).filter(Boolean));

function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  const s = n / (a.size + b.size - n);
  return s >= 0.5 || (n >= 3 && n / Math.min(a.size, b.size) >= 0.8) ? Math.max(s, 0.5) : 0;
}

/**
 * @param leftRows  rows of the original [{text}]
 * @param rightRows rows of the redacted work [{text, ...}]
 * @returns {rows, moved} the right rows in the original's order, and how many rows moved
 */
function reorderToMatch(leftRows, rightRows) {
  const L = leftRows.map((r) => words(r.text));
  const R = rightRows.map((r) => words(r.text));
  const n = L.length;
  const m = R.length;
  if (n < 2 || m < 2) return { rows: rightRows, moved: 0 };

  // Candidate partners of every right row.
  const cands = R.map((rw) => {
    const out = [];
    if (rw.size) L.forEach((lw, i) => { const s = similarity(lw, rw); if (s) out.push({ i, s }); });
    return out.sort((a, b) => b.s - a.s);
  });

  // 1. Sure pairs: one clear best partner (no second one nearly as good).
  const anchor = new Array(m).fill(null);
  cands.forEach((c, j) => {
    if (c.length && (c.length === 1 || c[0].s - c[1].s >= 0.15)) anchor[j] = c[0].i;
  });
  // 2. Ambiguous lines ("Responsibilities:" in every job): the partner closest to the
  //    sure pair before them, so they stay in their own block.
  for (let j = 0; j < m; j++) {
    if (anchor[j] != null || !cands[j].length) continue;
    let prev = null;
    for (let k = j - 1; k >= 0; k--) if (anchor[k] != null) { prev = anchor[k]; break; }
    const ref = prev == null ? (j / m) * n : prev;
    const top = cands[j].filter((c) => c.s >= cands[j][0].s - 0.15);
    // Documents read forwards: prefer a partner after the previous line, then the nearest.
    const ahead = prev == null ? top : top.filter((c) => c.i > prev);
    const pool = ahead.length ? ahead : top;
    anchor[j] = pool.reduce((a, b) => (Math.abs(b.i - ref) < Math.abs(a.i - ref) ? b : a)).i;
  }
  // 3. Lines without a partner go with the line before them (or the first one after).
  const key = anchor.slice();
  let last = null;
  for (let j = 0; j < m; j++) { if (key[j] != null) last = key[j]; else if (last != null) key[j] = last; }
  let next = null;
  for (let j = m - 1; j >= 0; j--) { if (anchor[j] != null) next = anchor[j]; else if (key[j] == null) key[j] = next == null ? -1 : next - 0.5; }

  const order = rightRows.map((_, j) => j).sort((a, b) => key[a] - key[b] || a - b);
  const moved = order.filter((j, k) => j !== k).length;
  return { rows: order.map((j) => rightRows[j]), moved };
}

module.exports = { reorderToMatch };
