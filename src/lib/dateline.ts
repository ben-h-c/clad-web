/**
 * "Tuesday, May 30, 1926" — the classic broadsheet dateline.
 * Ported from Clad/UI/NewspaperTheme.swift's NewspaperDate.dateline.
 */
export function dateline(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Short form for cards: "Jun 7, 2026". */
export function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Roman numeral volume — purely decorative, computed from year. */
export function volume(date: Date = new Date()): string {
  const v = date.getFullYear() - 2025;
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
