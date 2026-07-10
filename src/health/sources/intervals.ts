/**
 * Merge possibly-overlapping time intervals and return the union length in
 * hours. Sleep samples often come from multiple writers (Watch + iPhone), so
 * naive summing would double-count.
 */
export interface TimeInterval {
  start: number; // epoch ms
  end: number;
}

export function unionHours(intervals: TimeInterval[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].end;
  for (let i = 1; i < sorted.length; i++) {
    const { start, end } = sorted[i];
    if (start <= curEnd) {
      curEnd = Math.max(curEnd, end);
    } else {
      total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    }
  }
  total += curEnd - curStart;
  return total / 3600000;
}
