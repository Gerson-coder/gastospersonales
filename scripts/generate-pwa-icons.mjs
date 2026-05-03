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

const SOURCE_PATH = join(ROOT, "public", "icons", "kane.svg");
const ICONS_DIR = join(ROOT, "public", "icons");
mkdirSync(ICONS_DIR, { recursive: true });

// Color sólido detrás del icono en el maskable variant.
const MASKABLE_BG = { r: 1, g: 94, b: 44, alpha: 1 }; // #015E2C rich green

// kane.svg es un trace del diseño final del user. El SVG natural ya
// renderiza con verde rounded-card + K blanca + $ blanco + flecha
// blanca (es exactamente lo que queremos visualmente, casi). El UNICO
// problema es que los paths "cream" del trace (#FCFCFC, #FBFBFB, etc.)
// forman DOS cosas a la vez: (a) la K + flecha + $ que queremos
// preservar en blanco, (b) un "halo" exterior que rellena las esquinas
// redondeadas con cream/blanco — eso es lo que NO queremos.
//
// No podemos distinguir esos dos roles de los paths cream a nivel SVG
// (mismos colores, mismas estructuras). La solución más confiable es
// pixel-level pero ACOTADA a la banda exterior:
//
//   1. Renderizar kane.svg al natural → verde card + K blanca + halos
//      blancos en las 4 esquinas.
//   2. Recorrer SOLO la banda exterior (outer 12% del frame) y reemplazar
//      todos los pixeles "near-white" (R,G,B > 200) por verde #015E2C.
//      La K + flecha + $ viven en el centro, nunca llegan a esta banda,
//      asi que quedan intactos.
//   3. Resultado: cuadrado verde lleno hasta los bordes + K/$/flecha
//      blancos en el centro.
async function buildSourceBuffer() {
  const SIZE = 1024;
  const { data, info } = await sharp(readFileSync(SOURCE_PATH), {
    density: 144,
  })
    .resize(SIZE, SIZE, { fit: "cover", position: "center" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const GREEN = [1, 94, 44]; // #015E2C
  const BAND = Math.round(SIZE * 0.12); // outer 12% — fuera de la K
  const W = info.width;
  const H = info.height;

  for (let y = 0; y < H; y++) {
    const rowInBand = y < BAND || y >= H - BAND;
    for (let x = 0; x < W; x++) {
      const inBand = rowInBand || x < BAND || x >= W - BAND;
      if (!inBand) continue;

      const i = (y * W + x) * 4;
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];

      // En la banda exterior reemplazamos CUALQUIER pixel que no sea
      // ya el verde #015E2C exacto. Esto cubre tres cosas:
      //   - cream halos de las esquinas (R,G,B > 200)
      //   - pixeles intermedios del antialiasing del path bg redondeado
      //   - greens medianos (#4E8660 etc.) que forman outline en el borde
      // Threshold de 8 unidades de tolerancia por canal para absorber
      // cualquier off-by-one de sharp.
      const isExactGreen =
        Math.abs(r - GREEN[0]) <= 8 &&
        Math.abs(g - GREEN[1]) <= 8 &&
        Math.abs(b - GREEN[2]) <= 8;
      if (!isExactGreen) {
        data[i] = GREEN[0];
        data[i + 1] = GREEN[1];
        data[i + 2] = GREEN[2];
        data[i + 3] = 255;
      }
    }
  }

  return await sharp(data, {
    raw: { width: W, height: H, channels: info.channels },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

console.log("Rasterizing kane.svg + filling corner halos with green...");
const sourceBuffer = await buildSourceBuffer();
console.log("  done.\n");

// ─── Helpers ───────────────────────────────────────────────────────────────

async function renderAt(buf, size, outPath) {
  // El SVG fuente tiene un path de bg con beziers ligeramente curvas
  // en las esquinas (no es rectangle puro), entonces los píxeles fuera
  // de la silueta quedan transparentes. Componer sobre un cuadrado verde
  // sólido garantiza que el icono final sea un cuadrado verde lleno
  // hasta los bordes — el SO (iOS/Android) aplica su propio rounding
  // en hardware si quiere.
  const inner = await sharp(buf)
    .resize(size, size, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: MASKABLE_BG },
  })
    .composite([{ input: inner, gravity: "center" }])
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
  const inner = await sharp(buf)
    .resize(32, 32, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
  const pngBuf = await sharp({
    create: { width: 32, height: 32, channels: 4, background: MASKABLE_BG },
  })
    .composite([{ input: inner, gravity: "center" }])
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
