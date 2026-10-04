// Crops assets/wordmark.png (the company wordmark, dark on transparent) to its ink and
// writes a black and a white version for light and dark mode.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { readPng } = require('../test/png');

const A = path.join(__dirname, '..', 'assets');
const im = readPng(fs.readFileSync(path.join(A, 'wordmark.png')));
const alpha = (x, y) => im.data[(y * im.width + x) * 4 + 3];
let x0 = im.width, y0 = im.height, x1 = 0, y1 = 0;
for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
  if (alpha(x, y) > 10) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
}
const PAD = 2;
x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD); x1 = Math.min(im.width - 1, x1 + PAD); y1 = Math.min(im.height - 1, y1 + PAD);
const w = x1 - x0 + 1, h = y1 - y0 + 1;

const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = table[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
function write(file, grey) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = y * (w * 4 + 1) + 1 + x * 4;
      raw[d] = raw[d + 1] = raw[d + 2] = grey;
      raw[d + 3] = alpha(x + x0, y + y0);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(path.join(A, file), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
write('wordmark-black.png', 17);
write('wordmark-white.png', 255);
console.log(`wordmark: ${w} × ${h}`);
