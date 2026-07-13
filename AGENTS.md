# health-assistant 開発ガイド(人間・LLM共通)

毎朝の体重計測とApple Watchのデータを「語りかけ型」で分析する個人用ヘルスアプリ
「けさのからだ」(リポジトリ名は開発コードネームの health-assistant のまま)。
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
| `src/components/` | 共有UI。`*.ios.tsx` / `*.android.tsx` / `*.native.tsx` / `*.web.tsx` でOS別実装 |
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
- **外れ値(誤計測)をアプリ側で除外しない。** 記録の正しさはOSのヘルス基盤の責務で、
  うちは解釈に徹する。勝手に間引くとOSの表示と食い違い「独自の記録を持つアプリ」に
  なる。誤りはブリーフ(`weight-suspect`)で知らせ、OSのヘルスアプリでの削除を案内する
- **ブリーフのルールを足すときのチェック**(`src/coach/briefing.ts`):
  ①数値の再掲ではなく「解釈」を返しているか ②警告なら落ち着ける事実か次の一歩を添えたか
  ③診断していないか(最大でも「医療機関に相談」止まり) ④毎日は発火しないか
  (節目・イベントは希少だから価値がある) ⑤開いたイベントは閉じるか(`*-recovered`)
- 停滞・横ばいの判定にEWMAを使ってはいけない。半減期7日のEWMAには遅れがあり、
  21日間ぴったり横ばいのデータでも週-0.16kgの「減少」に見える。期間の傾きは
  生データの線形回帰(`slopeOverWindow`)で見る
- UI方針: **操作系はOSネイティブ**(タブバー・ボタン・セグメント。iOSのLiquid Glassや
  M3の波紋は自前で再現できない)、**表示系は自前**。Webは自前実装にフォールバック
- ネイティブ部品の色指定はラッパーごとにAPIが歯抜け(例: `@expo/ui/community` の
  SegmentedControl は tintColor が選択中の塗りにしか渡らず、Androidのラベル色は
  ダイナミックカラーのまま)。**まずはラッパーで済ませ、実機で見て破綻していたら**
  `@expo/ui/jetpack-compose` のプリミティブを直に組んで全状態の色を明示する。
  コードの単純さを優先し、先回りで作り込まない
- Androidのネイティブ部品は色を指定しないと壁紙由来のMaterial Youダイナミックカラーに
  なる。タブバーは tintColor(アイコン・ラベル)だけでなく backgroundColor / rippleColor /
  indicatorColor も要指定。Alertダイアログの色はJSからは触れない(OS標準のまま許容)
- 塗り(ボタン・選択中の面)には `tintFill` / `tintOnFill` を使う。`tint`(明るいコーラル)を
  ダークで塗ると白文字が3.3:1しか取れないため
- Androidデバッグ実機はMetro接続を `debug_http_host`(Wi-Fi直結)で行う。adb reverse は
  この環境では不安定(BUILD.md トラブルシューティング参照)
- 素のRNデバッグビルドは接続先を `host:port`(http)でしか持てず、httpsのトンネルURLに
  つながらない。`expo-dev-client` のランチャーUIが接続先指定(トンネル/LAN/QR)を担う

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
別ネットワークからつなぐときは `npm run start:tunnel`(expo-dev-client のランチャーで接続先を指定)

コンテナからも `npm run start:tunnel` で実機につなげる(トンネル経由)。Metroが起動時に展開する
React Native DevTools(Electron製)に必要な共有ライブラリと chrome-sandbox の setuid は
devcontainer.json / `scripts/devtools-sandbox.sh` で対応済み。
**`EXPO_UNSTABLE_HEADLESS=1` は使わないこと** — DevToolsのエラーは消えるが、
QRコード表示やLAN IP探索まで止まる(自動化ツール向けモードのため)。

## 規約

- **コードコメント・ドキュメントは日本語**(メンテナーは日本人)。UI文言も日本語
- コンテナ環境の依存(aptパッケージ等)は `.devcontainer/devcontainer.json` に追記(ユーザーがリビルド)
- コミットはマイルストーンごとに行い、pushまで実行してよい
