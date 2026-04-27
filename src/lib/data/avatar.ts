"use client";

/**
 * Avatar data layer — upload/remove the current user's profile picture.
 *
 * Storage convention: files live in the public `avatars` bucket under the
 * path `{user_id}/avatar.{ext}`. The DB column `profiles.avatar_url` holds
 * the public URL with a `?v={timestamp}` cache-buster appended so the UI
 * picks up the new image without waiting for the CDN cache to expire.
 *
 * RLS (see migration 00009) enforces that only the owner can write under
 * their own `{user_id}/...` prefix. Reads are public so the URL works in
 * any rendering context (marketing pages, emails, etc.).
 */

import { createClient } from "@/lib/supabase/client";

const BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type UploadAvatarResult = {
  publicUrl: string;
  path: string;
};

/**
 * Uploads a new avatar for the current user. Replaces any previous file
 * (same path), updates `profiles.avatar_url` to the new public URL, and
 * returns the URL.
 */
export async function uploadAvatar(file: File): Promise<UploadAvatarResult> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Tipo de archivo no permitido. Usa PNG, JPEG o WebP.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("La imagen es muy grande. Máximo 2 MB.");
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("Necesitas iniciar sesión para subir tu foto.");
  }

  // Stable file extension from MIME — keeps the path predictable so
  // `upsert: true` overwrites the previous avatar of the same type.
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

  if (uploadError) {
    throw new Error(uploadError.message || "No pudimos subir la imagen.");
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = `${publicData.publicUrl}?v=${Date.now()}`; // bust cache

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);

  if (updateError) {
    throw new Error(
      updateError.message ||
        "Subimos la imagen pero no pudimos guardarla en tu perfil.",
    );
  }

  return { publicUrl, path };
}

/**
 * Removes the avatar from Storage and clears profiles.avatar_url.
 * Tolerates missing files (file may already be gone or under a different ext).
 */
export async function removeAvatar(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("Necesitas iniciar sesión.");
  }

  // Try removing all known extensions — upload may have created any of them.
  const candidates = [
    `${user.id}/avatar.png`,
    `${user.id}/avatar.jpg`,
    `${user.id}/avatar.webp`,
  ];
  await supabase.storage
    .from(BUCKET)
    .remove(candidates)
    .catch(() => {
      // ignore — bucket may not exist yet or files already gone
    });

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message || "No pudimos quitar la imagen.");
  }
}
