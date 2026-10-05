// Evaratus Review — desktop PII check that reads the task documents from the screen.
//
//   1. The reviewer drags a box around the original (left) and the redacted work (right).
//   2. Both boxes are captured and read with the computer's own OCR (Apple Vision / Windows OCR).
//   3. Labels on the right are recognised by their highlight colour.
//   4. The Chrome extension's checks run on the text (desktop/shared), and the results
//      are shown in the window and marked over the documents on screen.
//
// Nothing leaves the computer: no network, screen images are kept in memory only,
// and settings hold positions and choices, never document text.
'use strict';
const { app, BrowserWindow, ipcMain, screen, shell, systemPreferences, nativeImage, session, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const capture = require('./src/capture');
const ocr = require('./src/ocr');
const { snapshotRows, joinRows } = require('./src/text-layout');
const { Stitcher, comparableRange } = require('./src/stitch');
const { detectDocuments } = require('./src/autodetect');
const { reorderToMatch } = require('./src/reorder');
const colours = require('./src/label-colors');
const analyzer = require('./src/analyzer');
const labelView = require('./src/label-view');
const Settings = require('./src/settings');

const LIVE_EVERY_MS = 1500;
const ICON = path.join(__dirname, 'assets', 'icon.png');

let settings;
let main = null;
const overlays = new Map();    // display id -> window
let selectors = [];
let picking = null;            // {step, picked}
let scanning = false;
let lastPrint = '';
let last = null;               // last result sent to the window
let decided = new Set();       // finding ids the reviewer has answered
let taskDone = false;          // the window says the task is done
let liveTimer = null;
let awayReads = 0;
let lastHeader = '';           // the pane's file name, read each time: a new name = a new task             // reads in a row where the boxes did not show the task
let finding = false;
// The whole documents, built up as the reviewer scrolls.
const docs = { left: new Stitcher(), right: new Stitcher() };

// ------------------------------------------------------------------ windows

const webPrefs = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true };

function createMain() {
  const { workArea } = screen.getPrimaryDisplay();
  main = new BrowserWindow({
    width: 460, height: Math.min(900, workArea.height - 40), minWidth: 400, minHeight: 560,
    x: workArea.x + workArea.width - 480, y: workArea.y + 20,
    title: 'Evaratus Review', icon: ICON, show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0a0a0a', webPreferences: webPrefs, acceptFirstMouse: true,
  });
  main.setContentProtection(true); // never read our own window as part of a document
  main.loadFile(path.join(__dirname, 'ui', 'index.html'));
  main.once('ready-to-show', () => main.show());
  main.on('closed', () => { main = null; app.quit(); });
}

