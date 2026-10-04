// VPC ID (guide: "Isolated private network in the cloud (VPC)"), e.g. vpc-0a1b2c3d4e5f67890.
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const VPC = /\bvpc-(?:[0-9a-f]{17}|[0-9a-f]{8})\b/gd;
  U.register('VPC ID', (text) => U.collect(text, VPC, 'VPC ID', 0.95, 'regex', { rule: 'vpc' }));
})(globalThis);
