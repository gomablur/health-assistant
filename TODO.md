# バックログ

今すぐやらないが、どこかでやりたいこと。着手時はこのファイルから消して進める。

## 多言語 / ローカライズ対応

現状は全文言が日本語ハードコード(画面テキスト、ブリーフのテンプレ文、権限の説明文)。
対応するなら:

- 文言を辞書化(i18next or expo-localization + 自前辞書)。ブリーフのテンプレ文
  (`src/coach/briefing.ts`)が言い回しローテーション付きなので、辞書設計に一工夫必要
- app.json の `NSHealthShareUsageDescription` 等は `locales` 設定でローカライズ可能
- 単位系(kg/lb)はローカライズと別軸で設定項目にするか要検討

## 設定の「権限を再リクエスト」ボタンが効かない

報告: 実機(iOS)でボタンを押しても権限ダイアログが出ない。

原因の見立て: HealthKit の仕様で、権限ダイアログは**タイプごとに一度しか表示されない**。
2回目以降の `requestAuthorization` は UI なしで即 resolve するため、ボタンが「効いていない」
ように見える。

修正案:

- ボタンを「設定アプリで開く」に変え、`Linking.openURL('x-apple-health://')` や
  `app-settings:` でヘルスケア設定へ誘導する(iOSからHealthKitの許可画面への
  直接ディープリンクは不可のため、手順テキストを添える)
- `getRequestStatusForAuthorization` で「リクエスト済みか」を判定し、
  未リクエスト時のみ再リクエスト、済みなら誘導UIを出す分岐にする
