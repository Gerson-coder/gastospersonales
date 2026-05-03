/**
 * recolor-icon.mjs
 * One-shot: lee la imagen referencia del user (icono.png en su desktop),
 * la croppea cuadrada centrada, resamplea a 512x512, y aplica un color
 * swap pixel-level que invierte el K oscuro a blanco y el fondo claro a
 * verde oscuro, preservando el verde brillante del arrow + simbolo $.
 *
 * Output: public/brand/kane-icon.png — listo para alimentar al script
 * generate-pwa-icons.mjs que genera los rasters PWA.
 *
 * Uso:
 *   node scripts/recolor-icon.mjs [path/al/source.png]
 *
 * Default source: C:/Users/ADMIN/Desktop/icono.png
 */

import { createRequire } from "module";
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

const SRC = process.argv[2] ?? "C:/Users/ADMIN/Desktop/icono.png";
const DST = join(ROOT, "public", "brand", "kane-icon.png");

// Paleta target: K blanca, fondo verde oscuro un poco más profundo
// que el theme color (#0F3D2E ya estaba en uso). El user pidió "un
// poco mas oscuro" así que vamos a #0A2E22.
const NEW_BG = [10, 46, 34]; // #0A2E22 — verde más oscuro
const NEW_K = [255, 255, 255]; // blanco puro

async function recolor() {
  const m = await sharp(SRC).metadata();
  console.log(`Source: ${SRC} (${m.width}x${m.height})`);

  // Crop a cuadrado centrado, después resize a 512x512
  const side = Math.min(m.width, m.height);
  const left = Math.round((m.width - side) / 2);
  const top = Math.round((m.height - side) / 2);

  const { data, info } = await sharp(SRC)
    .extract({ left, top, width: side, height: side })
    .resize(512, 512, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  console.log(`Working at ${info.width}x${info.height}, channels=${info.channels}`);

  let kept = 0,
    bg = 0,
    k = 0,
    mid = 0,
    white = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];

    // 1. Bright/saturated green (arrow + $ symbol) — preservar
    const maxRB = Math.max(r, b);
    if (g > 130 && g > maxRB + 30) {
      kept++;
      continue;
    }

    // 2. Pure white ($ circle interior) — preservar como blanco
    if (r > 240 && g > 240 && b > 240) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      white++;
      continue;
    }

    // 3. Luminance-based mapping para todo lo demás
    const L = 0.299 * r + 0.587 * g + 0.114 * b;

    if (L > 200) {
      // Light (cream bg) → dark green con suave fade en bordes AA
      const t = Math.min(1, (L - 200) / 40);
      data[i] = Math.round(NEW_BG[0] * t + r * (1 - t));
      data[i + 1] = Math.round(NEW_BG[1] * t + g * (1 - t));
      data[i + 2] = Math.round(NEW_BG[2] * t + b * (1 - t));
      bg++;
    } else if (L < 100) {
      // Dark (K body) → white con suave fade en bordes AA
      const t = Math.min(1, (100 - L) / 100);
      data[i] = Math.round(NEW_K[0] * t + r * (1 - t));
      data[i + 1] = Math.round(NEW_K[1] * t + g * (1 - t));
      data[i + 2] = Math.round(NEW_K[2] * t + b * (1 - t));
      k++;
    } else {
      // Mid-range (AA edges entre K y bg) — interpolación lineal
      const t = (L - 100) / 100;
      data[i] = Math.round(NEW_K[0] * (1 - t) + NEW_BG[0] * t);
      data[i + 1] = Math.round(NEW_K[1] * (1 - t) + NEW_BG[1] * t);
      data[i + 2] = Math.round(NEW_K[2] * (1 - t) + NEW_BG[2] * t);
      mid++;
    }
  }

  console.log(
    `Pixels: green-kept=${kept}, white-kept=${white}, bg-swapped=${bg}, k-swapped=${k}, mid-edge=${mid}`,
  );

  await sharp(data, {
    raw: { width: 512, height: 512, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(DST);

  console.log(`Wrote ${DST}`);
}

recolor().catch((e) => {
  console.error(e);
  process.exit(1);
});
