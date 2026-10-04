// Aadhar Card No (guide: "12-digit unique ID number"), e.g. 1234 5678 9012.
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'Aadhar Card No';
  const AADHAAR_KW = /\b(?:aadhaa?r|adhaa?r|uid|uidai|enrol(?:l)?ment)\b/i;
  const OTHER_KW = /\b(?:a\/c|account|card|bank|phone|mobile|aws|order|invoice|txn|transaction)\b/i;
  const SPACED = /(?<![\d-])\d{4}[ -]\d{4}[ -]\d{4}(?![\d-])/gd;
  const PLAIN = /(?<![\w.\/-])\d{12}(?![\w.\/-])/gd;
  const MASKED = /(?<![\w*•])[Xx*•]{4}[ -]?[Xx*•]{4}[ -]?\d{4}(?![\w])/gd;

  // Verhoeff checksum, used by real Aadhaar numbers.
  const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],
    [5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  const PERM = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],
    [4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  const verhoeff = (num) => { let c = 0; const a = num.split('').reverse().map(Number); a.forEach((d, i) => { c = D[c][PERM[i % 8][d]]; }); return c === 0; };

  U.register(LABEL, (text) => {
    const spaced = (v, m, s, e) => {
      const d = U.onlyDigits(v);
      if (U.near(text, s, e, AADHAAR_KW, 40, 0)) return 0.95;
      if (U.near(text, s, e, OTHER_KW, 30, 0)) return null;
      if (/^[01]/.test(d)) return null; // real Aadhaar numbers never start with 0 or 1
      return verhoeff(d) ? 0.85 : 0.6;
    };
    const withKeyword = (c) => (v, m, s, e) => (U.near(text, s, e, AADHAAR_KW, 40, 0) ? c : null);
    return [
      ...U.collect(text, SPACED, LABEL, spaced, 'regex', { rule: 'aadhaar-spaced' }),
      ...U.collect(text, PLAIN, LABEL, withKeyword(0.95), 'regex', { rule: 'aadhaar-plain' }),
      ...U.collect(text, MASKED, LABEL, withKeyword(0.9), 'regex', { rule: 'aadhaar-masked' }),
    ];
  });
  P.verhoeff = verhoeff;
})(globalThis);
