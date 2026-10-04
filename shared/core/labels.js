// The label set from the PII / BII Annotation Guide, plus colours and the
// tie-break order used when two detections cover the same text.
// Colours here must match highlight.css (generated from this list).
(function (g) {
  'use strict';
  const P = g.PIIRA;

  // group: PI = PII – Personal, BI = PII – Business, CRED = PII – Credentials (highest risk).
  // "Overscrubbed" is a review label, not an entity.
  P.LABELS = [
    { name: 'Person Name', slug: 'person-name', color: '#43a047', group: 'PI' },
    { name: 'Person Email', slug: 'person-email', color: '#1e88e5', group: 'PI' },
    { name: 'Person Phone No', slug: 'person-phone-no', color: '#00897b', group: 'PI' },
    { name: 'Person DOB', slug: 'person-dob', color: '#f9a825', group: 'PI' },
    { name: 'Person Username', slug: 'person-username', color: '#fb8c00', group: 'PI' },
    { name: 'Person Address', slug: 'person-address', color: '#8e24aa', group: 'PI' },
    { name: 'Business Name', slug: 'business-name', color: '#3949ab', group: 'BI' },
    { name: 'Business Email', slug: 'business-email', color: '#5c6bc0', group: 'BI' },
    { name: 'Business Phone No', slug: 'business-phone-no', color: '#26a69a', group: 'BI' },
    { name: 'Business Username', slug: 'business-username', color: '#ffa726', group: 'BI' },
    { name: 'Business Address', slug: 'business-address', color: '#ab47bc', group: 'BI' },
    { name: 'Account Number', slug: 'account-number', color: '#e53935', group: 'CRED' },
    { name: 'IFSC Code', slug: 'ifsc-code', color: '#c62828', group: 'CRED' },
    { name: 'PAN Card Number', slug: 'pan-card-number', color: '#d81b60', group: 'CRED' },
    { name: 'IP/MAC Address', slug: 'ip-mac-address', color: '#6d4c41', group: 'CRED' },
    { name: 'API/Private Keys', slug: 'api-private-keys', color: '#ad1457', group: 'CRED' },
    { name: 'Password', slug: 'password', color: '#b71c1c', group: 'CRED' },
    { name: 'Aadhar Card No', slug: 'aadhar-card-no', color: '#f4511e', group: 'CRED' },
    { name: 'Driving License No', slug: 'driving-license-no', color: '#bf360c', group: 'CRED' },
    { name: 'Voter ID', slug: 'voter-id', color: '#e65100', group: 'CRED' },
    { name: 'Credit/Debit Card No', slug: 'credit-debit-card-no', color: '#c2185b', group: 'CRED' },
    { name: 'UPI ID', slug: 'upi-id', color: '#00838f', group: 'CRED' },
    { name: 'Transaction ID', slug: 'transaction-id', color: '#5d4037', group: 'CRED' },
    { name: 'Invocation ID', slug: 'invocation-id', color: '#546e7a', group: 'CRED' },
    { name: 'SHA/SSH/Hash Key', slug: 'sha-ssh-hash-key', color: '#455a64', group: 'CRED' },
    { name: 'VPC ID', slug: 'vpc-id', color: '#37474f', group: 'CRED' },
    { name: 'Card ID', slug: 'card-id', color: '#880e4f', group: 'CRED' },
    { name: 'Account ID', slug: 'account-id', color: '#4e342e', group: 'CRED' },
    { name: 'Overscrubbed', slug: 'overscrubbed', color: '#757575', group: null },
  ];
  P.GROUP_NAMES = { PI: 'PII – Personal', BI: 'PII – Business', CRED: 'PII – Credentials' };
  P.GROUP_SHORT = { PI: 'Personal PII', BI: 'Business PII', CRED: 'a Credential' };

  // When two detections cover exactly the same length of text, the label
  // that appears earlier in this list wins (more specific first).
  P.SPECIFICITY = [
    'API/Private Keys', 'SHA/SSH/Hash Key', 'Transaction ID', 'Card ID', 'VPC ID', 'Invocation ID',
    'Person Email', 'Business Email', 'UPI ID', 'Credit/Debit Card No', 'IFSC Code', 'PAN Card Number',
    'Aadhar Card No', 'Driving License No', 'Voter ID', 'Account ID', 'Account Number', 'Password',
    'IP/MAC Address', 'Person Phone No', 'Business Phone No', 'Person Username', 'Business Username',
    'Person DOB', 'Person Address', 'Business Address', 'Business Name', 'Person Name',
  ];

  // Key used in the panel's show/hide set for the RIGHT-side overscrub marks.
  P.RIGHT_OVERSCRUB_KEY = 'Possible overscrub (right)';
  // Key for the marks on names from the business names list (not PII).
  P.KNOWN_NAMES_KEY = 'Known names (not PII)';

  // Project rules.
  P.SETTINGS = {
    // Only dates of birth are PII. Other dates (joining, meeting, login…) are not
    // flagged, and labeling them "Date" on the right is reported as a possible overscrub.
    dateDobOnly: true,
  };

  // Detections below this confidence are reported as NEEDS REVIEW.
  P.REVIEW_THRESHOLD = 0.7;

  const byName = new Map(P.LABELS.map((l) => [l.name, l]));
  P.labelGroup = (name) => (byName.get(name) || {}).group || null;
  P.labelInfo = (name) => byName.get(name) || { name, slug: 'unknown', color: '#9e9e9e' };
  P.specificityRank = (name) => {
    const i = P.SPECIFICITY.indexOf(name);
    return i === -1 ? P.SPECIFICITY.length : i;
  };
})(globalThis);