function overlayFor(display) {
  let win = overlays.get(display.id);
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({
    ...display.bounds, frame: false, transparent: true, resizable: false, movable: false, focusable: false,
    skipTaskbar: true, hasShadow: false, enableLargerThanScreen: true, show: false, webPreferences: webPrefs,
  });
  win.setIgnoreMouseEvents(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentProtection(true); // marks must not end up in the next capture
  win.loadFile(path.join(__dirname, 'ui', 'overlay.html'), { query: { x: display.bounds.x, y: display.bounds.y } });
  win.once('ready-to-show', () => win.showInactive());
  overlays.set(display.id, win);
  return win;
}

function send(win, channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

// ------------------------------------------------------------------ region picking

function startPicking() {
  picking = { step: 0, picked: {} };
  if (main) main.hide();
  for (const w of overlays.values()) if (!w.isDestroyed()) w.hide();
  selectors = screen.getAllDisplays().map((d) => {
    const win = new BrowserWindow({
      ...d.bounds, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true,
      hasShadow: false, enableLargerThanScreen: true, show: false, webPreferences: webPrefs,
      acceptFirstMouse: true, // macOS: the first click starts the box instead of only activating the window
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadFile(path.join(__dirname, 'ui', 'selector.html'), { query: { x: d.bounds.x, y: d.bounds.y } });
    win.once('ready-to-show', () => {
      win.show();
      if (process.platform === 'darwin') app.focus({ steal: true });
      win.focus();
      send(win, 'selector:step', picking);
    });
    return win;
  });
}

const size = (r) => `${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.x)},${Math.round(r.y)}`;

function stopPicking(saved) {
  for (const w of selectors) if (!w.isDestroyed()) w.close();
  selectors = [];
  picking = null;
  log(saved ? `documents selected: ${size(saved.left)} and ${size(saved.right)}` : 'selection cancelled');
  if (saved) {
    docs.left.reset();
    docs.right.reset();
    settings.set({ regions: saved, regionsFrom: 'manual' });
    lastHeader = '';
    lastPrint = '';
    last = null;
    decided = new Set();
  }
  if (main) { main.show(); main.focus(); }
  for (const w of overlays.values()) if (!w.isDestroyed()) w.showInactive();
  pushState();
  if (saved) scan(true);
}

// ------------------------------------------------------------------ scanning

/** Cheap fingerprint of both captures, so an unchanged screen is not read again. */
function fingerprint(shots) {
  const h = crypto.createHash('sha1');
  for (const side of ['left', 'right']) {
    const bmp = shots[side].image.toBitmap();
    const step = Math.max(4, Math.floor(bmp.length / 200000) * 4);
    for (let i = 0; i < bmp.length; i += step) h.update(bmp.subarray(i, i + 4));
  }
  return h.digest('hex');
}

const toScreen = (shot) => (boxes) => boxes.map(([x, y, w, h]) => ({
  x: shot.rect.x + x / shot.scale, y: shot.rect.y + y / shot.scale, width: w / shot.scale, height: h / shot.scale,
}));

function screenAccess() {
  if (process.platform !== 'darwin') return 'granted';
  return systemPreferences.getMediaAccessStatus('screen');
}

// One line per event in the terminal, so problems can be seen (no document text is printed).
const log = (...a) => console.log('[Evaratus Review]', ...a);

async function scan(force) {
  const regions = settings.get().regions;
  if (scanning || picking || !regions) return;
  scanning = true;
  const t0 = Date.now();
  try {
    const shots = await capture.grab(regions);
    if (capture.looksBlank(shots.left.image) && capture.looksBlank(shots.right.image)) {
      log('capture is blank; screen access:', screenAccess());
      send(main, 'status', { state: screenAccess() === 'granted' ? 'blank' : 'permission' });
      return;
    }
    // A different file name in the pane header means the next task is open: start over.
    if (shots.header) {
      const read = await ocr.recognize(shots.header.image.toPNG(), { scale: shots.header.scale < 2 ? 2 : 1 });
      const name = read.lines.map((l) => l.text).join(' ').toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, '');
      if (name.length >= 4) {
        if (lastHeader && name !== lastHeader) {
          log('new task: the file name in the pane header changed');
          docs.left.reset();
          docs.right.reset();
          decided = new Set();
          taskDone = false;
          lastPrint = '';
        }
        lastHeader = name;
      }
    }
    const print = fingerprint(shots);
    if (!force && print === lastPrint) return;
    send(main, 'status', { state: 'reading' });

    // Small (non-Retina) text is read enlarged: OCR keeps the spaces between words better.
    const scaleFor = (shot) => (shot.scale < 2 ? 2 : 1);
    const [leftOcr, rightOcr] = await Promise.all([
      ocr.recognize(shots.left.image.toPNG(), { scale: scaleFor(shots.left) }),
      ocr.recognize(shots.right.image.toPNG(), { scale: scaleFor(shots.right) }),
    ]);
    const tOcr = Date.now();

    // Place this read in the documents read so far.
    const size = shots.right.image.getSize();
    const img = { data: shots.right.image.toBitmap(), width: size.width, height: size.height, bgra: true };
    const leftRead = snapshotRows(leftOcr);
    const rightRead = snapshotRows(rightOcr);
    const unknownColours = colours.labelRows(rightRead, img, { learned: settings.get().learnedColours });
    const leftAdded = docs.left.add(leftRead);
    if (leftAdded === 'new') docs.right.reset();   // a new original means a new task
    // The redacted side only starts over together with the original (a new task).
    const rightAdded = docs.right.add(rightRead);
    if (leftAdded === 'ignored' || rightAdded === 'ignored') {
      // Another window in front, a page switching, a half-drawn screen: keep the last result.
      lastPrint = print;
      awayReads++;
      const chars = (rows) => rows.reduce((n, r) => n + r.text.length, 0);
      log(`read skipped (${leftAdded}/${rightAdded}, ${chars(leftRead)} + ${chars(rightRead)} characters): the boxes do not show the task right now`);
      send(main, 'status', { state: 'away' });
      // The task moved (window resized, panel moved)? Look for the documents again.
      if (settings.get().autoFind && awayReads >= 4) { awayReads = 0; setTimeout(() => findDocuments('the boxes stopped showing the task'), 0); }
      return;
    }
    awayReads = 0;

    // Compare only the part read on both sides.
    const leftRows = docs.left.document();
    // The redacted document may be laid out in another order: follow the original's.
    const reordered = reorderToMatch(leftRows, docs.right.document());
    const rightRows = reordered.rows;
    const range = comparableRange(leftRows, rightRows) || { left: [0, leftRows.length - 1], right: [0, rightRows.length - 1], matched: 0 };
    const lRows = leftRows.slice(range.left[0], range.left[1] + 1);
    const rRows = rightRows.slice(range.right[0], range.right[1] + 1);
    const left = joinRows(lRows);
    const right = joinRows(rRows);
    const spans = colours.spansFromRows(rRows, right);
    const result = analyzer.analyze(left, right, spans);
    result.coverage = {
      leftRows: leftRows.length, rightRows: rightRows.length, comparedLeft: lRows.length, comparedRight: rRows.length,
      notComparedLeft: leftRows.length - lRows.length, notComparedRight: rightRows.length - rRows.length,
      movedRows: reordered.moved,
    };

    // Image pixels -> screen points, for the overlay and for "show me" in the window.
    const L = toScreen(shots.left);
    const R = toScreen(shots.right);
    for (const stage of ['L1', 'L2']) {
      for (const f of result[stage].findings) { f.leftRects = L(f.leftBoxes); f.rightRects = R(f.rightBoxes); delete f.leftBoxes; delete f.rightBoxes; }
    }
    for (const l of result.labels) { l.rightRects = R(l.rightBoxes); delete l.rightBoxes; }
    for (const k of result.knownNames) { k.leftRects = L(k.leftBoxes); delete k.leftBoxes; }
    for (const x of result.extras) { x.leftRects = L(x.leftBoxes); x.rightRects = R(x.rightBoxes); delete x.leftBoxes; delete x.rightBoxes; }
    // What the window shows: each piece of PII with its site label, labeled? redacted?
    result.view = labelView.build(result, result.extras);

    if (last && last.taskKey !== result.taskKey) decided = new Set();
    lastPrint = print;
    last = { ...result, unknownColours, readAt: Date.now(), ocrMs: tOcr - t0, totalMs: Date.now() - t0, engine: ocr.engineName() };
    send(main, 'result', last);
    send(main, 'status', { state: 'idle' });
    drawOverlay();
    log(`read ${leftAdded}: document ${leftRows.length} + ${rightRows.length} rows, compared ${lRows.length} + ${rRows.length}, ${spans.length} labels, ` +
      `${result.L2.findings.length} L2 findings, ${result.L1.findings.length} L1 findings, ${last.totalMs} ms`);
  } catch (err) {
    if (err && err.code === 'permission') {
      log('no screen recording permission:', err.message);
      send(main, 'status', { state: 'permission' });
      return;
    }
    console.error('[Evaratus Review] scan failed', err);
    send(main, 'status', { state: 'error', message: String(err && err.message || err) });
  } finally {
    scanning = false;
  }
}

// ------------------------------------------------------------------ finding the documents automatically

/**
 * Reads the whole screen (without this app's windows) and looks for the raw original and
 * the redacted work side by side. Saves them as the boxes when found.
 * @returns {boolean} found
 */
async function findDocuments(reason) {
  if (finding || picking) return false;
  finding = true;
  send(main, 'status', { state: 'finding' });
  try {
    const cursor = screen.getCursorScreenPoint();
    const displays = [screen.getDisplayNearestPoint(cursor), ...screen.getAllDisplays()]
      .filter((d, i, all) => all.findIndex((x) => x.id === d.id) === i);
    for (const d of displays) {
      const area = d.workArea;
      const t0 = Date.now();
      const shot = await capture.grabArea(area);
      if (capture.looksBlank(shot.image)) continue;
      const tCap = Date.now();
      const read = await ocr.recognize(shot.image.toPNG(), { scale: shot.scale < 2 ? 2 : 1 });
      log(`screen read for finding: ${read.lines.length} lines (capture ${tCap - t0} ms, text ${Date.now() - tCap} ms)`);
      const found = detectDocuments(read, { scale: shot.scale, origin: { x: area.x, y: area.y } });
      if (!found) continue;
      log(`documents found automatically (${reason}): ${size(found.left)} and ${size(found.right)}, match ${found.score}`);
      docs.left.reset();
      docs.right.reset();
      lastPrint = '';
      awayReads = 0;
      settings.set({ regions: { left: found.left, right: found.right, ...(found.header ? { header: found.header } : {}) }, regionsFrom: 'auto' });
      lastHeader = '';
      pushState();
      for (const side of ['left', 'right']) overlayFor(screen.getDisplayMatching(found[side]));
      drawOverlay();
      for (const w of overlays.values()) send(w, 'overlay:show-frames', null);
      return true;
    }
    log(`no pair of documents found on screen (${reason})`);
    send(main, 'status', { state: 'notfound' });
    return false;
  } catch (err) {
    if (err && err.code === 'permission') { send(main, 'status', { state: 'permission' }); return false; }
    log('finding documents failed:', err.message);
    send(main, 'status', { state: 'error', message: err.message });
    return false;
  } finally {
    finding = false;
  }
}

// ------------------------------------------------------------------ reading the whole document

const { execFile } = require('child_process');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Scroll whatever is under the middle of a box (macOS; needs Accessibility permission). */
function scrollBox(rect, pixels) {
  const bin = fs.existsSync(path.join(process.resourcesPath || '', 'bin', 'scroll-mac'))
    ? path.join(process.resourcesPath, 'bin', 'scroll-mac') : path.join(__dirname, 'bin', 'scroll-mac');
  const x = Math.round(rect.x + rect.width / 2);
  const y = Math.round(rect.y + rect.height / 2);
  return new Promise((resolve) => execFile(bin, [String(x), String(y), String(Math.round(pixels))], { timeout: 10000 }, () => resolve()));
}

let readingAll = false;
/**
 * Pages through both document panes from top to bottom, reading each step, so both
 * documents are read in full; then scrolls them back to the top.
 */
async function readWholeDocument() {
  const regions = settings.get().regions;
  if (!regions || readingAll || picking) return;
  if (process.platform !== 'darwin') { send(main, 'status', { state: 'error', message: 'Reading the whole document automatically is available on macOS.' }); return; }
  // Sending scroll events needs Accessibility permission; asking shows the system prompt.
  if (!systemPreferences.isTrustedAccessibilityClient(true)) {
    log('read whole document: waiting for Accessibility permission');
    send(main, 'status', { state: 'accessibility' });
    return;
  }
  readingAll = true;
  const wasLive = settings.get().live;
  setLive(false);
  docs.left.reset();
  docs.right.reset();
  lastPrint = '';
  try {
    const page = (side) => regions[side].height * 0.7;
    // A picture of the redacted pane, to see whether it moves with the original.
    const rightPrint = async () => {
      const shot = await capture.grab(regions);
      return crypto.createHash('sha1').update(shot.right.image.toBitmap()).digest('hex');
    };
    await Promise.all(['left', 'right'].map((side) => scrollBox(regions[side], 30000)));   // to the top
    await wait(500);
    let synced = null;   // do the two panes scroll together? (found out on the first step)
    let still = 0;
    for (let step = 1; step <= 60 && still < 2; step++) {
      send(main, 'status', { state: 'reading-all', step });
      const before = docs.left.rows.length + docs.right.rows.length;
      await scan(true);
      const after = docs.left.rows.length + docs.right.rows.length;
      still = after === before ? still + 1 : 0;
      if (synced === null) {
        const r0 = await rightPrint();
        await scrollBox(regions.left, -page('left'));
        await wait(450);
        synced = (await rightPrint()) !== r0;
        log(`read whole document: the panes ${synced ? 'scroll together' : 'scroll separately'}`);
        if (!synced) await scrollBox(regions.right, -page('right'));
      } else if (synced) {
        await scrollBox(regions.left, -page('left'));
      } else {
        await Promise.all(['left', 'right'].map((side) => scrollBox(regions[side], -page(side))));
      }
      await wait(450);
    }
    log(`read whole document: ${docs.left.rows.length} + ${docs.right.rows.length} lines`);
    await Promise.all(['left', 'right'].map((side) => scrollBox(regions[side], 30000)));   // back to the top
    await wait(400);
    await scan(true);
  } finally {
    readingAll = false;
    setLive(wasLive);
    send(main, 'status', { state: 'idle' });
  }
}

// ------------------------------------------------------------------ overlay


// The tab shown on a mark: the label a value needs (left), what is wrong with it (right).
function itemTags(item) {
  const problems = [];
  if (item.labeled === 'no') problems.push('Not labeled');
  if (item.labeled === 'other') problems.push(`Labeled ${item.rightSite}`);
  if (item.redaction === 'visible') problems.push('Still visible');
  if (item.redaction === 'partly') problems.push('Partly visible');
  if (item.redaction === 'replacement') problems.push('Fix replacement');
  return { left: item.site, right: problems.length ? `${item.site}: ${problems.join(' · ')}` : `✓ ${item.site}` };
}

function drawOverlay(flashId) {
  const s = settings.get();
  const marks = [];
  if (s.overlay && last && last.view) {
    for (const item of last.view.items) {
      const tags = itemTags(item);
      const done = item.ok;
      item.leftRects.forEach((r, i) => marks.push({ id: item.id, side: 'left', done, tag: i === 0 ? tags.left : '', ...r }));
      item.rightRects.forEach((r, i) => marks.push({ id: item.id, side: 'right', done, tag: i === 0 ? tags.right : '', ...r }));
    }
    for (const o of last.view.other) {
      const tag = o.ok ? '✓ Overscrubbed' : o.kind === 'text' ? 'Text changed' : o.marked ? 'Overscrubbed' : 'Not PII — label Overscrubbed or keep';
      o.rightRects.forEach((r, i) => marks.push({ id: o.id, side: 'right', done: o.ok, tag: i === 0 ? tag : '', ...r }));
    }
  }
  const frames = s.regions && s.overlay ? [{ side: 'left', ...s.regions.left }, { side: 'right', done: taskDone, ...s.regions.right }] : [];
  for (const d of screen.getAllDisplays()) {
    const b = d.bounds;
    const inside = (r) => r.x < b.x + b.width && r.x + r.width > b.x && r.y < b.y + b.height && r.y + r.height > b.y;
    const mine = marks.filter(inside);
    const myFrames = frames.filter(inside);
    if (!mine.length && !myFrames.length && !overlays.has(d.id)) continue;
    send(overlayFor(d), 'overlay:draw', { marks: mine, frames: myFrames, flashId: flashId || null });
  }
}

// ------------------------------------------------------------------ window <-> app

function pushState() {
  const s = settings.get();
  send(main, 'state', {
    regions: s.regions, regionsFrom: s.regionsFrom,
    canScroll: process.platform === 'darwin' && systemPreferences.isTrustedAccessibilityClient(false), autoFind: s.autoFind, stage: s.stage, live: s.live, overlay: s.overlay, learnedColours: s.learnedColours,
    engine: ocr.engineName(), platform: process.platform, access: screenAccess(), version: app.getVersion(),
  });
}

function setLive(on) {
  clearInterval(liveTimer);
  liveTimer = on ? setInterval(() => { if (!readingAll) scan(false); }, LIVE_EVERY_MS) : null;
}

ipcMain.handle('app:ready', () => { pushState(); if (last) send(main, 'result', last); });
ipcMain.handle('app:pick', () => { log('selecting documents'); startPicking(); });
ipcMain.handle('app:scan', () => scan(true));
ipcMain.handle('app:find', async () => {
  const ok = await findDocuments('asked');
  if (!ok) return false;
  // Found automatically: read both documents in full right away (when scrolling is allowed).
  if (process.platform === 'darwin' && systemPreferences.isTrustedAccessibilityClient(false)) await readWholeDocument();
  else scan(true);
  return true;
});
ipcMain.handle('app:read-all', () => readWholeDocument());
ipcMain.handle('app:new-task', () => {
  taskDone = false;
  docs.left.reset();
  docs.right.reset();
  lastPrint = '';
  last = null;
  decided = new Set();
  log('starting over: new task');
  drawOverlay();
  scan(true);
});
ipcMain.handle('app:set', (_e, patch) => {
  const allowed = {};
  for (const k of ['stage', 'live', 'overlay', 'autoFind']) if (k in patch) allowed[k] = patch[k];
  settings.set(allowed);
  if ('live' in allowed) setLive(allowed.live);
  pushState();
  drawOverlay();
});
ipcMain.handle('app:decided', (_e, ids) => { decided = new Set(ids); drawOverlay(); });
ipcMain.handle('app:done', (_e, done) => {
  if (Boolean(done) === taskDone) return;
  taskDone = Boolean(done);
  if (taskDone) log('task done: no problems left on the right');
  drawOverlay();
});
ipcMain.handle('app:flash', (_e, id) => drawOverlay(id));
ipcMain.handle('app:show-regions', () => {
  const regions = settings.get().regions;
  if (!regions) return;
  for (const side of ['left', 'right']) overlayFor(screen.getDisplayMatching(regions[side]));
  drawOverlay();
  for (const w of overlays.values()) send(w, 'overlay:show-frames', null);
});
ipcMain.handle('app:learn-colour', (_e, { hex, label }) => {
  const learned = { ...settings.get().learnedColours };
  if (label) learned[hex] = label; else delete learned[hex];
  settings.set({ learnedColours: learned });
  pushState();
  scan(true);
});
ipcMain.handle('app:forget-colours', () => { settings.set({ learnedColours: {} }); pushState(); scan(true); });
ipcMain.handle('app:open-permissions', () => {
  if (process.platform === 'darwin') shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
});
ipcMain.handle('app:palette', () => colours.DEFAULT_PALETTE);

ipcMain.handle('selector:rect', (_e, rect) => {
  if (!picking) return;
  picking.picked[picking.step === 0 ? 'left' : 'right'] = rect;
  picking.step++;
  if (picking.step >= 2) return stopPicking(picking.picked);
  for (const w of selectors) send(w, 'selector:step', picking);
});
ipcMain.handle('selector:back', () => {
  if (!picking || picking.step === 0) return;
  picking.step = 0;
  picking.picked = {};
  for (const w of selectors) send(w, 'selector:step', picking);
});
ipcMain.handle('selector:cancel', () => stopPicking(null));

// ------------------------------------------------------------------ start

app.whenReady().then(() => {
  // No network: block every request that is not one of the app's own files.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !/^(file|devtools|chrome-extension):/.test(details.url) }));
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(nativeImage.createFromPath(ICON));
  settings = Settings.create(app.getPath('userData'));
  analyzer.setExtraNames(settings.get().extraKnownNames);
  log(`started; screen access: ${screenAccess()}; documents: ${settings.get().regions ? 'selected' : 'not selected yet'}`);
  // macOS: asking once makes the system show its permission prompt and list the app under Screen Recording.
  if (screenAccess() !== 'granted' && !process.env.EVARATUS_SELFTEST) {
    desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => {});
  }
  // EVARATUS_SELFTEST=1: read the left and right half of the main screen once, print the result, quit.
  if (process.env.EVARATUS_SELFTEST) {
    const { workArea: w } = screen.getPrimaryDisplay();
    const half = Math.floor(w.width / 2);
    settings = { get: () => ({ ...Settings.DEFAULTS, regions: { left: { ...w, width: half }, right: { ...w, x: w.x + half, width: half } } }), set() {} };
    scan(true).then(() => app.quit());
    return;
  }
  // EVARATUS_SELFTEST_FIND=1: look for the documents on screen once, print what was found, quit (settings untouched).
  if (process.env.EVARATUS_SELFTEST_FIND) {
    let saved = { ...Settings.DEFAULTS };
    settings = { get: () => saved, set: (p) => { saved = { ...saved, ...p }; return saved; } };
    findDocuments('self-test').then(async (ok) => {
      if (ok) {
        log('regions:', JSON.stringify(saved.regions));
        if (process.env.EVARATUS_SELFTEST_FIND === 'all' && systemPreferences.isTrustedAccessibilityClient(false)) await readWholeDocument();
        else await scan(true);
        if (last && last.view) {
          for (const i of last.view.items) log(`  ${i.site.padEnd(20)} ${JSON.stringify(i.text).padEnd(46)} label ${i.labeled.padEnd(5)} ${i.redaction || '-'}`);
          for (const o of last.view.other) log(`  other: ${o.kind} ${JSON.stringify(o.text)} ${o.rightSite || ''}`);
        }
      }
      app.quit();
    });
    return;
  }
  // EVARATUS_SELFTEST_PICK=1: open the region picker and drag two boxes with simulated mouse events.
  if (process.env.EVARATUS_SELFTEST_PICK) {
    createMain();
    main.webContents.once('did-finish-load', () => setTimeout(() => {
      startPicking();
      const win = selectors[0];
      const drag = (x1, y1, x2, y2) => {
        win.webContents.sendInputEvent({ type: 'mouseDown', x: x1, y: y1, button: 'left', clickCount: 1 });
        win.webContents.sendInputEvent({ type: 'mouseMove', x: x2, y: y2, button: 'left' });
        win.webContents.sendInputEvent({ type: 'mouseUp', x: x2, y: y2, button: 'left', clickCount: 1 });
      };
      win.webContents.once('did-finish-load', () => setTimeout(() => {
        drag(100, 150, 600, 700);
        setTimeout(() => drag(700, 150, 1200, 700), 500);
        setTimeout(() => { log('regions now:', JSON.stringify(settings.get().regions)); app.quit(); }, 6000);
      }, 500));
    }, 500));
    return;
  }
  createMain();
  setLive(settings.get().live);
  screen.on('display-removed', (_e, d) => { const w = overlays.get(d.id); if (w && !w.isDestroyed()) w.close(); overlays.delete(d.id); });
});

app.on('window-all-closed', () => app.quit());
