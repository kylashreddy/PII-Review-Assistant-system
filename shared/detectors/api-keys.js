// API/Private Keys (guide: "Secret keys, tokens, SSH/private keys").
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'API/Private Keys';

  // api_key=…  secret: …  access token - …  client_secret="…"
  const KEY_VALUE = new RegExp(
    String.raw`\b(api[_ \t-]?key|api[_ \t-]?secret|secret(?:[_ \t-]?key)?|client[_ \t-]?secret|(?:(?:access|auth|refresh|bearer|session)[_ \t-]?)?token|private[_ \t-]?key|access[_ \t-]?key(?:[_ \t-]?id)?)\b["']?[ \t]*(?:is[ \t]*:?|[:=]|-(?!>))[ \t]*["']?([^\s,;"']{8,})`,
    'gid'
  );
  const BEARER = /\bBearer[ \t]+([A-Za-z0-9._~+\/-]{16,}=*)/gd;

  // Well-known key formats.
  const KNOWN_KEYS = [
    [/\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}/gd, 'key-sk'],
    [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/gd, 'key-stripe'],
    [/\bAKIA[0-9A-Z]{16}\b/gd, 'key-aws'],
    [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/gd, 'key-github'],
    [/\bAIza[0-9A-Za-z_-]{35}\b/gd, 'key-google'],
    [/\bxox[baprs]-[A-Za-z0-9-]{10,}/gd, 'key-slack'],
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gd, 'key-jwt'],
    [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/gd, 'key-private'],
  ];

  function detect(text) {
    const out = [
      ...U.collect(text, KEY_VALUE, LABEL, (v) => (/\d/.test(v) || /[A-Z]/.test(v) && /[a-z]/.test(v) || v.length >= 20 ? 0.9 : 0.6),
        'regex', { group: 2, trim: true, rule: 'key-value' }),
      ...U.collect(text, BEARER, LABEL, 0.95, 'regex', { group: 1, rule: 'key-bearer' }),
    ];
    for (const [re, rule] of KNOWN_KEYS) out.push(...U.collect(text, re, LABEL, 0.95, 'regex', { rule }));
    return out;
  }

  U.register(LABEL, detect);
})(globalThis);
