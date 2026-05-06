/**
 * Partnerships data layer — invitaciones + RPCs de cuenta compartida.
 *
 * Modelo (ver migrations 00027 + 00028):
 *   - account_invitations: el owner crea una invitation con un code,
 *     comparte el link `/invite/{code}` por WhatsApp/etc, el partner
 *     lo acepta. Una invitation = un solo accept.
 *   - account_partnerships: row creada al aceptar. PK por
 *     (account_id, partner_user_id), unique por account_id (1 partner
 *     por cuenta en v1).
 *   - accounts.shared_with_partner: flag automaticamente sincronizada
 *     por las SECURITY DEFINER functions accept/revoke/leave.
 *
 * Mismo pattern que budgets.ts y commitments.ts:
 *   - "use client", browser bundle.
 *   - Throws con mensajes en español neutral.
 *   - No DELETE policy directa — para "desvincular" usar revoke o
 *     leave (functions RPC).
 */
"use client";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────

export type AccountInvitation = {
  id: string;
  account_id: string;
  invited_by: string;
  code: string;
  created_at: string;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
};

export type AccountPartnership = {
  account_id: string;
  partner_user_id: string;
  invited_at: string;
  joined_at: string;
};

export type InvitationPreview = {
  /** Nombre de la cuenta a la que se invita (ej "Casa", "Sueldo BCP"). */
  accountName: string;
  /** full_name del inviter, fallback a display_name, fallback a "Alguien". */
  inviterName: string;
  /** ISO de expiracion. UI lo formatea como "vence en 3 dias". */
  expiresAt: string;
};

// ─── Code generation ──────────────────────────────────────────────────

/**
 * Codigo cortito para meter en el link. 16 chars hex (~52 bits de
 * entropia) — suficiente para invitaciones que expiran en 7 dias.
 * El check de unicidad lo hace el unique constraint en DB; en la
 * practica un colapso de 16 hex chars es astronomicamente improbable.
 */
function generateInviteCode(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  // Fallback raro en browsers modernos.
  return Math.random().toString(36).slice(2, 18).padEnd(16, "0");
}

/**
 * URL absoluta del link de invitacion (lista para copiar/pegar en
 * WhatsApp). En SSR retorna solo el path — el caller la concatena
 * con el host una vez en el cliente.
 */
export function buildInvitationUrl(code: string): string {
  if (typeof window === "undefined") {
    return `/invite/${code}`;
  }
  return `${window.location.origin}/invite/${code}`;
}

// ─── Cross-component event bus ────────────────────────────────────────

/**
 * Disparado tras cualquier write — el dashboard, /accounts, settings
 * lo usan para refetchear el estado de cuentas compartidas sin
 * esperar al realtime.
 */
export const PARTNERSHIP_UPSERTED_EVENT = "partnership:upserted";

function emitUpserted(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PARTNERSHIP_UPSERTED_EVENT));
}

// ─── Invitations (owner side) ─────────────────────────────────────────

/**
 * Crea una invitacion para una cuenta del user. Pre-checks:
 * cuenta existe, es del user, no tiene partner ya. La RLS protege
 * estos casos tambien — los chequeos client-side son para dar
 * mensajes de error claros antes del round-trip.
 */
export async function createInvitation(
  accountId: string,
): Promise<AccountInvitation> {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error("Inicia sesión para invitar a tu pareja.");
  }

  // Pre-check: la cuenta es mia y no esta ya compartida.
  const { data: account, error: accountErr } = await supabase
    .from("accounts")
    .select("id, user_id, shared_with_partner, name")
    .eq("id", accountId)
    .maybeSingle();
  if (accountErr) {
    throw new Error(
      accountErr.message || "No pudimos verificar la cuenta.",
    );
  }
  if (!account || account.user_id !== user.id) {
    throw new Error("Esa cuenta no es tuya.");
  }
  if (account.shared_with_partner) {
    throw new Error(
      "Esta cuenta ya tiene una pareja vinculada. Si quieres cambiarla, primero retira a la actual.",
    );
  }

  const code = generateInviteCode();
  const { data, error } = await supabase
    .from("account_invitations")
    .insert({
      account_id: accountId,
      invited_by: user.id,
      code,
    })
    .select(
      "id, account_id, invited_by, code, created_at, expires_at, accepted_by, accepted_at, revoked_at",
    )
    .single();

  if (error) {
    throw new Error(error.message || "No pudimos crear la invitación.");
  }
  emitUpserted();
  return data as AccountInvitation;
}

/**
 * Lista invitaciones pendientes (no aceptadas, no revocadas, no
 * expiradas) que el user creo. Si se pasa accountId, filtra a esa
 * cuenta. RLS auto-scopea al invited_by = user.
 */
export async function listPendingInvitations(
  accountId?: string,
): Promise<AccountInvitation[]> {
  const supabase = createSupabaseClient();
  let query = supabase
    .from("account_invitations")
    .select(
      "id, account_id, invited_by, code, created_at, expires_at, accepted_by, accepted_at, revoked_at",
    )
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (accountId) {
    query = query.eq("account_id", accountId);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "No pudimos cargar las invitaciones.");
  }
  return (data ?? []) as AccountInvitation[];
}

/**
 * Marca una invitacion pendiente como revocada. La RLS update
 * permite solo al invited_by, asi que no necesitamos pre-check.
 */
