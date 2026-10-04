// Runs every detector over a text and resolves overlapping detections.
(function (g) {
  'use strict';
  const P = g.PIIRA;

  function sameSpanDedupe(list) {
    const best = new Map();
    for (const d of list) {
      const key = `${d.start}:${d.end}:${d.label}`;
      const cur = best.get(key);
      if (!cur || d.confidence > cur.confidence) best.set(key, d);
    }
    return [...best.values()];
  }

  const isPostal = (label) => label === 'Person Address' || label === 'Business Address';

  // Address spans are grown heuristically, so they may swallow a name or a
  // company at their edges ("Ravi Kumar, 12 MG Road"). Trim those edges off
  // instead of letting the longer Address win and hide the other detection.
  function trimAddressEdges(list, text) {
    const others = list.filter((d) => !isPostal(d.label) && d.confidence >= P.REVIEW_THRESHOLD)
      .sort((a, b) => a.start - b.start);
    // Longest "other" detection, so a window search can't miss one that starts earlier.
    const maxLen = others.reduce((m, o) => Math.max(m, o.end - o.start), 0);
    const out = [];
    for (const d of list) {
      if (!isPostal(d.label)) { out.push(d); continue; }
      let s = d.start;
      let e = d.end;
      const from = P.util.lowerBound(others, d.start - maxLen, (o) => o.start);
      const to = P.util.lowerBound(others, d.end, (o) => o.start);
      const near = others.slice(from, to);
      for (let pass = 0; pass < 4; pass++) {
        let changed = false;
        for (const o of near) {
          if (o.end <= s || o.start >= e) continue;
          if (o.start <= s && o.end < e) { s = o.end; changed = true; }
          else if (o.end >= e && o.start > s) { e = o.start; changed = true; }
        }
        while (s < e && /[\s,;:\-–]/.test(text[s])) s++;
        while (e > s && /[\s,;:\-–]/.test(text[e - 1])) e--;
        if (!changed) break;
      }
      if (e - s < 4) continue;
      out.push(s === d.start && e === d.end ? d : { ...d, start: s, end: e, text: text.slice(s, e) });
    }
    return out;
  }

  // Greedy: longer match first, then more specific label, then confidence.
  function resolveOverlaps(list) {
    const sorted = list.slice().sort((a, b) =>
      (b.end - b.start) - (a.end - a.start) ||
      P.specificityRank(a.label) - P.specificityRank(b.label) ||
      b.confidence - a.confidence ||
      a.start - b.start
    );
    // `kept` stays sorted by start and non-overlapping, so one binary search per
    // candidate is enough to test for an overlap.
    const kept = [];
    for (const d of sorted) {
      const i = P.util.lowerBound(kept, d.start, (k) => k.start);
      if (i < kept.length && kept[i].start < d.end) continue;      // next kept starts inside d
      if (i > 0 && kept[i - 1].end > d.start) continue;            // previous kept runs into d
      kept.splice(i, 0, d);
    }
    return kept;
  }

  function runDetector(det, text, all) {
    try {
      for (const d of det.detect(text)) {
        if (d && d.end > d.start && d.start >= 0 && d.end <= text.length) all.push(d);
      }
    } catch (err) {
      console.warn('[PII Review Assistant] detector failed:', det.label, err);
    }
  }

  function finish(all, text) {
    return resolveOverlaps(trimAddressEdges(sameSpanDedupe(all), text));
  }

  function run(text) {
    if (!text) return [];
    const all = [];
    for (const det of P.detectors) runDetector(det, text, all);
    return finish(all, text);
  }

  const yieldNow = () => (g.scheduler && typeof g.scheduler.yield === 'function'
    ? g.scheduler.yield() : new Promise((r) => setTimeout(r, 0)));

  /**
   * Same as run(), but gives the page a chance to respond between detectors so
   * very large documents never freeze the tab. Returns null if `isCurrent()`
   * becomes false (a newer analysis started).
   */
  async function runAsync(text, isCurrent) {
    if (!text) return [];
    const all = [];
    let t0 = Date.now();
    for (const det of P.detectors) {
      if (Date.now() - t0 > 25) {
        await yieldNow();
        if (isCurrent && !isCurrent()) return null;
        t0 = Date.now();
      }
      runDetector(det, text, all);
    }
    await yieldNow();
    if (isCurrent && !isCurrent()) return null;
    return finish(all, text);
  }

  P.engine = { run, runAsync, yieldNow };
})(globalThis);
