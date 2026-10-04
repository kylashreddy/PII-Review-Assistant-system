// Account Number (guide: "Bank account number"): keyword-led bank account
// numbers, IBANs, masked account numbers. Payment cards are a separate entity
// (card-number.js); cloud account ids are "Account ID" (account-id.js).
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'Account Number';

  const BANK_KW = /\b(?:a\/c|acct|account|bank|savings|current|ifsc|branch|sb|ca|beneficiary|neft|rtgs|imps)\b/i;
  const CARD_KW = /\b(?:card|debit|credit|visa|mastercard|rupay|amex)\b/i;
  const PHONE_KW = /\b(?:phone|ph|mobile|mob|tel|contact|cell|whatsapp|call)\b/i;
  const OTHER_ID_KW = /\b(?:aadhaa?r|uid|pan|voter|epic|licen[cs]e|aws|cloud|account[ \t]*id)\b/i;

  // GB82 WEST 1234 5698 7654 32 · DE89370400440532013000
  const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/gd;

  // XXXX1234 · xx-xx-5566 (a masked card is a card, see card-number.js)
  const MASKED = /(?<![\w*•])(?:[Xx*•]{2,}[ -]?)+\d{3,6}(?!\w)/gd;

  // "A/c No: 001234567890", "Bank account number - 50100234567890" (not "Account ID")
  const KEYWORD = /\b(?:a\/c|acct|(?:bank|savings|current|salary|sb)?[ \t]*account(?![ \t]*id\b))\b\.?[ \t]*(?:no\.?|number|num|#)?[ \t]*[:#-]?[ \t]*([0-9][0-9 -]{7,22}[0-9])(?![\d])/gid;

  // Plain 9–18 digit numbers, only accepted next to a bank word.
  const BARE = /(?<![\w.\/-])\d{9,18}(?![\w.\/-])/gd;

  function detect(text) {
    return [
      ...U.collect(text, IBAN, LABEL, (v, m, s, e) => {
        let end = e; // the regex may run into the next word; shorten until the checksum passes
        while (end - s >= 15) {
          if (U.ibanValid(text.slice(s, end))) return { start: s, end, confidence: 0.95 };
          const cut = text.slice(s, end).search(/ ?[A-Z0-9]{1,4}$/);
          if (cut <= 0) break;
          end = s + cut;
        }
        return null;
      }, 'regex', { rule: 'account-iban' }),

      ...U.collect(text, MASKED, LABEL, (v, m, s, e) => {
        if (U.near(text, s, e, PHONE_KW, 30, 0) || U.near(text, s, e, CARD_KW, 30, 0)) return null;
        return U.near(text, s, e, BANK_KW, 40, 0) ? 0.9 : 0.7;
      }, 'regex', { rule: 'account-masked' }),

      ...U.collect(text, KEYWORD, LABEL, (v, m, s, e) => {
        const n = U.digitCount(v);
        if (n < 8 || n > 18 || U.near(text, s, e, CARD_KW, 25, 0)) return null;
        return 0.92;
      }, 'regex', { group: 1, rule: 'account-keyword' }),

      ...U.collect(text, BARE, LABEL, (v, m, s, e) => {
        if (v.length === 10 && /^[6-9]/.test(v)) return null; // Indian mobile number
        if (U.near(text, s, e, OTHER_ID_KW, 30, 0)) return null; // Aadhaar, cloud account id …
        return U.near(text, s, e, BANK_KW, 40, 0) ? 0.65 : null;
      }, 'regex', { rule: 'account-bare-digits' }),
    ];
  }

  U.register(LABEL, detect);
})(globalThis);
