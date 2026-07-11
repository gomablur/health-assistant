# health-assistant

OS標準のヘルスアプリ(iOS: ヘルスケア / Android: ヘルスコネクト)からデータを読み取り、
「計測するだけ」で終わっていた健康データを分析して伴走するReact Native (Expo) アプリ。

## 機能

- **ダッシュボード** — 体重・歩数・睡眠・安静時心拍の今日のサマリーとスパークライン
- **体重分析** — 実測値 + 7日移動平均のトレンドチャート、EWMAによるトレンド体重、
  週あたりの変化ペース判定(健康的な目安: 週±0.5kg)、歩数との相関分析、計測継続率
- **アクティビティ** — 歩数・睡眠・アクティブカロリーの日次チャートと前週比
- **AIコーチ** — 統計サマリーをもとにした週次振り返りと質問応答
  (Gemini API 無料枠・ユーザー自身のキーを設定画面で登録。生データは端末外に出ません)

## アーキテクチャ

```
src/
  health/      HealthDataSource 抽象化(healthkit / healthconnect / mock)
  analytics/   移動平均・EWMA・線形回帰・相関などの純粋関数(ユニットテスト対象)
  coach/       デイリーブリーフのルールエンジン(このアプリの核)
  llm/         Gemini REST クライアントとプロンプト
  components/  Card / StatTile / チャート(検証済みパレット準拠)
  app/         expo-router 画面
```

- プラットフォーム別ファイル(`native.ios.ts` / `native.android.ts` / `native.web.ts`)で
  ネイティブSDKをWebバンドルから隔離
- Web / Expo Go / `EXPO_PUBLIC_MOCK_HEALTH=1` では決定論的なモックデータで全機能が動作

## 開発(DevContainer / ネイティブ環境不要)

```bash
npm install
npm test              # ユニットテスト(analytics / briefing)
npm run typecheck
npm run web           # モックデータでUI確認
```

開発の詳しい約束事は [AGENTS.md](AGENTS.md) を参照。

## デモサイト(Cloudflare Workers)

`main` への push で GitHub Actions が Web版(モックデータ)をデプロイする
([.github/workflows/deploy-web.yml](.github/workflows/deploy-web.yml))。
ネイティブのヘルス実装がないWebでは常にモックデータで動作する。

ローカルから手動でデプロイする場合:

```bash
npx wrangler login
npm run deploy:web
```

必要なリポジトリSecrets: `CLOUDFLARE_API_TOKEN`(Workers編集権限)、`CLOUDFLARE_ACCOUNT_ID`。

## 実機で使う

[docs/BUILD.md](docs/BUILD.md) を参照(Mac + Xcode で `npm run device:ios`)。

## 免責

本アプリの表示・AIの回答は一般的な情報であり、医療アドバイスではありません。
