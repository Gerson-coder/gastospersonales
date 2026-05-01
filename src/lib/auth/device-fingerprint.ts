import { createHash } from "node:crypto";

/**
 * Device fingerprint — sha256 of a few low-entropy browser signals
 * (NOT a privacy-invasive library like fingerprintjs).
 *
 * Inputs come from request headers + a small client-collected blob:
 *   - User-Agent       (server-side from req.headers)
 *   - Accept-Language  (server-side from req.headers)
 *   - Screen size      (client-side, sent in the body)
 *   - Timezone         (client-side, sent in the body)
 *
 * The hash is stable across page reloads on the same browser+device and
 * unstable across different browsers / private windows / different
 * machines. That's exactly what we want for "is this the same device
 * that already PIN-authenticated".
 *
 * For the device-name display we keep a friendly label parsed from UA.
 */

export type DeviceSignals = {
  userAgent: string | null;
  acceptLanguage: string | null;
  /** Screen pixel resolution like "1920x1080". */
  screenResolution: string | null;
  /** IANA tz like "America/Lima". */
  timezone: string | null;
};

/**
 * Stable sha256 hex digest. Empty values are coerced to "?" so we still
 * produce a hash if some signals are missing — better than rejecting the
 * device-trust attempt outright.
 */
export function fingerprintHash(signals: DeviceSignals): string {
  const parts = [
    signals.userAgent ?? "?",
    signals.acceptLanguage ?? "?",
    signals.screenResolution ?? "?",
    signals.timezone ?? "?",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Friendly label like "Chrome en Windows" / "Safari en iPhone". Best-effort
 * UA parsing — we don't ship a UA-parser library because the fidelity of
 * "Mobile Safari 17 on iOS 17.2" is not worth the bundle weight; the user
 * just needs to recognize "this device". When parsing fails we fall back
 * to "Navegador desconocido".
 */
export function deviceNameFromUserAgent(ua: string | null): string {
  if (!ua) return "Navegador desconocido";

  // Browser bucket
  let browser = "Navegador";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = "Safari";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/opera|opr\//i.test(ua)) browser = "Opera";

  // Platform bucket
  let platform = "dispositivo";
  if (/iphone/i.test(ua)) platform = "iPhone";
  else if (/ipad/i.test(ua)) platform = "iPad";
  else if (/android/i.test(ua)) platform = "Android";
  else if (/windows/i.test(ua)) platform = "Windows";
  else if (/mac os/i.test(ua)) platform = "macOS";
  else if (/linux/i.test(ua)) platform = "Linux";

  return `${browser} en ${platform}`;
}
