// IP/MAC Address (guide: "Network address of a device"): IPv4, IPv6 and MAC addresses.
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;
  const LABEL = 'IP/MAC Address';
  // 00:1A:2B:3C:4D:5E · 00-1A-2B-3C-4D-5E · 001a.2b3c.4d5e (Cisco)
  const MAC = /(?<![\w:-])[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}(?![\w:-])/gd;
  const MAC_DOTTED = /(?<![\w.])[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}(?![\w.])/gd;

  const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
  // Not preceded by a word char or "." (so "v1.2.3.4" and "1.2.3.4.5" are skipped),
  // not followed by a word char or ".digit".
  const IPV4 = new RegExp(`(?<![\\w.])(?:${OCTET}\\.){3}${OCTET}(?!\\w|\\.\\d)`, 'gd');

  // Loose IPv6 candidate; the validator below decides.
  const IPV6 = /(?<![\w:])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![\w:])/gd;

  const GROUP = /^[0-9A-Fa-f]{1,4}$/;

  function ipv6Groups(s) {
    const doubles = s.split('::').length - 1;
    if (doubles > 1) return -1;
    if (doubles === 0) {
      const parts = s.split(':');
      return parts.length === 8 && parts.every((p) => GROUP.test(p)) ? 8 : -1;
    }
    const [a, b] = s.split('::');
    const pa = a ? a.split(':') : [];
    const pb = b ? b.split(':') : [];
    const all = pa.concat(pb);
    if (!all.length || all.some((p) => !GROUP.test(p)) || all.length > 7) return -1;
    return all.length;
  }

  function detect(text) {
    const v4 = U.collect(text, IPV4, LABEL, 0.95, 'regex', { rule: 'ipv4' });
    const v6 = U.collect(text, IPV6, LABEL, (v) => {
      const groups = ipv6Groups(v);
      if (groups < 0) return null;
      // Needs at least one hex letter or "::" to be distinguishable from times/ratios.
      if (!/[a-f]/i.test(v) && !v.includes('::')) return null;
      return groups >= 3 || v.includes('::') ? 0.9 : 0.6;
    }, 'regex', { rule: 'ipv6' });
    const mac = [
      ...U.collect(text, MAC, LABEL, 0.92, 'regex', { rule: 'mac' }),
      ...U.collect(text, MAC_DOTTED, LABEL, (v) => (/[a-f]/i.test(v) ? 0.85 : null), 'regex', { rule: 'mac-dotted' }),
    ];
    return v4.concat(v6, mac);
  }

  U.register(LABEL, detect);
  P.ipv6Groups = ipv6Groups;
})(globalThis);
