import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 1024;
const BRAND = [199, 255, 74, 255];
const DARK = [9, 10, 15, 255];
const TRANSPARENT = [0, 0, 0, 0];
const WHITE = [255, 255, 255, 255];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    rows[rowOffset] = 0;
    rgba.copy(rows, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND'),
  ]);
}

function insideRoundedRect(px, py, x, y, width, height, radius) {
  if (px < x || py < y || px > x + width || py > y + height) return false;
  const innerLeft = x + radius;
  const innerRight = x + width - radius;
  const innerTop = y + radius;
  const innerBottom = y + height - radius;
  if ((px >= innerLeft && px <= innerRight) || (py >= innerTop && py <= innerBottom)) return true;
  const cx = px < innerLeft ? innerLeft : innerRight;
  const cy = py < innerTop ? innerTop : innerBottom;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function insideCircle(px, py, centerX, centerY, radius) {
  const dx = px - centerX;
  const dy = py - centerY;
  return dx * dx + dy * dy <= radius * radius;
}

function canonicalMask(x, y) {
  const heads = insideCircle(x, y, 352, 205, 72) || insideCircle(x, y, 672, 205, 72);

  let leftBond = insideRoundedRect(x, y, 144, 300, 512, 618, 256)
    && !insideRoundedRect(x, y, 286, 442, 228, 334, 114);
  if (x > 492 && y > 602) leftBond = false;

  let rightBond = insideRoundedRect(x, y, 368, 300, 512, 618, 256)
    && !insideRoundedRect(x, y, 510, 442, 228, 334, 114);
  if (x < 532 && y < 602) rightBond = false;

  const bindingKnot = insideRoundedRect(x, y, 260, 580, 504, 90, 45);
  return heads || leftBond || rightBond || bindingKnot;
}

function transformedMask(x, y, scale = 1, centerX = 512, centerY = 512) {
  const sourceX = (x - centerX) / scale + 512;
  const sourceY = (y - centerY) / scale + 512;
  return canonicalMask(sourceX, sourceY);
}

function coverageAt(x, y, options) {
  const samples = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  let hits = 0;
  for (const [sx, sy] of samples) {
    if (transformedMask(x + sx, y + sy, options.scale ?? 1, options.centerX ?? 512, options.centerY ?? 512)) hits += 1;
  }
  return hits / samples.length;
}

function render({ foreground, background = TRANSPARENT, scale = 1, centerX = 512, centerY = 512 }) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const coverage = coverageAt(x, y, { scale, centerX, centerY });
      const offset = (y * SIZE + x) * 4;
      const fgAlpha = (foreground[3] / 255) * coverage;
      const bgAlpha = background[3] / 255;
      const outAlpha = fgAlpha + bgAlpha * (1 - fgAlpha);
      for (let channel = 0; channel < 3; channel += 1) {
        const value = outAlpha === 0
          ? 0
          : (foreground[channel] * fgAlpha + background[channel] * bgAlpha * (1 - fgAlpha)) / outAlpha;
        rgba[offset + channel] = Math.round(value);
      }
      rgba[offset + 3] = Math.round(outAlpha * 255);
    }
  }
  return encodePng(SIZE, SIZE, rgba);
}

mkdirSync('assets/brand', { recursive: true });
writeFileSync('assets/brand/icon.png', render({ foreground: BRAND, background: DARK }));
writeFileSync('assets/brand/adaptive-foreground.png', render({ foreground: BRAND }));
writeFileSync('assets/brand/monochrome.png', render({ foreground: WHITE }));
writeFileSync('assets/brand/splash-icon.png', render({ foreground: BRAND, scale: 0.684, centerX: 522.5, centerY: 512 }));

console.log('Binder brand assets materialized: icon, adaptive foreground, monochrome and splash.');
