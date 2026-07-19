#!/usr/bin/env node
/**
 * Generate the PWA icons.
 *
 * Hand-rolled PNG encoding (zlib + CRC32) rather than a dependency: the mark is
 * pure geometry — a cinnabar rounded square carrying a three-line trigram, one
 * line broken — so there is no font to embed and nothing to rasterise. Keeping it
 * generated means the icon can never drift from the brand colour defined here,
 * and the build stays dependency-free.
 *
 * Run: npm run icons
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- brand ------------------------------------------------------------------
const CINNABAR = [0xb5, 0x43, 0x2e];
const PAPER = [0xf7, 0xf3, 0xea];

// --- tiny PNG encoder -------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: (x, y) => [r, g, b, a] */
function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = rgba(x, y);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- the mark ---------------------------------------------------------------

/** Signed coverage of a rounded rectangle, sampled for a soft (anti-aliased) edge. */
function roundedRectCoverage(x, y, left, top, right, bottom, radius) {
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  const d = Math.hypot(x - cx, y - cy);
  return Math.min(1, Math.max(0, radius - d + 0.5));
}

/**
 * @param maskable when true, inset the artwork so it survives the platform's
 *   safe-zone crop (Android masks icons to a circle at ~80%).
 */
function drawIcon(size, { maskable = false } = {}) {
  const pad = maskable ? size * 0.18 : size * 0.06;
  const left = pad;
  const top = pad;
  const right = size - pad;
  const bottom = size - pad;
  const radius = (right - left) * 0.22;

  // Three stacked lines; the middle one broken — the 易 "change" motif, reduced
  // to geometry so no glyph (and no font) is needed.
  const barH = (bottom - top) * 0.1;
  const barW = (right - left) * 0.52;
  const barX = (size - barW) / 2;
  const gapY = (bottom - top) * 0.19;
  const midY = (top + bottom) / 2;
  const rows = [midY - gapY - barH / 2, midY - barH / 2, midY + gapY - barH / 2];
  const split = barW * 0.16; // the gap in the broken line

  return (x, y) => {
    const bg = roundedRectCoverage(x + 0.5, y + 0.5, left, top, right, bottom, radius);
    if (bg <= 0) return [0, 0, 0, 0];

    let ink = 0;
    for (let i = 0; i < rows.length; i++) {
      const ry = rows[i];
      if (y + 0.5 < ry || y + 0.5 > ry + barH) continue;
      if (x + 0.5 < barX || x + 0.5 > barX + barW) continue;
      // Middle line is broken: skip the centre gap.
      if (i === 1 && Math.abs(x + 0.5 - size / 2) < split / 2) continue;
      ink = 1;
    }

    const [r, g, b] = ink ? PAPER : CINNABAR;
    return [r, g, b, Math.round(bg * 255)];
  };
}

const OUT = resolve(root, "public");
mkdirSync(OUT, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, opts: {} },
  { file: "icon-512.png", size: 512, opts: {} },
  { file: "icon-maskable-512.png", size: 512, opts: { maskable: true } },
  { file: "apple-touch-icon.png", size: 180, opts: {} },
  { file: "favicon-32.png", size: 32, opts: {} },
];

for (const { file, size, opts } of targets) {
  writeFileSync(resolve(OUT, file), png(size, drawIcon(size, opts)));
  console.log(`wrote public/${file} (${size}×${size})`);
}
