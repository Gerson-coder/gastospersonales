/**
 * Friendly relative-date formatter for transaction rows.
 *
 *   Today's tx     -> "Hoy, 12:30"
 *   Yesterday's tx -> "Ayer, 09:15"
 *   Older tx       -> "20 Abr, 18:60"
 *
 * Parses the ISO string by character slicing rather than `new Date()` so
 * the output is TZ-stable across SSR / hydration boundaries — `new Date(iso)`
 * re-anchors to local time and would flip the day for users in negative
 * UTC offsets when the tx happened just past midnight.
 */
const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export function formatTxDate(occurredAt: string): string {
  const txDate = occurredAt.slice(0, 10);
  const time = occurredAt.slice(11, 16);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const yesterday = (() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  if (txDate === today) return `Hoy, ${time}`;
  if (txDate === yesterday) return `Ayer, ${time}`;
  const [, mm, dd] = txDate.split("-");
  return `${parseInt(dd)} ${MONTHS[parseInt(mm) - 1]}, ${time}`;
}
