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

const sourceBuffer = readFileSync(SOURCE_PATH);

// Color sólido detrás del icono en el maskable variant. Debe matchear
// el fondo del SVG/PNG fuente para que el padding del safe-area no se
// note. El SVG fuente tiene bg verde #015E2C (rich green del nuevo
// diseño del user).
const MASKABLE_BG = { r: 1, g: 94, b: 44, alpha: 1 }; // #015E2C rich green

// ─── Helpers ───────────────────────────────────────────────────────────────

async function renderAt(buf, size, outPath) {
  // density alto cuando el source es SVG: sharp/librsvg necesita
  // density adecuado para rasterizar limpio en sizes chicos sin
  // perder detalle. 72 * (size/512) * 4 = 4x oversampling, despues
  // resize a size final con interpolación de cover (mantiene
  // aspecto, llena el frame).
  await sharp(buf, { density: Math.ceil((size / 512) * 72 * 4) })
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

  const innerBuf = await sharp(buf, {
    density: Math.ceil((innerSize / 512) * 72 * 4),
  })
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
  const pngBuf = await sharp(buf, {
    density: Math.ceil((32 / 512) * 72 * 4),
  })
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
  await renderFavicon(sourceBuffer, join(ROOT, "public", "favicon.ico"));

  console.log("\nAll icons generated successfully.");
} catch (err) {
  console.error("\nFailed to generate icons:", err.message);
  console.error(err.stack);
  process.exit(1);
}
