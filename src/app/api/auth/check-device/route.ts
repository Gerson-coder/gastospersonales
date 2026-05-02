import { NextResponse } from "next/server";

// eslint-disable-next-line no-restricted-imports -- service-role required to read user_pins + write last_seen_at on trusted_devices server-side
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  fingerprintHash,
  type DeviceSignals,
} from "@/lib/auth/device-fingerprint";
import { findUserByEmail } from "@/lib/auth/lookup";

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * POST /api/auth/check-device
 *
 * Body: { email?, deviceSignals: { screenResolution, timezone } }
 *
 * Decides what /login should show:
 *   - exists    — does an auth.users row exist for this email?
 *   - hasPin    — does the user have a PIN configured at all?
 *   - trusted   — is this device known + trusted for that user?
 *
 * Combined: only render the PIN screen when (exists && hasPin && trusted).
 * Else send the user through the OTP path (new_device flow).
 *
 * Two modes:
 *   1. Body has `email` → no-session lookup. The login page calls this
 *      after the user types their email but BEFORE any auth state exists.
 *   2. Body has no `email` → requires an active Supabase session and uses
 *      its user.id (legacy path used inside the app, e.g. settings).
 *
 * For unknown emails we return `{ exists: false, hasPin: false, trusted: false }`
 * — the caller treats it as "ask for an account" without leaking enumeration
 * beyond what `/register` already exposes (it 409s on existing emails).
 */
export async function POST(request: Request) {
  let body: {
    email?: string;
    deviceSignals?: Pick<DeviceSignals, "screenResolution" | "timezone">;
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const admin = createAdminClient();

  let userId: string | null = null;

  if (body.email && body.email.trim().length > 0) {
    const normalized = body.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalized)) {
      return NextResponse.json({ error: "Correo inválido." }, { status: 400 });
    }
    const found = await findUserByEmail(admin, normalized);
    if (!found) {
      return NextResponse.json({
        exists: false,
        hasPin: false,
        trusted: false,
      });
    }
    userId = found.id;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
    }
    userId = user.id;
  }

  const userAgent = request.headers.get("user-agent");
  const acceptLanguage = request.headers.get("accept-language");
  const signals: DeviceSignals = {
    userAgent,
    acceptLanguage,
    screenResolution: body.deviceSignals?.screenResolution ?? null,
    timezone: body.deviceSignals?.timezone ?? null,
  };
  const fp = fingerprintHash(signals);

  const [pinResult, deviceResult] = await Promise.all([
    admin.from("user_pins").select("user_id").eq("user_id", userId).maybeSingle(),
    admin
      .from("trusted_devices")
      .select("id")
      .eq("user_id", userId)
      .eq("fingerprint_hash", fp)
      .maybeSingle(),
  ]);

  // Bump last_seen on a trusted device so future "list devices" UI can
  // show a useful timestamp.
  if (deviceResult.data) {
    await admin
      .from("trusted_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", deviceResult.data.id);
  }

  return NextResponse.json({
    exists: true,
    hasPin: !!pinResult.data,
    trusted: !!deviceResult.data,
    fingerprintHash: fp,
  });
}
