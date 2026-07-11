#!/usr/bin/env node
// アプリアイコンの生成(依存パッケージなし: RGBAバッファに描画してzlibでPNGエンコード)。
// デザインを変えたら `npm run icons` で assets/ を再生成する。
//
// 絵柄: 吹き出し(語りかけ型)+ 体重トレンドライン(切り抜き)+ 現在地ドット。
// 色はアプリのブランド色(src/constants/theme.ts の tint 系)。
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES = join(ROOT, "assets", "images");

// ---- 最小PNGエンコーダ ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encodePng(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- 色 ----
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];
const BRAND_TOP = hex("#3987e5"); // theme dark tint(明るめの体重ブルー)
const BRAND_BOTTOM = hex("#1c5cab"); // theme seriesWeightSoft(dark)
const WHITE = hex("#ffffff");
const CLEAR = [0, 0, 0, 0];

// ---- 絵柄の形状(論理座標 0-100) ----
const BUBBLE = { x: 17, y: 20, w: 66, h: 48, r: 15 };
const TAIL = [
  [33, 66],
  [50, 67],
  [29, 86],
];
const LINE = [
  [33, 44],
  [45, 55],
  [57, 47],
  [67, 57],
];
const LINE_HW = 2.6; // 線の半幅
const LINE_END_T = 0.42; // 最終セグメントを途中で止めてドットと隙間を作る
const DOT = { x: 67, y: 57, r: 4.2 };

// ---- 描画 (論理0-100座標、S倍スーパーサンプリングでアンチエイリアス) ----
function drawIcon(size, { bg = "gradient", pad = 0, glyphColor = WHITE, glyph = true } = {}) {
  const S = 4;
  const W = size * S;
  const buf = new Uint8Array(W * W * 4); // 透明で初期化
  const L = 100 + pad * 2;
  const u = (v) => ((v + pad) / L) * W; // 論理 → 物理
  const r2p = (r) => (r / L) * W; // 半径・幅の変換

  // 背景色(切り抜きの復元にも使うので関数に)
  const bgAt = (x, y) => {
    if (bg === "transparent") return CLEAR;
    if (bg === "rounded") {
      // favicon用: 角丸スクエアの外は透明
      if (!inRoundRect(x, y, 0, 0, W, W, W * 0.22)) return CLEAR;
    }
    const t = (x + y) / (2 * W); // 左上→右下の対角グラデーション
    return [
      BRAND_TOP[0] + (BRAND_BOTTOM[0] - BRAND_TOP[0]) * t,
      BRAND_TOP[1] + (BRAND_BOTTOM[1] - BRAND_TOP[1]) * t,
      BRAND_TOP[2] + (BRAND_BOTTOM[2] - BRAND_TOP[2]) * t,
      255,
    ];
  };
  const px = (x, y, c) => {
    const i = (y * W + x) * 4;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = c[3];
  };

  function inRoundRect(x, y, rx, ry, rw, rh, rr) {
    if (x < rx || x > rx + rw || y < ry || y > ry + rh) return false;
    const cx = Math.max(rx + rr, Math.min(x, rx + rw - rr));
    const cy = Math.max(ry + rr, Math.min(y, ry + rh - rr));
    return (x - cx) ** 2 + (y - cy) ** 2 <= rr * rr;
  }
  const inTriangle = (x, y, [a, b, c]) => {
    const s = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    const d1 = s(a, b);
    const d2 = s(b, c);
    const d3 = s(c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const distToSegment = (x, y, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
  };

  // 形状ごとにバウンディングボックスだけ走査して塗る
  const paint = (x0, y0, x1, y1, test, color) => {
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(W - 1, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++)
        if (test(x, y)) px(x, y, color === "bg" ? bgAt(x, y) : color);
  };
  const fillRoundRect = ({ x, y, w, h, r }, c) =>
    paint(u(x), u(y), u(x + w), u(y + h), (px_, py_) => inRoundRect(px_, py_, u(x), u(y), r2p(w), r2p(h), r2p(r)), c);
  const fillTriangle = (pts, c) => {
    const p = pts.map(([x, y]) => [u(x), u(y)]);
    paint(
      Math.min(...p.map((q) => q[0])),
      Math.min(...p.map((q) => q[1])),
      Math.max(...p.map((q) => q[0])),
      Math.max(...p.map((q) => q[1])),
      (x, y) => inTriangle(x, y, p),
      c,
    );
  };
  const fillCapsule = ([ax, ay], [bx, by], hw, c) => {
    const [pax, pay, pbx, pby, phw] = [u(ax), u(ay), u(bx), u(by), r2p(hw)];
    paint(
      Math.min(pax, pbx) - phw,
      Math.min(pay, pby) - phw,
      Math.max(pax, pbx) + phw,
      Math.max(pay, pby) + phw,
      (x, y) => distToSegment(x, y, pax, pay, pbx, pby) <= phw,
      c,
    );
  };
  const fillCircle = ({ x, y, r }, c) => {
    const [pcx, pcy, pr] = [u(x), u(y), r2p(r)];
    paint(pcx - pr, pcy - pr, pcx + pr, pcy + pr, (px_, py_) => (px_ - pcx) ** 2 + (py_ - pcy) ** 2 <= pr * pr, c);
  };

  // 1. 背景
  if (bg !== "transparent")
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) px(x, y, bgAt(x, y));

  if (glyph) {
    // 2. 吹き出し(本体+しっぽ)
    fillRoundRect(BUBBLE, glyphColor);
    fillTriangle(TAIL, glyphColor);
    // 3. トレンドライン+ドットを背景色で切り抜く(透明背景なら透明=穴になる)
    for (let i = 0; i < LINE.length - 1; i++) {
      const [a, b] = [LINE[i], LINE[i + 1]];
      const end =
        i === LINE.length - 2
          ? [a[0] + (b[0] - a[0]) * LINE_END_T, a[1] + (b[1] - a[1]) * LINE_END_T]
          : b;
      fillCapsule(a, end, LINE_HW, "bg");
    }
    fillCircle(DOT, "bg");
  }

  // ダウンサンプリング (S×S平均)
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < S; dy++)
        for (let dx = 0; dx < S; dx++) {
          const i = ((y * S + dy) * W + x * S + dx) * 4;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3];
        }
      const n = S * S;
      const o = (y * size + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  return encodePng(out, size, size);
}

// ---- 出力 (Expo の構成に合わせる) ----
const targets = [
  // メインアイコン(iOS以外のフォールバック・ストア用): フルブリード
  ["assets/images/icon.png", drawIcon(1024)],
  // Android adaptive icon: 前景はセーフゾーン(中央66%)に収める
  ["assets/images/android-icon-foreground.png", drawIcon(1024, { bg: "transparent", pad: 26 })],
  ["assets/images/android-icon-background.png", drawIcon(1024, { glyph: false })],
  ["assets/images/android-icon-monochrome.png", drawIcon(1024, { bg: "transparent", pad: 26 })],
  // スプラッシュ: 白グリフのみ(背景色は app.json 側)
  ["assets/images/splash-icon.png", drawIcon(512, { bg: "transparent", pad: 4 })],
  // Web favicon: 角丸スクエア
  ["assets/images/favicon.png", drawIcon(64, { bg: "rounded", pad: 6 })],
  // iOS Icon Composer (.icon) のグリフレイヤー(背景色は icon.json 側)
  ["assets/expo.icon/Assets/glyph.png", drawIcon(1024, { bg: "transparent", pad: 8 })],
];
for (const [rel, png] of targets) {
  writeFileSync(join(ROOT, rel), png);
  console.log(`✓ ${rel}`);
}
