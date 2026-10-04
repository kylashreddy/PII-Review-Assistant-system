// SHA/SSH/Hash Key (guide: "Hash values (SHA-1/SHA-256) or SSH keys").
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'SHA/SSH/Hash Key';
  const SSH = /\b(?:ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-nistp(?:256|384|521)|sk-ssh-ed25519@openssh\.com)[ \t]+[A-Za-z0-9+\/]{20,}={0,3}(?:[ \t]+[\w.@-]+)?/gd;
  const PREFIXED = /\b(?:sha(?:1|224|256|384|512)|md5)[:=]([0-9a-fA-F]{32,128})\b/gd;
  // Bare hex digests: MD5 (32), SHA-1 (40), SHA-256 (64), SHA-512 (128). Not 0x… (transaction).
  const HEX = /(?<![0-9a-zA-Z_])(?:[0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{64}|[0-9a-f]{128}|[0-9A-F]{40}|[0-9A-F]{64})(?![0-9a-zA-Z_])/gd;
  const TXN_KW = /\b(?:txn|tx|transaction|txid|utr)\b/i;
  U.register(LABEL, (text) => [
    ...U.collect(text, SSH, LABEL, 0.95, 'regex', { rule: 'ssh-key' }),
    ...U.collect(text, PREFIXED, LABEL, 0.95, 'regex', { rule: 'hash-prefixed' }),
    ...U.collect(text, HEX, LABEL, (v, m, s, e) => {
      if (!/\d/.test(v) || !/[a-f]/i.test(v) || U.near(text, s, e, TXN_KW, 30, 0)) return null;
      return 0.85;
    }, 'regex', { rule: 'hash-hex' }),
  ]);
})(globalThis);
