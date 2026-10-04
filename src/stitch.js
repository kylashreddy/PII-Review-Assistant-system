// Builds up a whole document from the reads of one screen box as the reviewer scrolls.
//
// Each read shows a window onto the document. Its rows are matched to the rows read
// before (same text = same row), so the read can be placed: rows above are added at
// the top, rows below at the bottom, rows on screen are refreshed (with their boxes and
// labels). A read that matches nothing is ignored — another window was in front, or
// the page was switching — unless it keeps happening, which means a new task.
'use strict';

const key = (text) => text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');

// The same line read twice can differ by a character or two (OCR: "l" / "I", a dropped
// comma). Lines count as the same when their letter pairs mostly agree (Dice coefficient).
function pairs(k) {
  const m = new Map();
  for (let i = 0; i < k.length - 1; i++) { const p = k.slice(i, i + 2); m.set(p, (m.get(p) || 0) + 1); }
  return m;
}
function sameLine(a, b) {
  if (a === b) return true;
  // Numbers must agree exactly: rows of a table differ only in their numbers.
  if (a.replace(/\D/g, '') !== b.replace(/\D/g, '')) return false;
  if (a.length < 12 || b.length < 12 || Math.abs(a.length - b.length) > Math.max(3, a.length * 0.08)) return false;
  const A = pairs(a);
  const B = pairs(b);
  let n = 0;
  for (const [p, c] of A) n += Math.min(c, B.get(p) || 0);
  return (2 * n) / (a.length + b.length - 2) >= 0.9;
}
const NEW_TASK_AFTER = 3;   // reads in a row that match nothing before starting over
const MIN_CHARS = 20;       // a read with less text than this is not a document

class Stitcher {
  constructor() { this.reset(); }

  reset() {
    this.rows = [];     // {text, key, words, para, labels, seen}
    this.misses = 0;
    this.reads = 0;
  }

  /** Where the read's rows sit in the document: offset d (document row = read row + d), or null. */
  place(readRows) {
    const at = new Map();
    this.rows.forEach((r, j) => { if (r.key.length >= 4) (at.get(r.key) || at.set(r.key, []).get(r.key)).push(j); });
    // Document rows each read row could be: the same text, or nearly (fuzzy, only when there is no exact one).
    const candidates = readRows.map((r) => {
      const exact = at.get(r.key);
      if (exact) return exact;
      const near = [];
      this.rows.forEach((row, j) => { if (sameLine(row.key, r.key)) near.push(j); });
      return near.length === 1 ? near : [];   // only an unambiguous near match counts
    });
    const votes = new Map();
    readRows.forEach((r, i) => { for (const j of candidates[i]) votes.set(j - i, (votes.get(j - i) || 0) + 1 + r.key.length / 40); });
    let best = null;
    for (const [d, v] of votes) if (!best || v > best.v) best = { d, v };
    if (!best) return null;
    const hits = readRows.filter((r, i) => candidates[i].includes(i + best.d));
    // One shared row is enough when it is long enough to be unique (fast scrolling leaves little overlap).
    const enough = hits.length >= 2 || (hits.length === 1 && hits[0].key.length >= 25);
    return enough ? best.d : null;
  }

  /**
   * Add one read (rows from text-layout.snapshotRows, with row.labels).
   * mayStartOver: false keeps the document even after many reads that do not match
   * (the redacted side follows the original: only a new original means a new task).
   * @returns {'new'|'merged'|'ignored'}
   */
  add(snapshot, { mayStartOver = true } = {}) {
    const readRows = snapshot.filter((r) => !r.clipped && r.text.trim()).map((r) => ({ ...r, key: key(r.text) }));
    const chars = readRows.reduce((n, r) => n + r.text.length, 0);
    for (const r of this.rows) r.onScreen = false;
    if (chars < MIN_CHARS) return 'ignored';

    if (!this.rows.length) return this.start(readRows);
    const d = this.place(readRows);
    if (d == null) {
      this.misses++;
      if (mayStartOver && this.misses >= NEW_TASK_AFTER) return this.start(readRows);
      return 'ignored';
    }
    this.misses = 0;
    this.reads++;
    // Rows above the known part go first, then the known rows, then rows below.
    const above = Math.max(0, -d);
    if (above) this.rows.unshift(...readRows.slice(0, above).map((r) => this.fresh(r)));
    const shift = d + above;
    readRows.forEach((r, i) => {
      const j = i + shift;
      if (j < this.rows.length) {
        const old = this.rows[j];
        // The first row of a read has no row above it on screen, so its paragraph break is unknown.
        this.rows[j] = { ...this.fresh(r), para: i === 0 ? old.para : r.para };
      } else {
        this.rows.push(this.fresh(r));
      }
    });
    return 'merged';
  }

