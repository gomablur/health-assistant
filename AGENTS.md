# health-assistant 開発ガイド(人間・LLM共通)

毎朝の体重計測とApple Watchのデータを「語りかけ型」で分析する個人用ヘルスアプリ。
**ローカルのルールベース分析(src/coach/briefing.ts)が核**。LLM(Gemini)は任意の追加機能で、
統計サマリーしか渡さない。

## 最初に

- **Expoは変化が速い。** コードを書く前に必ずバージョン付きドキュメントを参照:
  https://docs.expo.dev/versions/v57.0.0/
- 実機ビルド手順は [docs/BUILD.md](docs/BUILD.md)(Mac側の作業。コンテナからは不可)
- 未着手の課題は [TODO.md](TODO.md)
- ブランド・販売方針(アプリ名「けさのからだ」、やらないことリスト、収益化)は
  [docs/BRAND.md](docs/BRAND.md)。機能の取捨選択に迷ったらここに立ち返る

## 地図

| 場所 | 役割 |
|---|---|
| `src/health/` | HealthDataSource 抽象化。`sources/{healthkit,healthconnect,mock}.ts`、分岐は `native.{ios,android,web}.ts` |
| `src/analytics/` | 統計の純粋関数(移動平均・EWMA・回帰・相関)。ユニットテスト対象 |
| `src/coach/` | デイリーブリーフのルールエンジン(`briefing.ts` が本体)と組み立てフック |
| `src/llm/` | Gemini RESTクライアント(モデル退役に備えた候補フォールバック)とプロンプト |
| `src/app/` | expo-router 画面。`(tabs)/` がメイン4画面、settings はモーダル |
| `src/components/` | 共有UI。`*.ios.tsx` / `*.native.tsx` / `*.web.tsx` でOS別実装 |
| `src/constants/theme.ts` | デザイントークン(検証済みパレット)。色はここからだけ取る |
| `plugins/` | ローカル config plugin(Health Connect の権限delegate注入など) |
| `scripts/` | `gen-icons.mjs`(アイコン生成)、`android-metro-host.sh`(Android実機のMetro接続先設定) |
| `wrangler.jsonc` | デモWeb(Cloudflare Workers静的配信)の設定。デプロイはmainへのpushでGH Actionsが実行 |

## 不変条件・ハマりどころ

- `DailyPoint[]` は未計測日を「要素が存在しない」で表す。**0埋め禁止**(統計が壊れる)
- 睡眠は**起床日に帰属**する。「昨夜の睡眠」= 今日の日付のデータ
- HealthKit の体脂肪率は '%' 単位指定でも 0〜1 の割合で返る(healthkit.ts で ×100 済み)
- ネイティブSDKのimportは `native.*.ts` の先に隔離し、Webバンドルに混ぜない
- `app.json` の android 直下に `minSdkVersion` を書いても無視される → expo-build-properties 経由
- `ios/` `android/` はCNG管理(コミットしない)。config plugin を変えたら
  `npx expo prebuild -p android --no-install` で生成物を確認し、終わったら `rm -rf android`
- LLMへ送るのは `CoachSummary`(統計値)のみ。日々の生データを端末外に出さない
- UI方針: 操作系はOSネイティブ(NativeTabs・@expo/ui)、表示系は自前。全面統一はしない
- Androidデバッグ実機はMetro接続を `debug_http_host`(Wi-Fi直結)で行う。adb reverse は
  この環境では不安定(BUILD.md トラブルシューティング参照)

## コマンド(コンテナ内で完結するもの)

```bash
npm test           # jest(analytics / briefing)
npm run typecheck  # tsc --noEmit
npm run lint
npm run web        # モックデータでUI確認(Webはネイティブ実装がないため常にモック)
npm run icons      # アプリアイコン一式を再生成
npm run build:web  # デモサイトを dist/ に出力(モックデータ)
```

実機系(Mac側): `npm run device:ios` / `npm run device:android` / `npm start`

## 規約

- **コードコメント・ドキュメントは日本語**(メンテナーは日本人)。UI文言も日本語
- コンテナ環境の依存(aptパッケージ等)は `.devcontainer/devcontainer.json` に追記(ユーザーがリビルド)
- コミットはマイルストーンごとに行い、pushまで実行してよい
