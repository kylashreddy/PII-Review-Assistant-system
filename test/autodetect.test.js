// Finding the raw original (left) and the PII-redacted work (right) on a whole-screen read.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { detectDocuments } = require('../src/autodetect');

const line = (text, x, y, w = text.length * 8, h = 18) => ({ text, box: [x, y, w, h], words: [] });

test('finds both documents on a real OCR read (fixture)', () => {
  const ocr = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'two-documents.ocr.json'), 'utf8'));
  const r = detectDocuments(ocr);
  assert.ok(r, 'found');
  assert.ok(r.left.x < 60 && r.left.x + r.left.width < 700, `left box ${JSON.stringify(r.left)}`);
  assert.ok(r.right.x > 700 && r.right.x < 760, `right box ${JSON.stringify(r.right)}`);
  for (const ocrLine of ocr.lines) {
    const [x, y, w, h] = ocrLine.box;
    const box = x < 700 ? r.left : r.right;
    assert.ok(x >= box.x && x + w <= box.x + box.width + 1 && y >= box.y && y + h <= box.y + box.height, `line inside: ${x},${y}`);
  }
});

test('Peak Talent layout: each box is the whole document pane (positions from a real screenshot)', () => {
  // Annotation Review modal, read at 2 pixels per point. Text is made up; positions are real.
  const L = (t, x, y, w) => line(t, x, y, w || t.length * 16, 34);
  const ocr = { width: 2000, height: 1240, lines: [
    L('Annotation Review — fr1_all_apps_2909~~gsuite~~nx-fr1-', 82, 236, 620),
    L('001~~google_calendar~~someone@example.com~~events~~files', 82, 268, 1540),
    L('Labels', 55, 372, 50), L('Account Number', 150, 372), L('Address', 336, 372), L('Business Name', 454, 372),
    L('Contact Number', 627, 372), L('Credentials', 811, 372), L('Date', 957, 372), L('Email Address', 1048, 372),
    L('Person Name', 85, 417), L('URL/Link', 243, 417), L('Person Username', 366, 417), L('Vehicle Number Plate', 558, 417),
    L('left.pdf-1e27b754', 82, 483, 160), L('Reference · read-only', 631, 483, 160),
    L('right.pdf-1e27b754', 857, 483, 175), L('Annotate here', 1459, 483, 110),
    L('Ravi Kumar Sharma', 88, 565), L('Email:ravi.sharma@gmail.com', 88, 657), L('Phone: +91 9876543210', 88, 702),
    L('+ 1 ( 816 ) - 824 -', 88, 794), L('Specialized in Information Technology as a Software Engineer', 88, 886, 625),
    L('specialized in UI development.', 88, 931), L('7625', 88, 1023),
    L('Ravi', 864, 565), L('Arjun Mehta', 864, 657), L('Email:arjun.mehta@gmail.com', 864, 748), L('Phone: +91 9876500000', 864, 794),
    L('+ 1 ( 816 ) - 824 -', 864, 886), L('Specialized in Helentjad Technology as a Software Engineer', 864, 977, 615),
    L('specialized in UI development.', 864, 1023),
    L('3 annotations', 55, 1150, 120), L('Close', 1505, 1150, 50),
  ] };
  const r = detectDocuments(ocr, { scale: 2 });
  assert.ok(r && r.panes, 'found the two panes');
  // Left pane: x 27–~415 pt, from under its header to above the footer.
  assert.ok(r.left.x >= 20 && r.left.x <= 45, `left x ${r.left.x}`);
  assert.ok(r.left.x + r.left.width >= 380 && r.left.x + r.left.width <= 432, `left right edge ${r.left.x + r.left.width}`);
  assert.ok(r.right.x >= 400 && r.right.x <= 432, `right x ${r.right.x}`);
  assert.ok(r.right.x + r.right.width >= 780, `right edge ${r.right.x + r.right.width}`);
  for (const b of [r.left, r.right]) {
    assert.ok(b.y > 258 && b.y < 280, `top under the headers: ${b.y}`);
    assert.ok(b.y + b.height < 575 && b.y + b.height > 540, `bottom above the footer: ${b.y + b.height}`);
  }
});

test('no pair of documents: nothing found', () => {
  const ocr = { lines: Array.from({ length: 10 }, (_, i) => line(`Mail subject number ${i} about something unrelated ${i * 7}`, 40, 40 + i * 30)) };
  assert.equal(detectDocuments(ocr), null);
});

test('screen points: Retina scale and display origin', () => {
  const ocr = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'two-documents.ocr.json'), 'utf8'));
  const a = detectDocuments(ocr);
  const b = detectDocuments(ocr, { scale: 2, origin: { x: 100, y: 50 } });
  assert.ok(Math.abs(b.left.x - (100 + (a.left.x + 12) / 2 - 12)) < 1);
  assert.ok(Math.abs(b.left.y - (50 + (a.left.y + 12) / 2 - 12)) < 1);
});