  start(readRows) {
    this.reset();
    this.reads = 1;
    this.rows = readRows.map((r) => this.fresh(r));
    return 'new';
  }

  fresh(r) {
    return { text: r.text, key: r.key, words: r.words, para: r.para, labels: r.labels || [], onScreen: true };
  }

  /** Rows for the whole document so far; rows not on screen keep their text and labels but no boxes. */
  document() {
    return this.rows.map((r) => (r.onScreen ? r : { ...r, words: r.words.map((w) => ({ start: w.start, end: w.end })) }));
  }
}

/**
 * The part of both documents that can be compared: from the first to the last row that
 * appears on both sides. Text above or below it has only been read on one side so far
 * (the other side is scrolled elsewhere), so comparing it would report false problems.
 * Rows match when most of their words are the same (a redacted row still shares most words).
 * @returns {left:[from, to], right:[from, to]} row ranges (inclusive), or null
 */
function comparableRange(leftRows, rightRows) {
  const words = (t) => new Set(t.toLowerCase().split(/[^\p{L}\p{N}@.]+/u).filter(Boolean));
  const L = leftRows.map((r) => words(r.text));
  const R = rightRows.map((r) => words(r.text));
  // How alike two rows are (0..1); below 0.5 they are not the same row.
  const sim = (a, b) => {
    if (!a.size || !b.size) return 0;
    let n = 0;
    for (const w of a) if (b.has(w)) n++;
    const s = n / (a.size + b.size - n);
    return s >= 0.5 || (n >= 3 && n / Math.min(a.size, b.size) >= 0.8) ? Math.max(s, 0.5) : 0;
  };
  // Best overall pairing that keeps the order of rows (weighted longest common subsequence),
  // so repeated or similar rows (tables, lists) are paired with the right partner.
  const n = L.length;
  const m = R.length;
  if (!n || !m) return null;
  const pairs = [];
  if (n * m <= 4e6) {
    const W = m + 1;
    const best = new Float64Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        const s = sim(L[i], R[j]);
        best[i * W + j] = Math.max(best[(i + 1) * W + j], best[i * W + j + 1], s ? s + best[(i + 1) * W + j + 1] : 0);
      }
    }
    for (let i = 0, j = 0; i < n && j < m;) {
      const s = sim(L[i], R[j]);
      if (s && best[i * W + j] === s + best[(i + 1) * W + j + 1]) { pairs.push([i, j]); i++; j++; }
      else if (best[(i + 1) * W + j] >= best[i * W + j + 1]) i++;
      else j++;
    }
  } else {
    let from = 0;   // very long documents: first match within the next rows
    L.forEach((a, i) => {
      for (let j = from; j < Math.min(m, from + 40); j++) if (sim(a, R[j])) { pairs.push([i, j]); from = j + 1; break; }
    });
  }
  if (!pairs.length) return null;
  const [first, last] = [pairs[0], pairs[pairs.length - 1]];
  const range = { left: [first[0], last[0]], right: [first[1], last[1]], matched: pairs.length };
  // Unmatched rows at the top (or bottom) of BOTH sides are the same part of the document,
  // changed by the redaction — e.g. the name line of a CV. Keep them when both sides
  // have a similar number of them; when only one side has them, the other is scrolled away.
  const close = (a, b) => a > 0 && b > 0 && Math.abs(a - b) <= Math.max(2, Math.min(a, b));
  if (close(first[0], first[1])) { range.left[0] = 0; range.right[0] = 0; }
  const tailL = leftRows.length - 1 - last[0];
  const tailR = rightRows.length - 1 - last[1];
  if (close(tailL, tailR)) { range.left[1] = leftRows.length - 1; range.right[1] = rightRows.length - 1; }
  return range;
}

module.exports = { Stitcher, comparableRange, key, sameLine };
