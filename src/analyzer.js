// Runs the extension's checks (desktop/shared, copied by scripts/sync-shared.js) on
// documents read from the screen. Same detectors, same L1/L2 rules, same tests.
'use strict';
const path = require('path');
const fs = require('fs');
const { boxesFor } = require('./text-layout');
const labelView = require('./label-view');

const SHARED = path.join(__dirname, '..', 'shared');
let P = null;

function load() {
  if (P) return P;
  const scripts = JSON.parse(fs.readFileSync(path.join(SHARED, 'scripts.json'), 'utf8'));
  for (const f of scripts) require(path.join(SHARED, f));
  P = globalThis.PIIRA;
  P.knownNames.setData(JSON.parse(fs.readFileSync(path.join(SHARED, 'data', 'business-names.json'), 'utf8')));
  return P;
}

/** Add extra known names (organisation list) on top of the built-in list. */
function setExtraNames(names) {
  load();
  const base = JSON.parse(fs.readFileSync(path.join(SHARED, 'data', 'business-names.json'), 'utf8'));
  P.knownNames.setData(names && names.length ? { ...base, organisation_list: names } : base);
}

const keep = (f, extra) => ({
  id: f.id, category: f.category, label: f.label || null, group: f.group || null, text: f.text || '',
  note: f.note || '', suggest: f.suggest || null, status: f.status || null, rightLabel: f.rightLabel || null,
  knownName: f.knownName || null, moved: Boolean(f.moved), confidence: f.confidence == null ? null : f.confidence, source: f.source || null,
  left: f.left || null, right: f.right || null, ...extra,
});

/**
 * @param left  {text, words}  the original, from text-layout
 * @param right {text, words}  the redacted work
 * @param spans labeled spans on the right [{siteLabel, start, end, text}]
 * @returns everything the window and the overlay show
 */
function analyze(left, right, spans) {
  load();
  const resolve = P.compare.labelResolver(P.SELECTORS);
  const rightLabels = spans.map((s) => {
    const label = resolve(s.siteLabel);
    return { label: label || s.siteLabel, rawLabel: s.siteLabel, known: Boolean(label), start: s.start, end: s.end, text: s.text, placeholder: false };
  });

  const detections = P.engine.run(left.text);
  const structure = P.redactionRules.structure(left.text);
  const language = P.redactionRules.languageReport(left.text, { scriptOnly: Boolean(structure) });
  const people = detections.filter((d) => d.label === 'Person Name');
  const knownNames = P.knownNames.findIn(left.text).filter((k) => !people.some((d) => k.start < d.end && k.end > d.start));

  const l1 = P.compare.compareDocuments({ leftText: left.text, rightText: right.text, detections, rightLabels });
  const l1id = P.identify.fromCompare(l1);
  const l2 = P.redaction.validate({ leftText: left.text, rightText: right.text, detections, alignment: l1.alignment });
  // Text "missing" here but present elsewhere on the other side was moved by the new
  // layout (a line split differently, a fragment placed further down), not changed.
  // Compared on letters and digits only, so "CLIENT:AXISBANK" = "Client: Axis Bank".
  const letters = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const leftLetters = letters(left.text);
  const rightLetters = letters(right.text);
  for (const f of l2.findings) {
    if (f.category !== 'UNKNOWN_TEXT') continue;
    const frag = letters(f.text);
    if (frag.length < 4) { f.moved = true; continue; }   // a stray bullet or punctuation
    const added = /not in the original/.test(f.note || '');
    if ((added ? leftLetters : rightLetters).includes(frag)) f.moved = true;
  }

  // Where a stretch of the original ended up in the redacted text (by the word alignment).
  const al = l1.alignment;
  function rightRangeOf(start, end) {
    const idx = [];
    al.leftTokens.forEach((t, k) => { if (t.start < end && t.end > start) idx.push(k); });
    if (!idx.length) return null;
    const mapped = idx.map((k) => al.l2r[k]).filter((j) => j !== -1);
    if (mapped.length) return { start: al.rightTokens[Math.min(...mapped)].start, end: al.rightTokens[Math.max(...mapped)].end };
    let before = -1;
    for (let k = idx[0] - 1; k >= 0; k--) if (al.l2r[k] !== -1) { before = al.l2r[k]; break; }
    let after = al.rightTokens.length;
    for (let k = idx[idx.length - 1] + 1; k < al.leftTokens.length; k++) if (al.l2r[k] !== -1) { after = al.l2r[k]; break; }
    if (after - 1 < before + 1) return null;
    return { start: al.rightTokens[before + 1].start, end: al.rightTokens[after - 1].end };
  }

  const where = (f) => ({
    leftBoxes: f.left ? boxesFor(left.words, f.left.start, f.left.end) : [],
    rightBoxes: f.right ? boxesFor(right.words, f.right.start, f.right.end) : [],
  });
  return {
    taskKey: P.util.hash(left.text),
    leftChars: left.text.length,
    rightChars: right.text.length,
    labels: rightLabels.map((l) => ({ label: l.label, rawLabel: l.rawLabel, known: l.known, text: l.text, start: l.start, end: l.end, rightBoxes: boxesFor(right.words, l.start, l.end) })),
    extras: labelView.detectExtras(left.text).map((x) => {
      const r = rightRangeOf(x.start, x.end);
      return { ...x, right: r, visible: right.text.includes(x.text), leftBoxes: boxesFor(left.words, x.start, x.end), rightBoxes: r ? boxesFor(right.words, r.start, r.end) : [] };
    }),
    knownNames: knownNames.map((k) => ({ name: k.name, text: k.text, leftBoxes: boxesFor(left.words, k.start, k.end) })),
    taskCheck: { language, structure },
    L1: { findings: l1id.findings.map((f) => keep(f, where(f))), stats: l1id.stats || null },
    L2: { findings: l2.findings.map((f) => keep(f, where(f))), stats: l2.stats || null },
  };
}

module.exports = { load, analyze, setExtraNames };
