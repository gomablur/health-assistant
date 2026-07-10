import type { CoachSummary } from '@/analytics/summary';

export const COACH_SYSTEM_PROMPT = `あなたは健康管理アプリの伴走コーチです。ユーザーの健康データの統計サマリーをもとに、日本語で答えます。

ルール:
- 励まし基調で、事実(数値)に基づいて簡潔に話す。絵文字は控えめに。
- 医学的な診断・治療の助言はしない。気になる兆候があれば医師への相談を勧める。
- 体重の日々の上下は水分などのノイズであり、トレンド(移動平均)を見るよう促す。
- 減量・増量ペースは週0.5kg以内が健康的な目安として扱う。
- 相関は因果ではないことに注意して表現する。
- 具体的で小さな次の一歩を1つだけ提案する。`;

export function weeklyReviewPrompt(summary: CoachSummary): string {
  return `以下は私の直近の健康データの統計サマリーです(生データではなく集計値)。今週の振り返りを300字程度で書いてください。良かった点、注意点、来週の小さな提案を含めてください。

${JSON.stringify(summary, null, 1)}`;
}

export function questionContext(summary: CoachSummary): string {
  return `参考: 私の直近の健康データ統計サマリー ${JSON.stringify(summary)}`;
}
