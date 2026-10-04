// Person Phone No / Business Phone No (guide: "Mobile or landline number of an
// individual" vs "Office, helpline or company phone number").
//   - toll-free (1800 / 1860) or office/helpline/support words nearby -> Business Phone No
//   - mobile numbers                                                 -> Person Phone No
//   - landlines with no context                                      -> Business Phone No (lower confidence)
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;

  const BUSINESS_KW = /\b(?:office|offices|helpline|help[ -]?line|toll[ -]?free|customer[ -]?(?:care|support|service)|support|reception|front[ -]?desk|branch|head[ -]?office|company|corporate|board(?:[ -]?line)?|fax|sales|enquir(?:y|ies)|call[ -]?cent(?:re|er)|hotline|service[ -]?cent(?:re|er)|store|showroom|our)\b/i;
  const PERSON_KW = /\b(?:mobile|mob|cell|personal|whatsapp|my|his|her|home|residence|father|mother|spouse|wife|husband|guardian|nominee|alternate)\b/i;

  // +91 98450 12345 · 098450-12345 · 9845012345 · 0091 9845012345
  const MOBILE = /(?<![\w+])(?:(?:\+|00)?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/gd;
  // 080-2345-6789 · (080) 2345 6789 · 080 4567 8900 · +91 80 2345 6789
  const LANDLINE = /(?<![\w+])(?:\+91[\s-]?\(?0?\d{2,4}\)?|\(?0\d{2,4}\)?)[\s-]\d{3,4}[\s-]?\d{4}(?!\d)/gd;
  // 1800 123 4567 · 1800-419-0000 · 1860 500 1111
  const TOLL_FREE = /(?<![\w+])18[06]0[\s-]?\d{3}[\s-]?\d{3,4}(?!\d)/gd;
  // +1 (415) 555-2671 · +44 20 7946 0958
  const INTERNATIONAL = /(?<![\w+])\+(?!91)\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}(?!\d)/gd;
  // 98xxx xxxxx · +91 98XXX XXX45
  const MASKED = /(?<![\w+])(?:\+?91[\s-]?)?[6-9][\dXx*•]{4}[\s-]?[\dXx*•]{5}(?![\w*•])/gd;
  // "Phone: …" / "Mobile No. …" followed by digits or a masked number.
  const KEYWORD = /\b(?:phone|ph|mobile|mob|tel|telephone|contact|cell|whatsapp|landline|fax|helpline)\b\.?[ \t]*(?:no\.?|number|#)?[ \t]*[:\-]?[ \t]*(\+?[\dXx*•(][\dXx*• \t().-]{6,20}[\dXx*•])/gid;

  /** Decide Person vs Business from the nearest keyword just before the number. */
  function owner(text, s, fallback) {
    const before = text.slice(Math.max(0, s - 45), s);
    const lastLine = before.slice(before.lastIndexOf('\n') + 1);
    const lastHit = (re) => {
      const g = new RegExp(re.source, 'gi');
      let pos = -1;
      let m;
      while ((m = g.exec(lastLine)) !== null) pos = m.index;
      return pos;
    };
    const b = lastHit(BUSINESS_KW);
    const p = lastHit(PERSON_KW);
    if (b === -1 && p === -1) return fallback;
    return b > p ? 'Business Phone No' : 'Person Phone No';
  }

  function detect(text) {
    const out = [];
    const add = (re, rule, score, fallback, group) => {
      for (const d of U.collect(text, re, 'Person Phone No', score, 'regex', { rule, group })) {
        d.label = owner(text, d.start, fallback);
        out.push(d);
      }
    };
    add(TOLL_FREE, 'phone-toll-free', 0.95, 'Business Phone No');
    add(MOBILE, 'phone-mobile', (v) => { const n = U.digitCount(v); return n >= 10 && n <= 13 ? 0.95 : null; }, 'Person Phone No');
    add(LANDLINE, 'phone-landline', (v) => { const n = U.digitCount(v); return n >= 10 && n <= 13 ? 0.82 : null; }, 'Business Phone No');
    add(INTERNATIONAL, 'phone-international', (v) => { const n = U.digitCount(v); return n >= 8 && n <= 15 ? 0.86 : null; }, 'Person Phone No');
    add(MASKED, 'phone-masked', (v) => (/[Xx*•]/.test(v) && U.digitCount(v) >= 2 ? 0.8 : null), 'Person Phone No');
    add(KEYWORD, 'phone-keyword', (v) => {
      const real = U.digitCount(v);
      const total = (v.match(/[\dXx*•]/g) || []).length;
      if (real < 2 || total < 8 || total > 13) return null;
      return /[Xx*•]/.test(v) ? 0.85 : 0.9;
    }, 'Person Phone No', 1);
    // Toll-free numbers are always business numbers, whatever words are nearby.
    for (const d of out) if (d.rule === 'phone-toll-free') d.label = 'Business Phone No';
    return out;
  }

  U.register('Person Phone No', detect);
})(globalThis);
