/**
 * 最小のGemini APIクライアント(REST直叩き、SDKなし)。APIキーはユーザー自身が
 * Google AI Studioで発行して設定画面から登録する。リクエストは端末から直接
 * 送信され、サーバーは介在しない。
 *
 * モデルは候補リストを順に試し、404(モデル退役 — Googleは告知より早く
 * モデルを止めることがある)なら次の候補へフォールバックする。これにより
 * モデル退役時もアプリ更新まで壊れず、劣化にとどまる。
 */

export const GEMINI_MODEL_CANDIDATES = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
] as const;

let workingModel: string | null = null;

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export interface GenerateOptions {
  apiKey: string;
  system?: string;
  turns: ChatTurn[];
  maxOutputTokens?: number;
}

async function callModel(
  model: string,
  { apiKey, system, turns, maxOutputTokens = 2048 }: GenerateOptions,
): Promise<Response> {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: { temperature: 0.6, maxOutputTokens },
      }),
    },
  );
}

export async function generateText(options: GenerateOptions): Promise<string> {
  const candidates = workingModel
    ? [workingModel, ...GEMINI_MODEL_CANDIDATES.filter((m) => m !== workingModel)]
    : [...GEMINI_MODEL_CANDIDATES];

  let res: Response | null = null;
  let model: string | null = null;
  for (const candidate of candidates) {
    res = await callModel(candidate, options);
    if (res.status !== 404) {
      model = candidate;
      break;
    }
  }

  if (!res || model == null) {
    throw new Error(
      'Geminiのモデルが見つかりませんでした(全候補が404)。アプリのアップデートで新しいモデル名への対応が必要かもしれません。',
    );
  }

  if (!res.ok) {
    if (res.status === 429)
      throw new Error('無料枠の上限に達したようです。少し時間をおいて再試行してください。');
    if (res.status === 400 || res.status === 403)
      throw new Error('APIキーが無効のようです。設定画面で確認してください。');
    throw new Error(`Gemini APIエラー (HTTP ${res.status})`);
  }

  workingModel = model;

  const json: any = await res.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? '')
      .join('') ?? '';
  if (!text) throw new Error('AIからの応答が空でした。もう一度お試しください。');
  return text;
}
