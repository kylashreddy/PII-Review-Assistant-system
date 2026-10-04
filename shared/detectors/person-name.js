// Person Name (heuristic): names after titles (Mr/Ms/Dr/Shri/Smt…), after
// form fields ("Name:", "Account Holder:"), after salutations ("Dear …"),
// in sign-offs, after S/O-D/O-W/O, a name alone on the first line (resumes),
// plus repeats of names already found.
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'Person Name';

  // One name word: Ravi · O'Brien · Rao-Patil · McDonald · RAVI · R.
  const TOKEN = "(?:[A-Z][a-z]+(?:[A-Z][a-z]+)?(?:['’-][A-Za-z]+)?|[A-Z]{2,}(?![A-Za-z])|[A-Z]\\.)";
  const SEP = '(?:[ \\t]+|(?<=\\.)(?=[A-Z]))';
  const NAME = `(${TOKEN}(?:${SEP}${TOKEN}){0,3})`;
  const TOKEN_RE = new RegExp(TOKEN, 'g');

  // Capitalised words that are never part of a name; a name is cut at the first one.
  const STOP = new Set((
    'address addr phone mobile mob tel ph email e-mail date dob road rd street st nagar layout bank ltd pvt private limited inc llc llp corp ' +
    'the and of for from to at in on by with account customer number no dear sir madam team manager policy name city state india ' +
    'regards thanks thank sincerely mr mrs ms dr hi hello contact id pan aadhaar office company department ref subject re please kindly ' +
    'yours signature signed fax gst gstin invoice amount total branch ifsc website url username password pin otp apartment apartments flat ' +
    'floor cross main sector block colony lane tower phase stage user login card vehicle registration reg world all everyone there valued ' +
    'friends folks members staff support sales admin hr employee employer client applicant nominee holder father mother spouse guardian ' +
    'desk loan care helpdesk management operations accounts billing service services department branch bank head ' +
    'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december'
  ).split(/\s+/));

  const TITLES = ['Mr', 'Mrs', 'Ms', 'Miss', 'Mx', 'Dr', 'Prof', 'Shri', 'Smt', 'Sri', 'Kum', 'Kumari', 'Capt', 'Col', 'Adv', 'Er'];
  const FIELDS = [
    'Name', 'Full Name', 'Customer Name', 'Client Name', 'Applicant Name', 'Applicant', 'Account Holder Name', 'Account Holder',
    'Account Name', 'Nominee Name', 'Nominee', "Father's Name", 'Father Name', "Mother's Name", 'Mother Name', 'Spouse Name',
    'Guardian Name', 'Guardian', 'Employee Name', 'Patient Name', 'Student Name', 'Candidate Name', 'Beneficiary Name',
    'Beneficiary', 'Holder Name', 'Contact Person', 'Signed by', 'Prepared by', 'Approved by', 'Reviewed by',
    'Authorised Signatory', 'Authorized Signatory', 'First Name', 'Last Name', 'Surname',
  ];
  const SALUTATIONS = ['Dear', 'Hi', 'Hello', 'Hey', 'Attn', 'Attention'];
  const SIGNOFFS = ['Regards', 'Best regards', 'Kind regards', 'Warm regards', 'Sincerely', 'Thanks', 'Thank you',
    'Best', 'Cheers', 'Yours truly', 'Yours sincerely', 'Yours faithfully'];
  const RELATIONS = ['S/O', 'D/O', 'W/O', 'C/O', 'son of', 'daughter of', 'wife of', 'husband of'];

  const RULES = [
    // Titles are matched as written ("Mr") or in capitals ("MR"), never lower-case,
    // so "I miss Delhi" is not read as a title.
    { rule: 'name-title', c: 0.85, re: new RegExp(`\\b(?:${TITLES.flatMap((t) => [t, t.toUpperCase()]).join('|')})(?:\\.[ \\t]*|[ \\t]+)${NAME}`, 'gd') },
    { rule: 'name-field', c: 0.85, re: new RegExp(`\\b${U.ciAny(FIELDS)}[ \\t]*[:\\-–][ \\t]*${NAME}`, 'gd'), field: true },
    { rule: 'name-relation', c: 0.85, re: new RegExp(`(?<![A-Za-z])${U.ciAny(RELATIONS)}[ \\t]*[:\\-]?[ \\t]*${NAME}`, 'gd') },
    // "my name is Rohit Verma", Hinglish "mera naam Rohit Verma hai"
    { rule: 'name-intro', c: 0.8, re: new RegExp(`\\b${U.ciAny(['my name is', 'mera naam', 'mera name', 'myself', 'this is'])}[ \\t]*[:,-]?[ \\t]+${NAME}`, 'gd') },
    { rule: 'name-salutation', c: 0.75, re: new RegExp(`\\b${U.ciAny(SALUTATIONS)}[ \\t]*[:,]?[ \\t]+${NAME}`, 'gd') },
    { rule: 'name-signoff', c: 0.75, re: new RegExp(`\\b${U.ciAny(SIGNOFFS)}[ \\t]*,?[ \\t]*\\r?\\n[ \\t]*${NAME}`, 'gd') },
  ];

  // "Company Name:", "File Name:" etc. are not people.
  const NON_PERSON_FIELD = /(?:company|business|firm|bank|organi[sz]ation|product|file|domain|user|place|brand|shop|store|project|branch|event|plan|scheme|course|app|device|host|server|vendor|merchant)[ \t]*$/i;

  /** Cut a captured name at the first stop word; returns new end offset or -1. */
  function trimName(text, s, e) {
    const value = text.slice(s, e);
    TOKEN_RE.lastIndex = 0;
    let m;
    let end = -1;
    let words = 0;
    while ((m = TOKEN_RE.exec(value)) !== null) {
      const word = m[0].replace(/\.$/, '').toLowerCase();
      if (STOP.has(word)) break;
      end = m.index + m[0].length;
      if (m[0].length > 2 || /^[A-Z][a-z]$/.test(m[0])) words++;
    }
    if (end <= 0 || words === 0) return -1;
    return s + end;
  }

  // The first line of a resume or profile is usually the person's name: two to four
  // capitalised words and nothing else ("Ananya Rao Kulkarni"), not a title ("Key Skills").
  const HEADING_WORDS = new Set(('resume curriculum vitae cv profile summary objective skills experience education contact ' +
    'details information personal report invoice statement letter agreement form application certificate receipt notice ' +
    'minutes meeting notes policy offer document page annual monthly quarterly project proposal plan schedule key').split(' '));
  const FIRST_LINE = /^\s*([A-Z][a-z]+(?:[ \t]+(?:[A-Z]\.|[A-Z][a-z]+)){1,3})[ \t]*(?:\r?\n|$)/d;
  function firstLineName(text) {
    const m = FIRST_LINE.exec(text.slice(0, 200));
    if (!m) return [];
    const [s, e] = m.indices[1];
    const words = m[1].split(/[ \t]+/);
    if (words.some((w) => STOP.has(w.toLowerCase()) || HEADING_WORDS.has(w.toLowerCase()))) return [];
    if (P.knownNames.lookup(m[1])) return [];
    return [{ label: LABEL, start: s, end: e, text: m[1], confidence: 0.8, source: 'heuristic', rule: 'name-first-line' }];
  }

  function detect(text) {
    const out = firstLineName(text);
    for (const r of RULES) {
      out.push(...U.collect(text, r.re, LABEL, (v, m, s, e) => {
        if (r.field && NON_PERSON_FIELD.test(text.slice(Math.max(0, m.index - 20), m.index))) return null;
        const end = trimName(text, s, e);
        if (end < 0) return null;
        return { start: s, end, confidence: r.c };
      }, 'heuristic', { group: 1, rule: r.rule }));
    }
    return out.concat(propagate(text, out));
  }

  // Once "Ravi Kumar Sharma" is found, flag its other appearances too.
  function propagate(text, found) {
    const extra = [];
    const taken = found.map((d) => [d.start, d.end]);
    const fulls = new Set();
    const parts = new Set();
    for (const d of found) {
      if (d.confidence < 0.75) continue;
      const words = d.text.split(/[ \t]+/).filter((w) => w.length >= 3 && !/\.$/.test(w));
      if (words.length >= 2) fulls.add(d.text);
      for (const w of words) if (!STOP.has(w.toLowerCase())) parts.add(w);
    }
    // One pass with a combined pattern (longest names first) instead of one scan per name —
    // large documents can contain thousands of names.
    const needles = [...fulls].sort((a, b) => b.length - a.length).concat([...parts].sort((a, b) => b.length - a.length));
    if (!needles.length) return extra;
    taken.sort((a, b) => a[0] - b[0]);
    const covered = (s, e) => {
      const i = U.lowerBound(taken, s, (t) => t[0]);
      return (i < taken.length && taken[i][0] < e) || (i > 0 && taken[i - 1][1] > s);
    };
    const CHUNK = 400; // keep each alternation regex a reasonable size
    const hits = [];
    for (let c = 0; c < needles.length; c += CHUNK) {
      const re = new RegExp(`(?<![A-Za-z])(?:${needles.slice(c, c + CHUNK).map(U.escapeRe).join('|')})(?![A-Za-z])`, 'gd');
      hits.push(...U.collect(text, re, LABEL, (v) => (fulls.has(v) ? 0.8 : 0.65), 'heuristic', { rule: 'name-repeat' }));
    }
    hits.sort((a, b) => (b.end - b.start) - (a.end - a.start));
    for (const d of hits) {
      if (covered(d.start, d.end)) continue;
      d.rule = fulls.has(d.text) ? 'name-repeat-full' : 'name-repeat-part';
      const i = U.lowerBound(taken, d.start, (t) => t[0]);
      taken.splice(i, 0, [d.start, d.end]);
      extra.push(d);
    }
    return extra;
  }

  U.register(LABEL, detect);
})(globalThis);
