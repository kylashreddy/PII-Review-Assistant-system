// Captures the two selected regions of the screen. Regions are in screen points
// (the same coordinates Electron uses for windows); images are in device pixels.
//
// macOS: bin/capture-mac (ScreenCaptureKit), which leaves this app's own windows —
// the panel and the marks — out of the picture. Windows: Electron's desktopCapturer;
// the app's windows are excluded there by setContentProtection.
'use strict';
const { desktopCapturer, screen, nativeImage } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

function helper() {
  const packaged = process.resourcesPath && path.join(process.resourcesPath, 'bin', 'capture-mac');
  return packaged && fs.existsSync(packaged) ? packaged : path.join(__dirname, '..', 'bin', 'capture-mac');
}

function grabMac(regions) {
  const rects = [regions.left, regions.right, ...(regions.header ? [regions.header] : [])];
  return captureRects(rects).then((shots) => ({ left: shots[0], right: shots[1], header: shots[2] || null }));
}

/** macOS: capture any rectangles (screen points) -> [{image, rect, scale}]. */
function captureRects(rects) {
  return new Promise((resolve, reject) => {
    execFile(helper(), [String(process.pid), JSON.stringify(rects)], { maxBuffer: 512 * 1024 * 1024, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error((stderr || err.message).trim());
        if (err.code === 2) e.code = 'permission';
        if (err.killed) e.message = 'Screen capture did not answer. macOS may be showing a screen-recording dialog — click Allow, then try again.';
        return reject(e);
      }
      const { images } = JSON.parse(stdout);
      resolve(images.map((img, i) => ({ image: nativeImage.createFromBuffer(Buffer.from(img.png, 'base64')), rect: rects[i], scale: img.scale })));
    });
  });
}

/** The display a region is on, and its pixels-per-point. */
function displayFor(rect) {
  const d = screen.getDisplayMatching(rect);
  return { display: d, scale: d.scaleFactor };
}

/**
 * @param regions {left, right}  rectangles in screen points
 * @returns {left, right} each {image (NativeImage, cropped), rect, scale}
 */
async function grab(regions) {
  if (process.platform === 'darwin') return grabMac(regions);
  const displays = screen.getAllDisplays();
  const maxW = Math.max(...displays.map((d) => Math.round(d.size.width * d.scaleFactor)));
  const maxH = Math.max(...displays.map((d) => Math.round(d.size.height * d.scaleFactor)));
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } });
  const out = {};
  for (const side of ['left', 'right']) {
    const rect = regions[side];
    const { display } = displayFor(rect);
    const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
    if (!source) throw new Error('No screen could be captured.');
    const shot = source.thumbnail;
    const px = shot.getSize().width / display.bounds.width; // device pixels per point on this display
    const crop = {
      x: Math.max(0, Math.round((rect.x - display.bounds.x) * px)),
      y: Math.max(0, Math.round((rect.y - display.bounds.y) * px)),
      width: Math.round(rect.width * px),
      height: Math.round(rect.height * px),
    };
    out[side] = { image: shot.crop(crop), rect, scale: px };
  }
  return out;
}

/** The whole work area of a display (screen points) as one image, for finding the documents. */
async function grabArea(rect) {
  if (process.platform === 'darwin') return (await captureRects([rect]))[0];
  const both = await grab({ left: rect, right: rect });
  return both.left;
}

/** True when the captured screen is empty: macOS without Screen Recording permission shows only the wallpaper. */
function looksBlank(image) {
  const { width, height } = image.getSize();
  const data = image.toBitmap();
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 4 * 97) {
    const v = data[i + 1];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return width === 0 || height === 0 || max - min < 8;
}

module.exports = { grab, grabArea, looksBlank };
