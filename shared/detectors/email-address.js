// Person Email / Business Email (guide: "Personal email address of an individual"
// vs "Official or company email address").
//   - role mailboxes (sales@, info@, support@, hr@ …)      -> Business Email
//   - free mail providers (gmail, yahoo, outlook, rediff …) -> Person Email
//   - other company domains (rahul.s@acmetech.com)          -> Business Email (official address)
// Dummy domains (example.com, *.test …) are placeholder data and never flagged.
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;

  // local-part @ domain labels . TLD(2-24 letters). Lookarounds stop us from
  // starting mid-word or ending inside a longer domain.
  const EMAIL = /(?<![\w.%+-])[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}(?![\w-]|\.[A-Za-z0-9])/gd;

  const FREE_MAIL = /^(?:gmail|googlemail|yahoo|ymail|rocketmail|outlook|hotmail|live|msn|icloud|me|mac|aol|proton|protonmail|pm|rediffmail|rediff|zoho|zohomail|gmx|mail|yandex|tutanota|fastmail|inbox|hey)\.[a-z.]{2,}$/i;
  const ROLE = /^(?:info|sales|support|help|helpdesk|contact|contactus|enquiry|enquiries|inquiry|hr|careers|jobs|recruitment|admin|office|team|hello|billing|accounts|finance|marketing|press|media|legal|compliance|security|noreply|no-reply|donotreply|service|services|customercare|care|feedback|orders|booking|bookings|reservations|partners|vendor|vendors|procurement|ops|operations|it|tech|webmaster|postmaster|abuse|privacy|grievance|nodal|escalation|cs|crm|official)(?:[._-][a-z0-9]+)*$/i;

  /** Person or Business, with a confidence. */
  function classify(email) {
    const [local, domain] = email.split('@');
    if (ROLE.test(local)) return ['Business Email', 0.92];
    if (FREE_MAIL.test(domain)) return ['Person Email', 0.95];
    return ['Business Email', 0.8]; // a work address on a company domain is an official email
  }

  function detect(text) {
    const out = [];
    EMAIL.lastIndex = 0;
    let m;
    while ((m = EMAIL.exec(text)) !== null) {
      const v = m[0];
      if (/\.\./.test(v) || U.isDummyDomain(v.split('@')[1])) continue;
      const [label, c] = classify(v);
      out.push(U.make(text, m.index, m.index + v.length, label, c, 'regex', label === 'Person Email' ? 'email-personal' : 'email-business'));
    }
    return out;
  }

  U.register('Person Email', detect);
})(globalThis);
