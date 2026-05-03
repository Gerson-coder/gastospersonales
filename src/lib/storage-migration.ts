/**
 * Migracion one-shot de claves de localStorage del rebrand legacy → Kane.
 *
 * Los users que vienen de la version anterior tenian sus prefs (currency,
 * theme, activeAccountId), su ultimo email, marca de notifs leidas,
 * presupuestos, metas, nombre, avatar, periodo de insights y flag de
 * onboarding bajo claves prefijadas con `lumi-` o `lumi_`. Renombrar las
 * claves al code base `kane-*` sin migrar les borraria todo eso en el
 * primer login despues del deploy — perdiendo currency selection, theme,
 * dispositivo, presupuestos, metas, etc.
 *
 * Esta funcion corre una vez por device en el primer mount del root
 * client provider. Por cada clave legacy:
 *   1. Si existe en la legacy Y NO existe en la nueva → copia el valor.
 *   2. Borra la clave legacy.
 *
 * Idempotente: corridas siguientes no hacen nada (ya borramos las claves
 * legacy en la primera). Si por alguna razon el user ya tiene datos en
 * la clave nueva (sesion mas reciente que el rebrand), NO los
 * sobreescribimos — la regla "si ya hay current, no toco" preserva el
 * estado mas nuevo.
 *
 * Safe-by-construction:
 *   - Bail si no hay window (SSR / build).
 *   - try/catch por si Safari Private Mode bloquea localStorage.
 *   - Sin throws — los errores se silencian; en el peor caso el user
 *     pierde state local y cuando login recrea las claves new-style.
 *
 * IMPORTANTE: NO renombrar las strings "lumi-*" / "lumi_*" de este
 * archivo durante el rebrand. Son las claves legacy literales — si las
 * cambias a "kane-*" la migracion se vuelve un no-op (lee y escribe la
 * misma clave) y los users pierden el state al actualizarse.
 */

const LEGACY_TO_NEW: Record<string, string> = {
  // Bag JSON con currency, theme, activeAccountId
  "lumi-prefs": "kane-prefs",
  // Local-only: presupuestos por categoria.
  // NOTA: aunque budgets y goals ahora viven en Supabase (migracion 00023),
  // mantenemos este rename para que los users legacy lumi conserven la data
  // local antes de que `uploadLegacyLocalDataToSupabase()` la suba al backend.
  // Borrar este mapping = los users lumi pierden sus presupuestos/metas viejos.
  "lumi-budgets": "kane-budgets",
  // Local-only: metas de ahorro. Misma nota que budgets — necesario para
  // que la subida one-shot a Supabase los vea bajo la clave kane-*.
  "lumi-goals": "kane-goals",
  // Profile / display
  "lumi-user-name": "kane-user-name",
  "lumi-user-avatar-url": "kane-user-avatar-url",
  // Auth helpers
  "lumi-last-email": "kane-last-email",
  // Notifs read cutoff
  "lumi-notifs-read-at": "kane-notifs-read-at",
  // Insights period selector
  "lumi-pref-insights-period": "kane-pref-insights-period",
  // Onboarding flag (nota: underscore, no hyphen — preservamos el
  // formato historico de la clave)
  "lumi_seen_intro": "kane_seen_intro",
};

export function migrateLegacyStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (const [legacy, current] of Object.entries(LEGACY_TO_NEW)) {
      const legacyValue = window.localStorage.getItem(legacy);
      if (legacyValue === null) continue;
      const currentValue = window.localStorage.getItem(current);
      if (currentValue === null) {
        window.localStorage.setItem(current, legacyValue);
      }
      window.localStorage.removeItem(legacy);
    }
  } catch {
    // Quota exceeded / private mode / etc. — silenciar; el user
    // recreara el state en su proxima interaccion.
  }
}
