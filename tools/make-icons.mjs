// Renders the BOKRA app icons (three diamonds in the shape of the dots of «ث») to PNG, no dependencies.
// Usage: node tools/make-icons.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'icons');
const BG = [0xF7, 0xF5, 0xF2];
const RED = [0xF2, 0x4A, 0x3D];
const BLACK = [0x11, 0x11, 0x11];

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// shapes in unit coordinates; scale < 1 shrinks the mark toward the center (maskable safe zone)
function render(size, { scale = 1, radius = 0.22 } = {}) {
  const r = 0.1 * scale;
  const dm = [
    { x: 0.5, y: 0.5 - 0.11 * scale, c: RED },
    { x: 0.5 - 0.118 * scale, y: 0.5 + 0.085 * scale, c: BLACK },
    { x: 0.5 + 0.118 * scale, y: 0.5 + 0.085 * scale, c: BLACK },
  ];
  const px = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0], alpha = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
          // rounded-square background (radius 0 = full bleed)
          let inBg = true;
          if (radius > 0) {
            const qx = Math.max(Math.abs(u - 0.5) - (0.5 - radius), 0), qy = Math.max(Math.abs(v - 0.5) - (0.5 - radius), 0);
            inBg = qx * qx + qy * qy <= radius * radius;
          }
          if (!inBg) continue;
          let col = BG;
          for (const d of dm) if (Math.abs(u - d.x) + Math.abs(v - d.y) <= r) col = d.c;
          acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]; alpha++;
        }
      }
      const i = (y * size + x) * 4;
      if (alpha) { px[i] = acc[0] / alpha; px[i + 1] = acc[1] / alpha; px[i + 2] = acc[2] / alpha; }
      px[i + 3] = Math.round((alpha / (SS * SS)) * 255);
    }
  }
  return png(size, size, px);
}

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), render(192));
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512));
fs.writeFileSync(path.join(out, 'maskable-512.png'), render(512, { scale: 0.8, radius: 0 }));
console.log('icons written to', out);
