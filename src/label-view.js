// What the reviewer sees: every piece of PII in the raw original (left) with the label it
// needs — in the review site's own label names — and, on the PII-redacted work (right),
// whether that label is there and whether the value is redacted.
'use strict';

// The review site's labels, in the order it shows them.
const SITE_LABELS = ['Account Number', 'Address', 'Business Name', 'Contact Number', 'Credentials', 'Date', 'Email Address',
  'IP Address', 'Overscrubbed', 'Person Name', 'URL/Link', 'Person Username', 'Vehicle Number Plate'];

// The checks' detailed entities -> the site's label.
const TO_SITE = {
  'Person Name': 'Person Name',
  'Person Email': 'Email Address', 'Business Email': 'Email Address',
  'Person Phone No': 'Contact Number', 'Business Phone No': 'Contact Number',
  'Person DOB': 'Date',
  'Person Address': 'Address', 'Business Address': 'Address',
  'Person Username': 'Person Username', 'Business Username': 'Person Username',
  'Business Name': 'Business Name',
  'Account Number': 'Account Number', 'Account ID': 'Account Number', 'IFSC Code': 'Account Number', 'Credit/Debit Card No': 'Account Number',
  'Card ID': 'Account Number', 'UPI ID': 'Account Number', 'Transaction ID': 'Account Number',
  'IP/MAC Address': 'IP Address',
  'Password': 'Credentials', 'API/Private Keys': 'Credentials', 'SHA/SSH/Hash Key': 'Credentials', 'VPC ID': 'Credentials',
  'Invocation ID': 'Credentials', 'Aadhar Card No': 'Credentials', 'PAN Card Number': 'Credentials', 'Driving License No': 'Credentials',
  'Voter ID': 'Credentials',
  'Overscrubbed': 'Overscrubbed',
};
const siteLabel = (label) => (SITE_LABELS.includes(label) ? label : TO_SITE[label] || null);

