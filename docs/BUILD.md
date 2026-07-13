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
npm run device:ios
```

初回は以下を聞かれます:

1. **署名チーム** — Xcode が自動で開いた場合は Signing & Capabilities で自分の Apple ID
   (Personal Team)を選択。CLI から聞かれた場合も同様に選ぶ。
2. iPhone 側で「信頼されていないデベロッパ」と出たら:
   **設定 > 一般 > VPN とデバイス管理** で自分の Apple ID を信頼。
3. 起動後、アプリがヘルスケアへのアクセス許可を求めるので、読み取りを許可する。

> **無料 Apple ID の制限**: 署名は **7日で失効**します。アプリが起動しなくなったら
> もう一度 `npm run device:ios` を実行すれば再署名されます(データは残ります)。

## 日々の開発ループ

ネイティブ部分(ライブラリ追加や app.json の plugins 変更)がなければ、
2回目以降はビルド不要です:

```bash
git pull
npm start   # Metro を起動(--dev-client モード: QR や 'a' キーが Expo Go ではなく本アプリを開く)
```

> **Expo Go は使えません**。HealthKit / Health Connect のネイティブモジュールが
> Expo Go には含まれていないためです。必ずホーム画面の「けさのからだ」アイコン
> (`device:ios` / `device:android` でインストールしたビルド)から起動してください。

実機にインストール済みの「けさのからだ」(dev client)を開くと、
同一 LAN 上の Metro に接続され、JS の変更は即時反映されます。
Android も同じ流れです(初回に接続先の書き込みが済んでいれば USB 不要。後述)。

ネイティブ設定を変えたときだけ、再度 `npm run device:ios`(Android は
`npm run device:android`)を実行してください。

## 外出先・別ネットワークから接続する(トンネル)

Mac と実機が同じ Wi-Fi にいない(テザリング、社内LAN、実家など)ときは、
Metro を公開URL経由で見せる **トンネル**を使います:

```bash
npm run start:tunnel   # = expo start --dev-client --tunnel
```

起動後、実機で:

- **iOS**: **標準のカメラアプリ**でターミナルのQRを撮る(アプリのスキームで
  dev client が開く)。**dev client のランチャー内にQRスキャナはありません** —
  もう一つの手は「Enter URL manually」に `https://xxxx.exp.direct` を入力
- **Android**: dev client の起動画面からQRを読み取る(スキャナ内蔵)。
  「Enter URL manually」でURL直接入力も可

> **なぜ dev client が必要か**: 素の RN デバッグビルドは接続先を `host:port`(http)
> でしか持てず、https のトンネルURL(443番)には原理的につながりません。
> `expo-dev-client` を入れると接続先を選ぶランチャーUIが付き、トンネルURL・
> LAN・QR・ディープリンクのどれでも指定できるようになります。
> **Android の「サーバー指定が複雑」問題はこれで解消します。**

> **「No script URL provided」** と出てランチャーが表示されない場合、その実機ビルドに
> `expo-dev-client` が入っていません(=素のRNビルド)。`git pull` 後に
> **`npm install` を忘れている**のが典型例です。次の順で入れ直してください:
>
> ```bash
> npm install            # expo-dev-client を node_modules に入れる
> npm run prebuild:clean # ios/ android/ を作り直し、Podsに確実に取り込む
> npm run device:ios     # (Android は device:android)
> ```

トンネルは公開URLを経由するぶん LAN 接続より低速です。同じ Wi-Fi にいるときは
`npm start` を使ってください。

## 外でも使う(スタンドアロン / Metro 不要)

上の dev client は JS を Mac の Metro から読み込むため、**同一 LAN 上で `npm start`
していないと起動しません**。JS をアプリ内に埋め込んだ **Release ビルド**にすると、
Mac も LAN も不要で、外出先でもオフラインでも起動します。

```bash
# iPhone を USB で Mac につないでから:
npm run standalone:ios
```

一度インストールすれば、以降は普通のアプリと同じように単体で動きます。

> **無料 Apple ID の場合**: Release 版でも **7日で失効**します。7日ごとに
> `npm run standalone:ios` で入れ直してください。
> この入れ直しをなくしたい・人に配りたい場合は、有料の **Apple Developer Program
> ($99/年)** に加入すると TestFlight が使えて有効期間が 90 日に伸び、Mac なしの
> クラウド配信もできるようになります。

## Android

Android 実機(Android 14 以降推奨。13 以前は Play ストアから Health Connect アプリを導入)がある場合:

```bash
# Android Studio をインストールして SDK を用意し、実機の USB デバッグを有効化してから:
npm run device:android
```

初回起動時に Health Connect の読み取り許可を求めます。

> **Metro への接続方式**: アプリを開くと dev client のランチャーが出るので、
> そこで接続先(LAN 上の Metro / トンネルURL)を選びます。USB は不要です。
>
> ランチャーからどうしても繋がらないときの**保険**として、接続先を直接
> 書き込むスクリプトを残してあります(アプリの `debug_http_host` に Mac の
> LAN IP を書く。**アプリがインストール済みでないと実行できません**):
>
> ```bash
> npm run android:metro-host                 # IPを自動検出
> npm run android:metro-host -- 192.168.x.x  # 手動指定
> ```
>
> 背景: デバッグビルドの既定の接続先は `localhost:8081`(USB トンネル
> `adb reverse` 前提)ですが、この方式は端末によってトンネルが無言で切れ、
> スプラッシュのままフリーズします(実測: OPPO CPH2309 / Android 12)。

**スタンドアロン / 配布**: Android は EAS Build の無料枠で **Google Play アカウント不要**の
インストール可能な APK を作れます(要 `npm i -g eas-cli` と Expo アカウント):

```bash
npm run build:android-apk   # eas build -p android --profile preview
```

USB 接続でローカルに Release を焼くだけなら `npm run standalone:android` でも可
(署名用 keystore の設定が必要)。

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| Android: スプラッシュで固まる | Metro に接続できていない(RN は応答が来ないと無言で待ち続ける)。Mac と実機が同じ Wi-Fi にいるか確認し、USB を挿して `npm run android:metro-host` で接続先を Mac の LAN IP に再設定 → `npm start` → アプリを起動し直す。疎通確認は実機ブラウザで `http://<MacのIP>:8081/status`(`packager-status:running` が出ればOK) |
| ヘルスデータが全部空 | 設定アプリ > ヘルスケア > データアクセスとデバイス > けさのからだ で読み取りが許可されているか確認 |
| 「モックデータを表示中」と出る | dev client ではなく Expo Go で開いている。ホーム画面のアプリアイコンから起動する |
| 7日経って起動しない | 無料署名の失効。`npm run device:ios`(または `npm run standalone:ios`)で再署名 |
| 外で開くと起動しない / 白画面 | dev client は Metro 必須。外でも使うなら `npm run standalone:ios` で Release 版を入れる |
| Metro に繋がらない | Mac と iPhone が同じ Wi-Fi か確認。`npx expo start --tunnel` も試す |
| bundleIdentifier / package を変えた | 既存の `ios/` `android/` に反映されない。`npm run prebuild:clean` で作り直してから再ビルド |
