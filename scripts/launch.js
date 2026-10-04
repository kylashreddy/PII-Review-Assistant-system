// Starts the app. On macOS it is opened as its own application (not as a child of the
// terminal), so Screen Recording permission belongs to the app itself and works from
// any terminal. Its log lines still appear in this terminal; Ctrl-C quits it.
'use strict';
const path = require('path');
const { spawn, execSync } = require('child_process');

const appDir = path.join(__dirname, '..');
const electron = require('electron'); // path to the Electron binary

if (process.platform !== 'darwin') {
  spawn(electron, [appDir], { stdio: 'inherit' }).on('exit', (code) => process.exit(code || 0));
} else {
  const bundle = path.resolve(electron, '..', '..', '..'); // …/Electron.app
  let tty = '';
  try { tty = execSync('tty', { stdio: ['inherit', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { /* not a terminal */ }
  const out = tty && tty.startsWith('/dev/') ? ['--stdout', tty, '--stderr', tty] : [];
  const child = spawn('open', ['-W', '-n', '-a', bundle, ...out, '--args', appDir], { stdio: 'inherit' });
  const quit = () => { try { execSync(`pkill -f "${bundle}/Contents/MacOS/Electron ${appDir}"`); } catch (e) { /* already closed */ } };
  process.on('SIGINT', () => { quit(); process.exit(0); });
  child.on('exit', (code) => process.exit(code || 0));
}
