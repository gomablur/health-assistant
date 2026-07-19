#!/usr/bin/env bash
# expo start のラッパー。コンテナ(Linux)では Electron のサンドボックスを無効化する。
# Mac では何もせずそのまま expo start する。引数は expo にそのまま渡す(--tunnel 等)。
#
# 背景: `expo start` は起動時に React Native DevTools(Electron製)を裏で準備し、
# コンテナだと毎回こんな ERROR を吐いていた:
#   FATAL ... The SUID sandbox helper binary was found, but is not configured correctly
#   (chrome-sandbox に setuid root を付けた後は)
#   LaunchProcess: failed to execvp: .../64/xxxx/React
#   FATAL:content/browser/zygote_host/zygote_host_impl_linux.cc ... Invalid argument
#
# 調査の結論: Chromium の SUID sandbox はこの環境では**構成不可能**。
#   dotslash が展開するパスが「React Native DevTools-linux-x64」と**スペース入り**で、
#   Chromium は zygote 起動時にサンドボックスヘルパーのパスをスペースで分割して
#   しまうため、setuid root/4755 を正しく付けても壊れたパス(…/React)を execvp
#   して即死する。よって権限修正(旧 scripts/devtools-sandbox.sh)は根本的に無駄だった。
#
# 正解: ELECTRON_DISABLE_SANDBOX=1 でサンドボックス自体を使わせない。
#   コンテナは GUI が無く DevTools のウィンドウはどのみち開けないので、
#   ここで失うものは無い(QR・トンネル・Metro には無関係)。
#   Mac ではサンドボックスは正常に動くので触らない。
#
# なお EXPO_UNSTABLE_HEADLESS=1 でも黙るが、QRコード表示・LAN IP探索まで
# 止まる(自動化ツール向けモード)ので使わないこと。
set -euo pipefail

if [ "$(uname)" = "Linux" ]; then
  export ELECTRON_DISABLE_SANDBOX=1
fi

exec npx expo start --dev-client "$@"
