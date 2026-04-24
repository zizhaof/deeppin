// Generate the Deeppin favicon.
// Design A: indigo rounded-square background + white four-pointed star.
// Outputs: app/favicon.ico (16/32/48 px) + app/icon.svg.

import sharp from "sharp";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, "../app");

// ── SVG template (size-parameterized) ────────────────────────────────
function makeSVG(size) {
  const r = size * 0.219;   // corner radius ≈ 3.5/16
  // Four-pointed star path: center C, arm lengths 42% and 21% of size.
  const c = size / 2;
  const outer = size * 0.42;  // center to tip
  const inner = size * 0.21;  // center to waist

  // Eight star points (top, top-right waist, right, bottom-right waist,
  // bottom, bottom-left waist, left, top-left waist).
  const pts = [
    [c,        c - outer],   // top
    [c + inner, c - inner],  // top-right waist
    [c + outer, c],          // right
    [c + inner, c + inner],  // bottom-right waist
    [c,        c + outer],   // bottom
    [c - inner, c + inner],  // bottom-left waist
    [c - outer, c],          // left
    [c - inner, c - inner],  // top-left waist
  ];
  const d = `M${pts.map((p) => p.join(",")).join("L")}Z`;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${r.toFixed(2)}" fill="#6366f1"/>
  <path d="${d}" fill="white"/>
</svg>`;
}

// ── 1. Write app/icon.svg (scalable, used directly by modern browsers) ──
const svgContent = makeSVG(32);
writeFileSync(join(appDir, "icon.svg"), svgContent, "utf8");
console.log("✓ app/icon.svg written");

// ── 2. Render PNGs via sharp (16/32/48) ──────────────────────────────
async function renderPNG(size) {
  const svg = Buffer.from(makeSVG(size));
  return sharp(svg).png().toBuffer();
}

// ── 3. Build the ICO binary (multi-size) ─────────────────────────────
async function buildICO(sizes) {
  const pngs = await Promise.all(sizes.map(renderPNG));

  const count = sizes.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + entrySize * count;

  // Compute each image's offset in the output file.
  const offsets = [];
  let offset = dataOffset;
  for (const png of pngs) {
    offsets.push(offset);
    offset += png.length;
  }

  const totalSize = offset;
  const buf = Buffer.alloc(totalSize);
  let pos = 0;

  // ICONDIR header
  buf.writeUInt16LE(0, pos);      // Reserved
  pos += 2;
  buf.writeUInt16LE(1, pos);      // Type = 1 (ICO)
  pos += 2;
  buf.writeUInt16LE(count, pos);  // Count
  pos += 2;

  // ICONDIRENTRY × count
  for (let i = 0; i < count; i++) {
    const s = sizes[i];
    const w = s >= 256 ? 0 : s;   // 256 is encoded as 0
    const h = s >= 256 ? 0 : s;
    buf.writeUInt8(w, pos);        pos += 1;  // Width
    buf.writeUInt8(h, pos);        pos += 1;  // Height
    buf.writeUInt8(0, pos);        pos += 1;  // ColorCount
    buf.writeUInt8(0, pos);        pos += 1;  // Reserved
    buf.writeUInt16LE(1, pos);     pos += 2;  // Planes
    buf.writeUInt16LE(32, pos);    pos += 2;  // BitCount
    buf.writeUInt32LE(pngs[i].length, pos);  pos += 4;  // BytesInRes
    buf.writeUInt32LE(offsets[i], pos);      pos += 4;  // ImageOffset
  }

  // Image payloads.
  for (const png of pngs) {
    png.copy(buf, pos);
    pos += png.length;
  }

  return buf;
}

// ── Main ────────────────────────────────────────────────────────────
const ico = await buildICO([16, 32, 48]);
writeFileSync(join(appDir, "favicon.ico"), ico);
console.log("✓ app/favicon.ico written (16/32/48px)");
console.log("Done.");
