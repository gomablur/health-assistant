#!/usr/bin/env bash
# React Native DevTools(Electron製)の chrome-sandbox に setuid root を付ける。
# コンテナ専用。Mac では不要(実行しても何も見つからず終了する)。
#
# なぜ必要か: Chromium の SUID sandbox は chrome-sandbox が **root所有・mode 4755**
# であることを要求する。DevTools のバイナリは dotslash が初回実行時に
# ~/.cache/dotslash 以下へ展開するため、実行ユーザー(node)所有のままとなり、
# `expo start` のたびに次のエラーで異常終了する:
#   FATAL ... The SUID sandbox helper binary was found, but is not configured correctly
#
# ELECTRON_DISABLE_SANDBOX では回避できず、EXPO_UNSTABLE_HEADLESS=1 は
# QRコード表示まで止めてしまう(自動化ツール向けモードのため)。権限を正すのが正攻法。
#
# RNのバージョンが上がって新しいバイナリが展開されたら、もう一度実行すること。
set -euo pipefail

DEVTOOLS_BIN="node_modules/@react-native/debugger-shell/bin/react-native-devtools"

if [ ! -x "$DEVTOOLS_BIN" ]; then
  echo "devtools-sandbox: DevTools が未インストール(npm install 前?)。何もしません。"
  exit 0
fi

# 初回はまだ展開されていないので、一度実行してダウンロード・展開させる
if ! find "$HOME/.cache/dotslash" -name chrome-sandbox -print -quit 2>/dev/null | grep -q .; then
  echo "devtools-sandbox: DevTools を展開しています..."
  "$DEVTOOLS_BIN" --version >/dev/null 2>&1 || true
fi

found=0
while IFS= read -r sandbox; do
  sudo chown root:root "$sandbox"
  sudo chmod 4755 "$sandbox"
  echo "devtools-sandbox: 権限を修正しました → $sandbox"
  found=1
done < <(find "$HOME/.cache/dotslash" -name chrome-sandbox 2>/dev/null)

if [ "$found" -eq 0 ]; then
  echo "devtools-sandbox: chrome-sandbox が見つかりません(オフライン?)。スキップします。" >&2
fi
