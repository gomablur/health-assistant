# 実機ビルド手順(Mac)

HealthKit / Health Connect はネイティブモジュールのため、**Expo Go では動きません**。
Mac 上で開発ビルド(dev client)を作って実機にインストールします。
DevContainer(Linux)側の作業はコード編集・Webプレビュー(モックデータ)まで、実機確認はこの手順で行います。

## 前提

- macOS + Xcode(App Store から。初回起動でコンポーネントをインストール)
- Node.js LTS(`brew install node` など)
- iPhone と Mac が同じ Wi-Fi にいること
- Apple ID(無料でOK。有料の Apple Developer Program は不要)

## iOS(初回)

```bash
git clone https://github.com/gomablur/health-assistant.git
cd health-assistant
npm install

# iPhone を USB で Mac につないでから:
npx expo run:ios --device
```

初回は以下を聞かれます:

1. **署名チーム** — Xcode が自動で開いた場合は Signing & Capabilities で自分の Apple ID
   (Personal Team)を選択。CLI から聞かれた場合も同様に選ぶ。
2. iPhone 側で「信頼されていないデベロッパ」と出たら:
   **設定 > 一般 > VPN とデバイス管理** で自分の Apple ID を信頼。
3. 起動後、アプリがヘルスケアへのアクセス許可を求めるので、読み取りを許可する。

> **無料 Apple ID の制限**: 署名は **7日で失効**します。アプリが起動しなくなったら
> もう一度 `npx expo run:ios --device` を実行すれば再署名されます(データは残ります)。

## 日々の開発ループ

ネイティブ部分(ライブラリ追加や app.json の plugins 変更)がなければ、
2回目以降はビルド不要です:

```bash
git pull
npx expo start   # Metro を起動
```

実機にインストール済みの health-assistant(dev client)を開くと、
同一 LAN 上の Metro に接続され、JS の変更は即時反映されます。

ネイティブ設定を変えたときだけ、再度 `npx expo run:ios --device` を実行してください。

## Android

Android 実機(Android 14 以降推奨。13 以前は Play ストアから Health Connect アプリを導入)がある場合:

```bash
# Android Studio をインストールして SDK を用意し、実機の USB デバッグを有効化してから:
npx expo run:android --device
```

初回起動時に Health Connect の読み取り許可を求めます。

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| ヘルスデータが全部空 | 設定アプリ > ヘルスケア > データアクセスとデバイス > health-assistant で読み取りが許可されているか確認 |
| 「モックデータを表示中」と出る | dev client ではなく Expo Go で開いている。ホーム画面のアプリアイコンから起動する |
| 7日経って起動しない | 無料署名の失効。`npx expo run:ios --device` で再署名 |
| Metro に繋がらない | Mac と iPhone が同じ Wi-Fi か確認。`npx expo start --tunnel` も試す |
