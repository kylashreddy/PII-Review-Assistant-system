// Small helpers shared by the detectors. Pure functions, no DOM access.
(function (g) {
  'use strict';
  const P = g.PIIRA;

  const TRAIL_PUNCT = /[.,;:!?'"\]}>»”’]/;

  const U = {
    round(n) {
      return Math.round(Math.min(0.99, Math.max(0.01, n)) * 100) / 100;
    },

    /** Build a detection object. */
    make(text, start, end, label, confidence, source, rule) {
      return { text: text.slice(start, end), label, start, end, confidence: U.round(confidence), source, rule };
    },

    /**
     * Run a regex (flags must include g and d) over text and turn matches into
     * detections. `score(value, match, start, end)` returns:
     *   - a number (confidence) to accept,
     *   - null/0 to reject,
     *   - {start, end, confidence} to accept with an adjusted span.
     * opts.group: capture group to label (default 0, the whole match)
     * opts.trim:  strip trailing punctuation such as "." or ")"
     */
    collect(text, re, label, score, source, opts) {
      opts = opts || {};
      const group = opts.group || 0;
      const out = [];
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        const idx = m.indices && m.indices[group];
        if (!idx) continue;
        let s = idx[0];
        let e = idx[1];
        if (opts.trim) e = U.trimTrailing(text, s, e);
        if (e <= s) continue;
        let c = typeof score === 'function' ? score(text.slice(s, e), m, s, e) : score;
        if (c && typeof c === 'object') {
          s = c.start; e = c.end; c = c.confidence;
        }
        if (c == null || !(c > 0) || e <= s) continue;
        out.push(U.make(text, s, e, label, c, source, opts.rule || label));
      }
      return out;
    },

    /** Move `end` left past trailing punctuation and unbalanced ")" characters. */
    trimTrailing(text, s, e) {
      while (e > s) {
        const ch = text[e - 1];
        if (TRAIL_PUNCT.test(ch)) { e--; continue; }
        if (ch === ')') {
          const seg = text.slice(s, e);
          if (U.count(seg, '(') < U.count(seg, ')')) { e--; continue; }
        }
        break;
      }
      return e;
    },

    count(str, ch) {
      let n = 0;
      for (let i = 0; i < str.length; i++) if (str[i] === ch) n++;
      return n;
    },

    digitCount(s) { return (s.match(/\d/g) || []).length; },
    onlyDigits(s) { return s.replace(/\D/g, ''); },

    /** Luhn checksum used by payment cards. */
    luhn(num) {
      let sum = 0;
      let alt = false;
      for (let i = num.length - 1; i >= 0; i--) {
        let d = num.charCodeAt(i) - 48;
        if (d < 0 || d > 9) return false;
        if (alt) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
        alt = !alt;
      }
      return num.length > 0 && sum % 10 === 0;
    },

    /** ISO 13616 IBAN mod-97 check. */
    ibanValid(s) {
      const v = s.replace(/\s+/g, '').toUpperCase();
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) return false;
      const r = v.slice(4) + v.slice(0, 4);
      let rem = 0;
      for (const ch of r) {
        const code = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
        for (const d of code) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
      }
      return rem === 1;
    },

    /** True if `re` (no g flag) matches within `before` chars before / `after` chars after the span. */
    near(text, s, e, re, before, after) {
      const ctx = text.slice(Math.max(0, s - (before || 0)), Math.min(text.length, e + (after || 0)));
      return re.test(ctx);
    },

    escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); },

    /**
     * Case-insensitive regex source for a phrase, without making the whole
     * regex case-insensitive: "Full Name" -> "[Ff][Uu][Ll][Ll][ \t]+[Nn][Aa][Mm][Ee]".
     */
    ci(phrase) {
      let out = '';
      for (const ch of phrase) {
        if (/[A-Za-z]/.test(ch)) out += `[${ch.toUpperCase()}${ch.toLowerCase()}]`;
        else if (ch === ' ') out += '[ \\t]+';
        else if (ch === "'") out += "['’]?";
        else out += U.escapeRe(ch);
      }
      return out;
    },

    /** Alternation of ci() phrases, longest first so "Full Name" beats "Name". */
    ciAny(phrases) {
      return '(?:' + [...phrases].sort((a, b) => b.length - a.length).map(U.ci).join('|') + ')';
    },

    /**
     * Dummy / reserved domains (RFC 2606/6761) such as example.com, example.org,
     * anything.example, *.test, *.invalid, *.localhost. Addresses on these are
     * placeholder data, not PII, so they are never flagged.
     */
    isDummyDomain(domain) {
      const d = String(domain || '').toLowerCase().replace(/^www\./, '').replace(/[.\/]+$/, '');
      return /(?:^|\.)example\.[a-z.]{2,}$/.test(d) || /\.(?:example|test|invalid|localhost)$/.test(d) || d === 'localhost';
    },

    /** First index i in a sorted array with key(arr[i]) >= x (arr.length if none). */
    lowerBound(arr, x, key) {
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((key ? key(arr[mid]) : arr[mid]) < x) lo = mid + 1; else hi = mid;
      }
      return lo;
    },

    /** Short FNV-1a hash of a string, for change detection (not security). */
    hash(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return (h >>> 0).toString(36);
    },

    /** Register a detector. `detect(text)` must return an array of detections. */
    register(label, detect) {
      P.detectors.push({ label, detect });
    },
  };

  P.util = U;
})(globalThis);
