/**
 * generate-pwa-icons.mjs
 * Genera todos los rasters PWA desde una fuente PNG (kane-icon.png)
 * usando sharp. sharp viene como dep transitiva de next@16.
 *
 * Uso: node scripts/generate-pwa-icons.mjs
 *
 * Si querés cambiar el icono fuente:
 *   1. Editá public/brand/kane-icon.png (recomendado: 512x512 cuadrado,
 *      con esquinas redondeadas si querés ese look en TODOS los assets,
 *      o cuadrado plano si querés que el sistema operativo aplique sus
 *      propias esquinas — depende del look que busques en cada plataforma).
 *   2. Corré este script desde la raíz del proyecto.
 *
 * Notas:
 * - El maskable variant escala el contenido al 80% del frame y rellena
 *   con un color sólido detrás. Andá ajustando MASKABLE_BG si el icono
 *   fuente cambia de paleta.
 * - El favicon.ico es PNG-in-ICO (un solo frame de 32x32). Compatible
 *   con todos los browsers modernos.
 */

import { createRequire } from "module";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require("sharp");
} catch {
  sharp = require(join(ROOT, "node_modules", "sharp"));
}

// Source es ahora un SVG vector (1254x1254) en /public/icons/kane.svg —
// el user lo proveyó traceado desde su diseño final. sharp + librsvg
// rasterizan a cualquier size sin perder calidad. Si el SVG cambia,
// solo correr este script para regenerar los PNG variants.
const SOURCE_PATH = join(ROOT, "public", "icons", "kane.svg");
const ICONS_DIR = join(ROOT, "public", "icons");
mkdirSync(ICONS_DIR, { recursive: true });

const rawSvgBuffer = readFileSync(SOURCE_PATH);

// Color sólido detrás del icono en el maskable variant.
const MASKABLE_BG = { r: 1, g: 94, b: 44, alpha: 1 }; // #015E2C rich green

