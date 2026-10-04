// Driving License No (guide: "Driving licence number"), e.g. MH12 20110012345.
// Indian format: state code (2 letters) + RTO (2 digits) + year (4) + 7 digits.
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'Driving License No';
  const STATES = new Set('AN AP AR AS BR CH CG DD DL DN GA GJ HR HP JH JK KA KL LA LD MH ML MN MP MZ NL OD OR PB PY RJ SK TN TR TS TG UK UA UP WB'.split(' '));
  const DL = /\b([A-Z]{2})[ -]?(\d{2})[ -]?((?:19|20)\d{2})[ -]?(\d{7})\b/gd;
  const DL_KW = /\b(?:dl|d\.l\.|driving[ \t]+licen[cs]e|licen[cs]e)\b[ \t]*(?:no\.?|number|#)?[ \t]*[:\-]?[ \t]*([A-Z]{2}[ -]?\d{2}[A-Z0-9 -]{8,14}\d)/gid;
  U.register(LABEL, (text) => [
    ...U.collect(text, DL, LABEL, (v, m) => (STATES.has(m[1]) ? 0.92 : null), 'regex', { rule: 'dl-format' }),
    ...U.collect(text, DL_KW, LABEL, (v) => (U.digitCount(v) >= 9 ? 0.88 : null), 'regex', { group: 1, rule: 'dl-keyword' }),
  ]);
})(globalThis);
