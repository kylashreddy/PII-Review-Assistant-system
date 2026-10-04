// PAN Card Number (guide: "Income tax ID (10 characters)"), e.g. ABCDE1234F.
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'PAN Card Number';
  const PAN = /\b([A-Z]{3})([A-Z])([A-Z])(\d{4})([A-Z])\b/gd;
  const PAN_KW = /\b(?:pan|permanent[ \t]+account[ \t]+number|income[ \t]+tax)\b/i;
  // 4th letter is the holder type: P person, C company, H HUF, F firm, A AOP, T trust, B BOI, L local, J AJP, G govt.
  const HOLDER = /[PCHFATBLJG]/;
  U.register(LABEL, (text) => U.collect(text, PAN, LABEL, (v, m, s, e) => {
    if (U.near(text, s, e, PAN_KW, 30, 0)) return 0.95;
    return HOLDER.test(m[2]) ? 0.88 : 0.65;
  }, 'regex', { rule: 'pan' }));
})(globalThis);