// El kane.svg viene del trace del icono original del user que tiene
// CREAM bg + DARK GREEN K (paleta invertida a lo que queremos para
// el PWA). Recoloreamos pixel-level el raster a:
//   - Bright green (g >> r,b): preservar (arrow + $ accent)
//   - Dark/medium green (la K): white
//   - Cream/light: dark green #015E2C (el bg deseado)
//   - Mid AA: interpolación lineal
// Esta función re-rasteriza el SVG a un PNG buffer "recoloreado" que
// despues alimenta al renderAt / renderMaskable. Sin esto el icono
// salia con el cream del SVG fuente como bordes en Samsung One UI.
async function recoloredBuffer(svgBuf, density) {
  const { data, info } = await sharp(svgBuf, { density })
    .resize(1024, 1024, { fit: "cover", position: "center" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const NEW_BG = [1, 94, 44]; // #015E2C — verde target
  const NEW_K = [255, 255, 255]; // blanco

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];

    // Bright green MUY saturado (solo el arrow + $ del accent #22C55E
    // ≈ (34,197,94)). Antes el threshold de g>130 atrapaba tintes
    // medios del K (#4E8660 etc.) y los preservaba en lugar de
    // mapearlos a white. Subido a g>170 + diferencia >60 con max(r,b)
    // para que solo el verde vivo del arrow sobreviva al recolor.
    const maxRB = Math.max(r, b);
    if (g > 170 && g > maxRB + 60) continue;

    // Threshold binario sobre lightness. Sharp aplica anti-aliasing
    // en el downsample 1024 → 192/512/etc., asi que no necesitamos
    // fade aqui — el final tendra bordes suaves del propio resize.
    // Antes el fade dejaba la K como un gris-verde tintado en lugar
    // de white puro porque los shades del K (#0xxx-#2Bxxx) tienen
    // L≈50-90, no L=0 — la formula de fade no llegaba a t=1 para
    // ellos.
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    if (L > 150) {
      // Light (cream bg) → verde
      data[i] = NEW_BG[0];
      data[i + 1] = NEW_BG[1];
      data[i + 2] = NEW_BG[2];
    } else {
      // Dark (la K) → white
      data[i] = NEW_K[0];
      data[i + 1] = NEW_K[1];
      data[i + 2] = NEW_K[2];
    }
  }

  return await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// Pre-recolorear UNA VEZ a 1024x1024, después renderAt/renderMaskable
// resamplean este PNG a las sizes finales (más rápido que recolorear
// por cada size, y el resampleo de un PNG ya recoloreado es fiel).
console.log("Recoloring kane.svg → green bg + white K...");
const sourceBuffer = await recoloredBuffer(rawSvgBuffer, 144);
console.log("  done.\n");

// ─── Helpers ───────────────────────────────────────────────────────────────

async function renderAt(buf, size, outPath) {
  // Source ya es un PNG recoloreado a 1024x1024 — solo redimensionar.
  // Sin density (no aplica a PNG fuente).
  await sharp(buf)
    .resize(size, size, { fit: "cover", position: "center" })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  const meta = await sharp(outPath).metadata();
  console.log(`  wrote ${outPath.replace(ROOT, ".")} — ${size}x${size} (${meta.size ? (meta.size / 1024).toFixed(1) : "?"} KB)`);
}

/**
 * Maskable: el contenido vive en el 80% central; el 20% restante es
 * padding sólido que el SO recortará según su máscara. Esto garantiza
 * que el K + flecha + $ del icono quedan dentro del círculo seguro.
 */
async function renderMaskable(buf, size, outPath) {
  const padding = Math.round(size * 0.1);
  const innerSize = size - padding * 2;

  const innerBuf = await sharp(buf)
    .resize(innerSize, innerSize, { fit: "cover", position: "center" })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: MASKABLE_BG,
    },
  })
    .composite([{ input: innerBuf, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log(`  wrote ${outPath.replace(ROOT, ".")} — ${size}x${size} maskable`);
}

/**
 * favicon.ico — un PNG 32x32 envuelto en un container ICO mínimo
 * (1 frame). Compatible con todos los browsers actuales.
 */
async function renderFavicon(buf, outPath) {
  const pngBuf = await sharp(buf)
    .resize(32, 32, { fit: "cover", position: "center" })
    .png()
    .toBuffer();

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0);
  entry.writeUInt8(32, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(6 + 16, 12);

  writeFileSync(outPath, Buffer.concat([header, entry, pngBuf]));
  const sizeKb = (
    Buffer.concat([header, entry, pngBuf]).length / 1024
  ).toFixed(1);
  console.log(`  wrote ${outPath.replace(ROOT, ".")} — ${sizeKb} KB`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

console.log("Generating PWA icons from kane.svg...\n");

try {
  await renderAt(sourceBuffer, 16, join(ICONS_DIR, "favicon-16.png"));
  await renderAt(sourceBuffer, 32, join(ICONS_DIR, "favicon-32.png"));
  await renderAt(sourceBuffer, 192, join(ICONS_DIR, "icon-192.png"));
  await renderAt(sourceBuffer, 512, join(ICONS_DIR, "icon-512.png"));
  await renderMaskable(sourceBuffer, 512, join(ICONS_DIR, "icon-512-maskable.png"));
  await renderAt(sourceBuffer, 180, join(ICONS_DIR, "apple-touch-icon.png"));
  // Next.js 13+ App Router convencion: `src/app/favicon.ico` toma
  // precedencia sobre `public/favicon.ico` (genera automaticamente el
  // <link rel="icon"> en el <head>). Escribimos a los dos lugares
  // para que no haya ambiguedad y cualquiera que estuviera cacheado
  // se sobreescriba.
  await renderFavicon(sourceBuffer, join(ROOT, "public", "favicon.ico"));
  await renderFavicon(sourceBuffer, join(ROOT, "src", "app", "favicon.ico"));

  console.log("\nAll icons generated successfully.");
} catch (err) {
  console.error("\nFailed to generate icons:", err.message);
  console.error(err.stack);
  process.exit(1);
}
