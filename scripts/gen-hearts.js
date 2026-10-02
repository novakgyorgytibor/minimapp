// Klasszikus szív ikonok (teli + körvonalas) PNG-be, 1x/2x/3x – futtatás: node scripts/gen-hearts.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, alpha) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = raw[o + 1] = raw[o + 2] = 255;
      raw[o + 3] = Math.round(alpha[y * size + x] * 255);
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// A klasszikus szívgörbe: x = 16 sin³t, y = 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t
const N = 720;
const poly = [];
for (let i = 0; i < N; i++) {
  const t = (i / N) * 2 * Math.PI;
  poly.push([16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
}
const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);

function inside(px, py) {
  let c = false;
  for (let i = 0, j = N - 1; i < N; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function dist(px, py) {
  let best = Infinity;
  for (let i = 0, j = N - 1; i < N; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
  }
  return best;
}

const BASE = 24; // pt
const PAD = 2; // pt, a körvonal miatt
const STROKE = 1.6; // pt
for (const scale of [1, 2, 3]) {
  const size = BASE * scale;
  const inner = size - 2 * PAD * scale;
  const k = inner / Math.max(maxX - minX, maxY - minY); // px / görbe-egység
  const ox = (size - (maxX - minX) * k) / 2, oy = (size - (maxY - minY) * k) / 2;
  const fill = new Float32Array(size * size), line = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x + 0.5 - ox) / k + minX, gy = (y + 0.5 - oy) / k + minY;
      const d = dist(gx, gy) * k; // px
      const sd = inside(gx, gy) ? d : -d;
      fill[y * size + x] = Math.max(0, Math.min(1, sd + 0.5));
      line[y * size + x] = Math.max(0, Math.min(1, (STROKE * scale) / 2 - Math.abs(sd - (STROKE * scale) / 2) + 0.5));
    }
  }
  const sfx = scale === 1 ? '' : `@${scale}x`;
  const dir = path.join(__dirname, '..', 'assets');
  fs.writeFileSync(path.join(dir, `heart${sfx}.png`), png(size, fill));
  fs.writeFileSync(path.join(dir, `heart-outline${sfx}.png`), png(size, line));
}
