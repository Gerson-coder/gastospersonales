/* eslint-disable */
// Renders Lumi PWA icons from inline SVG using sharp.
// Run: node scripts/generate-pwa-icons.cjs

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const OUT_DIR = path.join(__dirname, "..", "public", "icons");
const FAVICON_PATH = path.join(__dirname, "..", "src", "app", "favicon.ico");

fs.mkdirSync(OUT_DIR, { recursive: true });

// Brand colors — sRGB approximations of the source oklch tokens.
// oklch(0.78 0.16 162) ≈ #34d399, oklch(0.62 0.18 162) ≈ #059669, off-white ≈ #fdfcf8
const GRAD_TOP = "#34d399";
const GRAD_BOT = "#059669";
const FG = "#fdfcf8";

/**
 * Build the Lumi rounded icon SVG for a given canvas size and content scale.
 * @param {number} size      Output canvas size (px).
 * @param {number} pad       Inner padding around the rounded square (px) — used for maskable safe zone.
 * @param {number} radiusPct Corner radius as % of inner size (0..0.5).
 */
function lumiIconSvg(size, pad = 0, radiusPct = 112 / 512) {
  const inner = size - pad * 2;
  const r = Math.round(inner * radiusPct);
  // Inner-coord scale factor relative to the original 512 viewBox.
  const k = inner / 512;
  const textY = Math.round(372 * k) + pad;
  const fontSize = Math.round(320 * k);
  const letterSpacing = -Math.round(16 * k);
  const cx = Math.round(306 * k) + pad;
  const cy = Math.round(160 * k) + pad;
  const cr = Math.round(32 * k);
  const textX = Math.round(256 * k) + pad;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${GRAD_TOP}"/>
      <stop offset="100%" stop-color="${GRAD_BOT}"/>
    </linearGradient>
  </defs>
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${r}" ry="${r}" fill="url(#bg)"/>
  <text x="${textX}" y="${textY}" font-family="'Plus Jakarta Sans','Segoe UI',system-ui,-apple-system,sans-serif" font-weight="800" font-size="${fontSize}" letter-spacing="${letterSpacing}" text-anchor="middle" fill="${FG}">l</text>
  <circle cx="${cx}" cy="${cy}" r="${cr}" fill="${FG}"/>
</svg>`;
}

/**
 * Maskable variant: full-bleed gradient background + content scaled into the inner safe zone.
 * The PWA spec says ~10% padding on each side is the safe zone; we apply ~10% (52/512).
 */
function lumiMaskableSvg(size, safePct = 0.1) {
  const safe = Math.round(size * safePct);
  const inner = size - safe * 2;
  const k = inner / 512;
  const textY = Math.round(372 * k) + safe;
  const fontSize = Math.round(320 * k);
  const letterSpacing = -Math.round(16 * k);
  const cx = Math.round(306 * k) + safe;
  const cy = Math.round(160 * k) + safe;
  const cr = Math.round(32 * k);
  const textX = Math.round(256 * k) + safe;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${GRAD_TOP}"/>
      <stop offset="100%" stop-color="${GRAD_BOT}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" fill="url(#bg)"/>
  <text x="${textX}" y="${textY}" font-family="'Plus Jakarta Sans','Segoe UI',system-ui,-apple-system,sans-serif" font-weight="800" font-size="${fontSize}" letter-spacing="${letterSpacing}" text-anchor="middle" fill="${FG}">l</text>
  <circle cx="${cx}" cy="${cy}" r="${cr}" fill="${FG}"/>
</svg>`;
}

async function renderPng(svg, size, outPath) {
  const buf = Buffer.from(svg, "utf8");
  await sharp(buf, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  const stat = fs.statSync(outPath);
  console.log(`  wrote ${path.relative(path.join(__dirname, ".."), outPath)} (${stat.size} bytes)`);
}

(async () => {
  console.log("Rendering Lumi PWA icons...");

  // 192x192 (any)
  await renderPng(lumiIconSvg(192, 0), 192, path.join(OUT_DIR, "icon-192.png"));

  // 512x512 (any)
  await renderPng(lumiIconSvg(512, 0), 512, path.join(OUT_DIR, "icon-512.png"));

  // 512x512 maskable — content padded into ~10% safe zone, gradient bleeds to edges
  await renderPng(lumiMaskableSvg(512, 0.1), 512, path.join(OUT_DIR, "icon-512-maskable.png"));

  // 180x180 apple-touch-icon (rounded; iOS will mask to its own radius anyway)
  await renderPng(lumiIconSvg(180, 0), 180, path.join(OUT_DIR, "apple-touch-icon.png"));

  // favicon.ico — multi-size (16, 32, 48). sharp doesn't write ICO directly; emit a 32x32 PNG renamed,
  // and attempt a real ICO via png-to-ico if available. Otherwise leave existing favicon.ico in place.
  const fav32Path = path.join(OUT_DIR, "favicon-32.png");
  await renderPng(lumiIconSvg(32, 0), 32, fav32Path);
  const fav16Path = path.join(OUT_DIR, "favicon-16.png");
  await renderPng(lumiIconSvg(16, 0), 16, fav16Path);

  let icoWritten = false;
  try {
    const mod = require("png-to-ico");
    const pngToIco = typeof mod === "function" ? mod : mod.default;
    if (typeof pngToIco !== "function") throw new Error("png-to-ico export shape unexpected");
    const buf = await pngToIco([fav32Path, fav16Path]);
    fs.writeFileSync(FAVICON_PATH, buf);
    icoWritten = true;
    console.log(`  wrote src/app/favicon.ico (${buf.length} bytes)`);
  } catch (e) {
    console.log(`  png-to-ico unavailable (${e.code || e.message}); keeping existing favicon.ico`);
  }

  console.log(`Done. ICO ${icoWritten ? "regenerated" : "untouched"}.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
