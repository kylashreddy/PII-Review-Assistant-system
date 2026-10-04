// Builds the native helpers for this computer. macOS: Apple Vision OCR (bin/ocr-mac) and
// ScreenCaptureKit capture that leaves out the app's own windows (bin/capture-mac).
// Windows uses ocr/ocr-win.ps1 (Windows.Media.Ocr) and needs no build.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

if (process.platform !== 'darwin') { console.log('ocr: nothing to build on', process.platform); process.exit(0); }
for (const name of ['ocr-mac', 'capture-mac']) {
  const src = path.join(__dirname, '..', 'ocr', `${name}.swift`);
  const out = path.join(__dirname, '..', 'bin', name);
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(src).mtimeMs) { console.log(`${name}: up to date`); continue; }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('swiftc', ['-O', src, '-o', out], { stdio: 'inherit' });
  console.log(`${name}: built`);
}
