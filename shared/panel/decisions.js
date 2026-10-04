// What the panel asks the reviewer, and what each answer means. Pure, unit-tested in Node.
//
//   L1 · Identify  "Is it PII?"             Yes, <entity> / Not PII  -> a label change to make on the site
//   L2 · Verify    "Should it be redacted?" Redact / Keep            -> a fix to make in the redacted work
(function (g) {
  'use strict';
  const P = g.PIIRA;

  // Panel sections, in the order shown. `ok` sections are the done ones, closed by default.
  const SECTIONS = {
    L1: [
      { key: 'PI_TODO', title: 'PII – Personal to identify', hint: 'Details that identify a person (name, email, phone, DOB, username, address) not labeled yet, labeled differently, or to check.' },
      { key: 'BI_TODO', title: 'PII – Business to identify', hint: 'Details that identify a company (name, email, phone, username, address) not labeled yet, labeled differently, or to check.' },
      { key: 'CRED_TODO', title: 'PII – Credentials to identify', hint: 'Financial, government ID and security data (highest risk) not labeled yet, labeled differently, or to check.' },
      { key: 'NOT_PII', title: 'Labeled, but not PII?', hint: 'A label is on the page, but the assistant found no PII there. Marked with a purple wavy underline.' },
      { key: 'CHECK', title: 'Check these labels', hint: 'Labels the assistant could not read or line up with the original.' },
      { key: 'IDENTIFIED', title: 'Identified ✓', hint: 'Already labeled with the right entity.', ok: true },
    ],
    L2: [
      { key: 'TASK', title: 'Task issues', hint: 'Whole-task problems: other language (sampling imperfection) or unstructured text.' },
      { key: 'LEAKAGE', title: 'PI leakage', hint: 'PII from the original still visible on the right (not redacted, partly redacted, or leaked elsewhere). Should be redacted.' },
      { key: 'OVER_REDACTED', title: 'Redacted, but is it PII?', hint: 'The right side redacted this, but the assistant found no PII. Decide: redact, or keep the original words.' },
      { key: 'UNSURE', title: 'Possible PII, not redacted', hint: 'The assistant is not sure this is PII and the right side left it as is. Decide whether it should be redacted.' },
      { key: 'INCOHERENT', title: 'Incoherent', hint: 'The same value replaced in different ways (Ram → Raj here, Sam there), or different values given the same replacement.' },
      { key: 'DATATYPE', title: 'Wrong data type', hint: 'A value replaced by a different kind of data (e.g. a phone number replaced by a name).' },
      { key: 'NOT_SENSIBLE', title: 'Not sensible', hint: 'The replacement is not realistic text: masked (XXXX), a placeholder ([NAME]) or deleted.' },
      { key: 'UNKNOWN_TEXT', title: 'Unknown text', hint: 'Text added on the right, or original words missing. Exact words of the original must be kept.' },
      { key: 'REDACTED_OK', title: 'Redacted correctly', hint: 'PII replaced with a realistic value of the same kind, consistently.', ok: true },
    ],
  };
  const OK = new Set(['IDENTIFIED', 'REDACTED_OK']);

  const DECIDE = {
    L1: new Set(['PI_TODO', 'BI_TODO', 'CRED_TODO', 'NOT_PII', 'IDENTIFIED']),
    L2: new Set(['LEAKAGE', 'OVER_REDACTED', 'UNSURE', 'REDACTED_OK', 'INCOHERENT', 'DATATYPE', 'NOT_SENSIBLE']),
  };
  const REDACTED_ON_RIGHT = new Set(['OVER_REDACTED', 'REDACTED_OK', 'INCOHERENT', 'DATATYPE', 'NOT_SENSIBLE']);
  const BAD_REPLACEMENT = new Set(['INCOHERENT', 'DATATYPE', 'NOT_SENSIBLE']);

  const sections = (stage) => SECTIONS[stage] || SECTIONS.L2;
  const isIssue = (f) => !OK.has(f.category);

  /** The question for an item, or null when the item is not something to decide. */
  function question(f, stage) {
    if (!DECIDE[stage].has(f.category)) return null;
    if (stage === 'L1') {
      const group = (f.group && P.GROUP_SHORT[f.group]) || 'PII';
      return {
        ask: 'Is it PII?',
        suggestion: f.suggest === 'yes' ? `Assistant: ${group} — label it as ${f.label}`
          : f.suggest === 'not' ? 'Assistant: no PII found here' : 'Assistant: not sure — your call',
        tone: f.suggest === 'yes' ? 'redact' : f.suggest === 'not' ? 'keep' : 'unsure',
        yes: { key: 'yes', label: f.label && f.group ? `Yes, ${f.label}` : 'Yes, it is PII', title: 'It is PII of this type' },
        no: { key: 'no', label: 'Not PII', title: 'Not PII' },
      };
    }
    return {
      ask: 'Should it be redacted?',
      suggestion: { redact: 'Assistant: PII — should be redacted', keep: 'Assistant: not PII — keep the original' }[f.suggest]
        || 'Assistant: not sure — your call',
      tone: f.suggest || 'unsure',
      yes: { key: 'redact', label: 'Redact (PII)', title: 'It is PII: it should be redacted' },
      no: { key: 'keep', label: 'Keep (not PII)', title: 'Not PII: keep the original words' },
    };
  }

  /** What a decision means: {fix, kind, text}, or null when undecided. */
  function outcome(f, stage, verdict) {
    if (!verdict) return null;
    if (stage === 'L1') {
      const labeled = ['labeled', 'wrong', 'extra'].includes(f.status) || (f.status === 'check' && Boolean(f.rightLabel));
      if (verdict === 'yes') {
        if (f.status === 'unlabeled') return { fix: true, kind: 'label', text: `To do: label it as ${f.label} on the site.` };
        if (f.status === 'wrong') return { fix: true, kind: 'relabel', text: `To do: change the label from ${f.rightLabel} to ${f.label}.` };
        return { fix: false, text: f.status === 'extra' ? 'Keep the label.' : 'Identified.' };
      }
      return labeled ? { fix: true, kind: 'remove', text: 'To do: remove this label (or mark it Overscrubbed).' }
        : { fix: false, text: 'Correctly left unlabeled.' };
    }
    const redacted = REDACTED_ON_RIGHT.has(f.category);
    if (verdict === 'redact' && !redacted) return { fix: true, kind: 'missed', text: 'Missed redaction — the right side must redact this.' };
    if (verdict === 'keep' && redacted) return { fix: true, kind: 'over', text: 'Over-redaction — the right side must keep the original words.' };
    if (verdict === 'redact' && BAD_REPLACEMENT.has(f.category)) {
      return { fix: true, kind: 'quality', text: 'Correct to redact, but the replacement must be fixed.' };
    }
    return { fix: false, text: verdict === 'redact' ? 'Correctly redacted.' : 'Correctly kept as is.' };
  }

  /** A two- or three-word status shown on the item's first line; the full note is under Details. */
  function short(f, stage) {
    if (stage === 'L1') {
      if (f.knownName) return 'Over-scrubbing';
      return { unlabeled: 'Not labeled', wrong: `Labeled ${f.rightLabel || 'differently'}`, extra: 'Extra label',
        check: 'Check it', labeled: 'Labeled ✓' }[f.status] || 'Check it';
    }
    switch (f.category) {
      case 'LEAKAGE': return /partly/.test(f.note || '') ? 'Partly redacted' : /another/.test(f.note || '') ? 'Leaked elsewhere' : 'Not redacted';
      case 'OVER_REDACTED': return f.knownName ? 'Over-scrubbing' : 'Changed — PII?';
      case 'UNSURE': return 'Possible PII';
      case 'INCOHERENT': return 'Inconsistent';
      case 'DATATYPE': return 'Wrong data type';
      case 'NOT_SENSIBLE': return 'Not realistic';
      case 'UNKNOWN_TEXT': return /not in the original/.test(f.note || '') ? 'Text added' : 'Words missing';
      case 'REDACTED_OK': return 'Redacted ✓';
      case 'TASK': return 'Whole task';
      default: return '';
    }
  }

  /** Which answer the assistant suggests ('yes' | 'no' | 'redact' | 'keep'), or null. */
  function suggested(f, stage) {
    if (stage === 'L1') return f.suggest === 'yes' ? 'yes' : f.suggest === 'not' ? 'no' : null;
    return f.suggest === 'redact' || f.suggest === 'keep' ? f.suggest : null;
  }

  /** Totals for the "Your identification" / "Your decisions" box. */
  function summary(findings, stage, verdicts) {
    const t = { open: 0, ok: 0, fix: 0, kinds: {}, groups: { PI: 0, BI: 0, CRED: 0 } };
    for (const f of findings) {
      if (!DECIDE[stage].has(f.category)) continue;
      const v = verdicts.get(f.id);
      const o = outcome(f, stage, v);
      if (!o) { t.open++; continue; }
      if (stage === 'L1' && v === 'yes' && f.group) t.groups[f.group]++;
      if (o.fix) { t.fix++; t.kinds[o.kind] = (t.kinds[o.kind] || 0) + 1; } else t.ok++;
    }
    return t;
  }

  P.decisions = { sections, isIssue, question, outcome, summary, short, suggested };
})(globalThis);
