/**
 * 重なりうる時間区間をマージして、合計時間(時間単位)を返す。
 * 睡眠サンプルは複数の書き込み元(Watch + iPhone)から来ることが多く、
 * 素朴に合計すると二重計上になるため区間の和集合を取る。
 */
export interface TimeInterval {
  start: number; // エポックms
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
