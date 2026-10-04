// Invocation ID (guide: "Unique ID for a single run of a cloud function").
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'Invocation ID';
  // "Invocation ID: …", "RequestId: …" (AWS Lambda logs), "execution id …"
  const KEYWORD = /\b(?:invocation|execution|request|correlation|function[ \t]+run)[ \t_-]?id\b["']?[ \t]*[:=\-]?[ \t]*["']?([A-Za-z0-9][A-Za-z0-9-]{11,80})/gid;
  U.register(LABEL, (text) => U.collect(text, KEYWORD, LABEL, (v) => (/\d/.test(v) && /[a-z]/i.test(v) ? 0.9 : null),
    'regex', { group: 1, trim: true, rule: 'invocation-keyword' }));
})(globalThis);
