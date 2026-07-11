/**
 * Minimal Gemini API client (REST, no SDK). The user supplies their own free
 * Google AI Studio key via the settings screen; requests go directly from the
 * device, no server involved.
 *
 * Models are tried in order and a 404 (model retired — Google has been
 * shutting models down ahead of announced dates) falls through to the next
 * candidate, so a model retirement degrades gracefully instead of breaking
 * the app until an update.
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
