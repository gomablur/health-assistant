/** Date helpers. All series use local-time calendar days keyed as 'YYYY-MM-DD'. */

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Days since Unix epoch, timezone-safe for local calendar days. */
export function dayIndex(iso: string): number {
  const d = fromISODate(iso);
  return Math.round(d.getTime() / 86400000);
}

/** 'M/D' for axis labels. */
export function formatMonthDay(iso: string): string {
  const d = fromISODate(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** ISO week key like '2026-W28' (for weekly review caching). */
export function isoWeekKey(iso: string): string {
  const d = fromISODate(iso);
  // shift to Thursday of the same ISO week
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const week1 = new Date(d.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    );
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}
