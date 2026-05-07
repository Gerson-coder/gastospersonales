/**
 * Image compressor Web Worker.
 *
 * Runs canvas resize + JPEG re-encode off the main thread so the UI
 * doesn't jank during the receipt capture flow. Typical phone photos
 * (4-8 MP, 4-6 MB) take 200-500ms to compress on a mid-range device —
 * exactly the window where the user is tapping into the loading screen,
 * so any blocking work shows up as a stutter.
 *
 * Protocol:
 *   in:  postMessage({ blob, maxDim, quality })
 *   out: postMessage({ ok: true, dataUrl }) | postMessage({ ok: false, error })
 *
 * The caller is expected to spawn one worker per compression and
 * terminate it after the single response — keeps the worker pool simple
 * and avoids leaking a long-lived thread per page load.
 *
 * Requirements (caller MUST verify before spawning):
 *   - `OffscreenCanvas` is available
 *   - `createImageBitmap` is available
 *
 * If either is missing, the caller falls back to the main-thread
 * implementation. Older Safari (<16.4) lacks OffscreenCanvas.convertToBlob.
 */

export interface CompressRequest {
  blob: Blob;
  maxDim: number;
  quality: number;
}

export type CompressResponse =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string };

// Convert a Blob to a base64 data URL using FileReader. Works inside a
// Worker because FileReader is part of the Worker global scope.
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("filereader-not-string"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("filereader-failed"));
    reader.readAsDataURL(blob);
  });
}

self.addEventListener("message", async (event: MessageEvent<CompressRequest>) => {
  const { blob, maxDim, quality } = event.data;
  try {
    const bitmap = await createImageBitmap(blob);
    const ratio = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1);
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("offscreen-2d-unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const out = await canvas.convertToBlob({ type: "image/jpeg", quality });
    const dataUrl = await blobToDataUrl(out);

    const response: CompressResponse = { ok: true, dataUrl };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "image-compress-failed";
    const response: CompressResponse = { ok: false, error: message };
    (self as unknown as Worker).postMessage(response);
  }
});

// Required for Next.js / Turbopack to treat this file as a worker module.
export {};
