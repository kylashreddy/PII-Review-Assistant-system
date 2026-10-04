// Password (guide: "Passwords, PINs, OTPs, security answers").
// Only the secret value is labeled, not the keyword in front of it.
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'Password';

  // keyword  (is | : | = | -)  value.  "pin code" / "pincode" are postal codes, so they are excluded.
  const KEY_VALUE = new RegExp(
    String.raw`\b(pass(?:word|wd|code|phrase)?|pwd|m?pin(?![ \t]*code)|otp|security[ \t]+(?:answer|question[ \t]+answer)|secret[ \t]+answer|memorable[ \t]+(?:word|answer)|mother'?s[ \t]+maiden[ \t]+name)\b["']?[ \t]*(?:is[ \t]*:?|[:=]|-(?!>))[ \t]*["']?([^\s,;"']{3,})`,
    'gid'
  );

  // "Your OTP is 482913", "verification code for login: 7731"
  const OTP = /\b(?:OTP|one[ \t-]time[ \t]+(?:password|passcode|pin)|verification[ \t]+code|security[ \t]+code)\b[^\d\n]{0,30}?(?<!\d)(\d{4,8})(?!\d)/gid;

  function score(v, m) {
    const kw = m[1].toLowerCase();
    if (/^(?:m?pin|otp)$/.test(kw)) {
      if (!/^\d{3,8}$/.test(v)) return /\d/.test(v) ? 0.6 : null;
      return kw.endsWith('pin') && v.length === 6 ? 0.6 : 0.9; // a 6-digit "PIN" may be a postal PIN code
    }
    if (/answer|maiden|memorable/.test(kw)) return 0.85;
    // Looks like a real secret if it has a digit, symbol or mixed case.
    if (/\d|[^A-Za-z]/.test(v) || (/[a-z]/.test(v) && /[A-Z]/.test(v))) return 0.9;
    return 0.6; // "The password is strong" — plain word, let a human decide.
  }

  function detect(text) {
    return [
      ...U.collect(text, KEY_VALUE, LABEL, score, 'regex', { group: 2, trim: true, rule: 'password-key-value' }),
      ...U.collect(text, OTP, LABEL, 0.9, 'regex', { group: 1, rule: 'password-otp' }),
    ];
  }

  U.register(LABEL, detect);
})(globalThis);