// The two site labels the checks have no entity for.
const EXTRA_DETECTORS = [
  { site: 'URL/Link', re: /\b(?:https?:\/\/|www\.)[^\s<>"')]+|\b(?:[a-z0-9-]+\.)+(?:com|in|io|org|net|co|ai|dev|me)\/[^\s<>"')]+/gi },
  // Indian registration plates: MH 12 AB 4521, KA-01-MJ-2345, DL3CAB1234
  { site: 'Vehicle Number Plate', re: /\b[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{4}\b/g },
];

const overlaps = (a, b) => a && b && a.start < b.end && b.start < a.end;
const wordCount = (t) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
// The same text, read with OCR's usual confusions (I/l/1, O/0, rn/m) and spacing.
const reading = (t) => t.toLowerCase().replace(/rn/g, 'm').replace(/[il1|!]/g, 'l').replace(/0/g, 'o').replace(/[^\p{L}\p{N}]+/gu, '');
const sameReading = (a, b) => Boolean(a) && reading(a) === reading(b);

/**
 * @param r      result of analyzer.analyze (with labels[].start/end on the right)
 * @param extras detections of EXTRA_DETECTORS on the left: [{site, start, end, text, right}]
 * @returns {items, other, counts, done}
 */
function build(r, extras = []) {
  const l2 = r.L2.findings;
  const labels = r.labels;
  const labelAt = (range) => labels.filter((l) => overlaps(l, range));
  const items = [];

  // PII found in the original (L1: is it labeled on the right?)
  for (const f of r.L1.findings) {
    if (!['PI_TODO', 'BI_TODO', 'CRED_TODO', 'IDENTIFIED'].includes(f.category) || !f.left) continue;
    const site = siteLabel(f.label);
    if (!site) continue;
    const rightSite = f.rightLabel ? siteLabel(f.rightLabel) || f.rightLabel : null;
    let labeled = 'no';
    if (f.status === 'labeled') labeled = 'yes';
    else if (rightSite) labeled = rightSite === site ? 'yes' : 'other';
    items.push({ id: f.id, site, text: f.text, labeled, rightSite, left: f.left, right: f.right, leftRects: f.leftRects || [], rightRects: f.rightRects || [], confidence: f.confidence });
  }

  // Two site labels the checks do not cover.
  for (const x of extras) {
    if (items.some((i) => overlaps(i.left, x))) continue;
    const onRight = x.right ? labelAt(x.right) : [];
    const rightSite = onRight.length ? siteLabel(onRight[0].rawLabel) || onRight[0].rawLabel : null;
    items.push({ id: `X|${x.start}`, site: x.site, text: x.text, labeled: rightSite ? (rightSite === x.site ? 'yes' : 'other') : 'no',
      rightSite, left: { start: x.start, end: x.end }, right: x.right, leftRects: x.leftRects || [], rightRects: x.rightRects || [],
      visible: x.visible });
  }

  // Redaction on the right (L2), matched to each item by where it is in the original.
  for (const item of items) {
    const f = l2.find((g) => g.left && overlaps(g.left, item.left) && g.category !== 'UNKNOWN_TEXT' && g.category !== 'TASK');
    if (item.visible != null && !f) item.redaction = item.visible ? 'visible' : 'redacted';
    else if (!f) item.redaction = null;
    else if (f.category === 'LEAKAGE') item.redaction = /partly/.test(f.note) ? 'partly' : 'visible';
    else if (f.category === 'REDACTED_OK') item.redaction = 'redacted';
    else if (['INCOHERENT', 'DATATYPE', 'NOT_SENSIBLE'].includes(f.category)) item.redaction = 'replacement';
    else if (f.category === 'UNSURE') item.redaction = 'visible';
    else item.redaction = 'redacted';
    if (f) {
      item.note = f.note;
      if (f.rightRects && f.rightRects.length) item.rightRects = f.rightRects;
      if (!item.right && f.right) item.right = f.right;
    }
    // A label sitting on the redacted value counts, whatever the alignment said.
    if (item.labeled === 'no' && item.right) {
      const on = labelAt(item.right).map((l) => siteLabel(l.rawLabel) || l.rawLabel);
      if (on.length) { item.rightSite = on[0]; item.labeled = on.includes(item.site) ? 'yes' : 'other'; }
    }
    item.ok = item.labeled === 'yes' && (item.redaction === 'redacted' || item.redaction === null);
  }

  // Changes on the right that are not PII: words replaced that did not need it.
  // Only a short swap ("Information" -> "Helentjad", a company name replaced) is reported.
  // Not reported, because they are not redaction: text the new layout moved or split, the
  // same words read slightly differently by OCR ("APIs" / "APls", "CAREERHIGHLIGHTS" /
  // "CAREER HIGHLIGHTS"), and long stretches paired with unrelated text by a layout change.
  const other = [];
  let layoutNoise = 0;
  // Changes only a word or two apart are one bigger change (a sentence paired with
  // unrelated text, split where a common word like "for" happened to match): judge them together.
  const changes = l2.filter((f) => (f.category === 'OVER_REDACTED' || f.category === 'UNKNOWN_TEXT') && f.left)
    .sort((a, b) => a.left.start - b.left.start);
  const clusterWords = new Map();
  for (let i = 0; i < changes.length;) {
    let j = i;
    while (j + 1 < changes.length && changes[j + 1].left.start - changes[j].left.end <= 12) j++;
    const words = changes.slice(i, j + 1).reduce((n, f) => n + wordCount(f.text), 0);
    for (let k = i; k <= j; k++) clusterWords.set(changes[k], words);
    i = j + 1;
  }
  for (const f of l2) {
    if (f.category !== 'OVER_REDACTED' && f.category !== 'UNKNOWN_TEXT') continue;
    if (f.moved || f.category === 'UNKNOWN_TEXT') { layoutNoise++; continue; }
    const swap = /“([^”]*)” → “([^”]*)”/.exec(f.note || '');
    const was = swap ? swap[1] : f.text;
    const now = swap ? swap[2] : '';
    if (sameReading(was, now) || wordCount(was) > 3 || wordCount(now) > 4 || (clusterWords.get(f) || 0) > 3) { layoutNoise++; continue; }
    const on = f.right ? labelAt(f.right).map((l) => siteLabel(l.rawLabel) || l.rawLabel) : [];
    const marked = on.includes('Overscrubbed');
    other.push({
      id: f.id, kind: f.category === 'OVER_REDACTED' ? 'overscrub' : 'text', text: f.text, note: f.note, knownName: f.knownName || null,
      rightSite: on[0] || null, marked, ok: f.category === 'OVER_REDACTED' && marked, right: f.right,
      leftRects: f.leftRects || [], rightRects: f.rightRects || [],
    });
  }
  // Labels on the right over text that is not PII.
  for (const f of r.L1.findings) {
    if (f.category !== 'NOT_PII' || !f.rightLabel || other.some((o) => overlaps(o.right, f.right))) continue;
    const site = siteLabel(f.rightLabel) || f.rightLabel;
    other.push({ id: f.id, kind: 'extra-label', text: f.text, note: f.note, rightSite: site, marked: site === 'Overscrubbed', right: f.right,
      ok: site === 'Overscrubbed', leftRects: f.leftRects || [], rightRects: f.rightRects || [] });
  }

  items.sort((a, b) => SITE_LABELS.indexOf(a.site) - SITE_LABELS.indexOf(b.site) || a.left.start - b.left.start);
  const counts = {
    pii: items.length,
    labeled: items.filter((i) => i.labeled === 'yes').length,
    visible: items.filter((i) => i.redaction === 'visible' || i.redaction === 'partly').length,
    problems: items.filter((i) => !i.ok).length + other.filter((o) => !o.ok).length,
  };
  return { items, other, counts, layoutNoise, done: counts.problems === 0 };
}

/** URL/Link and vehicle plate detections on the left text. */
function detectExtras(text) {
  const out = [];
  for (const d of EXTRA_DETECTORS) {
    d.re.lastIndex = 0;
    let m;
    while ((m = d.re.exec(text)) !== null) {
      const value = m[0].replace(/[.,;:]+$/, '');
      out.push({ site: d.site, start: m.index, end: m.index + value.length, text: value });
    }
  }
  return out;
}

module.exports = { SITE_LABELS, siteLabel, build, detectExtras };
