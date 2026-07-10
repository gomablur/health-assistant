/**
 * Minimal Gemini API client (REST, no SDK). The user supplies their own free
 * Google AI Studio key via the settings screen; requests go directly from the
 * device, no server involved.
 */

export const GEMINI_MODEL = 'gemini-2.5-flash';

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

export async function generateText({
  apiKey,
  system,
  turns,
  maxOutputTokens = 1024,
}: GenerateOptions): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens,
          // keep free-tier usage cheap and answers fast
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );

  if (!res.ok) {
    if (res.status === 429)
      throw new Error('無料枠の上限に達したようです。少し時間をおいて再試行してください。');
    if (res.status === 400 || res.status === 403)
      throw new Error('APIキーが無効のようです。設定画面で確認してください。');
    throw new Error(`Gemini APIエラー (HTTP ${res.status})`);
  }

  const json: any = await res.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? '')
      .join('') ?? '';
  if (!text) throw new Error('AIからの応答が空でした。もう一度お試しください。');
  return text;
}
