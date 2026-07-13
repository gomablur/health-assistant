#!/usr/bin/env node
// アプリアイコンの生成(依存パッケージなし: RGBAバッファに描画してzlibでPNGエンコード)。
// デザインを変えたら `npm run icons` で assets/ を再生成する。
//
// 絵柄: 朝焼けグラデーション+白い滑らかなトレンド曲線(EWMA)+朝日。
// ブランド方針は docs/BRAND.md(マーケ面は朝焼けパレット、アプリ内データ色とは別系統)。
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
const BRAND_TOP = hex("#e2543f"); // 朝焼けの空(上: 深いコーラルローズ)
const BRAND_BOTTOM = hex("#f7a44f"); // 地平線近くのアンバーの光(下)
const WHITE = hex("#ffffff");
const CLEAR = [0, 0, 0, 0];

// ---- 絵柄の形状(論理座標 0-100) ----
// 朝日と丘の風景。丘の稜線はEWMAトレンド曲線(なだらかに下る)そのもの。
//
// 曲線を「線」ではなく「面(丘)」として描くのが要点。太い白線を単体で浮かせると
// 有機物(ミミズ)に見えるという指摘があり、下を塗って地形にすることで解消した。
//
// レイヤーの役割分担:
//   丘 = 背景・風景(全面ブリード。マスクで切れても成立する)
//   朝日 = 前景・主役(セーフゾーンに収まる。単体でもブランドが立つ)
// 透明背景のレイヤー(Androidの前景・スプラッシュ)に丘を置くと下端で切れて
// 破綻するため、そこでは朝日だけを使う。
const HILL = { y0: 58, y1: 76 }; // 稜線: 左端の高さ → 右端の高さ
const SUN = { x: 58, y: 34, r: 11, rayIn: 15, rayOut: 20, rayHw: 2.1, rays: 8 };

/** 丘の稜線の高さ(論理x → 論理y)。smoothstepで両端が水平に落ち着く */
const hillY = (x) => {
  const t = Math.max(0, Math.min(1, x / 100));
  const s = t * t * (3 - 2 * t);
  return HILL.y0 + (HILL.y1 - HILL.y0) * s;
};

// ---- 描画 (論理0-100座標、S倍スーパーサンプリングでアンチエイリアス) ----
/**
 * @param {object} opts
 * @param {"gradient"|"transparent"|"rounded"} opts.bg 背景
 * @param {number} opts.pad セーフゾーン用の余白(論理座標)
 * @param {boolean} opts.hill 丘を描くか(全面ブリード。透明背景レイヤーでは false)
 * @param {boolean} opts.sun 朝日を描くか
 */
function drawIcon(
  size,
  { bg = "gradient", pad = 0, glyphColor = WHITE, hill = true, sun = true, centerSun = false } = {},
) {
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
    const t = y / W; // 上→下の垂直グラデーション(朝焼けの空)
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

  // 2. 丘(稜線=EWMAトレンド曲線。稜線より下をすべて塗る)。
  //    padは無視して全面ブリードさせる — 風景なので端で切れて構わない
  if (hill) {
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const lx = (x / W) * 100;
        if (y >= (hillY(lx) / 100) * W && (bg !== "rounded" || bgAt(x, y)[3] > 0)) {
          px(x, y, glyphColor);
        }
      }
  }

  // 3. 朝日(円盤+放射状の光線)。セーフゾーン(pad)に収まる主役。
  //    丘のない単体レイヤー(スプラッシュ・Android前景)では中央に置く —
  //    風景の中での位置(右上)のままだと、単体で見たとき偏って見える
  if (sun) {
    const s = centerSun ? { ...SUN, x: 50, y: 50 } : SUN;
    fillCircle(s, glyphColor);
    for (let i = 0; i < s.rays; i++) {
      const a = (i / s.rays) * Math.PI * 2;
      const [dx, dy] = [Math.cos(a), Math.sin(a)];
      fillCapsule(
        [s.x + dx * s.rayIn, s.y + dy * s.rayIn],
        [s.x + dx * s.rayOut, s.y + dy * s.rayOut],
        s.rayHw,
        glyphColor,
      );
    }
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
  // メインアイコン(iOS以外のフォールバック・ストア用): 風景まるごと
  ["assets/images/icon.png", drawIcon(1024)],

  // Android adaptive icon: 丘は「風景」なので背景レイヤーに入れる(全面ブリードで、
  // マスクやパララックスで端が動いても成立する)。前景はセーフゾーンに収める必要が
  // あるので、そこに丘を入れると下端で切れて破綻する → 前景は朝日だけ
  ["assets/images/android-icon-background.png", drawIcon(1024, { sun: false })],
  ["assets/images/android-icon-foreground.png", drawIcon(1024, { bg: "transparent", hill: false, pad: 6, centerSun: true })],
  ["assets/images/android-icon-monochrome.png", drawIcon(1024, { bg: "transparent", hill: false, pad: 6, centerSun: true })],

  // スプラッシュ: 背景色(app.json)の上に白の朝日だけ。丘は下端まで塗る形なので、
  // 画面中央に小さく置くと宙に浮いた白い塊になってしまう
  ["assets/images/splash-icon.png", drawIcon(512, { bg: "transparent", hill: false, pad: 6, centerSun: true })],

  // Web favicon: 角丸スクエアに風景を収める
  ["assets/images/favicon.png", drawIcon(64, { bg: "rounded" })],

  // iOS Icon Composer (.icon) のグリフレイヤー(背景色は icon.json 側)。
  // iOS側でマスクされるので、丘は全面ブリードのままでよい
  ["assets/expo.icon/Assets/glyph.png", drawIcon(1024, { bg: "transparent" })],
];
for (const [rel, png] of targets) {
  writeFileSync(join(ROOT, rel), png);
  console.log(`✓ ${rel}`);
}
