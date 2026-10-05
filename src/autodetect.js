// Finds the two task documents on a screen read, instead of the reviewer drawing boxes.
//
// The raw original (left) and the PII-redacted work (right) are the same document, so
// they share most of their words. We look for the vertical split of the screen where
// the text on the left and the text on the right are most alike, then take, on each
// side, the block of lines that also appear on the other side — the document itself,
// without toolbars, file names or label chips around it.
'use strict';

const words = (t) => t.toLowerCase().split(/[^\p{L}\p{N}@.]+/u).filter((w) => w.length > 1);
const PAD = 12; // points around the text block, so the edges of lines are not cut
// Text that belongs to the page around the documents, not to a document.
const CHROME = /\.(pdf|docx?|txt|png|jpe?g|csv|json|xlsx?)\b|read-only|annotate here|reference|^labels?\b|\bannotations?$|^(close|submit|save|cancel|approve|reject)\b/i;

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / (a.size + b.size - n);
}

/**
 * @param ocr    OCR of the whole screen (boxes in image pixels)
 * @param scale  image pixels per screen point
 * @param origin {x, y} of the captured area in screen points
 * @returns {left, right, score} rectangles in screen points, or null when no pair is found
 */
function detectDocuments(ocr, { scale = 1, origin = { x: 0, y: 0 } } = {}) {
  const lines = (ocr.lines || [])
    .filter((l) => l.text.trim().length > 1)
    .map((l) => ({ ...l, x1: l.box[0], x2: l.box[0] + l.box[2], y1: l.box[1], y2: l.box[1] + l.box[3], w: new Set(words(l.text)) }));
  if (lines.length < 6) return null;

  // 1. The split: try each line's left edge as the boundary between the two documents.
  const tol = 4 * scale;
  const xs = [...new Set(lines.map((l) => Math.round(l.x1 / (10 * scale)) * 10 * scale))].sort((a, b) => a - b).slice(1);
  // Score a boundary by how many lines on one side have a near-identical line on the other
  // (the same document, before and after redaction). Lines of other windows on screen
  // rarely pair up, so they do not disturb it.
  const alike = (a, b) => {
    if (a.w.size < 2 || b.w.size < 2) return false;
    let n = 0;
    for (const w of a.w) if (b.w.has(w)) n++;
    return n / Math.max(a.w.size, b.w.size) >= 0.6;
  };
  let best = null;
  for (const X of xs) {
    const L = lines.filter((l) => l.x2 <= X + tol);
    const R = lines.filter((l) => l.x1 >= X - tol);
    if (L.length < 3 || R.length < 3) continue;
    const pairs = L.filter((l) => R.some((r) => alike(l, r))).length;
    // The boundary between two documents does not cut through their sentences (short
    // items like label chips and full-width lines like a window title are ignored).
    const wide = (l) => l.x2 - l.x1 > 0.6 * (ocr.width || 1e9);
    const cut = lines.filter((l) => l.x1 < X - tol && l.x2 > X + tol && !wide(l) && l.w.size >= 4).length;
    if (!best || pairs > best.pairs || (pairs === best.pairs && cut < best.cut)) {
      const wl = new Set(L.flatMap((l) => [...l.w]));
      const wr = new Set(R.flatMap((l) => [...l.w]));
      best = { X, pairs, cut, L, R, wl, wr, score: pairs / Math.min(L.length, R.length) };
    }
  }
  if (!best || best.pairs < 3) return null;

  // 2. On each side, the document = lines sharing most words with the other side, plus
  //    everything between them in the same column.
  function block(own, otherWords, otherTexts) {
    // A line of the document: most of its words are on the other side too. Short lines
    // must appear there word for word ("KEY SKILLS"), so file names sharing a code do not count.
    const shared = own.filter((l) => {
      if (CHROME.test(l.text.trim())) return false;
      const n = [...l.w].filter((w) => otherWords.has(w)).length;
      return l.w.size >= 3 ? n / l.w.size >= 0.5 : otherTexts.has(l.text.trim().toLowerCase());
    }).sort((a, b) => a.y1 - b.y1);
    if (shared.length < 2) return null;
    let top = shared[0].y1;
    let bottom = shared[shared.length - 1].y2;
    const left = Math.min(...shared.map((l) => l.x1));
    const right = Math.max(...shared.map((l) => l.x2));
    return { shared, top, bottom, left, right };
  }

  // Lines just above or below the shared block that were changed by the redaction (a CV's
  // name line) still belong to the documents. They come in pairs — one on each side at the
  // same place — while the page around the documents (a window title, a file name) is on
  // one side only or reads as page text. Extend both blocks one pair at a time.
  function extend(a, b, own, other) {
    const pitchOf = (blk) => {
      const steps = blk.shared.slice(1).map((l, i) => l.y1 - blk.shared[i].y1).sort((x, y) => x - y);
      return steps[steps.length >> 1] || 40 * scale;
    };
    const colOf = (blk, lines) => lines.filter((l) => l.x1 >= blk.left - 40 * scale && l.x1 <= blk.right).sort((x, y) => x.y1 - y.y1);
    const ca = colOf(a, own);
    const cb = colOf(b, other);
    const pa = pitchOf(a);
    const pb = pitchOf(b);
    const pair = (la, lb, gapA, gapB) => {
      if (!la || !lb || CHROME.test(la.text.trim()) || CHROME.test(lb.text.trim())) return false;
      if (gapA > 2.2 * pa || gapB > 2.2 * pb) return false;
      const sharesWord = [...la.w].some((w) => lb.w.has(w));
      return sharesWord || Math.abs(gapA / pa - gapB / pb) <= 0.6;
    };
    for (let k = 0; k < 4; k++) {
      const la = ca.filter((l) => l.y2 <= a.top + 2).pop();
      const lb = cb.filter((l) => l.y2 <= b.top + 2).pop();
      if (!pair(la, lb, la && a.top - la.y2, lb && b.top - lb.y2)) break;
      a.top = la.y1;
      b.top = lb.y1;
    }
    for (let k = 0; k < 4; k++) {
      const la = ca.find((l) => l.y1 >= a.bottom - 2);
      const lb = cb.find((l) => l.y1 >= b.bottom - 2);
      if (!pair(la, lb, la && la.y1 - a.bottom, lb && lb.y1 - b.bottom)) break;
      a.bottom = la.y2;
      b.bottom = lb.y2;
    }
  }

  /** The text block on screen (points), with a margin. */
  function box(blk, lines) {
    const column = lines.filter((l) => l.x1 >= blk.left - 40 * scale && l.x1 <= blk.right);
    const { top, bottom } = blk;
    const inside = column.filter((l) => l.y1 >= top - 2 && l.y2 <= bottom + 2);
    return {
      x: origin.x + Math.min(...inside.map((l) => l.x1)) / scale - PAD,
      y: origin.y + top / scale - PAD,
      width: (Math.max(...inside.map((l) => l.x2)) - Math.min(...inside.map((l) => l.x1))) / scale + 2 * PAD,
      height: (bottom - top) / scale + 2 * PAD,
    };
  }

  // 3. The whole document pane, not only the lines on screen now. In a review tool like
  //    Peak Talent each document sits in a pane with a header (its file name,
  //    "Reference · read-only", "Annotate here") and a footer below ("3 annotations",
  //    "Close"): the pane runs from just under the header to just above the footer,
  //    across its full width. Without such headers (another app): the text block.
  const HEADER = /\.(pdf|docx?|txt|png|jpe?g)\b|read-only|annotate here|reference/i;
  const FOOTER = /\bannotations?$|^(close|submit|save|cancel)\b/i;
  function pane(blk, side) {
    const sideLines = lines.filter((l) => (side === 'left' ? l.x2 <= best.X + tol : l.x1 >= best.X - tol));
    const header = sideLines
      .filter((l) => l.y2 <= blk.top + 2 && blk.top - l.y2 < 6 * blk.pitch && HEADER.test(l.text))
      .sort((a, b) => b.y2 - a.y2)[0];
    if (!header) return null;
    const mid = (l) => (l.y1 + l.y2) / 2;
    const headerRow = sideLines.filter((l) => Math.abs(mid(l) - mid(header)) < header.y2 - header.y1);
    const footer = lines.filter((l) => l.y1 >= blk.bottom - 2 && FOOTER.test(l.text.trim())).sort((a, b) => a.y1 - b.y1)[0];
    const top = header.y2 + 8 * scale;
    const bottom = footer ? footer.y1 - 8 * scale : (ocr.height || blk.bottom + 40 * scale) - 8 * scale;
    // Edges from where the header and the text start (the split itself is only approximate).
    const start = Math.min(blk.left, ...headerRow.map((l) => l.x1)) - 14 * scale;
    const x1 = Math.max(0, start);
    const x2 = side === 'left' ? rightStart : Math.max(blk.right + 14 * scale, ...headerRow.map((l) => l.x2));
    return {
      x: origin.x + x1 / scale, y: origin.y + top / scale, width: (x2 - x1) / scale, height: Math.max(bottom - top, 40 * scale) / scale,
      // The header line with the file name: when it changes, a new task is open.
      header: { x: origin.x + (header.x1 - 6 * scale) / scale, y: origin.y + (header.y1 - 4 * scale) / scale,
        width: (header.x2 - header.x1 + 12 * scale) / scale, height: (header.y2 - header.y1 + 8 * scale) / scale },
    };
  }

  const texts = (ls) => new Set(ls.map((l) => l.text.trim().toLowerCase()));
  const bl = block(best.L, best.wr, texts(best.R));
  const br = block(best.R, best.wl, texts(best.L));
  if (!bl || !br) return null;
  extend(bl, br, best.L, best.R);
  for (const blk of [bl, br]) {
    const steps = blk.shared.slice(1).map((l, i) => l.y1 - blk.shared[i].y1).sort((x, y) => x - y);
    blk.pitch = steps[steps.length >> 1] || 40 * scale;
  }
  let rightStart = 0;
  const pr = pane(br, 'right');
  if (pr) rightStart = (pr.x - origin.x) * scale;
  const pl = pr ? pane(bl, 'left') : null;
  if (pl && pr) {
    const header = pl.header;
    delete pl.header;
    delete pr.header;
    return { left: pl, right: pr, header, score: Math.round(best.score * 100) / 100, panes: true };
  }

  const left = box(bl, best.L);
  const right = box(br, best.R);
  // The two documents are usually the same width: widen the narrower box to match (short lines).
  const width = Math.max(left.width, right.width);
  left.width = Math.min(width, best.X / scale + origin.x - left.x);
  right.width = width;
  return { left, right, score: Math.round(best.score * 100) / 100, panes: false };
}

module.exports = { detectDocuments };
