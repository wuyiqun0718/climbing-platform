// 底部 tab 图标：按岩馆主题色画成 png（小程序 tabBar 只认图片，用不了 CSS 变量）。
// 未选中是正文色描边；选中落在品牌色胶囊底上（照原型），描边用品牌底上的文字色。由 prepare-gym 调用，写进 src/static/gym/。
// tabBar 的图标位是正方形，胶囊画在正方形里：横向占满、上下留白，线稿缩小一点放在中间，选中前后大小不变。
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const SIZE = 48;
const STROKE = 3;
/** 每个像素 4×4 采样算覆盖率，边缘不发毛 */
const SS = 4;

const seg = (ax, ay, bx, by) => (x, y) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};
const ring = (cx, cy, r) => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r);
const roundRect = (x0, y0, x1, y1, r) => (x, y) => {
  const hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
  const qx = Math.abs(x - (x0 + x1) / 2) - hx, qy = Math.abs(y - (y0 + y1) / 2) - hy;
  const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  return Math.abs(sd);
};
const arc = (cx, cy, r, from, to, n = 24) => Array.from({ length: n }, (_, i) => {
  const a = from + ((to - from) * i) / n, b = from + ((to - from) * (i + 1)) / n;
  return seg(cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b));
});

/** 线稿缩放：以画布中心为原点缩到 k 倍，描边粗细不变 */
const ICON_SCALE = 0.84;
const scaled = d => (x, y) => d(24 + (x - 24) / ICON_SCALE, 24 + (y - 24) / ICON_SCALE) * ICON_SCALE;
/** 胶囊底：左右顶到边，高 34 */
const PILL = { x0: 0, x1: 48, y0: 7, y1: 41 };
const inPill = (x, y) => {
  const r = (PILL.y1 - PILL.y0) / 2, cy = (PILL.y0 + PILL.y1) / 2;
  const cx = Math.min(Math.max(x, PILL.x0 + r), PILL.x1 - r);
  return Math.hypot(x - cx, y - cy) <= r;
};

const ICONS = {
  home: [seg(12, 24, 24, 13), seg(24, 13, 36, 24), seg(15, 22, 15, 35), seg(15, 35, 33, 35), seg(33, 35, 33, 22), seg(21, 35, 21, 28), seg(21, 28, 27, 28), seg(27, 28, 27, 35)],
  cards: [roundRect(11, 15, 37, 33, 3.5), seg(11, 21, 37, 21), seg(16, 28, 22, 28)],
  me: [ring(24, 18, 5.5), ...arc(24, 37, 11, Math.PI, 2 * Math.PI)],
};

function hex(c) {
  const n = parseInt(c.replace('#', '').replace(/^(.)(.)(.)$/, '$1$1$2$2$3$3'), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function coverage(test) {
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) if (test(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hit++;
      out[y * SIZE + x] = hit / (SS * SS);
    }
  }
  return out;
}

function draw(shapes, fg, bg) {
  const line = coverage((x, y) => shapes.some(d => scaled(d)(x, y) <= STROKE / 2));
  const disc = bg ? coverage(inPill) : null;
  const px = Buffer.alloc(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const a1 = line[i], a0 = disc ? disc[i] : 0;
    // 描边盖在圆底上
    const a = a1 + a0 * (1 - a1);
    for (let k = 0; k < 3; k++) {
      const c = a ? (fg[k] * a1 + (bg ? bg[k] : 0) * a0 * (1 - a1)) / a : 0;
      px[i * 4 + k] = Math.round(c);
    }
    px[i * 4 + 3] = Math.round(a * 255);
  }
  return png(px);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 位 RGBA
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** 写 tab-<name>.png 和 tab-<name>-on.png；pages.base.json 的 iconPath 指向这里 */
export function writeTabIcons(theme, dir) {
  const ink = hex(theme.ink), onBrand = hex(theme.onBrand), brand = hex(theme.brand);
  for (const [name, shapes] of Object.entries(ICONS)) {
    writeFileSync(path.join(dir, `tab-${name}.png`), draw(shapes, ink, null));
    writeFileSync(path.join(dir, `tab-${name}-on.png`), draw(shapes, onBrand, brand));
  }
}
