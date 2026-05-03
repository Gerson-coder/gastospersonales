/**
 * Text utilities — small, pure helpers for string normalization.
 *
 * Currently focused on user-name capture (onboarding + welcome). Reused
 * across forms so all entry points share the same rule for what counts
 * as "valid name input".
 */

/**
 * Whitelist regex for name inputs: solo letras Unicode (cubre acentos,
 * ñ, etc.), digitos, y espacios. Cualquier otra cosa — emojis, ZWJ
 * joiners, variation selectors, símbolos, control chars, zero-width
 * spaces — se elimina.
 *
 * Por que whitelist en vez de blacklist: la version anterior usaba
 * `\p{Extended_Pictographic}` que cubría los pictographs visibles pero
 * dejaba caracteres residuales (zero-width joiners, variation selectors
 * sueltos) cuando el user pegaba un emoji compuesto — el field
 * mostraba "espacios en blanco" que ni se podían seleccionar. Con
 * whitelist, NADA fuera de letras/números/espacio sobrevive.
 *
 * Flags: `g` (replace all matches) + `u` (Unicode property escapes
 * require it).
 */
const NAME_DISALLOWED_REGEX = /[^\p{L}\p{N} ]/gu;

export type SanitizeNameResult = {
  /** Input filtered to letters, digits and spaces. */
  cleaned: string;
  /** True when at least one disallowed character was removed. Caller
   *  uses this to surface a transient hint ("Solo letras y números")
   *  so the user understands why their emoji vanished. */
  stripped: boolean;
};

/**
 * Sanitize a free-form name input: strips anything that is not a
 * letter, a digit or a space. Run this in the form's `onChange` so the
 * user's draft state never holds invalid characters — the DB and any
 * downstream surface (greetings, ProfileMenu, etc.) stay clean
 * without a second validation pass.
 */
export function sanitizeNameInput(value: string): SanitizeNameResult {
  const cleaned = value.replace(NAME_DISALLOWED_REGEX, "");
  return { cleaned, stripped: cleaned !== value };
}
