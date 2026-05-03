/**
 * Text utilities — small, pure helpers for string normalization.
 *
 * Currently focused on user-name capture (onboarding + welcome). Reused
 * across forms so all entry points share the same rule for what counts
 * as "valid name input".
 */

/**
 * Matches any emoji-like glyph: pictographs (😀, 🍕, 🚗) plus emoji
 * components (skin tones, ZWJ joiners, variation selectors). Kept in
 * one place so the emoji-blocking rule is consistent across forms.
 *
 * `\p{Extended_Pictographic}` covers the actual emoji glyphs.
 * `\p{Emoji_Component}` covers the modifiers / joiners that would
 * otherwise be left as garbage characters when the pictograph is
 * stripped (e.g. removing 👨‍🦰 without touching the ZWJ leaves
 * a stray U+200D).
 *
 * Flags: `g` (replace all matches) + `u` (Unicode property escapes
 * require it).
 */
const EMOJI_REGEX = /[\p{Extended_Pictographic}\p{Emoji_Component}]/gu;

export type StripEmojisResult = {
  /** Input without emoji glyphs. */
  cleaned: string;
  /** True when at least one emoji was removed. Caller can use this to
   *  surface a temporary "No se permiten emojis" hint without spamming
   *  the user on every keystroke. */
  stripped: boolean;
};

/**
 * Remove every emoji-like glyph from `value`. The form layer should
 * pipe `onChange` through this helper instead of accepting raw input
 * — that way the user's draft state never holds an emoji and the
 * round-trip to the DB is always emoji-free without a separate
 * validation pass.
 */
export function stripEmojis(value: string): StripEmojisResult {
  const cleaned = value.replace(EMOJI_REGEX, "");
  return { cleaned, stripped: cleaned !== value };
}
