// Putting the redacted document's lines in the original's order (blocks moved by a new
// layout), modelled on a real review task (screen recording, made-up values).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { reorderToMatch } = require('../src/reorder');
const { comparableRange } = require('../src/stitch');

const row = (text) => ({ text });
const texts = (rows) => rows.map((r) => r.text);

const LEFT = [
  'Vijaya Krishna Navuluri', 'Email:vijaya.k@gmail.com Phone: +91 8919036918', '+ 1 ( 816 ) - 824 -',
  'Specialized in Information Technology as a Software Engineer specialized in UI', 'development.', '7625',
  'KEYSKILLS', 'Angular, React.', 'JavaScript, jQuery, Material, AJAX, HTML, CSS, Less.', 'Node.js', 'SQL, MySQL',
  'implementation of single page applications using Angular and React.',
  '+ Excellent work experience in front end technologies like', 'javascript,jquery,css and html.',
  'HASHEDIN TECHNOLOGIES', 'JUNE2020-PRESENT', 'CLIENT:AXISBANK', 'Client :', 'Axis Bank', 'Project: Axis Bank',
  'Responsibilities:', 'Gathering business requirements from clients', 'Worked on state management using redux',
  'ADECCO', 'Responsibilities:', 'Integration of APIs between client and server', 'Encrypted payload data between services',
];
// The redacted PDF: the experience lines come right after 7625, the skills block after them,
// a heading block replaced, values replaced, and one line wrapped differently.
const RIGHT = [
  'Vijaya', 'Vanixmer Lumivlysora', 'Email:haxev.lumi@gmail.com Phone: +91', '8919030000', '+ 1 ( 816 ) - 824 -',
  'Specialized in Helentjad Technology as a Software Engineer specialized in UI', 'development.', '7625',
  'implementation of single page applications using Angular and React.',
  '+ Excellent work experience in front end technologies like', 'javascript,jquery,css and html.',
  'KEYSKILLS', 'Angular, React.', 'JavaScript, jQuery, Material,', 'Node.js', 'SQL, MySQL',
  'Client:', 'Axis Bank', 'Project: Axis Bank',
  'Responsibilities:', 'Gathering business requirements from', 'Worked on state management using redux',
  'cederacob', 'Responsibilities:', 'Integration of APIs between client and', 'Encrypted payload data between services',
];

test('a moved block goes back to its place in the original', () => {
  const { rows, moved } = reorderToMatch(LEFT.map(row), RIGHT.map(row));
  const t = texts(rows);
  assert.ok(moved > 0);
  assert.ok(t.indexOf('KEYSKILLS') < t.indexOf('implementation of single page applications using Angular and React.'), 'skills before the experience lines, as in the original');
  assert.ok(t.indexOf('SQL, MySQL') < t.indexOf('+ Excellent work experience in front end technologies like'));
  assert.equal(t.length, RIGHT.length, 'no line lost');
});

test('lines without a partner stay with the line before them', () => {
  const t = texts(reorderToMatch(LEFT.map(row), RIGHT.map(row)).rows);
  assert.equal(t[t.indexOf('Email:haxev.lumi@gmail.com Phone: +91') + 1], '8919030000', 'the wrapped number follows its line');
  assert.equal(t[t.indexOf('Vijaya') + 1], 'Vanixmer Lumivlysora');
});

test('a repeated line stays in its own block', () => {
  const t = texts(reorderToMatch(LEFT.map(row), RIGHT.map(row)).rows);
  const second = t.lastIndexOf('Responsibilities:');
  assert.equal(t[second + 1], 'Integration of APIs between client and');
  assert.equal(t[second - 1], 'cederacob');
});

test('after reordering, the whole document lines up for comparing', () => {
  const before = comparableRange(LEFT.map(row), RIGHT.map(row));
  const after = comparableRange(LEFT.map(row), reorderToMatch(LEFT.map(row), RIGHT.map(row)).rows);
  assert.ok(after.matched > before.matched, `${after.matched} lines paired after, ${before.matched} before`);
});

test('documents already in the same order are left as they are', () => {
  const same = LEFT.map((t) => row(t.replace('Navuluri', 'Mehta')));
  const { rows, moved } = reorderToMatch(LEFT.map(row), same);
  assert.equal(moved, 0);
  assert.deepEqual(texts(rows), texts(same));
});

test('text moved by the layout is not reported as missing or added', () => {
  const { joinRows } = require('../src/text-layout');
  const { analyze } = require('../src/analyzer');
  const row2 = (t) => ({ text: t, words: [], para: false });
  const left = ['Skills', 'JavaScript, jQuery, Material, AJAX, HTML, CSS, Less.', 'Experience', 'Built dashboards for retail clients.'];
  // The redacted PDF split the skills line and put its end further down.
  const right = ['Skills', 'JavaScript, jQuery, Material,', 'Experience', 'Built dashboards for retail clients.', 'AJAX, HTML, CSS, Less.'];
  const r = analyze(joinRows(left.map(row2)), joinRows(reorderToMatch(left.map(row2), right.map(row2)).rows), []);
  const unknown = r.L2.findings.filter((f) => f.category === 'UNKNOWN_TEXT');
  assert.ok(unknown.every((f) => f.moved), JSON.stringify(unknown.map((f) => [f.text, f.moved])));
  // Without reordering the fragment is found elsewhere and marked as moved.
  const plain = analyze(joinRows(left.map(row2)), joinRows(right.map(row2)), []);
  assert.ok(plain.L2.findings.filter((f) => f.category === 'UNKNOWN_TEXT').every((f) => f.moved));
});
