import { NextResponse } from "next/server";

// eslint-disable-next-line no-restricted-imports -- service-role required to read user_pins + write last_seen_at on trusted_devices server-side
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  fingerprintHash,
  type DeviceSignals,
} from "@/lib/auth/device-fingerprint";

/**
 * POST /api/auth/check-device
 *
 * Body: { deviceSignals: { screenResolution, timezone } }
 *
 * Decides what /login should show:
 *   - hasPin    — does the user have a PIN configured at all?
 *   - trusted   — is this device known + trusted?
 *
 * Combined: only render the PIN screen when (hasPin && trusted).
 * Else render the email-OTP / password fallback.
 *
 * Auth: requires an active Supabase session.
 */
export async function POST(request: Request) {
  let body: {
    deviceSignals?: Pick<DeviceSignals, "screenResolution" | "timezone">;
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const admin = createAdminClient();

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
    admin.from("user_pins").select("user_id").eq("user_id", user.id).maybeSingle(),
    admin
      .from("trusted_devices")
      .select("id")
      .eq("user_id", user.id)
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
    hasPin: !!pinResult.data,
    trusted: !!deviceResult.data,
    fingerprintHash: fp,
  });
}
