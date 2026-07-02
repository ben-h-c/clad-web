/**
 * "Tuesday, May 30, 1926" — the classic broadsheet dateline.
 * Ported from Clad/UI/NewspaperTheme.swift's NewspaperDate.dateline.
 *
 * All date math is anchored to Eastern time (the newsroom's clock) so the
 * dateline, issue number, and volume agree regardless of server timezone.
 */
const TZ = "America/New_York";

export function dateline(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: TZ,
  });
}

/** Short form for cards: "Jun 7, 2026". */
export function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: TZ,
  });
}

/** Calendar date parts (year/month/day) in Eastern time. */
export function nyDateParts(date: Date = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .split("-");
  return { y: Number(parts[0]), m: Number(parts[1]), d: Number(parts[2]) };
}

/** Issue number: days since Jan 1, 2026, keyed to the Eastern calendar day. */
export function issueNumber(date: Date = new Date()): number {
  const { y, m, d } = nyDateParts(date);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86_400_000);
}

/** Roman numeral volume — purely decorative, computed from year. */
export function volume(date: Date = new Date()): string {
  const v = nyDateParts(date).y - 2025;
  return toRoman(v);
}

function toRoman(n: number): string {
  const numerals: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let result = "";
  for (const [val, sym] of numerals) {
    while (n >= val) {
      result += sym;
      n -= val;
    }
  }
  return result || "I";
}
