/** 日付ヘルパー。全系列はローカル時刻の暦日を 'YYYY-MM-DD' キーで扱う。 */

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

/** Unixエポックからの日数。ローカル暦日に対してタイムゾーン安全。 */
export function dayIndex(iso: string): number {
  const d = fromISODate(iso);
  return Math.round(d.getTime() / 86400000);
}

/** 軸ラベル用の 'M/D' 表記。 */
export function formatMonthDay(iso: string): string {
  const d = fromISODate(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** '2026-W28' 形式のISO週キー(週次振り返りのキャッシュキー用)。 */
export function isoWeekKey(iso: string): string {
  const d = fromISODate(iso);
  // 同じISO週の木曜日にシフトする(ISO週番号の定義に従う)
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
