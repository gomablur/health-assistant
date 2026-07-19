---
name: verify
description: デモWeb(モックデータ)をheadless Chromiumで駆動してUI変更を実機レスで検証する手順
---

# 検証レシピ(コンテナ内・Webサーフェス)

ネイティブ実機はコンテナから触れないので、UI変更は Web(常にモックデータ)で観察する。

## 起動

```bash
# 開発サーバー(こちら推奨。エラーが未minifyで出る)
EXPO_PUBLIC_MOCK_HEALTH=1 npx expo start --web --port 8081   # バックグラウンド起動
# 静的エクスポートを使う場合は clean URL 必須(expo-router が /weight.html を解決できない)
npm run build:web && npx serve -l 8788 dist                  # python http.server は不可
```

## Playwright での駆動(スクラッチパッドに `npm i playwright` + `npx playwright install chromium --no-shell`)

- `chromium.launch({ channel: 'chromium' })` を使う(フルChromium)
- **初回はオンボーディング画面**。「はじめる(モックデータ)」をクリックして通過する
- dev サーバーでは空の `#error-toast` オーバーレイがタブバーへのクリックを遮る。
  クリック前に `document.querySelector('#error-toast')?.remove()`
- 画面遷移はタブバーのテキスト(例 `getByText('体重').last()`)をクリック。
  `page.goto('/weight')` 直行でも動くが、実ユーザー経路はタブクリック
- 線グラフのポインタ(十字カーソル+ツールチップ)は down→少しmove→up で発火。
  クリックだけでは出ない。棒グラフのツールチップは棒の上をクリックで出る
- チャート領域の特定: 線グラフは「一番面積の大きい svg」、棒グラフはカードの
  innerText 先頭(「歩数」等)でカード div を特定して座標クリック

## 既知のハマりどころ

- WeightTrendChart は「データなし分岐 → チャート分岐」の切り替え時に
  react-native-web の onLayout(ResizeObserver 登録)が失われうる。
  両分岐のルート View に同じ onLayout を付けてあるので、外すと Web でチャートが消える
- X軸ラベルの「6..」のような切り詰め、Y軸最下段のラベル重複(70 が2回)は既存の見た目
- dev モードでは gifted-charts のポインタ操作で "Unknown event handler property"
  警告トーストが出る(Web非対応のレスポンダ系 prop。実害なし)
