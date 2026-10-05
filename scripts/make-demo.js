// Writes ui/demo-data.json: a real check of test/fixtures/two-documents.png, used when
// ui/index.html is opened in a browser (?demo=result) to work on the design.
'use strict';
const fs = require('fs');
const path = require('path');
const { readPng } = require('../test/png');
const { buildText } = require('../src/text-layout');
const { findLabels } = require('../src/label-colors');
const { analyze } = require('../src/analyzer');
const labelView = require('../src/label-view');

const F = path.join(__dirname, '..', 'test', 'fixtures');
const ocr = JSON.parse(fs.readFileSync(path.join(F, 'two-documents.ocr.json'), 'utf8'));
const img = readPng(fs.readFileSync(path.join(F, 'two-documents.png')));
const half = (left) => ({ ...ocr, lines: ocr.lines.filter((l) => (l.box[0] < img.width / 2) === left) });
const left = buildText(half(true));
const right = buildText(half(false));
const found = findLabels(right, img);
const r = analyze(left, right, found.spans);
for (const s of ['L1', 'L2']) for (const f of r[s].findings) { delete f.leftBoxes; delete f.rightBoxes; }
for (const l of r.labels) delete l.rightBoxes;
for (const k of r.knownNames) delete k.leftBoxes;
for (const x of r.extras) { x.leftRects = []; x.rightRects = []; delete x.leftBoxes; delete x.rightBoxes; }
r.view = labelView.build(r, r.extras);
const demo = { ...r, unknownColours: [{ hex: '#e6dcfa', count: 2, example: 'ravi_k92' }], totalMs: 640, ocrMs: 410, engine: 'Apple Vision' };
fs.writeFileSync(path.join(__dirname, '..', 'ui', 'demo-data.json'), JSON.stringify(demo));
console.log('demo:', r.L2.findings.length, 'L2 findings,', r.L1.findings.length, 'L1 findings');
