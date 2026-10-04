// Which words on the redacted document carry a label, read from their highlight colour.
//
// A label on the site is a light tint of the label's colour behind the words. For each
// word we sample the pixels behind it, keep the tinted ones (light and coloured; text
// strokes are dark), and match their colour:
//   1. colours the reviewer taught the app ("this colour is Person Name"), then
//   2. the site's label colours, as a tint of each colour on white.
// Colours that match neither are reported so the reviewer can teach them.
'use strict';

// Peak Talent's label colours (the dots on its label chips).
const DEFAULT_PALETTE = {
  'Account Number': '#6d28d9', 'Address': '#dc2626', 'Business Name': '#14b8a6', 'Contact Number': '#f97316',
  'Credentials': '#fb7185', 'Date': '#ec4899', 'Email Address': '#16a34a', 'IP Address': '#22d3ee',
  'Overscrubbed': '#f9a8b4', 'Person Name': '#2563eb', 'URL/Link': '#f59e0b', 'Person Username': '#3730a3',
  'Vehicle Number Plate': '#84cc16',
};

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const dist = (a, b) => Math.sqrt(((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) / 3);

/**
 * The highlight colour behind a box, or null when the background is plain.
 * @param img {data, width, height, bgra}  raw pixels (BGRA from Electron's toBitmap, else RGBA)
 */
function tintBehind(img, box) {
  const [bx, by, bw, bh] = box.map(Math.round);
  const step = Math.max(1, Math.floor(Math.min(bw, bh) / 10));
  const [ri, bi] = img.bgra ? [2, 0] : [0, 2];
  const tinted = [];
  let total = 0;
  for (let y = Math.max(0, by); y < Math.min(img.height, by + bh); y += step) {
    for (let x = Math.max(0, bx); x < Math.min(img.width, bx + bw); x += step) {
      const o = (y * img.width + x) * 4;
      const c = [img.data[o + ri], img.data[o + 1], img.data[o + bi]];
      total++;
      const hi = Math.max(...c);
      if (hi >= 150 && hi - Math.min(...c) >= 12) tinted.push(c);
    }
  }
  if (!total || tinted.length / total < 0.22) return null;
  const median = (k) => tinted.map((c) => c[k]).sort((a, b) => a - b)[tinted.length >> 1];
  return [median(0), median(1), median(2)];
}

/** How well `tint` looks like `color` laid over white: {residual, alpha}. */
function asTint(tint, color) {
  let num = 0;
  let den = 0;
  for (let k = 0; k < 3; k++) {
    const d = 255 - color[k];
    num += (255 - tint[k]) * d;
    den += d * d;
  }
  const alpha = den ? Math.min(1, Math.max(0.04, num / den)) : 0;
  const mixed = color.map((v) => 255 - alpha * (255 - v));
  return { residual: dist(mixed, tint), alpha };
}

/** Site label name for a highlight colour, or null. */
function matchLabel(tint, { learned = {}, palette = DEFAULT_PALETTE } = {}) {
  let best = null;
  for (const [hex, label] of Object.entries(learned)) {
    const d = dist(hexToRgb(hex), tint);
    if (d < 12 && (!best || d < best.d)) best = { label, d };
  }
  if (best) return best.label;
  for (const [label, hex] of Object.entries(palette)) {
    const { residual } = asTint(tint, hexToRgb(hex));
    if (residual < 11 && (!best || residual < best.d)) best = { label, d: residual };
  }
  return best ? best.label : null;
}

/**
 * Labeled spans on the redacted document.
 * @returns {spans:[{siteLabel, start, end, text}], unknown:[{hex, count, example}]}
 */
function findLabels(doc, img, options = {}) {
  const tagged = doc.words.map((w) => {
    const tint = tintBehind(img, w.box);
    return { w, tint, label: tint ? matchLabel(tint, options) : null };
  });
  const spans = [];
  const unknown = new Map();
  let cur = null;
  for (const t of tagged) {
    if (t.tint && !t.label) {
      const key = rgbToHex(t.tint.map((v) => Math.round(v / 6) * 6 > 255 ? 255 : Math.round(v / 6) * 6));
      const u = unknown.get(key) || { hex: rgbToHex(t.tint), count: 0, example: '' };
      u.count++;
      if (u.example.length < 40) u.example = (u.example ? u.example + ' ' : '') + doc.text.slice(t.w.start, t.w.end);
      unknown.set(key, u);
    }
    const joins = cur && t.label === cur.siteLabel && !doc.text.slice(cur.end, t.w.start).trim();
    if (t.label && joins) { cur.end = t.w.end; continue; }
    if (cur) spans.push(cur);
    cur = t.label ? { siteLabel: t.label, start: t.w.start, end: t.w.end } : null;
  }
  if (cur) spans.push(cur);
  for (const s of spans) {
    // A word box includes punctuation next to the label ("Systems," "(Ravi").
    while (s.end > s.start && /[,.;:)\]]/.test(doc.text[s.end - 1])) s.end--;
    while (s.start < s.end && /[(\[]/.test(doc.text[s.start])) s.start++;
    s.text = doc.text.slice(s.start, s.end);
  }
  return { spans: spans.filter((s) => s.text.trim()), unknown: [...unknown.values()].sort((a, b) => b.count - a.count) };
}

/**
 * Labels on each row of one read, kept on the row (row.labels, offsets within the row) so
 * they are remembered after the row scrolls out of view. Returns the unknown colours.
 */
function labelRows(rowList, img, options = {}) {
  const unknown = new Map();
  for (const row of rowList) {
    const found = findLabels({ text: row.text, words: row.words.filter((w) => w.box) }, img, options);
    row.labels = found.spans.map(({ siteLabel, start, end }) => ({ siteLabel, start, end }));
    for (const u of found.unknown) {
      const cur = unknown.get(u.hex) || { ...u, count: 0, example: u.example };
      cur.count += u.count;
      unknown.set(u.hex, cur);
    }
  }
  return [...unknown.values()].sort((a, b) => b.count - a.count);
}

/** Row labels -> labeled spans in the joined text; a label running on to the next row stays one span. */
function spansFromRows(rowList, joined) {
  const spans = [];
  rowList.forEach((row, r) => {
    for (const l of row.labels || []) {
      const start = joined.rowStarts[r] + l.start;
      const end = joined.rowStarts[r] + l.end;
      const prev = spans[spans.length - 1];
      const prevRowEnd = r > 0 ? joined.rowStarts[r - 1] + rowList[r - 1].text.length : -1;
      if (prev && prev.siteLabel === l.siteLabel && l.start === 0 && prev.end === prevRowEnd) prev.end = end;
      else spans.push({ siteLabel: l.siteLabel, start, end });
    }
  });
  for (const s of spans) s.text = joined.text.slice(s.start, s.end);
  return spans;
}

module.exports = { DEFAULT_PALETTE, tintBehind, matchLabel, findLabels, labelRows, spansFromRows, asTint, hexToRgb, rgbToHex };
