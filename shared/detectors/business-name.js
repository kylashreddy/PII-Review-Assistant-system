// Business Name (heuristic): capitalised words ending in a company suffix
// (Pvt Ltd, Ltd, Inc, LLC, Corp, Technologies…), "Company: …" fields and
// "Bank of …" names. Names on the business names list (Google, Infosys, HDFC Bank…) are excluded.
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'Business Name';

  const WORD = "(?:[A-Z][A-Za-z0-9&'’.\\-]*|&)";
  const JOIN = '(?:[ \\t]+(?:and|of|&|the|for))?[ \\t]+';
  const LEGAL = '(?:Pvt\\.?[ \\t]*Ltd|Private[ \\t]+Limited|Pte\\.?[ \\t]+Ltd|Ltd|Limited|Inc|Incorporated|LLC|L\\.L\\.C|LLP|Corp|Corporation|PLC|GmbH|Co)';
  const GENERIC = '(?:Technologies|Technology|Tech|Solutions|Industries|Enterprises|Group|Services|Systems|Consultants|Consulting|Labs|' +
    'Software|Infotech|Infosystems|Associates|Traders|Trading|Exports|Imports|Foundation|Trust|Hospitals?|Clinic|Bank|Insurance|Motors|' +
    'Pharma|Pharmaceuticals|Logistics|Holdings|Ventures|Capital|Finance|Agency|Studios?|Media|Networks|Electronics|Textiles|' +
    'Constructions?|Builders|Developers|Realty|Foods|Retail|Mart|Stores|Company)';

  const SUFFIXED = new RegExp(
    `(?<![A-Za-z0-9&])(?:${WORD}${JOIN}){1,5}(${LEGAL}|${GENERIC})\\.?(?![A-Za-z])`,
    'gd'
  );
  const LEGAL_RE = new RegExp(`(?<![A-Za-z])${LEGAL}\\.?(?![A-Za-z])`);
  const SUFFIX_WORD = new RegExp(`^(?:${LEGAL}|${GENERIC}|Pvt|Private|Pte)\\.?$`);

  const FIELD = new RegExp(
    `\\b${U.ciAny(['Company', 'Company Name', 'Employer', 'Organisation', 'Organization', 'Firm', 'Business', 'Business Name',
      'Merchant', 'Vendor', 'Supplier', 'Client Company', 'Insurer', 'Bank', 'Bank Name'])}[ \\t]*[:\\-–][ \\t]*(${WORD}(?:${JOIN}${WORD}){0,5})`,
    'gd'
  );
  const BANK_OF = /\b(?:(?:State|Central|Union|Reserve|Punjab[ \t]+National)[ \t]+)?Bank[ \t]+of[ \t]+[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)?/gd;

  // "Information Technology", "Financial Services": a field of work, not a company,
  // when one of these words is all there is before the generic suffix.
  const FIELD_OF_WORK = new Set(('information computer computing financial medical health healthcare food data digital software ' +
    'business mechanical electrical electronic civil chemical biomedical industrial engineering education legal banking ' +
    'customer it cloud web mobile network security').split(' '));

  // Capitalised words that start a sentence rather than a company name.
  const LEAD_STOP = new Set(('the a an at in on for from with by to and of our your this that these those dear mr mrs ms dr hi hello ' +
    'employer company client vendor via per as is was we i he she they it my his her their contact call visit please').split(' '));

  function trimLead(text, s, e) {
    const re = /\S+/g;
    const seg = text.slice(s, e);
    let m;
    let offset = 0;
    while ((m = re.exec(seg)) !== null) {
      if (!LEAD_STOP.has(m[0].toLowerCase())) { offset = m.index; break; }
      offset = m.index + m[0].length;
    }
    return s + offset;
  }

  function detect(text) {
    const out = [];
    out.push(...U.collect(text, SUFFIXED, LABEL, (v, m, s, e) => {
      const start = trimLead(text, s, e);
      const kept = text.slice(start, e).split(/[ \t]+/).filter(Boolean);
      const nonSuffix = kept.filter((w) => !SUFFIX_WORD.test(w) && !/^(?:and|of|&|the|for)$/.test(w));
      if (!nonSuffix.length) return null;
      const legal = LEGAL_RE.test(text.slice(start, e));
      if (!legal && nonSuffix.length === 1 && FIELD_OF_WORK.has(nonSuffix[0].toLowerCase())) return null;
      let c;
      if (legal) c = 0.9;
      else c = nonSuffix.length >= 2 ? 0.75 : 0.65;
      // "Inc." keeps its dot mid-sentence, but a sentence-ending "." is dropped.
      let end = e;
      if (text[end - 1] === '.' && !/^[ \t]*[a-z,;)]/.test(text.slice(end))) end--;
      return { start, end, confidence: c };
    }, 'heuristic', { rule: 'business-suffix' }));

    out.push(...U.collect(text, FIELD, LABEL, (v, m, s, e) => {
      // A field value ends at its legal suffix ("… Pvt Ltd") or at the end of the sentence.
      const legal = new RegExp(`(?:^|[ \\t])${LEGAL}\\.?(?=[ \\t]|$)`).exec(v);
      const sentence = /\.[ \t]+(?=[A-Z])/.exec(v);
      let cut = v.length;
      if (legal) cut = Math.min(cut, legal.index + legal[0].length);
      if (sentence) cut = Math.min(cut, sentence.index);
      let val = v.slice(0, cut);
      const trailing = /(?:[ \t]+(?:and|of|&|the|for))+$/.exec(val);
      if (trailing) val = val.slice(0, -trailing[0].length);
      val = val.replace(/\.$/, (dot) => (/(?:Ltd|Inc|Co|Corp)\.$/.test(val) ? dot : ''));
      return { start: s, end: s + val.length, confidence: 0.8 };
    }, 'heuristic', { group: 1, trim: true, rule: 'business-field' }));

    out.push(...U.collect(text, BANK_OF, LABEL, 0.85, 'heuristic', { rule: 'business-bank-of' }));
    return withoutKnownNames(text, out);
  }

  // Project rule: names on the business names list (data/business-names.json) are
  // not Business Name PII. Handles a short match inside a known name, and
  // "Google Inc. and Acme Traders" (only Acme Traders is kept).
  function withoutKnownNames(text, list) {
    const isKnown = (t) => Boolean(P.knownNames.lookup(t));
    const knownSpans = P.knownNames.findIn(text);
    const known = [];
    const kept = [];
    for (const d of list) {
      const parts = [];
      const re = /\s+(?:and|&)\s+/g;
      let last = 0;
      let m;
      while ((m = re.exec(d.text)) !== null) { parts.push([last, m.index]); last = m.index + m[0].length; }
      parts.push([last, d.text.length]);
      const knownParts = parts.filter(([a, b]) => isKnown(d.text.slice(a, b)));
      if (isKnown(d.text) || knownParts.length === parts.length) { known.push(d); continue; }
      if (!knownParts.length) { kept.push(d); continue; }
      known.push(...knownParts.map(([a, b]) => ({ start: d.start + a, end: d.start + b })));
      for (const [a, b] of parts) {
        if (knownParts.some((k) => k[0] === a)) continue;
        if (/\s/.test(d.text.slice(a, b)) || /(?:Ltd|Limited|Inc|LLC|LLP|Corp)/.test(d.text.slice(a, b))) {
          kept.push(U.make(text, d.start + a, d.start + b, LABEL, d.confidence, d.source, d.rule));
        }
      }
    }
    // Also drop a detection that sits inside a known name found in the text ("State Bank" in "State Bank of India").
    const blocked = known.concat(knownSpans);
    return kept.filter((d) => !blocked.some((k) => d.start >= k.start && d.end <= k.end) && !known.some((k) => d.start < k.end && d.end > k.start));
  }

  U.register(LABEL, detect);
})(globalThis);
