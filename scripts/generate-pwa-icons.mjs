/**
 * generate-pwa-icons.mjs
 * Generates all required PWA icon rasters from kane-icon.svg using sharp.
 * sharp is available as a transitive dependency of next@16.
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Resolve sharp from node_modules (may live under next's subtree)
const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  // Try next's bundled sharp
  sharp = require(join(ROOT, 'node_modules', 'sharp'));
}

const SVG_PATH = join(ROOT, 'public', 'brand', 'kane-icon.svg');
const ICONS_DIR = join(ROOT, 'public', 'icons');
mkdirSync(ICONS_DIR, { recursive: true });

const svgBuffer = readFileSync(SVG_PATH);

// ─── Helper ────────────────────────────────────────────────────────────────

async function renderSvgAt(svgBuf, size, outPath) {
  await sharp(svgBuf, { density: Math.ceil((size / 512) * 72 * 4) })
    .resize(size, size, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  const { size: bytes } = await sharp(outPath).metadata();
  console.log(`  wrote ${outPath.replace(ROOT, '.')} — ${(bytes / 1024).toFixed(1)} KB`);
}

/**
 * Maskable variant: embed the icon at 80% scale centered on a solid bg.
 * Android safe zone = innermost 80% circle; we scale to 80% of the frame
 * so the icon content (K + arrow) always lives within the safe zone.
 * Background fill: #0F3D2E (matches icon bg top-left color).
 */
async function renderMaskable(svgBuf, size, outPath) {
  const padding = Math.round(size * 0.10); // 10% each side → 80% content
  const innerSize = size - padding * 2;

  // Render the SVG at the inner size first
  const innerBuf = await sharp(svgBuf, { density: Math.ceil((innerSize / 512) * 72 * 4) })
    .resize(innerSize, innerSize, { fit: 'fill' })
    .png()
    .toBuffer();

  // Composite onto a solid #0F3D2E background at full size
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 15, g: 61, b: 46, alpha: 1 }, // #0F3D2E
    },
  })
    .composite([{ input: innerBuf, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  const { size: bytes } = await sharp(outPath).metadata();
  console.log(`  wrote ${outPath.replace(ROOT, '.')} — ${(bytes / 1024).toFixed(1)} KB`);
}

/**
 * favicon.ico: 32x32 PNG saved as .ico (single-frame ICO via raw bitmap).
 * sharp can't write .ico natively; we write a 32x32 PNG and wrap it in
 * a minimal 1-image ICO container manually.
 */
async function renderFavicon(svgBuf, outPath) {
  // Render 32x32 PNG
  const pngBuf = await sharp(svgBuf, { density: Math.ceil((32 / 512) * 72 * 4) })
    .resize(32, 32, { fit: 'fill' })
    .png()
    .toBuffer();

  // Wrap PNG in minimal ICO container (PNG-inside-ICO, supported by all modern browsers)
  // ICO header: 6 bytes
  // ICONDIRENTRY: 16 bytes
  // PNG data: pngBuf.length bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // type: ICO
  header.writeUInt16LE(1, 4);   // count: 1 image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0);      // width (0 means 256, but 32 is explicit)
  entry.writeUInt8(32, 1);      // height
  entry.writeUInt8(0, 2);       // color count (0 = truecolor)
  entry.writeUInt8(0, 3);       // reserved
  entry.writeUInt16LE(1, 4);    // planes
  entry.writeUInt16LE(32, 6);   // bit count
  entry.writeUInt32LE(pngBuf.length, 8);  // size of image data
  entry.writeUInt32LE(6 + 16, 12);        // offset from file start

  writeFileSync(outPath, Buffer.concat([header, entry, pngBuf]));
  const fileSizeKb = (Buffer.concat([header, entry, pngBuf]).length / 1024).toFixed(1);
  console.log(`  wrote ${outPath.replace(ROOT, '.')} — ${fileSizeKb} KB`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('Generating PWA icons from kane-icon.svg...\n');

try {
  await renderSvgAt(svgBuffer, 192, join(ICONS_DIR, 'icon-192.png'));
  await renderSvgAt(svgBuffer, 512, join(ICONS_DIR, 'icon-512.png'));
  await renderMaskable(svgBuffer, 512, join(ICONS_DIR, 'icon-512-maskable.png'));
  await renderSvgAt(svgBuffer, 180, join(ICONS_DIR, 'apple-touch-icon.png'));
  await renderFavicon(svgBuffer, join(ROOT, 'public', 'favicon.ico'));

  console.log('\nAll icons generated successfully.');
} catch (err) {
  console.error('\nFailed to generate icons:', err.message);
  console.error(err.stack);
  process.exit(1);
}
