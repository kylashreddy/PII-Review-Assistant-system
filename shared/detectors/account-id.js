// Account ID (guide: "12-digit cloud account number (e.g. AWS)"), e.g. 125636728392.
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'Account ID';
  const KEYWORD = /\b(?:aws[ \t]+account(?:[ \t]+(?:id|number|no\.?))?|account[ \t]*id|cloud[ \t]+account(?:[ \t]+id)?|owner[ \t]*id|payer[ \t]+account)\b["']?[ \t]*[:#=\-]?[ \t]*["']?(\d{12})(?!\d)/gid;
  const ARN = /\barn:aws[\w-]*:[\w-]+:[\w-]*:(\d{12}):/gd;
  const AWS_KW = /\b(?:aws|amazon[ \t]+web[ \t]+services|iam|arn|cloud)\b/i;
  const BARE = /(?<![\w.\/-])\d{12}(?![\w.\/-])/gd;
  U.register(LABEL, (text) => [
    ...U.collect(text, KEYWORD, LABEL, 0.95, 'regex', { group: 1, rule: 'account-id-keyword' }),
    ...U.collect(text, ARN, LABEL, 0.95, 'regex', { group: 1, rule: 'account-id-arn' }),
    ...U.collect(text, BARE, LABEL, (v, m, s, e) => (U.near(text, s, e, AWS_KW, 40, 0) ? 0.85 : null), 'regex', { rule: 'account-id-aws' }),
  ]);
})(globalThis);
