// Transaction ID (guide: "Bank or blockchain (e.g. Bitcoin) transaction ID").
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'Transaction ID';
  // Ethereum-style transaction hash: 0x + 64 hex
  const ETH = /\b0x[0-9a-fA-F]{64}\b/gd;
  // "Txn ID: …", "Transaction ID - …", "UTR No. …", "RRN: …", "tx hash: …", "txid …"
  const KEYWORD = /\b(?:txn|tx|trans(?:action)?|utr|rrn|txid|tx[ \t]*hash|transaction[ \t]*hash|payment[ \t]*ref(?:erence)?|bank[ \t]*ref(?:erence)?)\b\.?[ \t]*(?:id|no\.?|number|ref(?:erence)?|#|hash)?[ \t]*[:#=\-]?[ \t]*([A-Za-z0-9][A-Za-z0-9._-]{7,90})/gid;
  U.register(LABEL, (text) => [
    ...U.collect(text, ETH, LABEL, 0.95, 'regex', { rule: 'txn-eth' }),
    ...U.collect(text, KEYWORD, LABEL, (v) => (/\d/.test(v) ? 0.9 : null), 'regex', { group: 1, trim: true, rule: 'txn-keyword' }),
  ]);
})(globalThis);
