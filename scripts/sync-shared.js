// Copies the PII Review Assistant extension's detection and checking code into shared/,
// so the desktop app and the Chrome extension run exactly the same rules. The extension's
// manifest.json is the list; scripts that need a web page (content.js, config.js) are left out.
//
// The extension is looked for next to this project (../pii-review-assistant) or at
// PII_EXTENSION_DIR. Without it, the copy already in shared/ (committed) is used as is.
'use strict';
const fs = require('fs');
const path = require('path');

const EXT = process.env.PII_EXTENSION_DIR || path.join(__dirname, '..', '..', 'pii-review-assistant');
const OUT = path.join(__dirname, '..', 'shared');

if (!fs.existsSync(path.join(EXT, 'manifest.json'))) {
  if (!fs.existsSync(path.join(OUT, 'scripts.json'))) {
    console.error(`shared: extension not found at ${EXT} and no shared/ copy. Set PII_EXTENSION_DIR.`);
    process.exit(1);
  }
  console.log('shared: using the bundled copy in shared/');
  process.exit(0);
}
const BROWSER_ONLY = new Set(['content.js', 'core/config.js']);

const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const scripts = manifest.content_scripts[0].js.filter((f) => !BROWSER_ONLY.has(f));
const files = [...scripts, 'data/business-names.json'];

fs.rmSync(OUT, { recursive: true, force: true });
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true });
  fs.copyFileSync(path.join(EXT, f), path.join(OUT, f));
}
fs.writeFileSync(path.join(OUT, 'scripts.json'), JSON.stringify(scripts, null, 2) + '\n');
console.log(`shared: ${files.length} files from the extension (v${manifest.version})`);