export async function revokeInvitation(invitationId: string): Promise<void> {
  const supabase = createSupabaseClient();
  const { error } = await supabase
    .from("account_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId);
  if (error) {
    throw new Error(error.message || "No pudimos cancelar la invitación.");
  }
  emitUpserted();
}

// ─── Invitations (partner side) ───────────────────────────────────────

/**
 * Lookup del preview de una invitacion sin aceptarla. Llama a la
 * SECURITY DEFINER function preview_account_invitation que retorna
 * solo metadata minima (nombre cuenta + nombre inviter + expires_at).
 *
 * Returns null cuando: code invalido, accepted, revoked o expired.
 * No distinguimos las 4 razones para no leakear info — un
 * "invitacion no valida" generico es suficiente UX.
 */
export async function previewInvitation(
  code: string,
): Promise<InvitationPreview | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.rpc("preview_account_invitation", {
    p_code: code,
  });
  if (error) {
    throw new Error(
      error.message || "No pudimos validar la invitación.",
    );
  }
  if (!data || data.length === 0) return null;
  const row = data[0] as {
    account_name: string;
    inviter_name: string;
    expires_at: string;
  };
  return {
    accountName: row.account_name,
    inviterName: row.inviter_name,
    expiresAt: row.expires_at,
  };
}

/**
 * Acepta una invitacion. Llama a la SECURITY DEFINER function que:
 *   1. Valida el code (no expirado, no aceptado, no revocado).
 *   2. Inserta la partnership.
 *   3. Marca la invitacion accepted.
 *   4. Setea accounts.shared_with_partner = true.
 * Atomico via plpgsql.
 *
 * Retorna el accountId. La UI puede usarlo para redirigir o
 * invalidar caches scope-cuenta.
 */
export async function acceptInvitation(code: string): Promise<string> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.rpc("accept_account_invitation", {
    p_code: code,
  });
  if (error) {
    // Mensajes amigables para los errcodes que la function lanza.
    const msg = error.message || "";
    if (msg.includes("P0002")) {
      throw new Error("Esta invitación ya no es válida o expiró.");
    }
    if (msg.includes("P0003")) {
      throw new Error("No puedes aceptar tu propia invitación.");
    }
    if (msg.includes("P0004")) {
      throw new Error("Esta cuenta ya tiene una pareja vinculada.");
    }
    throw new Error(msg || "No pudimos aceptar la invitación.");
  }
  emitUpserted();
  return data as string;
}

// ─── Partnerships (management) ────────────────────────────────────────

/**
 * Owner saca al partner. Borra la partnership, desmarca la flag
 * shared_with_partner y revoca invitaciones pendientes de la cuenta
 * (todo atomico en la function).
 */
export async function revokePartnership(accountId: string): Promise<void> {
  const supabase = createSupabaseClient();
  const { error } = await supabase.rpc("revoke_account_partnership", {
    p_account_id: accountId,
  });
  if (error) {
    if ((error.message || "").includes("P0005")) {
      throw new Error("Solo el dueño de la cuenta puede retirar a la pareja.");
    }
    throw new Error(error.message || "No pudimos retirar a la pareja.");
  }
  emitUpserted();
}

/**
 * Partner se sale de la cuenta sin pedir permiso al owner.
 * Tras esto pierde acceso a las transactions/commitments de esa
 * cuenta. Las que el partner creo quedan con su user_id (el owner
 * las ve si la cuenta sigue compartida con alguien o las ve
 * archivadas, pero v1 simplificacion: las tx se mantienen).
 */
export async function leavePartnership(accountId: string): Promise<void> {
  const supabase = createSupabaseClient();
  const { error } = await supabase.rpc("leave_account_partnership", {
    p_account_id: accountId,
  });
  if (error) {
    throw new Error(
      error.message || "No pudimos salir de la cuenta compartida.",
    );
  }
  emitUpserted();
}

/**
 * Quien es el partner de una cuenta (si la tengo compartida)?
 * Retorna null cuando la cuenta no esta compartida o no tengo
 * permisos via RLS para verla.
 */
export async function getAccountPartner(
  accountId: string,
): Promise<AccountPartnership | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("account_partnerships")
    .select("account_id, partner_user_id, invited_at, joined_at")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) {
    return null;
  }
  return data as AccountPartnership | null;
}

/**
 * Info renderizable del partner de una cuenta (nombre + joined_at).
 * Llama a la SECURITY DEFINER function que bypassa RLS de profiles
 * (el owner no tiene SELECT directo sobre el profile del partner).
 *
 * Retorna null cuando la cuenta no tiene partner o no tengo
 * permisos.
 */
export type AccountPartnerInfo = {
  partnerUserId: string;
  partnerName: string;
  joinedAt: string;
};

export async function getAccountPartnerInfo(
  accountId: string,
): Promise<AccountPartnerInfo | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.rpc("get_account_partner_info", {
    p_account_id: accountId,
  });
  if (error) return null;
  if (!data || data.length === 0) return null;
  const row = data[0] as {
    partner_user_id: string;
    partner_name: string;
    joined_at: string;
  };
  return {
    partnerUserId: row.partner_user_id,
    partnerName: row.partner_name,
    joinedAt: row.joined_at,
  };
}

/**
 * Lista todas las partnerships en las que participa el user (como
 * owner o como partner). Util para el dashboard "tus cuentas
 * compartidas". RLS le deja ver:
 *   - rows donde el es partner_user_id, o
 *   - rows donde la cuenta referenciada es suya.
 */
export async function listMyPartnerships(): Promise<AccountPartnership[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("account_partnerships")
    .select("account_id, partner_user_id, invited_at, joined_at");
  if (error) {
    throw new Error(
      error.message || "No pudimos cargar tus cuentas compartidas.",
    );
  }
  return (data ?? []) as AccountPartnership[];
}
