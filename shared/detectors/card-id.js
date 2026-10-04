// Card ID (guide: "Internal or tokenized reference to a payment card"),
// e.g. card_1NqX2kLkdIwHu7ixAbCdEfGh (Stripe-style card / token / payment-method ids).
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const CARD_ID = /\b(?:card|tok|pm|src|ba|cus_card)_[A-Za-z0-9]{10,}\b/gd;
  const KEYWORD = /\b(?:card[ \t]*(?:id|token|ref(?:erence)?)|token(?:ised|ized)?[ \t]+card)\b[ \t]*[:=\-]?[ \t]*([A-Za-z0-9][A-Za-z0-9_-]{9,60})/gid;
  U.register('Card ID', (text) => [
    ...U.collect(text, CARD_ID, 'Card ID', 0.93, 'regex', { rule: 'card-id' }),
    ...U.collect(text, KEYWORD, 'Card ID', (v) => (/\d/.test(v) && /[a-z]/i.test(v) ? 0.85 : null), 'regex', { group: 1, rule: 'card-id-keyword' }),
  ]);
})(globalThis);
