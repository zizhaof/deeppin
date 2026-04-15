// scripts/gen-favicon.mjs — 生成 Deeppin favicon
// 方案 A：Indigo 圆角方形底 + 白色四角星
// 输出：app/favicon.ico（16/32/48 三尺寸）+ app/icon.svg

import sharp from "sharp";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, "../app");

// ── SVG 模板（参数化尺寸）──────────────────────────────────────────────
function makeSVG(size) {
  const r = size * 0.219;   // 圆角半径 ≈ 3.5/16
  // 四角星路径：中心 C，臂长 42% 和 21% 的 size
  const c = size / 2;
  const outer = size * 0.42;  // 从中心到顶点
  const inner = size * 0.21;  // 从中心到腰部

  // 四角星八个点（上、右上腰、右、右下腰、下、左下腰、左、左上腰）
  const pts = [
    [c,        c - outer],   // 上
    [c + inner, c - inner],  // 右上腰
    [c + outer, c],          // 右
    [c + inner, c + inner],  // 右下腰
    [c,        c + outer],   // 下
    [c - inner, c + inner],  // 左下腰
    [c - outer, c],          // 左
    [c - inner, c - inner],  // 左上腰
  ];
  const d = `M${pts.map((p) => p.join(",")).join("L")}Z`;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${r.toFixed(2)}" fill="#6366f1"/>
  <path d="${d}" fill="white"/>
</svg>`;
}

// ── 1. 写 app/icon.svg（可缩放，现代浏览器直接用）────────────────────
const svgContent = makeSVG(32);
writeFileSync(join(appDir, "icon.svg"), svgContent, "utf8");
console.log("✓ app/icon.svg written");

// ── 2. 用 sharp 渲染 PNG（16/32/48）─────────────────────────────────
async function renderPNG(size) {
  const svg = Buffer.from(makeSVG(size));
  return sharp(svg).png().toBuffer();
}

// ── 3. 构造 ICO 二进制（支持多尺寸）────────────────────────────────
async function buildICO(sizes) {
  const pngs = await Promise.all(sizes.map(renderPNG));

  const count = sizes.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + entrySize * count;

  // 计算各图片在文件中的偏移
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
    const w = s >= 256 ? 0 : s;   // 256 编码为 0
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

  // 图片数据
  for (const png of pngs) {
    png.copy(buf, pos);
    pos += png.length;
  }

  return buf;
}

// ── 主流程 ──────────────────────────────────────────────────────────
const ico = await buildICO([16, 32, 48]);
writeFileSync(join(appDir, "favicon.ico"), ico);
console.log("✓ app/favicon.ico written (16/32/48px)");
console.log("Done.");
