#!/usr/bin/env bash
# React Native DevTools(Electron製)の chrome-sandbox に setuid root を付ける。
# コンテナ(Linux)専用。Mac では即 return する。
#
# なぜ必要か: Chromium の SUID sandbox は chrome-sandbox が **root所有・mode 4755**
# であることを要求する。DevTools のバイナリは dotslash が初回の `expo start` 時に
# ~/.cache/dotslash 以下へ遅延ダウンロード・展開するため、実行ユーザー(node)所有の
# ままとなり、`expo start` のたびに次のエラーで異常終了する:
#   FATAL ... The SUID sandbox helper binary was found, but is not configured correctly
#
# ELECTRON_DISABLE_SANDBOX では回避できず、EXPO_UNSTABLE_HEADLESS=1 は
# QRコード表示・LAN IP探索まで止めてしまう(自動化ツール向けモードのため)。
# 権限を正すのが正攻法。
#
# 重要: 展開には `dotslash -- fetch`(実行せずダウンロード・展開だけ)を使う。
#   以前は `react-native-devtools --version` で展開を誘発していたが、それだと
#   権限修正「前」の chrome-sandbox で Electron が一度起動して FATAL し、その残骸が
#   直後の expo 側の起動チェックを巻き添えにする(zygote の execvp 失敗)。
#   「壊れた権限のまま一度も起動させない」ことがこのスクリプトの存在意義。
#
# 呼び出しタイミング: `npm start` / `npm run start:tunnel` の直前(package.json)。
#   devcontainer の postCreate では npm install 前のため node_modules が無く、
#   DevTools も未ダウンロードなので効かない。start 直前が唯一確実なフック点。
# RNのバージョンが上がって新しいバイナリが展開されても、次回 start 時に自動で直る。
set -euo pipefail

# Mac では chrome-sandbox の setuid は不要(そもそも存在しない)。無駄な展開も避ける。
[ "$(uname)" = "Linux" ] || exit 0

DEVTOOLS_MANIFEST="node_modules/@react-native/debugger-shell/bin/react-native-devtools"
DOTSLASH="node_modules/.bin/dotslash"

if [ ! -f "$DEVTOOLS_MANIFEST" ] || [ ! -x "$DOTSLASH" ]; then
  echo "devtools-sandbox: DevTools が未インストール(npm install 前?)。何もしません。"
  exit 0
fi

# ダウンロード・展開だけ行い、実行ファイルのパスを得る(Electron は起動しない)
echo "devtools-sandbox: DevTools を確認しています(初回は100MB超のDLで少し待ちます)..."
if ! exe_path="$("$DOTSLASH" -- fetch "$DEVTOOLS_MANIFEST" 2>/dev/null)"; then
  echo "devtools-sandbox: DevTools を取得できません(オフライン?)。スキップします。" >&2
  exit 0
fi

sandbox="$(dirname "$exe_path")/chrome-sandbox"
if [ ! -f "$sandbox" ]; then
  echo "devtools-sandbox: chrome-sandbox が見つかりません → $sandbox" >&2
  exit 0
fi

# 既に root:root 4755 なら何もしない(idempotent。毎回の start でも高速)
if [ "$(stat -c '%U:%a' "$sandbox")" != "root:4755" ]; then
  sudo chown root:root "$sandbox"
  sudo chmod 4755 "$sandbox"
  echo "devtools-sandbox: 権限を修正しました → $sandbox"
fi
