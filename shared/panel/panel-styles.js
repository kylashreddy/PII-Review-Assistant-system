// Styles for the side panel. Applied inside the panel's Shadow DOM only, so
// they cannot leak into the Peak Talent page (and the page's CSS cannot
// reach in). Kept as a JS string so no web_accessible_resources are needed.
(function (g) {
  'use strict';
  g.PIIRA.PANEL_CSS = `
/* ---------- tokens */
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --bg: #ffffff; --bg2: #f5f6f8; --fg: #1d2129; --muted: #5f6b7a; --line: #e2e5ea; --accent: #2563eb;
  --missed: #d32f2f; --wrong: #ef6c00; --over: #7b1fa2; --review: #0277bd; --ok: #2e7d32;
  --flag: #f0b429; --flag-ink: #8a5a00;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--fg);
}
@media (prefers-color-scheme: dark) {
  .root { --bg: #1e2127; --bg2: #262a31; --fg: #e8eaed; --muted: #9aa4b2; --line: #363b44; --accent: #6ea8ff; --flag-ink: #f5c76b; }
}

/* ---------- shell: panel, collapsed tab, header, footer */
.panel {
  position: fixed; top: 0; right: 0; width: 380px; max-width: 92vw; height: 100vh;
  display: flex; flex-direction: column; background: var(--bg); border-left: 1px solid var(--line);
  box-shadow: -4px 0 18px rgba(0,0,0,.12); z-index: 2147483646;
}
.root.dock-left .panel { right: auto; left: 0; border-left: 0; border-right: 1px solid var(--line); box-shadow: 4px 0 18px rgba(0,0,0,.12); }
.root.collapsed .panel { display: none; }
.tab {
  position: fixed; top: 40%; right: 0; z-index: 2147483646; display: none;
  writing-mode: vertical-rl; padding: 12px 6px; border: 0; border-radius: 8px 0 0 8px;
  background: var(--accent); color: #fff; font: 600 12px/1 inherit; cursor: pointer; box-shadow: -2px 2px 8px rgba(0,0,0,.2);
}
.tab.attention { background: #b26a00; }
.root.dock-left .tab { right: auto; left: 0; border-radius: 0 8px 8px 0; }
.root.collapsed .tab { display: block; }
header { padding: 12px 14px 8px; border-bottom: 1px solid var(--line); }
.title-row { display: flex; align-items: center; gap: 6px; }
h1 { font-size: 15px; margin: 0; flex: 1; font-weight: 650; }
.status { color: var(--muted); font-size: 12px; margin-top: 4px; }
.busy { margin-left: 6px; color: var(--accent); }
.body { flex: 1; overflow: auto; padding: 0 14px 14px; }
footer { border-top: 1px solid var(--line); padding: 8px 14px; color: var(--muted); font-size: 11px; }

/* ---------- controls */
.icon-btn {
  border: 1px solid var(--line); background: var(--bg2); color: var(--fg); border-radius: 6px;
  height: 26px; min-width: 26px; padding: 0 7px; cursor: pointer; font: inherit; font-size: 12px;
}
.icon-btn:hover { border-color: var(--accent); }
.icon-btn[aria-pressed="false"] { opacity: .55; }
.btn { border: 1px solid var(--line); background: var(--bg2); color: var(--fg); border-radius: 6px; padding: 6px 12px; cursor: pointer; font: inherit; font-size: 12.5px; }
.btn:hover { border-color: var(--accent); }
.btn:disabled { opacity: .45; cursor: default; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.stage { display: flex; margin-top: 8px; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
.seg { flex: 1; border: 0; border-left: 1px solid var(--line); background: var(--bg2); color: var(--fg); font: inherit; font-size: 12px; padding: 5px 4px; cursor: pointer; }
.seg:first-child { border-left: 0; }
.seg.on { background: var(--accent); color: #fff; font-weight: 600; }
.nav { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.nav .nav-label { flex: 1; text-align: center; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.chip {
  border: 1px solid var(--line); background: var(--bg2); color: var(--fg); border-radius: 999px; padding: 3px 10px;
  cursor: pointer; font: inherit; font-size: 12px; display: inline-flex; gap: 6px; align-items: center;
}
.chip b { font-weight: 700; }
.chip.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.filters { display: flex; gap: 6px; margin-top: 12px; }
.search { flex: 1; min-width: 0; padding: 7px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font: inherit; }
.label-filter { max-width: 140px; padding: 0 6px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font: inherit; font-size: 12px; }
label.check { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.progress { margin-top: 12px; }
.progress-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); }
.bar { height: 6px; background: var(--bg2); border-radius: 3px; overflow: hidden; margin-top: 5px; }
.bar > div { height: 100%; background: var(--ok); width: 0; transition: width .2s; }

/* ---------- notices */
.banner { position: relative; margin: 10px 14px 0; padding: 10px 12px; border-radius: 8px; font-size: 12.5px; }
.banner.error { background: #fdecea; color: #8a1c13; border: 1px solid #f5c2bd; }
.banner.info { background: #e8f1fd; color: #0b3d79; border: 1px solid #bcd6f7; }
@media (prefers-color-scheme: dark) {
  .banner.error { background: #3b1f1d; color: #ffb4a9; border-color: #6b2b25; }
  .banner.info { background: #1b2b40; color: #a8c8f5; border-color: #2b4565; }
}
.banner strong { display: block; margin-bottom: 4px; padding-right: 18px; }
.banner ul { margin: 4px 0 0; padding-left: 18px; }
.banner code { font-size: 11.5px; word-break: break-all; }
.banner-close { position: absolute; top: 4px; right: 6px; padding: 2px 4px; border: 0; background: none; color: inherit; font-size: 16px; line-height: 1; cursor: pointer; opacity: .7; }
.banner-close:hover { opacity: 1; }

/* task check: other language / unstructured text */
.task-card { margin-top: 12px; padding: 10px 12px; border: 1px solid var(--flag); border-radius: 8px; background: rgba(240,180,41,.10); }
.task-title { font-weight: 700; font-size: 13.5px; color: var(--flag-ink); }
.task-sub { margin-top: 2px; font-size: 11.5px; color: var(--muted); }
.task-langs { width: 100%; margin-top: 8px; border-collapse: collapse; font-size: 12px; }
.task-langs td { padding: 3px 0; border-top: 1px solid var(--line); }
.task-langs td.num { width: 70px; text-align: right; font-variant-numeric: tabular-nums; }
.task-langs tr.en td { color: var(--muted); }
.task-where { margin-top: 6px; font-size: 12px; }
.task-reason { margin-top: 8px; padding: 6px 8px; border: 1px dashed var(--line); border-radius: 6px; background: var(--bg); font-size: 11.5px; user-select: text; }
.task-card details.section { background: var(--bg); }

/* "Your identification" / "Your decisions" */
.decisions { margin-top: 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg2); }
.dec-title { font-weight: 650; font-size: 12.5px; }
.dec-row { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; font-size: 12px; }
.dec.fix b { color: var(--missed); } .dec.ok b { color: var(--ok); } .dec.open b { color: var(--review); }
.decisions .hint { padding: 4px 0 0; }

/* ---------- sections and the legend */
details.section { margin-top: 12px; border: 1px solid var(--line); border-radius: 8px; }
details.section > summary {
  list-style: none; cursor: pointer; padding: 8px 10px; font-weight: 600; display: flex; align-items: center; gap: 8px;
  background: var(--bg2); border-radius: 8px;
}
details.section[open] > summary { border-radius: 8px 8px 0 0; border-bottom: 1px solid var(--line); }
details.section > summary::-webkit-details-marker { display: none; }
details.section > summary::before { content: "▸"; color: var(--muted); }
details.section[open] > summary::before { content: "▾"; }
.count { margin-left: auto; color: var(--muted); font-weight: 500; font-size: 12px; }
.hint { color: var(--muted); font-size: 11.5px; padding: 6px 10px 0; }
.body > .hint { padding: 0; margin: 8px 0 0; }
.empty { padding: 10px; color: var(--muted); font-size: 12px; }
.section-empty { display: flex; gap: 8px; margin-top: 6px; padding: 4px 10px; font-size: 12px; opacity: .6; }
.more { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--line); }
table.legend { width: 100%; border-collapse: collapse; font-size: 12px; }
table.legend th { text-align: left; font-weight: 600; color: var(--muted); padding: 6px 10px 4px; font-size: 11px; }
table.legend td { padding: 4px 10px; border-top: 1px solid var(--line); }
table.legend td.num { width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
table.legend tr.grp td { background: var(--bg2); color: var(--muted); font-weight: 650; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
table.legend tr.off td { opacity: .45; }
.swatch-toggle { display: inline-flex; align-items: center; gap: 7px; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: none; }
.wavy { width: 18px; height: 9px; flex: none; display: inline-block; border-bottom: 2px dotted var(--over); background: rgba(123,31,162,.22); border-radius: 2px; }
.setup-info { display: grid; gap: 4px; padding: 8px 10px; font-size: 12px; }

.known-mark { width: 18px; height: 9px; flex: none; display: inline-block; border-bottom: 2px dotted var(--ok); }
.tag.known { background: transparent; color: var(--ok); border: 1px solid var(--ok); font-weight: 600; }

/* section title colours */
.cat-PI_TODO, .cat-IDENTIFIED, .cat-REDACTED_OK { color: var(--ok); }
.cat-BI_TODO { color: var(--accent); }
.cat-CRED_TODO, .cat-LEAKAGE { color: var(--missed); }
.cat-NOT_PII, .cat-NOT_SENSIBLE, .cat-OVER_REDACTED { color: var(--over); }
.cat-CHECK, .cat-UNSURE, .cat-UNKNOWN_TEXT { color: var(--review); }
.cat-INCOHERENT { color: var(--wrong); }
.cat-DATATYPE { color: #c2185b; }
.cat-TASK { color: #b00020; }

/* ---------- findings */
ul.items { list-style: none; margin: 0; padding: 0; }
li.item { display: flex; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--line); align-items: flex-start; }
li.item:first-child { border-top: 0; }
li.item.done { opacity: .75; }
li.item.current { background: rgba(37, 99, 235, .10); box-shadow: inset 3px 0 0 var(--accent); }
li.item input { margin-top: 3px; cursor: pointer; flex: none; }
.item-body { flex: 1; min-width: 0; }
.item-main { width: 100%; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.item-main:hover .quote { text-decoration: underline; }
.item-main:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.tag { font-size: 11px; padding: 1px 7px; border-radius: 4px; color: #fff; font-weight: 600; }
.tag.outline { background: transparent !important; color: var(--fg); border: 1px solid var(--line); font-weight: 500; }
.arrow { color: var(--muted); font-size: 11px; }
.quote { margin-top: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-word; }
.note { margin-top: 3px; color: var(--muted); font-size: 11.5px; }
.where { margin-top: 2px; color: var(--muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; }

/* compact finding: one line + actions; the rest under "Details" */
.line1 { display: flex; align-items: center; gap: 6px; min-width: 0; }
.line1 .quote { margin-top: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-chip { flex: none; font-size: 11px; color: var(--muted); white-space: nowrap; }
.item-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
.more-toggle { padding: 2px 4px; border: 0; background: none; color: var(--accent); font: inherit; font-size: 11.5px; cursor: pointer; }
.more-toggle:hover { text-decoration: underline; }
.item-details { margin-top: 6px; padding: 6px 8px; border-left: 2px solid var(--line); }
.item-details .quote { margin-top: 4px; }
.vbtn.suggested { border-style: dashed; border-color: var(--accent); }

/* the decision under a finding */
.decide { margin-top: 6px; }
.suggest { font-size: 11.5px; font-weight: 600; }
.suggest-redact { color: var(--missed); } .suggest-keep { color: var(--ok); } .suggest-unsure { color: var(--review); }
.verdict { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 5px; }
.verdict .q { margin-right: 2px; color: var(--muted); font-size: 11.5px; }
.vbtn { padding: 3px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--bg2); color: var(--fg); font: inherit; font-size: 11.5px; cursor: pointer; }
.vbtn:hover { border-color: var(--accent); }
.vbtn.on.redact { background: var(--missed); border-color: var(--missed); color: #fff; }
.vbtn.on.keep { background: var(--ok); border-color: var(--ok); color: #fff; }
.outcome { display: inline-block; margin-top: 5px; padding: 3px 7px; border-radius: 4px; font-size: 11.5px; }
.outcome.fix { background: rgba(211,47,47,.12); color: var(--missed); font-weight: 600; }
.outcome.ok { background: rgba(46,125,50,.12); color: var(--ok); }
li.item.done .outcome { opacity: 1; }

/* ---------- page setup and the click-setup overlay */
.setup { margin-top: 14px; }
.setup h2 { font-size: 15px; margin: 4px 0 6px; }
.setup .step { color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; }
.setup .hint { padding: 0; margin: 8px 0 0; }
.setup .banner { margin: 10px 0 0; }
.setup-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
.pick-box { position: fixed; display: none; pointer-events: none; border: 2px solid #2563eb; border-radius: 4px; background: rgba(37,99,235,.08); }
.pick-box.fixed { border-color: #2e7d32; border-style: dashed; background: rgba(46,125,50,.06); }
.pick-tag { position: absolute; top: -20px; left: -2px; padding: 4px 6px; border-radius: 4px 4px 0 0; background: #2563eb; color: #fff; font: 600 11px/1 -apple-system, sans-serif; white-space: nowrap; }
.pick-box.fixed .pick-tag { background: #2e7d32; }
`;
})(globalThis);
