// Not over-detecting: what the review screen recording showed must not be reported.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { garbled, joinRows } = require('../src/text-layout');
const colours = require('../src/label-colors');
const { analyze } = require('../src/analyzer');
const labelView = require('../src/label-view');

const row = (t) => ({ text: t, words: [], para: false });
const view = (left, right) => {
  const r = analyze(joinRows(left.map(row)), joinRows(right.map(row)), []);
  return labelView.build(r, r.extras);
};

test('unreadable OCR lines are dropped, real words are kept', () => {
  assert.ok(garbled('vulIlnly NuvIlVONIVYMIVHIUIL HVlIVIIUILU'));
  for (const ok of ['JavaScript, jQuery, PostgreSQL and MySQL', 'Worked on LinkedIn and iPhone apps', 'HASHEDIN TECHNOLOGIES',
    'Rhythm and Synthesis', 'McDonald and DeVries', 'SQL, MYSQL']) assert.ok(!garbled(ok), ok);
});

test('OCR reading the same words differently is not over-scrubbing', () => {
  const v = view(['Built REST APIs for the CAREERHIGHLIGHTS page'], ['Built REST APls for the CAREER HIGHLIGHTS page']);
  assert.deepEqual(v.other, []);
});

test('a short word swap that is not PII is reported once', () => {
  const v = view(['Specialized in Information Technology as a Software Engineer'], ['Specialized in Helentjad Technology as a Software Engineer']);
  assert.equal(v.other.length, 1);
  assert.equal(v.other[0].text, 'Information');
});

test('whole sentences paired with unrelated text by a layout change are not reported', () => {
  const v = view(
    ['Experience', 'Worked on writing Unit test cases for every module', 'Education'],
    ['Experience', 'Axis Bank wants to build a platform for products', 'Education']);
  assert.deepEqual(v.other, []);
  assert.ok(v.layoutNoise >= 1);
});

test('a software product is not a Business Name', () => {
  const v = view(['Tools: Visual Studio, IntelliJ, Android Studio and Notepad++'], ['Tools: Visual Studio, IntelliJ, Android Studio and Notepad++']);
  assert.ok(!v.items.some((i) => i.site === 'Business Name'), JSON.stringify(v.items.map((i) => i.text)));
});

test('labels drawn as an underline are read (fill, underline, or both)', () => {
  // A word box 60x20 on white; below it a 2px line in the label's colour.
  const W = 80, H = 40;
  const img = (fill, line) => {
    const data = Buffer.alloc(W * H * 4, 255);
    const put = (x, y, c) => { const o = (y * W + x) * 4; data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; };
    for (let y = 5; y < 25; y++) for (let x = 10; x < 70; x++) put(x, y, (x + y) % 7 === 0 ? [30, 30, 30] : fill);
    if (line) for (let y = 27; y < 29; y++) for (let x = 10; x < 70; x++) put(x, y, line);
    return { data, width: W, height: H, bgra: false };
  };
  const doc = { text: 'Helentjad', words: [{ start: 0, end: 9, box: [10, 5, 60, 20] }] };
  const underlineOnly = colours.findLabels(doc, img([255, 249, 249], [255, 229, 234]));
  assert.deepEqual(underlineOnly.spans.map((s) => s.siteLabel), ['Overscrubbed']);
  const fillAndLine = colours.findLabels({ ...doc, text: 'Vijaya' }, img([209, 224, 253], [33, 107, 232]));
  assert.deepEqual(fillAndLine.spans.map((s) => s.siteLabel), ['Person Name']);
  assert.deepEqual(colours.findLabels(doc, img([255, 255, 255], null)).spans, [], 'plain text has no label');
});
