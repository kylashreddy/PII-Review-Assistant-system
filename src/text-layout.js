// OCR lines -> one document text, with every word's box so any part of the text can
// be found on screen again.
//
// Lines on the same row ("Email: …      Phone: …") are joined with a space, rows
// with a line break, and a larger vertical gap starts a new paragraph.
'use strict';

const mid = (b) => b[1] + b[3] / 2;

/** Group OCR lines into rows (same height on the page), top to bottom, left to right. */
function rows(lines) {
  const sorted = lines.filter((l) => l.text.trim()).slice().sort((a, b) => mid(a.box) - mid(b.box));
  const out = [];
  for (const line of sorted) {
    const row = out[out.length - 1];
    const h = Math.min(line.box[3], row ? row.height : line.box[3]);
    if (row && Math.abs(mid(line.box) - row.mid) < h * 0.5) {
      row.lines.push(line);
      row.top = Math.min(row.top, line.box[1]);
      row.bottom = Math.max(row.bottom, line.box[1] + line.box[3]);
    } else {
      out.push({ lines: [line], mid: mid(line.box), height: line.box[3], top: line.box[1], bottom: line.box[1] + line.box[3] });
    }
  }
  for (const row of out) row.lines.sort((a, b) => a.box[0] - b.box[0]);
  return out;
}

/**
 * @param ocr {width, height, lines:[{text, box:[x,y,w,h], words:[{text, box}]}]}
 * @returns {text, words:[{start, end, box, row}]}  boxes in the image's pixels
 */
function buildText(ocr) {
  let text = '';
  const words = [];
  const rs = rows(ocr.lines || []);
  rs.forEach((row, r) => {
    if (r > 0) {
      const gap = row.top - rs[r - 1].bottom;
      text += gap > Math.min(row.height, rs[r - 1].height) * 0.9 ? '\n\n' : '\n';
    }
    row.lines.forEach((line, i) => {
      if (i > 0) text += ' ';
      const base = text.length;
      text += line.text;
      let cursor = 0;
      for (const w of line.words || []) {
        const at = line.text.indexOf(w.text, cursor);
        if (at < 0) continue;
        words.push({ start: base + at, end: base + at + w.text.length, box: w.box, row: r });
        cursor = at + w.text.length;
      }
    });
  });
  return { text, words };
}

/** Boxes covering text[start, end): one per row, in image pixels. */
function boxesFor(words, start, end) {
  const byRow = new Map();
  for (const w of words) {
    if (w.end <= start || w.start >= end) continue;
    const b = byRow.get(w.row);
    const [x, y, wd, ht] = w.box;
    if (!b) byRow.set(w.row, [x, y, x + wd, y + ht]);
    else byRow.set(w.row, [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x + wd), Math.max(b[3], y + ht)]);
  }
  return [...byRow.values()].map(([x1, y1, x2, y2]) => [x1, y1, x2 - x1, y2 - y1]);
}

module.exports = { buildText, boxesFor, rows };
