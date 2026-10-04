// Person Username / Business Username (guide: "Login ID, handle or social media
// username" vs "Company account, portal or social handle").
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;

  // @ravi_k — not part of an email (no word char before "@"), must start with a letter or "_".
  const HANDLE = /(?<![\w.@\/])@[A-Za-z_][A-Za-z0-9_.]{1,29}/gd;

  // A profile link after the key ("GitHub: github.com/ravi-k") gives the handle after the domain.
  const KEY_VALUE = /\b(?:user[ \t]?name|user[ \t]?id|log[ \t]?in[ \t]?(?:id|name)|login|screen[ \t]?name|handle|user|twitter|instagram|github|gitlab|linkedin|telegram|skype)\b["']?[ \t]*[:=\-][ \t]*["']?(?:(?:https?:\/\/)?(?:www\.)?[a-z]+\.(?:com|me|in|io)\/(?:in\/)?)?(@?[A-Za-z0-9_.\-]{2,40})/gid;

  const BUSINESS_HANDLE = /(?:official|_hq|hq_|_india\b|india_|^_?in_|support|care|_team|team_|corp|_inc|_ltd|store|shop|brand|company|global|news|helpdesk|_co$)/i;
  const BUSINESS_KW = /\b(?:company|brand|official|corporate|business|our|page|portal account|organisation|organization)\b/i;

  function owner(text, s, value) {
    const before = text.slice(Math.max(0, s - 40), s);
    if (BUSINESS_HANDLE.test(value.replace(/^@/, '')) || BUSINESS_KW.test(before.slice(before.lastIndexOf('\n') + 1))) {
      return 'Business Username';
    }
    return 'Person Username';
  }

  function detect(text) {
    const out = [
      ...U.collect(text, HANDLE, 'Person Username', 0.85, 'regex', { trim: true, rule: 'username-handle' }),
      ...U.collect(text, KEY_VALUE, 'Person Username', (v, m, s, e) => {
        if (text.slice(e, e + 3) === '://' || text[e] === '@' || text[e] === '/') return null; // URL or email follows
        return /[A-Za-z0-9]/.test(v) ? 0.9 : null;
      }, 'regex', { group: 1, trim: true, rule: 'username-key-value' }),
    ];
    for (const d of out) d.label = owner(text, d.start, d.text);
    return out;
  }

  U.register('Person Username', detect);
})(globalThis);
