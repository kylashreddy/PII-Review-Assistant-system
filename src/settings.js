// The app's settings, saved in the user's app data folder. Only positions, choices
// and taught label colours are stored — never document text or screen images.
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  regions: null,          // {left: {x, y, width, height}, right: {...}} in screen points
  stage: 'L2',            // 'L1' identify, 'L2' verify
  live: true,             // re-read the screen when it changes
  overlay: true,          // marks drawn over the documents
  autoFind: true,         // look for the documents again when the boxes stop showing them
  regionsFrom: null,      // 'auto' | 'manual'
  learnedColours: {},     // '#rrggbb' -> site label name
  extraKnownNames: [],
};

function create(dir) {
  const file = path.join(dir, 'settings.json');
  let data = { ...DEFAULTS };
  try { data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (e) { /* first start */ }
  return {
    get: () => data,
    set(patch) {
      data = { ...data, ...patch };
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      return data;
    },
  };
}

module.exports = { create, DEFAULTS };
