// The desktop pipeline on a real OCR result: test/fixtures/two-documents.png (an
// original and a redacted CV side by side, labels as coloured highlights) read by
// Apple Vision into two-documents.ocr.json. Runs in plain Node (no Electron needed).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { readPng } = require('./png');
const { buildText, boxesFor } = require('../src/text-layout');
const colours = require('../src/label-colors');
const { analyze } = require('../src/analyzer');

const F = path.join(__dirname, 'fixtures');
const ocr = JSON.parse(fs.readFileSync(path.join(F, 'two-documents.ocr.json'), 'utf8'));
const img = readPng(fs.readFileSync(path.join(F, 'two-documents.png')));
const half = (left) => ({ ...ocr, lines: ocr.lines.filter((l) => (l.box[0] < img.width / 2) === left) });
const left = buildText(half(true));
const right = buildText(half(false));

test('layout: rows, paragraphs and words with boxes', () => {
  assert.ok(left.text.startsWith('Ananya Rao Kulkarni\n\nEmail: ananya.kulkarni92@gmail.com Phone: +91 9876012345'));
  const at = left.text.indexOf('9876012345');
  const [box] = boxesFor(left.words, at, at + 10);
  assert.ok(box && box[2] > 40 && box[3] > 10, 'the phone number has a box on screen');
  assert.equal(boxesFor(left.words, 0, left.text.length).length, new Set(left.words.map((w) => w.row)).size);
});

test('layout: two lines on one row are joined, a gap starts a paragraph', () => {
  const t = buildText({ lines: [
    { text: 'Name: Ravi', box: [0, 0, 100, 20], words: [] },
    { text: 'Phone: 98', box: [300, 2, 90, 20], words: [] },
    { text: 'next line', box: [0, 24, 90, 20], words: [] },
    { text: 'new paragraph', box: [0, 90, 120, 20], words: [] },
  ] });
  assert.equal(t.text, 'Name: Ravi Phone: 98\nnext line\n\nnew paragraph');
});

test('colours: labels are found from their highlight colour', () => {
  const { spans, unknown } = colours.findLabels(right, img);
  const got = spans.map((s) => `${s.siteLabel}: ${s.text}`);
  assert.deepEqual(got, [
    'Person Name: Varnika Selvam', 'Email Address: varnika.selvam88@gmail.com', 'Contact Number: 9876010000',
    'Business Name: Corvent Systems', 'Business Name: Lumora Data Pvt Ltd', 'Date: 02/09/1990', 'Address: Flat 4C, Palm Grove',
  ]);
  assert.deepEqual(unknown, []);
});

test('colours: plain text has no label, a taught colour wins', () => {
  const white = { data: Buffer.alloc(40 * 20 * 4, 255), width: 40, height: 20, bgra: false };
  assert.equal(colours.tintBehind(white, [0, 0, 40, 20]), null);
  const tint = [230, 220, 250];
  assert.equal(colours.matchLabel(tint, { learned: { '#e6dcfa': 'Person Username' } }), 'Person Username');
  assert.equal(colours.matchLabel([200, 200, 200]), null, 'grey is not a label');
});

test('checks: the L2 problems in the redacted CV', () => {
  const { spans } = colours.findLabels(right, img);
  const r = analyze(left, right, spans);
  const by = (cat) => r.L2.findings.filter((f) => f.category === cat).map((f) => f.text);
  assert.deepEqual(by('LEAKAGE').sort(), ['+91 9876012345', '10.24.8.17', 'Ananya Rao Kulkarni', 'Flat 12B, Lakeview Residency, Baner Road, Pune 411045'].sort());
  assert.ok(by('OVER_REDACTED').includes('Infosys'), 'a known company replaced is over-scrubbing');
  assert.ok(by('REDACTED_OK').includes('ananya.kulkarni92@gmail.com'));
  for (const f of r.L2.findings) assert.ok(f.leftBoxes.length || f.rightBoxes.length, `${f.text} can be shown on screen`);
});
