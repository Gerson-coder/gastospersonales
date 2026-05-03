import "server-only";

import { Resend } from "resend";

/**
 * Resend client — singleton. Reads RESEND_API_KEY from env. When the key
 * is missing we DO NOT throw at import time; instead `sendOtpEmail` logs
 * the OTP to the server console and returns a dev-mode flag. This lets
 * the dev environment work end-to-end without a Resend account, and the
 * production environment hard-fails on the first send if the key was
 * forgotten (visible in Vercel logs immediately).
 *
 * For testing without a verified domain, we use Resend's official
 * `onboarding@resend.dev` sender — that one is allowed to send only to
 * the email associated with the Resend account, perfect for the project
 * owner to dogfood. Once the domain (e.g. `kane.app`) is verified, set
 * RESEND_FROM_ADDRESS=`Kane <no-reply@kane.app>` and we send to anyone.
 */

import type { OtpPurpose } from "./otp";

let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cachedClient) cachedClient = new Resend(key);
  return cachedClient;
}

/**
 * Default sender — Resend's onboarding sandbox. Override in production
 * by setting RESEND_FROM_ADDRESS in the env. The format MUST be
 * `Display Name <local@domain>` for Resend to accept it.
 */
function getFromAddress(): string {
  return (
    process.env.RESEND_FROM_ADDRESS ?? "Kane <onboarding@resend.dev>"
  );
}

const SUBJECT_BY_PURPOSE: Record<OtpPurpose, string> = {
  email_verification: "Tu código de verificación",
  new_device: "Inicio de sesión desde un dispositivo nuevo",
  pin_reset: "Recupera tu PIN de Kane",
};

const HEADLINE_BY_PURPOSE: Record<OtpPurpose, string> = {
  email_verification: "Verifica tu correo",
  new_device: "Estás iniciando sesión en un dispositivo nuevo",
  pin_reset: "Recupera tu PIN",
};

const BODY_BY_PURPOSE: Record<OtpPurpose, string> = {
  email_verification:
    "Ingresa este código en la app para confirmar que este correo es tuyo.",
  new_device:
    "Detectamos un inicio de sesión desde un dispositivo que no reconocemos. Si fuiste tú, ingresa este código en la app.",
  pin_reset:
    "Ingresa este código en la app para crear un PIN nuevo. Si no lo solicitaste, ignora este correo.",
};

/**
 * Send an OTP email. Always logs to server console (safety net for dev
 * + ops triage). Returns the delivery status so the API route can decide
 * whether to surface a "no se pudo enviar el correo" message.
 */
