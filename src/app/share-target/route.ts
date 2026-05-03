/**
 * Web Share Target receiver — Kane
 *
 * Registered via `share_target` in /public/manifest.json. When the installed
 * PWA is picked from the native Android share sheet (e.g. user shares a
 * Yape/Plin screenshot from another app), the OS POSTs the file here as
 * multipart/form-data. We don't have a request body on a redirect, so we
 * respond with a tiny self-contained HTML bridge that:
 *   1. Serializes the shared image as a base64 data URL.
 *   2. Stashes it in sessionStorage under a known key.
 *   3. Replaces the URL with /receipt?fromShare=1, which already knows how
 *      to load images from a local blob/data URL.
 *
 * This path is preferred over a direct Supabase upload because the receipt
 * page (src/app/(tabs)/receipt/page.tsx) currently consumes images via a
 * local URL.createObjectURL() pipeline — the share entry-point should match
 * that contract, not invent a parallel one.
 *
 * Limitations / fallbacks (intentional, no special handling):
 *   - iOS does NOT support Web Share Target (as of 2026-04). Users on iOS
 *     simply won't see Kane in their share sheet. They keep using the
 *     in-app camera/gallery picker — no degradation.
 *   - Desktop browsers + uninstalled PWAs do not register share targets at
 *     all. The action URL is only ever hit by the OS share intent.
 *   - If the user reaches /share-target via a stray GET, we redirect to
 *     /receipt so they land on something useful instead of a 405.
 */

import { NextResponse, type NextRequest } from "next/server";

// 10 MB ceiling — images larger than this are almost certainly not receipts
// and risk OOM on low-end devices when we base64-encode them.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const RECEIPT_PATH = "/receipt";

/**
 * Render an HTML bridge page that moves the shared image into sessionStorage
 * and then replaces the history entry with /receipt?fromShare=1. Inline,
 * blocking script — runs before paint so the user never sees this page.
 */
function bridgeHtml(dataUrl: string, mimeType: string, fileName: string): string {
  // We embed the data URL directly. It's already a string of safe ASCII
  // (base64 + the data: prefix); the only escape we need is for </script>.
  const safeDataUrl = dataUrl.replace(/<\/script/gi, "<\\/script");
  const safeName = JSON.stringify(fileName);
  const safeMime = JSON.stringify(mimeType);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Procesando…</title>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<style>
  html,body{margin:0;padding:0;background:#fdfcf8;color:#0f172a;font:14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
  .wrap{min-height:100dvh;display:flex;align-items:center;justify-content:center;}
</style>
</head>
<body>
<div class="wrap"><p>Cargando ticket…</p></div>
<script>
(function(){
  try {
    sessionStorage.setItem("kane:share-target:image", ${JSON.stringify(safeDataUrl)});
    sessionStorage.setItem("kane:share-target:mime", ${safeMime});
    sessionStorage.setItem("kane:share-target:name", ${safeName});
    sessionStorage.setItem("kane:share-target:ts", String(Date.now()));
  } catch (err) {
    // Quota or privacy-mode: fall through, receipt page handles the empty case.
  }
  location.replace(${JSON.stringify(RECEIPT_PATH + "?fromShare=1")});
})();
</script>
</body>
</html>`;
}

function redirectWithError(req: NextRequest, code: string): NextResponse {
  const url = new URL(RECEIPT_PATH, req.url);
  url.searchParams.set("shareError", code);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: NextRequest): Promise<NextResponse | Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return redirectWithError(req, "bad-request");
  }

  const shared = formData.get("shared_image");
  if (!(shared instanceof File)) {
    return redirectWithError(req, "no-image");
  }

  if (!shared.type.startsWith("image/")) {
    return redirectWithError(req, "not-image");
  }

  if (shared.size <= 0 || shared.size > MAX_FILE_BYTES) {
    return redirectWithError(req, "too-large");
  }

  const buf = Buffer.from(await shared.arrayBuffer());
  const dataUrl = `data:${shared.type};base64,${buf.toString("base64")}`;
  const html = bridgeHtml(dataUrl, shared.type, shared.name || "shared-image");

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Don't cache — every share carries a fresh image.
      "cache-control": "no-store",
    },
  });
}

// If the OS or a stray link sends a GET (shouldn't happen for share targets,
// but Android has been known to fall back to GET when method isn't honoured),
// just punt to the receipt page so the user lands somewhere usable.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return NextResponse.redirect(new URL(RECEIPT_PATH, req.url), { status: 303 });
}
