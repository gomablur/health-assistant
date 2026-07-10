/** Number formatting for metric values. */
export function formatValue(value: number | null | undefined, digits: number): string | null {
  if (value == null) return null;
  if (digits > 0) return value.toFixed(digits);
  return Math.round(value).toLocaleString('ja-JP');
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