export async function sendOtpEmail(params: {
  to: string;
  code: string;
  purpose: OtpPurpose;
}): Promise<{ delivered: boolean; devMode: boolean; messageId?: string }> {
  const { to, code, purpose } = params;

  // Always log — never trust that email actually arrived. Useful in
  // dev (when no Resend key) AND in prod (for ops to debug a stuck flow).
  console.log(
    `[auth] OTP ${purpose} for ${to}: ${code} (expires in 10 min)`,
  );

  const client = getClient();
  if (!client) {
    return { delivered: false, devMode: true };
  }

  try {
    const result = await client.emails.send({
      from: getFromAddress(),
      to,
      subject: SUBJECT_BY_PURPOSE[purpose],
      html: renderOtpHtml({
        headline: HEADLINE_BY_PURPOSE[purpose],
        body: BODY_BY_PURPOSE[purpose],
        code,
      }),
      // Plaintext fallback so the email passes the "is this spam?" sniff
      // tests aggressively run by Gmail / Outlook.
      text: `${HEADLINE_BY_PURPOSE[purpose]}\n\n${BODY_BY_PURPOSE[purpose]}\n\nTu código: ${code}\n\nEste código expira en 10 minutos.`,
    });
    if (result.error) {
      const errName = result.error.name ?? "unknown";
      const errMessage = result.error.message ?? "unknown";
      const errStatus =
        (result.error as { statusCode?: number }).statusCode ?? "unknown";
      console.error(
        `[auth] resend send_failed name=${errName} statusCode=${errStatus} message=${errMessage}`,
      );
      return { delivered: false, devMode: false };
    }
    return {
      delivered: true,
      devMode: false,
      messageId: result.data?.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "unknown";
    console.error(`[auth] resend threw name=${name} message=${message}`);
    return { delivered: false, devMode: false };
  }
}

/**
 * Send a "new device login" notification AFTER the user finishes the OTP
 * verification on a previously-untrusted device. Distinct from the OTP
 * email itself: that one is "here's the code"; this one is "we trusted
 * the device, here's what we know about it" — the security signal big
 * apps (Google, Apple) send when an account is accessed somewhere new.
 *
 * Fire-and-forget from the caller — never block the auth flow on this.
 */
export async function sendNewDeviceLoginEmail(params: {
  to: string;
  deviceName: string;
  ipAddress?: string | null;
  occurredAt?: Date;
}): Promise<{ delivered: boolean; devMode: boolean; messageId?: string }> {
  const { to, deviceName, ipAddress } = params;
  const occurredAt = params.occurredAt ?? new Date();

  const formattedDate = occurredAt.toLocaleString("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "full",
    timeStyle: "short",
  });

  console.log(
    `[auth] new_device_login to=${to} device="${deviceName}" ip=${ipAddress ?? "n/a"} at=${occurredAt.toISOString()}`,
  );

  const client = getClient();
  if (!client) {
    return { delivered: false, devMode: true };
  }

  try {
    const result = await client.emails.send({
      from: getFromAddress(),
      to,
      subject: "Nuevo inicio de sesión en tu cuenta",
      html: renderNewDeviceHtml({
        deviceName,
        ipAddress: ipAddress ?? null,
        formattedDate,
      }),
      text: `Detectamos un nuevo inicio de sesión en tu cuenta de Kane.\n\nDispositivo: ${deviceName}\nFecha: ${formattedDate}${ipAddress ? `\nIP: ${ipAddress}` : ""}\n\nSi fuiste tú, no necesitas hacer nada. Si no reconoces este acceso, cambia tu PIN desde la app y revisa la lista de dispositivos confiables en Configuración.`,
    });
    if (result.error) {
      const errName = result.error.name ?? "unknown";
      const errMessage = result.error.message ?? "unknown";
      console.error(
        `[auth] resend new_device_send_failed name=${errName} message=${errMessage}`,
      );
      return { delivered: false, devMode: false };
    }
    return {
      delivered: true,
      devMode: false,
      messageId: result.data?.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[auth] resend new_device threw message=${message}`);
    return { delivered: false, devMode: false };
  }
}

function renderNewDeviceHtml(params: {
  deviceName: string;
  ipAddress: string | null;
  formattedDate: string;
}): string {
  const { deviceName, ipAddress, formattedDate } = params;
  const escapedDevice = deviceName.replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c] ?? c;
  });
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nuevo inicio de sesión</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
  <div style="max-width:480px;margin:0 auto;padding:32px 16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
      <tr>
        <td style="padding:32px 28px;">
          <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#16a34a;margin-bottom:24px;">Kane</div>
          <h1 style="font-size:22px;font-weight:700;line-height:1.3;margin:0 0 12px 0;color:#0f172a;">Nuevo inicio de sesión</h1>
          <p style="font-size:15px;line-height:1.55;margin:0 0 24px 0;color:#475569;">Detectamos un inicio de sesión en tu cuenta desde un dispositivo nuevo. Si fuiste tú, no necesitas hacer nada.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;border-radius:12px;margin-bottom:24px;">
            <tr>
              <td style="padding:16px 20px;font-size:13px;color:#475569;">
                <div style="margin-bottom:10px;"><span style="color:#94a3b8;">Dispositivo:</span> <strong style="color:#0f172a;">${escapedDevice}</strong></div>
                <div style="margin-bottom:10px;"><span style="color:#94a3b8;">Fecha:</span> <strong style="color:#0f172a;">${formattedDate}</strong></div>
                ${ipAddress ? `<div><span style="color:#94a3b8;">IP:</span> <strong style="color:#0f172a;">${ipAddress}</strong></div>` : ""}
              </td>
            </tr>
          </table>
          <p style="font-size:13px;line-height:1.55;color:#475569;margin:0 0 16px 0;"><strong style="color:#0f172a;">¿No fuiste tú?</strong> Cambia tu PIN desde la app y revisa la lista de dispositivos confiables en Configuración.</p>
        </td>
      </tr>
    </table>
    <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:18px;">Kane · controla tu dinero</p>
  </div>
</body>
</html>`;
}

/**
 * Inline HTML for the OTP email. Hand-written rather than via React Email
 * because the template is tiny and the runtime cost of importing
 * @react-email/components into every server action is real. If we add
 * more email types later we can graduate to react-email.
 *
 * Accessibility: the code is a heading + a `aria-label`-ed span so screen
 * readers say "código uno dos tres cuatro cinco seis" instead of "one
 * hundred twenty three thousand …".
 */
function renderOtpHtml(params: {
  headline: string;
  body: string;
  code: string;
}): string {
  const { headline, body, code } = params;
  // Spaced out for screen readers + visual grouping.
  const spacedCode = code.split("").join(" ");
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
  <div style="max-width:480px;margin:0 auto;padding:32px 16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
      <tr>
        <td style="padding:32px 28px;">
          <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#16a34a;margin-bottom:24px;">Kane</div>
          <h1 style="font-size:22px;font-weight:700;line-height:1.3;margin:0 0 12px 0;color:#0f172a;">${headline}</h1>
          <p style="font-size:15px;line-height:1.55;margin:0 0 28px 0;color:#475569;">${body}</p>
          <div style="text-align:center;background:#f1f5f9;border-radius:12px;padding:24px 16px;margin-bottom:24px;">
            <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Tu código</div>
            <div role="text" aria-label="Código ${spacedCode}" style="font-size:36px;font-weight:700;letter-spacing:0.4em;font-variant-numeric:tabular-nums;color:#0f172a;">${code}</div>
            <div style="font-size:12px;color:#64748b;margin-top:14px;">Expira en 10 minutos</div>
          </div>
          <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:0;">Si no fuiste tú, ignora este correo. Tu cuenta sigue protegida porque solo tú tienes acceso al PIN.</p>
        </td>
      </tr>
    </table>
    <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:18px;">Kane · controla tu dinero</p>
  </div>
</body>
</html>`;
}
