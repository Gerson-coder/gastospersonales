/**
 * Friendly relative-date formatter for transaction rows + a few helpers
 * for date bucketing in Peru time.
 *
 *   Today's tx     -> "Hoy, 12:30"
 *   Yesterday's tx -> "Ayer, 09:15"
 *   Older tx       -> "20 Abr, 18:42"
 *
 * Why a fixed `America/Lima` timezone instead of the browser's local
 * tz? Supabase stores `occurred_at` as `timestamptz` which serializes to
 * UTC ISO. When a Peruvian user logs an expense at 23:00 local time, the
 * raw ISO carries 04:00 UTC of the next calendar day. Naive parsers
 * (character slicing, or `new Date(iso)` on a non-Peru runtime) shift
 * the day boundary and the row ends up in "tomorrow" when the user
 * expects "today". Pinning every formatter to America/Lima keeps the
 * day boundary anchored to the user's wall clock, regardless of where
 * Vercel's edge serves the page from or which device the user opens.
 *
 * Implementation uses `Intl.DateTimeFormat.formatToParts` so we can read
 * the Lima year / month / day / hour / minute as separate strings without
 * locale-specific surprises ("9:20 a. m." vs "9:20 AM" etc.). The output
 * is hand-stitched.
 */
const LIMA_TZ = "America/Lima";

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

// Single shared formatter — DateTimeFormat allocations are not free, and
// transaction lists call the helpers below per-row.
const LIMA_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: LIMA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type LimaParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function partsOf(date: Date): LimaParts {
  const parts = LIMA_PARTS_FORMATTER.formatToParts(date);
  const get = (type: string): string => {
    const p = parts.find((x) => x.type === type);
    return p?.value ?? "00";
  };
  // `hour` can return "24" at the rollover boundary on some engines;
  // Intl spec is clear that hour12: false yields 00–23, but there were
  // historical V8 bugs returning "24". Defensive normalize.
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
  };
}

/** "YYYY-MM-DD" key in Lima time. Use for same-day comparisons. */
export function formatLimaDate(occurredAt: string | Date): string {
  const d = typeof occurredAt === "string" ? new Date(occurredAt) : occurredAt;
  const p = partsOf(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "HH:MM" 24h time in Lima TZ. */
export function formatLimaTime(occurredAt: string | Date): string {
  const d = typeof occurredAt === "string" ? new Date(occurredAt) : occurredAt;
  const p = partsOf(d);
  return `${p.hour}:${p.minute}`;
}

/**
 * Friendly relative date. Today / yesterday boundaries are also computed
 * in Lima TZ so a tx at 23:00 Lima vs 00:30 Lima the next day reads
 * correctly as "Hoy" then "Ayer".
 */
export function formatTxDate(occurredAt: string): string {
  const txDate = new Date(occurredAt);
  const tx = partsOf(txDate);
  const txKey = `${tx.year}-${tx.month}-${tx.day}`;
  const time = `${tx.hour}:${tx.minute}`;

  const now = new Date();
  const today = partsOf(now);
  const todayKey = `${today.year}-${today.month}-${today.day}`;

  // Yesterday in Lima time — 24h subtract is correct because we then
  // reformat through the Lima formatter; it preserves the Lima day.
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yest = partsOf(yesterdayDate);
  const yesterdayKey = `${yest.year}-${yest.month}-${yest.day}`;

  if (txKey === todayKey) return `Hoy, ${time}`;
  if (txKey === yesterdayKey) return `Ayer, ${time}`;
  return `${parseInt(tx.day, 10)} ${MONTHS[parseInt(tx.month, 10) - 1]}, ${time}`;
}
