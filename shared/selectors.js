// ============================================================================
//  selectors.js — EVERYTHING that depends on the Peak Talent page lives here.
//  When the site changes, update this file only. No other file needs editing.
//
//  You usually do NOT need to edit this on peaktalent.ai: if these selectors
//  don't match, the extension auto-detects the two documents, and reviewers
//  can fix it with "Set up manually" in the panel (saved per browser).
//  The selectors below match test.html. Put real Peak Talent selectors here
//  only if you want to ship a fixed setup to everyone.
//
//  Each selector entry is a LIST. They are tried in order and the first one
//  that matches an element on the page wins, so you can keep an old selector
//  as a fallback while the site migrates.
// ============================================================================
(function (g) {
  'use strict';
  g.PIIRA = g.PIIRA || {};

  g.PIIRA.SELECTORS = {
    // LEFT panel: the original, unredacted base document.
    leftDocument: ['[data-testid="left-document"]', '#left-doc'],

    // RIGHT panel: the same document after the PII review.
    rightDocument: ['[data-testid="right-document"]', '#right-doc'],

    // Labeled PII spans inside the RIGHT panel.
    rightLabelSpan: ['[data-pii-label]', '.pii-label'],

    // Where the label name is stored on a labeled span. Tried in order;
    // the first value that is a known label name (or alias) is used.
    labelNameAttributes: ['data-pii-label', 'data-label', 'data-entity', 'data-tag', 'aria-label', 'title'],

    // If the label name is encoded in a class instead, e.g. class="tag-person-name",
    // list the class prefix here ("tag-").
    labelClassPrefixes: ['pii-label--'],

    // If the label name is shown as text in a small child element (a "badge"),
    // e.g. <span>Ravi <sup class="tag">Person Name</sup></span>, put the child's
    // selector here (relative to the span), e.g. ':scope > sup.tag'.
    labelNameFromChild: '',

    // Elements whose text must NOT be read as document text, e.g. a small
    // badge showing the label name or a "×" remove button inside a span.
    ignoreInText: ['.pii-label-badge', '.pii-label-remove', '.doc-title'],

    // Some reviewed documents replace PII with placeholder text such as
    // [PERSON_NAME] instead of keeping the original words. This pattern finds
    // those placeholders even when they are not wrapped in a labeled span.
    // Group 1 must capture the label name. Set to '' to disable.
    placeholderPattern: '\\[([A-Z][A-Z0-9 _/]*[A-Z0-9])\\]',

    // Maps the names the site uses to the extension's label names.
    // Keys are compared lower-case with spaces/punctuation removed, so
    // "PERSON_NAME", "person-name" and "Person Name" all become "personname".
    labelAliases: {
      // PII – Personal
      personname: 'Person Name', name: 'Person Name', person: 'Person Name', fullname: 'Person Name', alias: 'Person Name',
      personemail: 'Person Email', email: 'Person Email', emailaddress: 'Person Email', personalemail: 'Person Email',
      personphoneno: 'Person Phone No', personphone: 'Person Phone No', phone: 'Person Phone No', phoneno: 'Person Phone No',
      phonenumber: 'Person Phone No', mobile: 'Person Phone No', contactnumber: 'Person Phone No', contact: 'Person Phone No',
      persondob: 'Person DOB', dob: 'Person DOB', dateofbirth: 'Person DOB', date: 'Person DOB',
      personusername: 'Person Username', username: 'Person Username', handle: 'Person Username',
      personaddress: 'Person Address', address: 'Person Address', homeaddress: 'Person Address', addr: 'Person Address',
      // PII – Business
      businessname: 'Business Name', business: 'Business Name', company: 'Business Name', organization: 'Business Name',
      organisation: 'Business Name', org: 'Business Name',
      businessemail: 'Business Email', companyemail: 'Business Email', officialemail: 'Business Email',
      businessphoneno: 'Business Phone No', businessphone: 'Business Phone No', officephone: 'Business Phone No',
      businessusername: 'Business Username', companyusername: 'Business Username',
      businessaddress: 'Business Address', officeaddress: 'Business Address', companyaddress: 'Business Address',
      // PII – Credentials
      accountnumber: 'Account Number', accountno: 'Account Number', bankaccount: 'Account Number', account: 'Account Number',
      ifsccode: 'IFSC Code', ifsc: 'IFSC Code',
      pancardnumber: 'PAN Card Number', pancard: 'PAN Card Number', pan: 'PAN Card Number', panno: 'PAN Card Number',
      ipmacaddress: 'IP/MAC Address', ipaddress: 'IP/MAC Address', ip: 'IP/MAC Address', macaddress: 'IP/MAC Address', mac: 'IP/MAC Address',
      apiprivatekeys: 'API/Private Keys', apikey: 'API/Private Keys', apikeys: 'API/Private Keys', privatekey: 'API/Private Keys', token: 'API/Private Keys',
      password: 'Password', credentials: 'Password', credential: 'Password', pin: 'Password', otp: 'Password',
      aadharcardno: 'Aadhar Card No', aadhaar: 'Aadhar Card No', aadhar: 'Aadhar Card No', aadhaarnumber: 'Aadhar Card No',
      drivinglicenseno: 'Driving License No', drivinglicence: 'Driving License No', drivinglicense: 'Driving License No', dl: 'Driving License No',
      voterid: 'Voter ID', epic: 'Voter ID',
      creditdebitcardno: 'Credit/Debit Card No', cardnumber: 'Credit/Debit Card No', creditcard: 'Credit/Debit Card No', debitcard: 'Credit/Debit Card No',
      upiid: 'UPI ID', upi: 'UPI ID', vpa: 'UPI ID',
      transactionid: 'Transaction ID', txnid: 'Transaction ID', utr: 'Transaction ID',
      invocationid: 'Invocation ID', requestid: 'Invocation ID',
      shasshhashkey: 'SHA/SSH/Hash Key', hash: 'SHA/SSH/Hash Key', sshkey: 'SHA/SSH/Hash Key', hashkey: 'SHA/SSH/Hash Key',
      vpcid: 'VPC ID', vpc: 'VPC ID',
      cardid: 'Card ID', cardtoken: 'Card ID',
      accountid: 'Account ID', awsaccount: 'Account ID', awsaccountid: 'Account ID',
      // review label
      overscrubbed: 'Overscrubbed', overscrub: 'Overscrubbed',
    },

    // How long to wait for the panels to appear before showing the
    // "Couldn't find the document panels" message.
    waitForTaskMs: 8000,

    // Wait this long after the page stops changing before re-analysing.
    debounceMs: 600,
  };
})(globalThis);
