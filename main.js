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
const crypto = require('crypto');
const capture = require('./src/capture');
const ocr = require('./src/ocr');
const { snapshotRows, joinRows } = require('./src/text-layout');
const { Stitcher, comparableRange } = require('./src/stitch');
const colours = require('./src/label-colors');
const analyzer = require('./src/analyzer');
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
    settings.set({ regions: saved });
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
    const rightAdded = docs.right.add(rightRead, { mayStartOver: leftAdded === 'new' || !docs.right.rows.length });
    if (leftAdded === 'ignored' || rightAdded === 'ignored') {
      // Another window in front, a page switching, a half-drawn screen: keep the last result.
      lastPrint = print;
      log(`read skipped (${leftAdded}/${rightAdded}): the boxes do not show the task right now`);
      send(main, 'status', { state: 'away' });
      return;
    }

    // Compare only the part read on both sides.
    const leftRows = docs.left.document();
    const rightRows = docs.right.document();
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
    };

    // Image pixels -> screen points, for the overlay and for "show me" in the window.
    const L = toScreen(shots.left);
    const R = toScreen(shots.right);
    for (const stage of ['L1', 'L2']) {
      for (const f of result[stage].findings) { f.leftRects = L(f.leftBoxes); f.rightRects = R(f.rightBoxes); delete f.leftBoxes; delete f.rightBoxes; }
    }
    for (const l of result.labels) { l.rightRects = R(l.rightBoxes); delete l.rightBoxes; }
    for (const k of result.knownNames) { k.leftRects = L(k.leftBoxes); delete k.leftBoxes; }

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

// ------------------------------------------------------------------ overlay

const MARK = {
  L2: { LEAKAGE: 'leak', INCOHERENT: 'fix', DATATYPE: 'fix', NOT_SENSIBLE: 'fix', OVER_REDACTED: 'over', UNSURE: 'maybe', UNKNOWN_TEXT: 'text' },
  L1: { PI_TODO: 'pi', BI_TODO: 'bi', CRED_TODO: 'cred', NOT_PII: 'over', CHECK: 'fix' },
};

function drawOverlay(flashId) {
  const s = settings.get();
  const marks = [];
  if (s.overlay && last) {
    const kinds = MARK[s.stage];
    for (const f of last[s.stage].findings) {
      const kind = kinds[f.category];
      if (!kind) continue;
      const done = decided.has(f.id);
      // The status goes on the first box of the side the reviewer acts on (the redacted work when there is one).
      const tag = analyzer.load().decisions.short(f, s.stage);
      const tagSide = f.rightRects.length ? 'right' : 'left';
      f.leftRects.forEach((r, i) => marks.push({ id: f.id, kind, side: 'left', done, tag: tagSide === 'left' && i === 0 ? tag : '', ...r }));
      f.rightRects.forEach((r, i) => marks.push({ id: f.id, kind, side: 'right', done, tag: tagSide === 'right' && i === 0 ? tag : '', ...r }));
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
    regions: s.regions, stage: s.stage, live: s.live, overlay: s.overlay, learnedColours: s.learnedColours,
    engine: ocr.engineName(), platform: process.platform, access: screenAccess(), version: app.getVersion(),
  });
}

function setLive(on) {
  clearInterval(liveTimer);
  liveTimer = on ? setInterval(() => scan(false), LIVE_EVERY_MS) : null;
}

ipcMain.handle('app:ready', () => { pushState(); if (last) send(main, 'result', last); });
ipcMain.handle('app:pick', () => { log('selecting documents'); startPicking(); });
ipcMain.handle('app:scan', () => scan(true));
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
  for (const k of ['stage', 'live', 'overlay']) if (k in patch) allowed[k] = patch[k];
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
