// Rules used by the L2 redaction check (redaction.js). Pure functions.
//
//  sameType(label, text)   is the replacement the same kind of data as the original?
//  sensible(text)          is the replacement real, readable text (not "XXXX" or "[NAME]")?
//  languageReport(text)    which languages a document contains, line by line (sampling imperfection)
//  structure(text)         is the document unstructured (logs, code, OCR noise…)?
(function (g) {
  'use strict';
  const P = g.PIIRA;

  // ------------------------------------------------------------ data type

  const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const DATE_RES = [
    /^\d{1,2}[\/.-]\d{1,2}[\/.-](?:\d{4}|\d{2})$/,
    /^\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}$/,
    new RegExp(`^\\d{1,2}(?:st|nd|rd|th)?(?:\\s+of)?[\\s-]+${MONTH}\\.?,?[\\s-]+(?:\\d{4}|'\\d{2})$`, 'i'),
    new RegExp(`^${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}$`, 'i'),
    new RegExp(`^${MONTH}\\.?,?\\s+\\d{4}$`, 'i'),
  ];
  const ADDRESS_WORD = /\b(?:road|rd|street|st|nagar|layout|cross|main|sector|block|lane|colony|apartment|apartments|apt|flat|floor|tower|society|marg|avenue|ave|village|district|phase|stage|plot|house|building|city|pin)\b/i;

  const digits = (s) => (s.match(/\d/g) || []).length;

  const EMAIL_T = (t) => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(t);
  const PHONE_T = (t) => /^[+\d][\d\s().-]*\d$/.test(t) && digits(t) >= 7 && digits(t) <= 15;
  const USER_T = (t) => /^@?[\w.\-]{2,40}$/.test(t);
  const ADDRESS_T = (t) => t.split(/\s+/).length >= 2 && (/\d/.test(t) || ADDRESS_WORD.test(t) || t.includes(','));
  const IP_T = (t) => /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(t) ||
    (P.ipv6Groups ? P.ipv6Groups(t) > 0 : false) || /^[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}$/.test(t);
  const TOKEN_T = (min) => (t) => new RegExp(`^\\S{${min},}$`).test(t) && /[A-Za-z0-9]/.test(t);

  const TYPE_CHECKS = {
    // PII – Personal
    'Person Name': (t) => /^[\p{L}][\p{L}.'’ -]{0,79}$/u.test(t) && t.split(/\s+/).length <= 6,
    'Person Email': EMAIL_T,
    'Person Phone No': PHONE_T,
    'Person DOB': (t) => DATE_RES.some((re) => re.test(t)),
    'Person Username': USER_T,
    'Person Address': ADDRESS_T,
    // PII – Business
    'Business Name': (t) => /^[\p{L}\d&.,'’() -]{2,100}$/u.test(t) && /\p{L}/u.test(t),
    'Business Email': EMAIL_T,
    'Business Phone No': PHONE_T,
    'Business Username': USER_T,
    'Business Address': ADDRESS_T,
    // PII – Credentials
    'Account Number': (t) => /^[A-Za-z0-9 -]{6,34}$/.test(t) && digits(t) >= 6,
    'IFSC Code': (t) => /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(t),
    'PAN Card Number': (t) => /^[A-Z]{5}\d{4}[A-Z]$/i.test(t),
    'IP/MAC Address': IP_T,
    'API/Private Keys': TOKEN_T(8),
    'Password': TOKEN_T(3),
    'Aadhar Card No': (t) => /^\d{4}[ -]?\d{4}[ -]?\d{4}$/.test(t),
    'Driving License No': (t) => /^[A-Z]{2}[ -]?\d{2}[ -]?[A-Z0-9 -]{8,14}$/i.test(t) && digits(t) >= 9,
    'Voter ID': (t) => /^[A-Z]{3}\d{7}$/i.test(t),
    'Credit/Debit Card No': (t) => (/^[\d -]{13,23}$/.test(t) && digits(t) >= 13) || /^\d{3,4}$/.test(t) || /^\d{2}\s*\/\s*\d{2,4}$/.test(t),
    'UPI ID': (t) => /^[\w.\-]{2,}@[A-Za-z][A-Za-z0-9]{1,30}$/.test(t),
    'Transaction ID': TOKEN_T(8),
    'Invocation ID': TOKEN_T(8),
    'SHA/SSH/Hash Key': (t) => /^[0-9a-f]{32,128}$/i.test(t) || /^(?:ssh-|ecdsa-)\S+\s+\S{20,}/.test(t),
    'VPC ID': (t) => /^vpc-[0-9a-f]{8,17}$/.test(t),
    'Card ID': (t) => /^[a-z]+_[A-Za-z0-9]{8,}$/.test(t),
    'Account ID': (t) => /^\d{12}$/.test(t),
  };

  /** Is `text` the same kind of data as `label`? Unknown labels pass. */
  function sameType(label, text) {
    const check = TYPE_CHECKS[label];
    return check ? check(String(text || '').trim()) : true;
  }

  // ------------------------------------------------------------ sensible

  const PLACEHOLDER = /^[\[<{(].*[\]>})]$/;
  const MASK = /^[xX*#•_?\-]{2,}$|^(?:[xX*#•]{2,}[\s-]?)+\d{0,4}$/;
  const JUNK = /^(?:redacted|removed|masked|hidden|anonymi[sz]ed|n\/?a|null|none|undefined|nan|unknown|test|dummy|sample|placeholder|lorem ipsum.*|asdf\w*|qwerty\w*|xyz|abc|tbd|todo|\?+)$/i;

  /** null if the replacement reads like real text, else a short reason. */
  function sensible(text) {
    const t = String(text || '').trim();
    if (!t) return 'the PII was deleted instead of being replaced';
    if (PLACEHOLDER.test(t)) return `"${t}" is a placeholder, not realistic text`;
    if (MASK.test(t)) return `"${t}" is masked, not realistic text`;
    if (JUNK.test(t)) return `"${t}" is not a realistic value`;
    if (/(.)\1{3,}/.test(t.replace(/\d/g, ''))) return `"${t}" repeats the same character`;
    if (/[\p{L}]{6,}/u.test(t) && !/[aeiouyAEIOUYÀ-ɏऀ-෿]/.test(t)) return `"${t}" looks like random letters`;
    return null;
  }

  // ------------------------------------------------------------ language

  const SCRIPTS = ['Latin', 'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam',
    'Arabic', 'Cyrillic', 'Greek', 'Han', 'Hiragana', 'Katakana', 'Hangul', 'Thai', 'Hebrew'];
  const SCRIPT_RES = SCRIPTS.map((s) => [s, new RegExp(`\\p{Script=${s}}`, 'u')]);
  const SCRIPT_NAMES = { Devanagari: 'Hindi/Marathi (Devanagari)', Oriya: 'Odia', Han: 'Chinese', Hiragana: 'Japanese', Katakana: 'Japanese', Hangul: 'Korean' };

  const STOPWORDS = {
    English: 'the and of to in is for on with that this be are as at by from it or was an your you we will have has not our please',
    Hinglish: 'hai hain ka ki ke ko aur mein main nahi kya kar karo kiya tha thi bhi se par ap aap hum tum yeh woh ho raha rahe',
    Spanish: 'el la de que y en los del las por con para una es su al lo como más pero sus le ya',
    French: 'le la les de des et est une pour dans que qui sur pas au avec vous nous ce il',
    German: 'der die das und ist nicht mit von zu den sie ein eine auf für ich sich',
    Portuguese: 'de que do da em não para os com uma no na por mais você ele ela muito',
    Indonesian: 'yang dan di ke dari untuk dengan ini itu tidak ada akan pada juga',
  };
  const STOP_SETS = Object.fromEntries(Object.entries(STOPWORDS).map(([k, v]) => [k, new Set(v.split(' '))]));

  // ------------------------------------------------------------ language report (line by line)

  // Words shared with English ("main road", "do", "par") never decide a line on their own:
  // a line is another language only with at least 2 different stop words of it, more than English ones.
  function classifyUnit(u, scriptOnly) {
    // Letters plus combining marks (Hindi/Tamil vowel signs belong to their script).
    const letters = u.match(/[\p{L}\p{M}]/gu);
    if (!letters || letters.length < 8) return null;
    if (/[^\x00-\x7F]/.test(u)) {
      const counts = new Map();
      for (const ch of letters) {
        if (ch.charCodeAt(0) < 0x250) { counts.set('Latin', (counts.get('Latin') || 0) + 1); continue; }
        for (const [name, re] of SCRIPT_RES) if (re.test(ch)) { counts.set(name, (counts.get(name) || 0) + 1); break; }
      }
      const other = [...counts.entries()].filter(([k]) => k !== 'Latin').sort((x, y) => y[1] - x[1]);
      const otherN = other.reduce((n, [, c]) => n + c, 0);
      if (other.length && otherN / letters.length >= 0.3) {
        const script = other[0][0];
        return { language: SCRIPT_NAMES[script] || script, letters: letters.length };
      }
    }
    if (scriptOnly) return { language: 'English', letters: letters.length };
    const words = u.toLowerCase().match(/\p{L}{2,}/gu) || [];
    if (words.length < 3) return { language: 'English', letters: letters.length };
    const distinct = new Set(words);
    const hits = {};
    for (const [lang, set] of Object.entries(STOP_SETS)) hits[lang] = [...distinct].filter((w) => set.has(w)).length;
    const [best, n] = Object.entries(hits).filter(([k]) => k !== 'English').sort((x, y) => y[1] - x[1])[0];
    if (n >= 2 && n > hits.English) return { language: best, letters: letters.length };
    return { language: 'English', letters: letters.length };
  }

  /**
   * Which languages a document contains, line by line.
   * @returns {verdict:'english'|'mixed'|'other', share, totalLetters, byLanguage:{lang:{letters, lines}},
   *           segments:[{start, end, language, line, lines}], summary, reason}
   */
  function languageReport(text, opts) {
    const scriptOnly = Boolean(opts && opts.scriptOnly);
    const units = [];
    let pos = 0;
    let line = 1;
    for (const raw of text.split('\n')) {
      // Long lines (paragraphs) are judged sentence by sentence.
      if (raw.length > 400) {
        const re = /[^.!?।]+[.!?।]*\s*/g;
        let m;
        while ((m = re.exec(raw)) !== null) { if (m[0].trim()) units.push({ start: pos + m.index, end: pos + m.index + m[0].trimEnd().length, line }); if (!m[0]) break; }
      } else if (raw.trim()) {
        units.push({ start: pos, end: pos + raw.length, line });
      }
      pos += raw.length + 1;
      line++;
    }
    const byLanguage = {};
    const segments = [];
    let total = 0;
    for (const u of units) {
      const c = classifyUnit(text.slice(u.start, u.end), scriptOnly);
      if (!c) continue;
      total += c.letters;
      const entry = byLanguage[c.language] || (byLanguage[c.language] = { letters: 0, lines: new Set() });
      entry.letters += c.letters;
      entry.lines.add(u.line);
      if (c.language === 'English') continue;
      const last = segments[segments.length - 1];
      if (last && last.language === c.language && u.line - last.lastLine <= 1) {
        last.end = u.end; last.lastLine = u.line;
      } else {
        segments.push({ start: u.start, end: u.end, language: c.language, line: u.line, lastLine: u.line });
      }
    }
    const langs = Object.entries(byLanguage).map(([language, v]) => ({ language, letters: v.letters, lines: v.lines.size,
      share: total ? v.letters / total : 0 })).sort((x, y) => y.letters - x.letters);
    const others = langs.filter((l) => l.language !== 'English');
    const otherLetters = others.reduce((n, l) => n + l.letters, 0);
    const share = total ? otherLetters / total : 0;
    const verdict = !others.length ? 'english' : share >= 0.5 ? 'other' : 'mixed';
    const pct = (x) => (x > 0 && x < 0.01 ? '<1' : String(Math.round(x * 100))) + '%';
    const where = segments.map((sg) => (sg.line === sg.lastLine ? `${sg.line}` : `${sg.line}–${sg.lastLine}`));
    const wherePhrase = where.length > 6 ? `${where.slice(0, 6).join(', ')} and ${where.length - 6} more` : where.join(', ');
    const names = others.map((l) => `${l.language} ${pct(l.share)} of the text (${l.lines} line${l.lines > 1 ? 's' : ''})`);
    const summary = verdict === 'english' ? 'The document is in English.'
      : verdict === 'other' ? `The document is mostly not in English: ${names.join('; ')}.`
        : `The document is mostly English but contains other language: ${names.join('; ')}.`;
    const reason = verdict === 'english' ? '' : `Task contains non-English text — ${names.join('; ')}; lines ${wherePhrase}. ` +
      'Flagged as other language (sampling imperfection).';
    return { verdict, share, totalLetters: total, languages: langs, segments: segments.map(({ lastLine, ...sg }) => ({ ...sg, lines: lastLine - sg.line + 1, lastLine })),
      summary, reason, where: wherePhrase };
  }

  // ------------------------------------------------------------ structure

  /** Returns null for normal prose/forms, else {reasons: [...]} for unstructured text. */
  function structure(text) {
    const t = text.trim();
    if (t.length < 300) return null;
    const reasons = [];
    const chars = t.replace(/\s/g, '');
    const symbols = (chars.match(/[^\p{L}\p{N}.,:;'"()?!-]/gu) || []).length / (chars.length || 1);
    if (symbols > 0.18) reasons.push(`${Math.round(symbols * 100)}% symbols`);
    const tokens = t.split(/\s+/);
    const longTokens = tokens.filter((w) => w.length > 40).length;
    if (longTokens >= 3 || longTokens / tokens.length > 0.02) reasons.push('long runs of characters without spaces');
    const mixed = tokens.filter((w) => w.length >= 5 && /\p{L}/u.test(w) && /\d/.test(w) && /[^\p{L}\p{N}]/u.test(w.replace(/[.,;:]$/, ''))).length;
    if (mixed / tokens.length > 0.12) reasons.push('many garbled words mixing letters, digits and symbols');
    const code = (t.match(/[{}<>;=]|=>|\(\)|<\/?\w+>|^\s*[\w$]+\s*[:=]\s*[\[{]/gm) || []).length / tokens.length;
    if (code > 0.15) reasons.push('looks like code, markup or a data dump');
    const sentenceEnds = (t.match(/[.!?](?:\s|$)/g) || []).length;
    const lines = t.split('\n').filter((l) => l.trim());
    const fieldLines = lines.filter((l) => /^[^:]{1,40}:\s*\S/.test(l)).length;
    if (sentenceEnds < t.length / 600 && fieldLines < lines.length * 0.3 && tokens.length > 120) reasons.push('almost no sentences or form fields');
    return reasons.length >= 2 ? { reasons } : null;
  }

  P.redactionRules = { sameType, sensible, languageReport, structure };
})(globalThis);
