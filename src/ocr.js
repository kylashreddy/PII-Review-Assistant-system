// Runs the OCR helper for this computer on a PNG. The image goes in through stdin
// and the text comes back as JSON; nothing is written to disk or sent anywhere.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');

function binDir() {
  // Packaged app: Resources/bin. Development: desktop/bin and desktop/ocr.
  const packaged = process.resourcesPath && path.join(process.resourcesPath, 'bin');
  return packaged && fs.existsSync(packaged) ? packaged : path.join(__dirname, '..', 'bin');
}

function engineName() {
  if (process.platform === 'darwin') return 'Apple Vision';
  if (process.platform === 'win32') return 'Windows OCR';
  return 'none';
}

function runMac(png, scale) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(binDir(), 'ocr-mac'), ['--scale', String(scale)]);
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(Buffer.concat(err).toString() || `OCR exited with ${code}`));
      try { resolve(JSON.parse(Buffer.concat(out).toString())); } catch (e) { reject(e); }
    });
    child.stdin.end(png);
  });
}

// Windows.Media.Ocr needs a file; it lives in the temp folder only while it is read.
function runWindows(png, scale) {
  const file = path.join(os.tmpdir(), `evaratus-ocr-${process.pid}-${Date.now()}.png`);
  fs.writeFileSync(file, png);
  const script = fs.existsSync(path.join(binDir(), 'ocr-win.ps1')) ? path.join(binDir(), 'ocr-win.ps1') : path.join(__dirname, '..', 'ocr', 'ocr-win.ps1');
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, file, String(scale)],
      { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
        fs.rm(file, { force: true }, () => {});
        if (err) return reject(err);
        try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
      });
  });
}

/** OCR a PNG buffer -> {width, height, lines:[{text, box, words:[{text, box}]}]} */
function recognize(png, { scale = 1 } = {}) {
  if (process.platform === 'darwin') return runMac(png, scale);
  if (process.platform === 'win32') return runWindows(png, scale);
  return Promise.reject(new Error('OCR is available on macOS and Windows only.'));
}

module.exports = { recognize, engineName };
