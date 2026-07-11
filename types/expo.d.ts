/// <reference types="expo/types" />

// Expo が提供する環境型(*.css などのアセットimport、process.env.EXPO_PUBLIC_* 等)。
// Expoは同等の expo-env.d.ts を起動時に自動生成するが、あれは .gitignore 対象で
// CI(npm ci → tsc のみ)には存在しない。型チェックを生成物に依存させないため、
// 同じ参照をコミット可能なファイルとして持つ。
