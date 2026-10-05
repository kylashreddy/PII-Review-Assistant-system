// Building whole documents from reads of a small screen box while the reviewer scrolls.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Stitcher, comparableRange } = require('../src/stitch');
const { joinRows } = require('../src/text-layout');

const DOC = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}: the quick brown fox number ${i + 1} jumps over the lazy dog`);
const row = (text, para = false) => ({ text, words: [{ start: 0, end: text.length, box: [0, 0, 10, 10] }], para, clipped: false, labels: [] });
const view = (from, n, lines = DOC) => lines.slice(from, from + n).map((t) => row(t));
const text = (st) => st.document().map((r) => r.text);

test('scrolling down and up builds the whole document once', () => {
  const st = new Stitcher();
  assert.equal(st.add(view(10, 6)), 'new');
  for (const from of [13, 16, 19, 24, 7, 4, 1, 0]) assert.equal(st.add(view(from, 6)), 'merged', `read at ${from}`);
  assert.deepEqual(text(st), DOC);
});

test('a read that matches nothing is kept as its own piece (nothing is lost)', () => {
  const st = new Stitcher();
  st.add(view(0, 6));
  assert.equal(st.add(view(15, 5)), 'merged');
  assert.deepEqual(text(st), [...DOC.slice(0, 6), ...DOC.slice(15, 20)]);
});

test('with mayStartOver, reads that match nothing three times start a new document', () => {
  const st = new Stitcher();
  st.add(view(0, 6));
  const other = Array.from({ length: 10 }, (_, i) => `Another task row ${i} with different words entirely`);
  assert.equal(st.add(view(0, 5, other), { mayStartOver: true }), 'ignored');
  assert.equal(st.add(view(0, 5, other), { mayStartOver: true }), 'ignored');
  assert.equal(st.add(view(0, 5, other), { mayStartOver: true }), 'new');
  assert.deepEqual(text(st), other.slice(0, 5));
});

test('fast scrolling: separate pieces join up when a later read connects them', () => {
  const st = new Stitcher();
  st.add(view(0, 6));      // rows 0-5
  st.add(view(12, 6));     // rows 12-17: no overlap, its own piece
  st.add(view(5, 8));      // rows 5-12: connects both
  assert.deepEqual(text(st), DOC.slice(0, 18));
  st.add(view(24, 6));     // another jump
  st.add(view(17, 8));     // rows 17-24: connects again
  assert.deepEqual(text(st), DOC.slice(0, 30));
});

test('an almost empty read (window switching) is ignored', () => {
  const st = new Stitcher();
  st.add(view(0, 6));
  assert.equal(st.add([row('ok')]), 'ignored');
  assert.deepEqual(text(st), DOC.slice(0, 6));
});

test('rows cut by the edge of the box are not used until fully visible', () => {
  const st = new Stitcher();
  const read = view(0, 4);
  read[3] = { ...read[3], text: 'Line 4: the quick bro', clipped: true };
  st.add(read);
  assert.deepEqual(text(st), DOC.slice(0, 3));
});

test('only rows on screen keep their boxes; labels are remembered after scrolling', () => {
  const st = new Stitcher();
  const first = view(0, 6);
  first[1].labels = [{ siteLabel: 'Person Name', start: 0, end: 6 }];
  st.add(first);
  st.add(view(4, 6));
  const doc = st.document();
  assert.deepEqual(doc[1].labels, [{ siteLabel: 'Person Name', start: 0, end: 6 }]);
  assert.equal(joinRows(doc).words.length, 6, 'boxes only for the 6 rows on screen');
});

test('comparable range: only the part read on both sides', () => {
  const left = DOC.slice(0, 20).map((t) => row(t));
  const right = DOC.slice(5, 12).map((t) => row(t.replace('fox', 'cat')));
  const r = comparableRange(left, right);
  assert.deepEqual(r.left, [5, 11]);
  assert.deepEqual(r.right, [0, 6]);
});

test('comparable range: a changed name line at the top of both sides is kept', () => {
  const left = [row('Ananya Rao Kulkarni'), ...DOC.slice(0, 5).map((t) => row(t))];
  const right = [row('Ananya'), row('Varnika Selvam'), ...DOC.slice(0, 5).map((t) => row(t))];
  const r = comparableRange(left, right);
  assert.deepEqual(r.left, [0, 5]);
  assert.deepEqual(r.right, [0, 6]);
});

test('the same line read slightly differently still lines up', () => {
  const st = new Stitcher();
  st.add(view(0, 6));
  const jittered = view(3, 6).map((r, i) => (i === 1 ? { ...r, text: r.text.replace('lazy', 'Iazy') } : r));
  assert.equal(st.add(jittered), 'merged');
  assert.equal(st.document().length, 9);
});

test('the document never starts over on its own', () => {
  const st = new Stitcher();
  st.add(view(0, 6));
  const other = Array.from({ length: 6 }, (_, i) => `Completely different content row ${i} for another page`);
  for (let k = 0; k < 5; k++) st.add(view(0, 6, other));
  assert.deepEqual(text(st).slice(0, 6), DOC.slice(0, 6), 'what was read is kept');
});

test('paging down: a read that does not overlap is added after, not lost', () => {
  const st = new Stitcher();
  st.add(view(0, 6));
  assert.equal(st.add(view(10, 6)), 'merged');
  assert.deepEqual(text(st), [...DOC.slice(0, 6), ...DOC.slice(10, 16)]);
});
