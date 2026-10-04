// Voter ID (guide: "Election card (EPIC) number"), e.g. ABC1234567.
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'Voter ID';
  const EPIC = /\b[A-Z]{3}\d{7}\b/gd;
  const VOTER_KW = /\b(?:voter|epic|election|electoral)\b/i;
  U.register(LABEL, (text) => U.collect(text, EPIC, LABEL,
    (v, m, s, e) => (U.near(text, s, e, VOTER_KW, 40, 0) ? 0.95 : 0.72), 'regex', { rule: 'voter-epic' }));
})(globalThis);
