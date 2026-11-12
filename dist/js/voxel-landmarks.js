/* ══════════════════════════════════════════════════════════════════
   voxel-landmarks.js —— 体素（voxel）版 18 城地标
   ------------------------------------------------------------------
   由「微缩街区」的方块建模体系移植而来：所有构件按颜色合桶，
   最后每种颜色合并成一个 mesh，18 座地标总计只有几十个 draw call。

   与 landmarks.js（低多边形写实体系）并存：
   scene.html?models=voxel  → 本文件（默认）
   scene.html?models=classic→ landmarks.js

   约束：只用 vendor/three.module.js，不引入任何依赖与构建工具。
   ══════════════════════════════════════════════════════════════════ */

import * as THREE from './vendor/three.module.js';

let OX = 0, OZ = 0;
/* 摩天轮轮盘：这几段几何要能整体转动，先单独接出来 */
const wheelBuckets = new Map();
const wheelGlass = [];
const WHEEL_HUB = { x: 0, y: 0, z: 0 };
let wheelSpin = false;
const C = {
  white: 0xffffff, paper: 0xfbfcfe, pave: 0xdde3ec, side: 0xeff3f8,
  curb: 0xe3e8f0, path: 0xf3e9d4, pathEdge: 0xdfd2b6, line: 0xffffff,
  blue: 0x4e9bea, blueDeep: 0x2c6fba, blueLite: 0x93cbf5,
  yellow: 0xf8c86e, yellowDeep: 0xe0a64b,
  cream: 0xfff6e4,
  coral: 0xf58f7e, coralDeep: 0xdb6e5e,
  berry: 0xd24572, berryDeep: 0xab2c56,
  glass: 0xd7ecfb, glassDeep: 0xa7d4ef,
  green: 0x66c48f, greenDeep: 0x3f9d6a, trunk: 0xc59a6c, soil: 0x9a7f63,
  metal: 0xbac4d2, wood: 0xe2c49c, dark: 0x4f5b6b, grey: 0xdde3ec
};

const X = {
  gold:     0xf7c14d,
  goldDeep: 0xe0a02e,
  chRed:    0xd6443a,
  chDeep:   0xb02f2b,
  roofRed:  0xd8503f,
  stone:    0xece8dd,
  stoneDeep:0xc9c3b2,
  jade:     0x35bf94,
  jadeDeep: 0x219873,
  water:    0x74c2ec,
  waterDeep:0x4fa8dd,
  sand:     0xe9d4a6,
  tile:     0x7d8794,
  tileDeep: 0x5f6874,
  brick:    0xc25a46,
  brickDeep:0xa2453a
};


/* ═══════════════════════════════════════════════════════
   2. 几何堆积系统（按颜色合并，和街区同一套做法）
   ═══════════════════════════════════════════════════════ */
const buckets = new Map();
const glassGeos = [];
const matCache = new Map();

/* 站点场景是「强日照 + ACES 色调映射」，纯白与浅色方砖会直接过曝成白块。
   这里做一层色板映射 + 压光：白件转暖白、石台转石材灰、水面压深，体块层次才留得住。 */
const TONE_MAP = new Map([
  [0xffffff, 0xdcd3c0],
  [0xfbfcfe, 0xe6dfd0],
  [0xeff3f8, 0xd8dfe8],
  [0xece8dd, 0xc9bfa9],
  [0xc9c3b2, 0xa89f8c],
  [0x74c2ec, 0x3d84b2],
  [0x4fa8dd, 0x2e6b97]
]);

/* 玻璃与窗带：白天当冷色玻璃，入夜由 scene.js 统一点亮 */
const LIT_COLORS = new Set([0xd7ecfb, 0x93cbf5, 0x9fd8f5]);
const litMats = [];

function matFor(hex) {
  let m = matCache.get(hex);
  if (!m) {
    const mapped = TONE_MAP.has(hex);
    const base = new THREE.Color(mapped ? TONE_MAP.get(hex) : hex);
    if (!mapped) base.multiplyScalar(0.95);
    const lit = LIT_COLORS.has(hex);
    m = new THREE.MeshStandardMaterial({
      color: base,
      roughness: lit ? 0.34 : 0.86,
      metalness: lit ? 0.26 : 0.03,
      emissive: lit ? base.clone() : 0x000000,
      emissiveIntensity: lit ? 0.12 : 0
    });
    if (lit) litMats.push(m);
    matCache.set(hex, m);
  }
  return m;
}

function push(geo, color) {
  const map = wheelSpin ? wheelBuckets : buckets;
  let a = map.get(color);
  if (!a) { a = []; map.set(color, a); }
  a.push(geo);
}

function applyT(g, x, y, z, rx, ry, rz) {
  if (rx || ry || rz) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
    m.setPosition(x, y, z);
    g.applyMatrix4(m);
  } else {
    g.translate(x, y, z);
  }
}

/* 当前沙盘的局部原点 */

function B(w, h, d, color, x, y, z, rx, ry, rz) {
  const g = new THREE.BoxGeometry(w, h, d);
  applyT(g, OX + x, y, OZ + z, rx || 0, ry || 0, rz || 0);
  push(g, color);
  return g;
}

function CY(rt, rb, h, seg, color, x, y, z, rx, ry, rz) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  applyT(g, OX + x, y, OZ + z, rx || 0, ry || 0, rz || 0);
  push(g, color);
  return g;
}

function SP(r, color, x, y, z, w, h) {
  const g = new THREE.SphereGeometry(r, w || 14, h || 9);
  g.translate(OX + x, y, OZ + z);
  push(g, color);
  return g;
}

function GLS(w, h, d, x, y, z, rx, ry, rz) {
  const g = new THREE.BoxGeometry(w, h, d);
  applyT(g, OX + x, y, OZ + z, rx || 0, ry || 0, rz || 0);
  (wheelSpin ? wheelGlass : glassGeos).push(g);
}

/* 任意两点之间的杆件（桁架 / 斜撑 / 支腿 / 斜梯） */
function STRUT(w, d, color, x1, y1, z1, x2, y2, z2, ryBase) {
  const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  if (len < 0.001) return;
  const g = new THREE.BoxGeometry(w, len, d);
  g.translate(0, len / 2, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  m.setPosition(OX + x1, y1, OZ + z1);
  g.applyMatrix4(m);
  push(g, color);
}

/* 台锥（檐口、塔身收分、坡面） */
function FRUSTUM(w, d, h, shrink, color, seg, x, y, z, ry) {
  const g = new THREE.CylinderGeometry(Math.SQRT1_2 * shrink, Math.SQRT1_2, h, seg || 4, 1);
  if ((seg || 4) === 4) g.rotateY(Math.PI / 4);
  g.scale(w, 1, d);
  g.translate(0, h / 2, 0);
  applyT(g, OX + x, y, OZ + z, 0, ry || 0, 0);
  push(g, color);
}

/* 尖锥（攒尖顶、塔顶） */
function PYR(w, d, h, color, seg, x, y, z, ry) {
  const g = new THREE.CylinderGeometry(0, Math.SQRT1_2, h, seg || 4, 1);
  if ((seg || 4) === 4) g.rotateY(Math.PI / 4);
  g.scale(w, 1, d);
  g.translate(0, h / 2, 0);
  applyT(g, OX + x, y, OZ + z, 0, ry || 0, 0);
  push(g, color);
}

/* 中式一重檐：下檐口 + 上部坡顶 */
function ROOF(w, d, h, cEave, cRoof, x, y, z, seg) {
  seg = seg || 4;
  FRUSTUM(w * 1.03, d * 1.03, h * 0.30, 0.72, cEave, seg, x, y, z);
  PYR(w * 0.73, d * 0.73, h * 0.72, cRoof, seg, x, y + h * 0.30, z);
}

/* 一层柱列 */
function COLS(x0, x1, n, z, y0, h, c, r) {
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? x0 : x0 + (x1 - x0) * i / (n - 1);
    CY(r || 0.32, r || 0.32, h, 8, c, x, y0 + h / 2, z);
  }
}

/* 栏杆 */
function RAIL(w, d, x, y, z, c, h, seg) {
  const n = Math.max(2, Math.round(w / 1.6));
  B(w, h * 0.22, 0.16, c, x, y + h, z);
  B(w, h * 0.14, 0.14, c, x, y + h * 0.1, z);
  for (let i = 0; i < n; i++) {
    B(0.14, h * 0.8, 0.14, c, x - w / 2 + w * i / (n - 1), y + h * 0.5, z);
  }
  if (d) {
    const m = Math.max(2, Math.round(Math.abs(d) / 1.6));
    for (let i = 0; i < m; i++) {
      B(0.14, h * 0.8, 0.14, c, x + w / 2, y + h * 0.5, z + d * i / (m - 1));
    }
  }
}

/* 拱券（半圆砌块，用来做桥洞 / 券门） */
function ARCH(cx, cy, r, thick, depth, n, color, z) {
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (i + 0.5) / n;
    B(thick * 1.02, thick, depth, color,
      cx + Math.cos(a) * (r + thick / 2), cy + Math.sin(a) * (r + thick / 2), z || 0,
      0, 0, a - Math.PI / 2);
  }
}

/* 水面 */
function WATER(w, d, x, z, y) {
  B(w, 0.5, d, X.water, x, (y || 0) + 0.25, z);
  B(w, 0.18, d * 0.62, X.waterDeep, x, (y || 0) + 0.52, z);
}


/* ═══════════════════════════════════════════════════════
   4. 十八座地标
   ═══════════════════════════════════════════════════════ */

/* ── 1 北京 · 天安门 ───────────────────────────────── */
function lmGate() {
  B(30, 1.4, 15, X.stone, 0, 0.7, 0);
  B(29, 0.5, 14, C.white, 0, 1.62, 0);
  RAIL(28.4, 0, 0, 1.86, 7.0, C.white, 0.8);

  /* 城台 */
  B(25, 8.8, 11.5, X.chRed, 0, 6.3, 0);
  B(25.4, 0.55, 11.9, C.white, 0, 10.5, 0);

  /* 三个券门 */
  [-7.4, 0, 7.4].forEach(x => {
    B(3.8, 5.4, 0.9, 0x7a4238, x, 4.6, 5.85);
    CY(1.9, 1.9, 0.9, 16, 0x7a4238, x, 7.3, 5.85, Math.PI / 2, 0, 0);
    B(4.6, 0.5, 1.2, C.white, x, 1.95, 5.9);
  });
  /* 城台壁柱 */
  for (let i = 0; i < 8; i++) {
    const x = -11 + i * 3.15;
    B(0.55, 8.4, 0.35, X.chDeep, x, 6.3, 5.78);
  }

  /* 城楼台面 */
  B(25.6, 0.9, 12.2, C.white, 0, 11.2, 0);
  RAIL(25.2, 0, 0, 11.62, 5.85, C.white, 0.85);

  /* 城楼 */
  B(17.6, 5.4, 9.4, X.chRed, 0, 14.1, 0);
  for (let i = 0; i < 6; i++) {
    const x = -7.4 + i * 2.96;
    B(0.62, 5.4, 0.62, C.wood, x, 14.1, 4.55);
    B(0.62, 5.4, 0.62, C.wood, x, 14.1, -4.55);
  }
  /* 门窗格 */
  for (let i = 0; i < 5; i++) {
    B(2.1, 3.1, 0.2, C.yellow, -5.9 + i * 2.96, 13.6, 4.72);
    B(1.5, 2.3, 0.16, X.chDeep, -5.9 + i * 2.96, 13.4, 4.84);
  }
  /* 匾额 */
  B(5.0, 1.5, 0.3, C.yellow, 0, 17.3, 4.78);
  B(4.3, 1.0, 0.16, X.chDeep, 0, 17.3, 4.9);

  /* 下层檐 */
  FRUSTUM(20.6, 11.6, 1.9, 0.84, X.gold, 4, 0, 16.8, 0);
  /* 上层楼身 */
  B(13.4, 3.4, 7.4, X.chRed, 0, 18.5, 0);
  for (let i = 0; i < 4; i++) {
    B(1.7, 2.2, 0.16, C.yellow, -4.4 + i * 2.9, 18.5, 3.72);
  }
  /* 上层檐 */
  ROOF(15.6, 9.2, 3.6, X.gold, X.goldDeep, 0, 20.2, 0);
  /* 正脊 */
  B(6.0, 0.4, 0.4, X.goldDeep, 0, 23.7, 0);

  /* 华表 */
  [-12.6, 12.6].forEach(x => {
    B(1.5, 0.4, 1.5, C.white, x, 2.0, 8.4);
    CY(0.45, 0.5, 8.4, 10, C.white, x, 6.4, 8.4);
    B(1.9, 0.26, 0.5, C.white, x, 9.6, 8.4);
    B(0.7, 0.6, 0.7, C.white, x, 10.9, 8.4);
  });

  /* 两侧红墙 */
  [-14.6, 14.6].forEach(x => {
    B(7.4, 4.6, 8.0, X.chRed, x, 3.9, -1.2);
    B(7.8, 0.7, 8.4, X.gold, x, 6.4, -1.2);
  });
}

/* ── 2 南京 · 夫子庙 ───────────────────────────────── */
function lmTemple() {
  /* 秦淮河 + 岸 */
  WATER(40, 9.5, 0, 14.6);
  B(40, 0.8, 2.2, X.stone, 0, 0.4, 9.0);
  RAIL(39, 0, 0, 0.8, 8.1, C.white, 0.9);

  /* 广场铺地 */
  B(34, 0.24, 9.0, C.side, 0, 0.12, 4.0);
  B(34, 0.1, 0.4, C.curb, 0, 0.25, 8.4);

  /* 台基 */
  B(25, 1.8, 14, X.stone, 0, 0.9, -3.2);
  RAIL(24.4, 0, 0, 1.8, 3.6, C.white, 0.7);

  /* 主体白墙 */
  B(21, 7.6, 11.5, C.white, 0, 5.6, -3.2);
  /* 红柱廊 */
  for (let i = 0; i < 7; i++) {
    const x = -9 + i * 3;
    CY(0.4, 0.4, 7.6, 8, X.chRed, x, 5.6, 2.55);
  }
  B(21.4, 0.5, 0.5, X.chRed, 0, 9.1, 2.55);
  /* 槅扇门窗 */
  for (let i = 0; i < 6; i++) {
    B(2.3, 4.6, 0.2, C.wood, -7.6 + i * 3.05, 4.5, 2.28);
    B(1.9, 3.8, 0.14, X.chDeep, -7.6 + i * 3.05, 4.4, 2.4);
  }
  /* 匾 */
  B(6.4, 1.5, 0.34, X.chDeep, 0, 7.9, 2.5);
  B(5.7, 1.05, 0.16, X.gold, 0, 7.9, 2.66);

  /* 双重檐 */
  FRUSTUM(23.2, 13.6, 1.5, 0.86, X.gold, 4, 0, 9.4, -3.2);
  B(15.2, 3.6, 8.4, C.white, 0, 11.6, -3.2);
  for (let i = 0; i < 6; i++) {
    CY(0.34, 0.34, 3.6, 8, X.chRed, -6.6 + i * 2.64, 11.6, 0.9);
    B(1.5, 2.4, 0.14, C.wood, -6.0 + i * 2.4, 11.5, 1.02);
  }
  ROOF(17.6, 10.6, 5.4, X.gold, X.goldDeep, 0, 13.4, -3.2);
  B(7.0, 0.5, 0.5, X.goldDeep, 0, 18.6, -3.2);

  /* 牌坊 */
  [[-13.6], [13.6]].forEach(([x]) => {
    B(0.9, 7.2, 0.9, X.chRed, x - 1.9, 3.6, 6.0);
    B(0.9, 7.2, 0.9, X.chRed, x + 1.9, 3.6, 6.0);
    B(6.0, 0.8, 1.1, X.chRed, x, 7.5, 6.0);
    ROOF(7.4, 2.6, 2.0, X.gold, X.goldDeep, x, 7.9, 6.0);
  });

  /* 小船 */
  B(4.6, 0.9, 1.8, C.wood, -8, 0.75, 15.4);
  B(2.6, 1.0, 1.3, C.cream, -8, 1.7, 15.4);
  B(4.6, 1.1, 1.8, C.wood, 9, 0.85, 13.6);
  B(2.2, 1.6, 1.2, C.coral, 9, 2.1, 13.6);
}

/* ── 3 西安 · 大雁塔 ───────────────────────────────── */
function lmXian() {
  B(15, 1.8, 15, X.stone, 0, 0.9, 0);
  B(14.2, 0.4, 14.2, C.white, 0, 1.95, 0);
  RAIL(13.6, 0, 0, 2.05, 6.9, C.white, 0.7);

  let y = 2.1, w = 12.0;
  for (let i = 0; i < 7; i++) {
    const h = 4.1 - i * 0.15;
    B(w, h, w, C.yellow, 0, y + h / 2, 0);
    /* 四角砖柱 */
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => {
      B(0.68, h, 0.68, C.coralDeep, sx * (w / 2 - 0.26), y + h / 2, sz * (w / 2 - 0.26));
    }));
    /* 四面壁龛 */
    const dw = Math.min(2.6, w * 0.36);
    [[0, 0], [0, 1], [1, 0], [1, 1]].forEach(([ax, neg]) => {
      const sg = neg ? -1 : 1;
      if (ax === 0) {
        B(dw, h * 0.56, 0.3, 0x6d4a30, 0, y + h * 0.35, sg * (w / 2 + 0.02));
        B(dw + 0.5, 0.3, 0.34, X.goldDeep, 0, y + h * 0.64, sg * (w / 2 + 0.02));
      } else {
        B(0.3, h * 0.56, dw, 0x6d4a30, sg * (w / 2 + 0.02), y + h * 0.35, 0);
        B(0.34, 0.3, dw + 0.5, X.goldDeep, sg * (w / 2 + 0.02), y + h * 0.64, 0);
      }
    });
    /* 薄檐 */
    FRUSTUM(w + 1.5, w + 1.5, 0.52, 0.93, X.goldDeep, 4, 0, y + h, 0);
    FRUSTUM(w + 0.7, w + 0.7, 0.3, 0.97, C.coral, 4, 0, y + h + 0.52, 0);
    y += h + 0.82;
    w *= 0.925;
  }

  /* 塔刹 */
  CY(0.9, 1.15, 1.6, 8, X.gold, 0, y + 0.8, 0);
  SP(1.05, X.gold, 0, y + 2.1, 0, 12, 9);
  PYR(1.5, 1.5, 2.0, X.goldDeep, 4, 0, y + 3.0, 0);
  CY(0.15, 0.2, 2.6, 8, X.gold, 0, y + 5.8, 0);
}

/* ── 4 杭州 · 雷峰塔 ───────────────────────────────── */
function lmHangzhou() {
  /* 夕照山 */
  FRUSTUM(26, 22, 4.2, 0.66, 0x8dbb9b, 8, 0, -0.2, 0);
  FRUSTUM(16, 14, 2.0, 0.8, 0xa8cdb3, 8, 0, 3.9, 0);
  /* 西湖 */
  WATER(28, 6.0, 0, 14.6, 0);

  /* 台基 */
  CY(8.0, 9.0, 1.3, 8, X.stone, 0, 6.2, 0);
  B(15, 0.4, 0.9, C.white, 0, 6.9, 8.4);

  let y = 6.9, r = 6.6;
  for (let i = 0; i < 5; i++) {
    const h = 4.5 - i * 0.12;
    CY(r, r, h, 8, X.brick, 0, y + h / 2, 0);
    /* 红柱 */
    for (let a = 0; a < 8; a++) {
      const ang = Math.PI * 2 * a / 8 + Math.PI / 8;
      CY(0.26, 0.26, h, 8, X.chRed, Math.cos(ang) * r * 0.99, y + h / 2, Math.sin(ang) * r * 0.99);
    }
    /* 窗 */
    for (let a = 0; a < 4; a++) {
      const ang = Math.PI * 2 * a / 4 + Math.PI / 4;
      B(1.7, h * 0.52, 0.28, C.yellow, Math.cos(ang) * (r - 0.05), y + h * 0.46, Math.sin(ang) * (r - 0.05), 0, -ang, 0);
    }
    /* 檐 */
    FRUSTUM((r + 1.15) * 2, (r + 1.15) * 2, 0.62, 0.92, X.gold, 8, 0, y + h, 0);
    FRUSTUM((r + 0.5) * 2, (r + 0.5) * 2, 0.32, 0.96, X.goldDeep, 8, 0, y + h + 0.62, 0);
    y += h + 0.96;
    r *= 0.87;
  }

  /* 塔刹 */
  CY(1.2, 1.5, 1.2, 8, X.gold, 0, y + 0.6, 0);
  for (let i = 0; i < 5; i++) CY(0.95 - i * 0.15, 0.95 - i * 0.15, 0.28, 8, X.goldDeep, 0, y + 1.3 + i * 0.4, 0);
  SP(0.8, X.gold, 0, y + 3.5, 0, 12, 9);
  CY(0.12, 0.18, 2.0, 8, X.gold, 0, y + 4.8, 0);
}

/* ── 5 武汉 · 黄鹤楼 ───────────────────────────────── */
function lmWuhan() {
  B(27, 1.8, 19, X.stone, 0, 0.9, 0);
  RAIL(26, 0, 0, 1.8, 9.0, C.white, 0.7);
  B(9, 0.8, 2.2, X.stone, 0, 0.4, 10.4);

  let y = 1.9;
  const tiers = [
    { w: 18.5, d: 13.5, h: 5.0 },
    { w: 16.4, d: 12.0, h: 4.8 },
    { w: 14.2, d: 10.4, h: 4.5 },
    { w: 12.0, d: 8.8, h: 4.0 },
    { w: 9.8, d: 7.2, h: 3.8 }
  ];
  tiers.forEach((t, i) => {
    /* 白墙楼身 */
    B(t.w, t.h, t.d, C.cream, 0, y + t.h / 2, 0);
    /* 红柱 */
    for (let k = 0; k < 5; k++) {
      const x = -t.w / 2 + 0.7 + (t.w - 1.4) * k / 4;
      CY(0.33, 0.33, t.h, 8, X.chRed, x, y + t.h / 2, t.d / 2 - 0.15);
      CY(0.33, 0.33, t.h, 8, X.chRed, x, y + t.h / 2, -t.d / 2 + 0.15);
    }
    /* 窗 */
    if (i > 0) {
      for (let k = 0; k < 4; k++) {
        B(1.6, t.h * 0.5, 0.16, C.yellow, -t.w / 2 + 1.8 + (t.w - 3.6) * k / 3, y + t.h * 0.45, t.d / 2 + 0.02);
        B(1.2, t.h * 0.34, 0.1, X.chRed, -t.w / 2 + 1.8 + (t.w - 3.6) * k / 3, y + t.h * 0.45, t.d / 2 + 0.12);
      }
    }
    /* 平座栏杆 */
    if (i > 0) RAIL(t.w - 0.3, 0, 0, y + 0.08, t.d / 2 + 0.5, C.coral, 0.5);
    /* 檐 */
    FRUSTUM(t.w + 2.6, t.d + 2.2, 1.1, 0.92, X.gold, 4, 0, y + t.h, 0);
    FRUSTUM(t.w + 1.2, t.d + 1.0, 0.5, 0.96, X.goldDeep, 4, 0, y + t.h + 1.1, 0);
    y += t.h + 1.6;
  });

  /* 攒尖顶 */
  PYR(11.4, 8.6, 3.4, X.gold, 4, 0, y, 0);
  PYR(9.2, 6.8, 2.2, X.goldDeep, 4, 0, y + 3.2, 0);
  CY(0.85, 1.05, 1.1, 8, X.gold, 0, y + 6.0, 0);
  SP(0.7, X.goldDeep, 0, y + 6.8, 0, 12, 9);
  CY(0.14, 0.2, 2.4, 8, X.gold, 0, y + 8.0, 0);
}

/* ── 6 莆田 · 广化寺塔 ─────────────────────────────── */
function lmPutian() {
  /* 寺院院墙 */
  B(32, 0.3, 26, C.side, 0, 0.15, 0);
  [-1, 1].forEach(s => {
    B(0.9, 4.4, 22, C.white, s * 15.4, 2.2, 0);
    B(1.3, 0.6, 22.4, X.tile, s * 15.4, 4.5, 0);
  });
  B(30.8, 4.4, 0.9, C.white, 0, 2.2, -12.2);
  B(31.2, 0.6, 1.2, X.tile, 0, 4.5, -12.2);

  /* 塔基 */
  B(13.5, 1.4, 13.5, 0xc9c3b2, 0, 0.7, 0);
  B(12.8, 0.4, 12.8, C.white, 0, 1.6, 0);
  RAIL(12.2, 0, 0, 1.75, 6.1, C.white, 0.65);

  let y = 1.8, w = 9.6;
  for (let i = 0; i < 7; i++) {
    const h = 3.9 - i * 0.14;
    CY(w * 0.68, w * 0.68, h, 8, 0xd8d1c0, 0, y + h / 2, 0);
    for (let a = 0; a < 8; a++) {
      const ang = Math.PI * 2 * a / 8 + Math.PI / 8;
      CY(0.24, 0.24, h, 8, 0xa9a28e, Math.cos(ang) * w * 0.67, y + h / 2, Math.sin(ang) * w * 0.67);
    }
    for (let a = 0; a < 4; a++) {
      const ang = Math.PI * 2 * a / 4;
      B(1.05, h * 0.56, 0.26, 0x5f6874, Math.cos(ang) * (w * 0.68 - 0.05), y + h * 0.42, Math.sin(ang) * (w * 0.68 - 0.05), 0, -ang, 0);
    }
    /* 石檐 */
    FRUSTUM(w * 1.4, w * 1.4, 0.38, 0.94, 0xb3ab96, 8, 0, y + h, 0);
    FRUSTUM(w * 1.2, w * 1.2, 0.22, 0.97, C.white, 8, 0, y + h + 0.38, 0);
    y += h + 0.76;
    w *= 0.945;
  }
  CY(0.8, 1.0, 1.1, 8, 0xb3ab96, 0, y + 0.55, 0);
  SP(0.65, 0xa9a28e, 0, y + 1.5, 0, 12, 9);
  CY(0.12, 0.16, 2.2, 8, 0xa9a28e, 0, y + 2.8, 0);
}

/* ── 7 上海 · 东方明珠 ─────────────────────────────── */
function lmShanghai() {
  B(22, 0.9, 22, X.stone, 0, 0.45, 0);
  B(20, 0.5, 20, C.white, 0, 1.0, 0);
  CY(8.2, 9.2, 2.6, 20, C.white, 0, 2.6, 0);
  CY(8.6, 8.6, 0.45, 20, C.blueLite, 0, 3.9, 0);

  /* 三根斜腿 */
  [90, 210, 330].forEach(a => {
    const rad = Math.PI * a / 180;
    STRUT(3.2, 3.2, C.white, Math.cos(rad) * 6.6, 3.4, Math.sin(rad) * 6.6, Math.cos(rad) * 2.4, 13.0, Math.sin(rad) * 2.4);
    STRUT(1.0, 1.0, C.blueLite, Math.cos(rad) * 6.2, 6.4, Math.sin(rad) * 6.2, Math.cos(rad) * 2.3, 12.2, Math.sin(rad) * 2.3);
  });

  /* 下球 */
  SP(5.6, C.berry, 0, 17.6, 0, 20, 14);
  CY(5.3, 5.3, 0.55, 20, C.cream, 0, 17.6, 0);
  SP(2.6, C.berryDeep, 0, 17.6, 4.4, 12, 9);

  /* 中柱 */
  CY(1.6, 1.9, 8.6, 12, C.white, 0, 25.2, 0);
  CY(1.9, 1.9, 0.4, 12, C.blueLite, 0, 21.4, 0);
  CY(1.7, 1.7, 0.4, 12, C.blueLite, 0, 28.8, 0);

  /* 上球 */
  SP(4.0, C.berry, 0, 30.2, 0, 20, 14);
  CY(3.8, 3.8, 0.45, 20, C.cream, 0, 30.2, 0);

  /* 太空舱 */
  CY(1.1, 1.1, 4.4, 10, C.white, 0, 34.4, 0);
  CY(2.4, 2.4, 3.0, 16, C.berry, 0, 38.2, 0);

  /* 天线 */
  CY(0.32, 0.5, 4.0, 8, C.metal, 0, 41.7, 0);
  CY(0.1, 0.14, 2.8, 6, C.metal, 0, 45.0, 0);
}

/* ── 8 广州 · 广州塔 ───────────────────────────────── */
function lmGuangzhou() {
  B(20, 0.9, 20, X.stone, 0, 0.45, 0);
  CY(7.4, 8.2, 2.0, 16, C.white, 0, 1.9, 0);
  CY(7.7, 7.7, 0.5, 16, C.blueLite, 0, 2.95, 0);

  const N = 22, H = 34;
  const rad = t => 2.2 + 3.7 * Math.pow(Math.abs(t - 0.5) * 2, 1.8);

  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    CY(rad(t1), rad(t0), H / N + 0.1, 18, i % 2 ? C.blue : C.white, 0, 3.2 + (i + 0.5) * H / N, 0);
  }
  /* 塔冠 + 天线 */
  CY(3.6, 4.6, 1.4, 16, C.white, 0, 3.2 + H + 0.7, 0);
  CY(2.4, 3.2, 1.2, 12, C.blueLite, 0, 3.2 + H + 1.9, 0);
  CY(0.35, 0.6, 5.2, 8, C.metal, 0, 3.2 + H + 5.4, 0);
  CY(0.12, 0.18, 3.4, 6, C.metal, 0, 3.2 + H + 9.6, 0);
}

/* ── 9 成都 · 天府塔 ───────────────────────────────── */
function lmChengdu() {
  B(20, 0.9, 20, X.stone, 0, 0.45, 0);
  CY(5.6, 7.0, 2.4, 16, C.white, 0, 1.9, 0);
  CY(5.9, 5.9, 0.5, 16, C.blueLite, 0, 3.2, 0);

  /* 塔身（收分） */
  for (let i = 0; i < 6; i++) {
    const r1 = 4.8 - i * 0.42, r2 = 4.8 - (i + 1) * 0.42;
    CY(r2, r1, 3.6, 16, i % 2 ? C.blue : C.blueLite, 0, 3.4 + i * 3.6 + 1.8, 0);
  }
  /* 观光平台 */
  CY(5.5, 4.8, 2.0, 16, C.cream, 0, 25.0, 0);
  CY(5.7, 5.7, 0.4, 16, C.white, 0, 26.1, 0);
  /* 上段塔身 */
  CY(2.4, 3.4, 9.0, 12, C.blue, 0, 31.2, 0);
  CY(2.6, 2.6, 0.4, 12, C.cream, 0, 35.8, 0);
  /* 天线 */
  CY(0.5, 0.9, 6.0, 8, C.metal, 0, 39.4, 0);
  CY(0.14, 0.2, 3.4, 6, C.metal, 0, 43.6, 0);
  SP(0.46, C.berry, 0, 45.2, 0, 10, 8);
}

/* ── 10 厦门 · 世茂双子塔 ──────────────────────────── */
function lmXiamen() {
  B(24, 0.9, 24, X.stone, 0, 0.45, 0);
  /* 裙楼 */
  B(20, 3.4, 16, C.white, 0, 2.4, 0);
  for (let i = 0; i < 6; i++) B(1.6, 2.4, 0.16, C.blueLite, -8 + i * 3.2, 2.6, 8.06);

  const twin = [{ x: -6.0, h: 32 }, { x: 6.0, h: 29 }];
  twin.forEach((tw, idx) => {
    /* 塔身（轻微收分 + 圆角） */
    CY(4.4, 4.9, tw.h, 14, C.white, tw.x, 4.1 + tw.h / 2, -1.0);
    /* 玻璃竖带 */
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * 2 * k / 7;
      B(1.5, tw.h * 0.96, 0.4, C.blueLite,
        tw.x + Math.cos(a) * 4.55, 4.2 + tw.h / 2, -1.0 + Math.sin(a) * 4.55, 0, -a, 0);
    }
    /* 每 6 米一道横带 */
    const bands = Math.floor(tw.h / 5.2);
    for (let b = 1; b <= bands; b++) {
      CY(4.62, 4.62, 0.26, 14, C.blue, tw.x, 4.2 + b * 5.2, -1.0);
    }
    /* 顶部斜切冠 */
    B(9.0, 2.4, 9.0, C.white, tw.x, 4.1 + tw.h + 1.0, -1.0, 0, 0, idx ? 0.09 : -0.09);
    B(9.6, 0.6, 9.6, C.blue, tw.x, 4.1 + tw.h + 2.1, -1.0, 0, 0, idx ? 0.09 : -0.09);
    /* 顶部尖 */
    CY(0.3, 0.6, 3.2, 8, C.metal, tw.x, 4.1 + tw.h + 3.8, -1.0, 0, 0, idx ? 0.09 : -0.09);
  });

  /* 连接廊 */
  B(13.0, 1.8, 3.6, C.white, 0, 22.0, -1.0);
  B(12.4, 1.1, 2.9, C.blueLite, 0, 22.0, -1.0);
  B(13.4, 0.3, 4.0, C.blue, 0, 23.0, -1.0);
}

/* ── 11 深圳 · 平安金融中心 ────────────────────────── */
function lmShenzhen() {
  B(24, 0.9, 24, X.stone, 0, 0.45, 0);
  B(20, 2.6, 20, C.white, 0, 1.9, 0);
  B(19.6, 1.5, 19.6, C.blueLite, 0, 2.35, 0);
  B(20.4, 0.35, 20.4, C.white, 0, 3.2, 0);

  /* 方塔收分：四角白棱 + 层间细线 */
  let y = 3.4, w = 13.0;
  const SEGS = 7, SH = 5.4;
  for (let i = 0; i < SEGS; i++) {
    const nw = w * 0.962;
    FRUSTUM(w, w, SH, nw / w, C.blue, 4, 0, y, 0);
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
      STRUT(0.52, 0.52, C.white, sx * w * 0.5, y, sz * w * 0.5, sx * nw * 0.5, y + SH, sz * nw * 0.5);
    });
    B(nw + 0.12, 0.14, nw + 0.12, C.white, 0, y + SH, 0);
    /* 楼层横线 + 竖向幕墙分格 */
    for (let f = 1; f <= 4; f++) {
      const fy = y + SH * f / 5;
      B(nw + 0.04, 0.06, nw + 0.04, C.blueLite, 0, fy, 0);
    }
    [-1, 1].forEach(sd => {
      for (let m = 1; m <= 3; m++) {
        const off = nw * (m / 4 - 0.5);
        STRUT(0.16, 0.16, C.white, off, y, sd * (w / 2 + 0.05), off, y + SH, sd * (nw / 2 + 0.05));
        STRUT(0.16, 0.16, C.white, sd * (w / 2 + 0.05), y, off, sd * (nw / 2 + 0.05), y + SH, off);
      }
    });
    y += SH; w = nw;
  }

  /* 塔冠 + 尖顶 */
  FRUSTUM(w * 1.18, w * 1.18, 1.1, 0.9, 0xb3c9e0, 4, 0, y, 0);
  y += 1.1;
  FRUSTUM(w, w, 3.6, 0.26, 0xc6d8ec, 4, 0, y, 0);
  y += 3.6;
  CY(0.55, 0.8, 4.6, 8, 0xb3c9e0, 0, y + 2.3, 0);
  CY(0.18, 0.34, 4.4, 8, 0x9fb0c4, 0, y + 6.4, 0);
}

/* ── 12 长沙 · 国金中心 ────────────────────────────── */
function lmChangsha() {
  B(26, 0.9, 26, X.stone, 0, 0.45, 0);
  /* 裙楼 */
  B(22, 4.2, 18, C.white, 0, 2.8, 0);
  for (let i = 0; i < 7; i++) B(1.8, 3.0, 0.18, C.blueLite, -9 + i * 3.0, 3.0, 9.06);
  B(22.4, 0.7, 18.4, C.blue, 0, 5.0, 0);

  const towers = [{ x: -5.6, h: 33, w: 8.4 }, { x: 5.6, h: 26, w: 8.0 }];
  towers.forEach((tw, idx) => {
    /* 塔身（方柱 + 切角） */
    B(tw.w, tw.h, tw.w * 0.92, C.white, tw.x, 5.3 + tw.h / 2, 0);
    /* 玻璃幕墙 */
    B(tw.w * 0.94, tw.h * 0.97, tw.w * 0.86, C.blueLite, tw.x, 5.3 + tw.h / 2, 0.02);
    /* 竖向分格 */
    const n = 5;
    for (let k = 0; k <= n; k++) {
      const x = tw.x - tw.w / 2 + tw.w * k / n;
      B(0.36, tw.h * 0.97, 0.36, C.white, x, 5.3 + tw.h / 2, tw.w * 0.46);
      B(0.36, tw.h * 0.97, 0.36, C.white, x, 5.3 + tw.h / 2, -tw.w * 0.46);
    }
    /* 横带 */
    for (let b = 1; b < 10; b++) {
      B(tw.w * 1.01, 0.34, tw.w * 0.94, C.blue, tw.x, 5.3 + b * (tw.h / 10), 0);
    }
    /* 顶部冠：斜切 + 挑檐 */
    B(tw.w * 1.14, 1.6, tw.w * 1.06, C.white, tw.x, 5.3 + tw.h + 0.8, 0);
    B(tw.w * 1.22, 0.5, tw.w * 1.14, C.blue, tw.x, 5.3 + tw.h + 1.75, 0);
    B(tw.w * 0.72, 2.6, tw.w * 0.66, C.white, tw.x, 5.3 + tw.h + 3.2, 0, 0, 0, idx ? 0.06 : -0.06);
    CY(0.24, 0.5, 3.4, 8, C.metal, tw.x, 5.3 + tw.h + 6.2, 0);
  });
}

/* ── 13 重庆 · 洪崖洞 ──────────────────────────────── */
function lmChongqing() {
  /* 崖壁 */
  B(34, 1.0, 26, C.side, 0, 0.5, 0);
  FRUSTUM(32, 20, 9.0, 0.88, X.stoneDeep, 4, 0, 0.8, -3.0);
  B(30, 1.2, 19, C.greenDeep, 0, 9.3, -3.0);

  /* 江面 */
  WATER(40, 6.0, 0, 13.6);

  /* 五层吊脚楼，逐层退台 */
  for (let i = 0; i < 5; i++) {
    const y = 1.6 + i * 5.0;
    const z = 5.4 - i * 1.5;
    const w = 27 - i * 2.6;
    /* 木构主体 */
    B(w, 4.2, 7.0, C.wood, 0, y + 2.1, z);
    /* 柱 */
    for (let k = 0; k < 8; k++) {
      const x = -w / 2 + 1.0 + (w - 2.0) * k / 7;
      B(0.45, 4.2, 0.45, X.brickDeep, x, y + 2.1, z + 3.5);
    }
    /* 窗格 */
    for (let k = 0; k < 7; k++) {
      const x = -w / 2 + 1.8 + (w - 3.6) * k / 6;
      B(2.0, 2.0, 0.16, 0x8a5a3c, x, y + 2.3, z + 3.56);
      B(1.6, 1.6, 0.12, C.yellow, x, y + 2.3, z + 3.66);
    }
    /* 屋檐（灰瓦） */
    FRUSTUM(w + 3.6, 10.4, 1.5, 0.9, X.tile, 4, 0, y + 4.2, z);
    FRUSTUM(w + 2.2, 9.0, 0.5, 0.96, X.tileDeep, 4, 0, y + 5.7, z);
    /* 栏杆平台 */
    B(w + 4.0, 0.3, 2.6, C.wood, 0, y + 0.15, z + 4.6);
    RAIL(w + 3.6, 0, 0, y + 0.3, z + 5.8, X.brickDeep, 0.8);
    /* 红灯笼 */
    for (let k = 0; k < 6; k++) {
      const x = -w / 2 + 2.2 + (w - 4.4) * k / 5;
      CY(0.05, 0.05, 0.7, 6, C.dark, x, y + 4.0, z + 5.5);
      SP(0.72, C.coralDeep, x, y + 3.2, z + 5.5, 10, 7);
      SP(0.4, X.gold, x, y + 3.95, z + 5.5, 8, 6);
    }
    /* 吊脚支撑（下层） */
    if (i < 4) {
      [-1, 1].forEach(s => {
        B(0.4, 2.6, 0.4, X.brickDeep, s * (w / 2 - 1.2), y - 1.3, z + 4.6);
      });
    }
  }
  /* 顶部楼阁 */
  B(9.0, 3.4, 6.0, C.wood, 0, 27.3, -2.4);
  FRUSTUM(12.6, 8.6, 1.6, 0.9, X.tile, 4, 0, 29.0, -2.4);
  PYR(10.2, 7.0, 2.4, X.tileDeep, 4, 0, 30.5, -2.4);

  /* 千厮门大桥片段 */
  B(4.0, 0.8, 22, C.white, -15.5, 8.0, 3.0);
  [-1, 1].forEach(s => {
    STRUT(0.4, 0.4, C.white, -15.5 - 1.6, 8.4, s * 9.0, -15.5 - 1.6, 12.0, s * 4.0);
  });
}

/* ── 14 哈尔滨 · 圣索菲亚 ──────────────────────────── */
function lmHarbin() {
  B(26, 0.9, 26, X.stone, 0, 0.45, 0);
  B(23, 0.5, 23, C.white, 0, 1.1, 0);

  /* 主堂红砖体 */
  B(15, 11.0, 13, X.brick, 0, 6.5, -2.0);
  /* 拱窗 */
  for (let i = 0; i < 3; i++) {
    const x = -4.6 + i * 4.6;
    B(2.2, 4.2, 0.3, C.cream, x, 6.4, 4.55);
    CY(1.1, 1.1, 0.3, 12, C.cream, x, 8.5, 4.55, Math.PI / 2, 0, 0);
    GLS(1.6, 3.4, 0.16, x, 6.1, 4.72);
  }
  /* 檐口 */
  B(16.2, 0.8, 14.2, X.stone, 0, 12.2, -2.0);

  /* 中央鼓座 + 洋葱顶 */
  CY(4.6, 5.0, 3.6, 16, X.brick, 0, 14.2, -2.0);
  CY(4.9, 4.9, 0.5, 16, X.stone, 0, 12.6, -2.0);
  for (let a = 0; a < 8; a++) {
    const ang = Math.PI * 2 * a / 8;
    B(1.0, 2.2, 0.3, C.cream, Math.cos(ang) * 4.5, 14.2, -2.0 + Math.sin(ang) * 4.5, 0, -ang, 0);
  }
  SP(4.9, X.jade, 0, 17.2, -2.0, 18, 12);
  FRUSTUM(3.4, 3.4, 3.4, 0.98, X.jadeDeep, 12, 0, 19.4, -2.0);
  CY(0.9, 1.4, 1.6, 10, X.jadeDeep, 0, 22.6, -2.0);
  SP(0.55, X.gold, 0, 23.6, -2.0, 10, 8);
  CY(0.14, 0.2, 2.2, 6, X.gold, 0, 25.0, -2.0);

  /* 四角小穹顶 */
  [[-6.0, -8.0], [6.0, -8.0], [-6.0, 3.0], [6.0, 3.0]].forEach(([x, z]) => {
    CY(1.7, 1.9, 3.2, 12, X.brick, x, 13.0, z);
    SP(1.9, X.jade, 0, 15.0, z, 14, 10);
    PYR(1.4, 1.4, 1.8, X.jadeDeep, 8, 0, 15.9, 0);
    CY(0.1, 0.14, 1.2, 6, X.gold, x, 17.4, z);
  });

  /* 钟楼 */
  B(6.6, 15.0, 6.6, X.brick, 0, 8.6, 7.0);
  B(7.2, 0.7, 7.2, X.stone, 0, 16.4, 7.0);
  B(2.2, 2.6, 0.3, C.cream, 0, 13.6, 10.3);
  CY(1.1, 1.1, 0.3, 12, C.cream, 0, 14.9, 10.3, Math.PI / 2, 0, 0);
  B(3.4, 2.6, 3.4, X.brick, 0, 18.0, 7.0);
  SP(2.4, X.jade, 0, 20.4, 7.0, 14, 10);
  PYR(1.8, 1.8, 2.2, X.jadeDeep, 8, 0, 21.6, 7.0);
  CY(0.1, 0.14, 1.6, 6, X.gold, 0, 24.0, 7.0);

  /* 基座台阶 */
  B(9.0, 0.6, 3.0, X.stone, 0, 1.5, 11.0);
}

/* ── 15 拉萨 · 布达拉宫 ────────────────────────────── */
function lmLhasa() {
  /* 红山 */
  B(34, 1.0, 28, C.side, 0, 0.5, 0);
  FRUSTUM(28, 21, 8.6, 0.80, X.sand, 4, 0, 0.8, -1.0);
  B(22.8, 1.0, 16.4, 0xdcc094, 0, 9.4, -1.0);

  /* 白宫：整片展开，正面露出 */
  B(25.0, 11.0, 13.0, C.white, 0, 9.4 + 5.5, 0.4);
  B(25.6, 0.9, 13.6, X.chDeep, 0, 20.0, 0.4);
  B(25.2, 0.36, 13.2, 0xefe6d4, 0, 17.4, 0.4);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      const x = -11.2 + c * 2.8;
      if (Math.abs(x) < 5.8) continue;
      B(1.3, 1.8, 0.3, 0x3a3f4a, x, 13.2 + r * 2.4, 6.95);
      B(1.7, 0.42, 0.42, X.chDeep, x, 12.1 + r * 2.4, 6.97);
    }
  }

  /* 红宫：中央凸出 */
  B(10.8, 15.0, 12.4, X.chRed, 0, 9.4 + 7.5, -0.4);
  B(11.2, 1.0, 12.8, X.chDeep, 0, 24.4, -0.4);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      B(1.2, 1.6, 0.3, 0x3a3f4a, -3.3 + c * 3.3, 12.2 + r * 3.0, 6.0);
      B(1.5, 0.34, 0.4, X.chDeep, -3.3 + c * 3.3, 11.2 + r * 3.0, 6.02);
    }
  }
  /* 金顶 */
  [[-3.8, 3.4], [3.8, 3.4], [0, -3.0]].forEach(([x, z]) => {
    const yy = 24.9;
    B(5.4, 0.9, 5.0, X.gold, x, yy, z);
    PYR(5.0, 4.6, 2.4, X.goldDeep, 4, x, yy + 0.45, z);
    CY(0.16, 0.22, 1.6, 6, X.gold, x, yy + 3.2, z);
    SP(0.42, X.gold, x, yy + 4.1, z, 10, 8);
  });

  /* 之字形登城梯 */
  for (let i = 0; i < 9; i++) {
    B(4.6, 0.7, 2.0, 0xd8bd8c, 12.4 - i * 0.4, 2.6 + i * 1.05, 7.4 + (i % 2 ? 0.5 : -0.5));
  }
  /* 山脚房屋 */
  [[-12.6, 6.2, 6.4, 3.2], [-8.8, 8.4, 4.4, 2.4], [12.8, 3.8, 5.4, 2.8]].forEach(([x, z, w, h]) => {
    B(w, h, 4.2, C.white, x, 2.2 + h / 2, z);
    B(w + 0.6, 0.5, 4.7, X.chDeep, x, 2.2 + h + 0.2, z);
  });
}

/* ── 16 天津 · 天津之眼 ────────────────────────────── */
function lmTianjin() {
  /* 河 */
  WATER(40, 11.0, 0, 12.0);
  /* 桥面 */
  B(38, 1.2, 6.0, C.white, 0, 5.2, 2.0);
  B(38, 0.5, 1.0, C.blue, 0, 5.4, 5.0);
  RAIL(38, 0, 0, 5.8, 5.0, C.white, 0.7);
  /* 桥墩 */
  [-14, -7, 0, 7, 14].forEach(x => {
    B(2.6, 5.0, 3.4, X.stone, x, 2.5, 2.0);
    PYR(2.2, 3.0, 0.8, X.stone, 4, x, 5.0, 2.0);
  });

  const WY = 20.6, WR = 11.8;
  /* A 字支架 */
  [-1, 1].forEach(s => {
    STRUT(1.0, 1.0, C.white, s * 6.6, 5.8, 2.0, s * 1.4, WY, -1.6);
    STRUT(0.7, 0.7, C.white, s * 6.6, 5.8, 2.0, s * 1.4, 11.0, -0.4);
  });
  B(4.4, 1.2, 1.4, C.blue, 0, WY - 0.5, -1.6);

  /* 双圈 —— 轮盘起始，以下几何进独立子组 */
  WHEEL_HUB.x = 0; WHEEL_HUB.y = WY; WHEEL_HUB.z = 0.6; wheelSpin = true;
  for (let i = 0; i < 36; i++) {
    const a = Math.PI * 2 * i / 36;
    [-0.8, 0.8].forEach(z => {
      B(1.35, 0.34, 0.34, i % 4 === 0 ? C.berry : C.cream,
        Math.cos(a) * WR, WY + Math.sin(a) * WR, z + 0.6, 0, 0, a);
    });
  }
  /* 辐条 */
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * 2 * i / 18;
    STRUT(0.2, 0.2, C.white, 0, WY, 0.4, Math.cos(a) * WR, WY + Math.sin(a) * WR, 0.4);
  }
  /* 吊舱 */
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * 2 * i / 18;
    const gx = Math.cos(a) * (WR + 0.25), gy = WY + Math.sin(a) * (WR + 0.25);
    B(0.18, 0.5, 0.18, C.metal, gx, gy, 0.6);
    B(1.75, 1.5, 1.6, i % 2 ? C.berry : C.blue, gx, gy - 1.2, 0.6);
    B(1.95, 0.28, 1.8, C.white, gx, gy - 1.9, 0.6);
    B(1.3, 0.6, 0.14, C.glass, gx, gy - 1.1, 1.36);
  }
  /* 轴心 */
  CY(1.0, 1.0, 3.2, 12, C.metal, 0, WY, 0.6, Math.PI / 2, 0, 0);
  wheelSpin = false;
}

/* ── 17 兰州 · 中山桥 ──────────────────────────────── */
function lmLanzhou() {
  /* 黄河 */
  WATER(32, 16.0, 0, 0);
  B(32, 0.6, 0.9, X.sand, 0, 0.62, 8.2);
  B(32, 0.6, 0.9, X.sand, 0, 0.62, -8.2);

  /* 桥面 */
  B(38, 1.0, 5.4, C.white, 0, 6.0, 0);
  B(38, 0.42, 0.6, X.stoneDeep, 0, 6.2, 2.7);
  B(38, 0.42, 0.6, X.stoneDeep, 0, 6.2, -2.7);

  /* 五个桁架跨 */
  const spans = [-15.2, -7.6, 0, 7.6, 15.2];
  for (let i = 0; i < spans.length - 1; i++) {
    const x1 = spans[i], x2 = spans[i + 1];
    [-1, 1].forEach(s => {
      /* 上下弦 */
      B(x2 - x1, 0.45, 0.45, 0x7f8b99, (x1 + x2) / 2, 11.4, s * 2.5);
      B(x2 - x1, 0.5, 0.5, 0x7f8b99, (x1 + x2) / 2, 6.55, s * 2.5);
      /* 竖杆 */
      for (let k = 0; k <= 2; k++) {
        const x = x1 + (x2 - x1) * k / 2;
        B(0.4, 5.0, 0.4, 0x7f8b99, x, 9.0, s * 2.5);
      }
      /* 斜撑 X */
      STRUT(0.34, 0.34, 0x9aa6b3, x1, 6.6, s * 2.5, x2, 11.3, s * 2.5);
      STRUT(0.34, 0.34, 0x9aa6b3, x1, 11.3, s * 2.5, x2, 6.6, s * 2.5);
      /* 横联 */
      STRUT(0.3, 0.3, 0x9aa6b3, x1, 11.3, s * 2.5, x1, 11.3, -s * 2.5);
    });
    /* 顶部横撑 */
    B(0.45, 0.45, 4.9, 0x7f8b99, (x1 + x2) / 2 + (x2 - x1) / 2, 11.4, 0);
  }

  /* 桥墩 */
  spans.forEach(x => {
    B(2.2, 6.6, 3.4, X.stoneDeep, x, 3.3, 0);
    PYR(1.9, 3.0, 0.9, X.stone, 4, x, 6.6, 0);
  });

  /* 北岸白塔 */
  FRUSTUM(14, 12, 4.4, 0.7, C.greenDeep, 4, -12, 0.4, -12.5);
  B(5.6, 5.0, 5.6, C.white, -12, 7.5, -12.5);
  CY(2.6, 3.4, 4.6, 12, C.white, -12, 12.0, -12.5);
  SP(1.9, C.white, -12, 15.0, -12.5, 14, 10);
  CY(0.5, 1.0, 2.0, 10, C.white, -12, 16.6, -12.5);
  CY(0.14, 0.2, 1.8, 6, X.gold, -12, 18.3, -12.5);
}

/* ── 18 绍兴 · 八字桥 ──────────────────────────────── */
function lmShaoxing() {
  /* 运河 */
  WATER(28, 15.0, 0, 2.0);
  /* 两岸石驳 */
  B(28, 1.6, 3.4, 0x9e9782, 0, 0.8, -7.4);
  B(28, 1.6, 3.4, 0x9e9782, 0, 0.8, 11.4);
  B(28, 0.4, 3.4, 0xc6bfab, 0, 1.7, -7.4);
  B(28, 0.4, 3.4, 0xc6bfab, 0, 1.7, 11.4);

  /* 主拱桥 */
  const BY = 0.4, BR = 4.4;
  ARCH(0, BY, BR, 0.95, 6.8, 11, 0x8d8672, 0.4);
  /* 拱肩 */
  [-1, 1].forEach(s => {
    B(2.8, BY + BR + 0.6, 6.8, 0xb9b19c, s * (BR + 1.4), (BY + BR + 0.6) / 2, 0.4);
  });
  /* 桥面（阶梯式堆高） */
  for (let i = 0; i < 8; i++) {
    const y = BY + 0.9 + i * 0.6;
    const w = 13.2 - i * 1.25;
    B(w, 0.6, 6.8, 0xa9a08b, 0, y, 0.4);
  }
  /* 桥栏 */
  [-1, 1].forEach(s => {
    for (let i = 0; i < 7; i++) {
      const y = BY + 1.2 + i * 0.6;
      B(1.2, 0.95, 0.36, 0x9e9782, s * (10.4 - i * 1.35), y + 0.5, 0.4 + 3.0);
      B(1.2, 0.95, 0.36, 0x9e9782, s * (10.4 - i * 1.35), y + 0.5, 0.4 - 3.0);
    }
  });

  /* 两岸白墙黑瓦（缩小、退到两侧，露出桥） */
  [[-8.6, -8.6], [8.6, -8.6]].forEach(([x, z]) => {
    B(4.4, 4.2, 4.2, 0xd9cfba, x, 3.6, z);
    FRUSTUM(5.2, 4.9, 1.3, 0.86, X.tile, 4, x, 5.8, z);
  });
  [[-8.8, 12.4], [8.8, 12.4]].forEach(([x, z]) => {
    B(4.8, 4.0, 4.2, 0xd2c8b3, x, 3.6, z);
    FRUSTUM(5.6, 5.0, 1.3, 0.86, X.tile, 4, x, 5.8, z);
    B(1.4, 1.8, 0.2, C.wood, x, 3.2, z - 2.15);
  });

  /* 乌篷船 */
  B(4.0, 0.65, 1.4, C.dark, -8.6, 0.8, 3.4);
  B(2.2, 0.85, 1.2, 0x353b45, -8.6, 1.4, 3.4);
  B(3.6, 0.55, 1.3, C.dark, 9.0, 0.75, 8.2);
  B(1.9, 0.75, 1.1, 0x353b45, 9.0, 1.3, 8.2);
}

/* ═══════════════════════════════════════════════════════
   5. 布展：6 × 3 沙盘
   ═══════════════════════════════════════════════════════ */
const CELL_X = [-117.5, -70.5, -23.5, 23.5, 70.5, 117.5];
const CELL_Z = [-66, 0, 66];

const BOARD = [
  /* 后排：中式古建 */
  { t: '天安门', c: 'BEIJING', f: lmGate, k: 0.98 },
  { t: '大雁塔', c: 'XI\u2019AN', f: lmXian, k: 1.02 },
  { t: '雷峰塔', c: 'HANGZHOU', f: lmHangzhou, k: 1.0 },
  { t: '黄鹤楼', c: 'WUHAN', f: lmWuhan, k: 0.98 },
  { t: '夫子庙', c: 'NANJING', f: lmTemple, k: 0.98 },
  { t: '广化寺塔', c: 'PUTIAN', f: lmPutian, k: 1.06 },

  /* 中排：现代塔楼 */
  { t: '东方明珠', c: 'SHANGHAI', f: lmShanghai, k: 0.9 },
  { t: '广州塔', c: 'GUANGZHOU', f: lmGuangzhou, k: 0.9 },
  { t: '天府塔', c: 'CHENGDU', f: lmChengdu, k: 0.9 },
  { t: '世茂双子塔', c: 'XIAMEN', f: lmXiamen, k: 1.0 },
  { t: '平安金融中心', c: 'SHENZHEN', f: lmShenzhen, k: 0.92 },
  { t: '国金中心', c: 'CHANGSHA', f: lmChangsha, k: 0.92 },

  /* 前排：特色结构 */
  { t: '洪崖洞', c: 'CHONGQING', f: lmChongqing, k: 0.95 },
  { t: '圣索菲亚教堂', c: 'HARBIN', f: lmHarbin, k: 0.95 },
  { t: '布达拉宫', c: 'LHASA', f: lmLhasa, k: 0.9 },
  { t: '天津之眼', c: 'TIANJIN', f: lmTianjin, k: 0.92 },
  { t: '中山桥', c: 'LANZHOU', f: lmLanzhou, k: 1.0 },
  { t: '八字桥', c: 'SHAOXING', f: lmShaoxing, k: 1.05 }
];

/* ══════════════════════════════════════════════════════════════════
   合并与装配
   ══════════════════════════════════════════════════════════════════ */

/* 自带的几何合并：只处理 position / normal / uv + index，
   避免依赖 three 的 BufferGeometryUtils 附加模块 */
function mergeGeos(list) {
  const geos = list.filter(function (g) { return g && g.attributes && g.attributes.position; });
  if (!geos.length) return null;
  let vCount = 0, iCount = 0;
  for (let i = 0; i < geos.length; i++) {
    const g = geos[i];
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (let i = 0; i < geos.length; i++) {
    const g = geos[i];
    const p = g.attributes.position.array;
    pos.set(p, vo * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) {
      const ia = g.index.array;
      for (let k = 0; k < ia.length; k++) idx[io + k] = ia[k] + vo;
      io += ia.length;
    } else {
      const n = g.attributes.position.count;
      for (let k = 0; k < n; k++) idx[io + k] = vo + k;
      io += n;
    }
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/* 城市 id → 建模函数 */
const BUILDERS = {
  beijing: lmGate,
  xian: lmXian,
  hangzhou: lmHangzhou,
  wuhan: lmWuhan,
  nanjing: lmTemple,
  putian: lmPutian,
  shanghai: lmShanghai,
  guangzhou: lmGuangzhou,
  chengdu: lmChengdu,
  xiamen: lmXiamen,
  shenzhen: lmShenzhen,
  changsha: lmChangsha,
  chongqing: lmChongqing,
  haerbin: lmHarbin,
  lasa: lmLhasa,
  tianjin: lmTianjin,
  lanzhou: lmLanzhou,
  shaoxing: lmShaoxing
};

/* 归一化尺寸：与 landmarks.js 的体量口径对齐，
   宽不出 CORE_RADIUS(2.35)、高不顶画幅 */
const TARGET_H = 5.3;
const TARGET_W = 4.8;

export function createVoxelLandmark(options) {
  const city = (options && options.city) || {};
  const id = city.id || 'beijing';
  const build = BUILDERS[id] || lmGate;

  buckets.clear();
  glassGeos.length = 0;
  wheelBuckets.clear();
  wheelGlass.length = 0;
  matCache.clear();
  litMats.length = 0;
  OX = 0;
  OZ = 0;

  build();

  const inner = new THREE.Group();
  let glassMesh = null;
  let merged = 0;

  buckets.forEach(function (geos, color) {
    const geo = mergeGeos(geos);
    geos.forEach(function (g) { g.dispose(); });
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, matFor(color | 0));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    inner.add(mesh);
    merged++;
  });

  if (glassGeos.length) {
    const geo = mergeGeos(glassGeos);
    glassGeos.forEach(function (g) { g.dispose(); });
    if (geo) {
      glassMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0xd8ecff, emissive: 0x8fc0ee, emissiveIntensity: 0.42,
        transparent: true, opacity: 0.4, roughness: 0.14, metalness: 0.0,
        depthWrite: false
      }));
      glassMesh.renderOrder = 2;
      inner.add(glassMesh);
    }
  }
  buckets.clear();
  glassGeos.length = 0;

  const root = new THREE.Group();
  root.add(inner);

  const box = new THREE.Box3().setFromObject(inner);
  if (box.isEmpty()) return root;
  const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  const h = box.max.y - box.min.y;
  let k = TARGET_H / Math.max(h, 1e-3);
  if (w * k > TARGET_W) k = TARGET_W / w;

  /* 直接烘进几何：底面贴地 + 水平居中 + 归一化缩放。
     不能改 root.scale —— scene.js 会用地标的 LANDMARK_SCALE 覆盖它。 */
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const y0 = box.min.y;
  inner.traverse(function (o) {
    if (!o.isMesh || !o.geometry) return;
    o.geometry.translate(-cx, -y0, -cz);
    o.geometry.scale(k, k, k);
  });
  root.userData.voxel = { meshes: merged, height: h * k, width: w * k };
  /* 摩天轮轮盘：几何绕轴心收拢，位置与缩放跟随归一化，子组可独立旋转 */
  if (wheelBuckets.size || wheelGlass.length) {
    const wheel = new THREE.Group();
    const addWheel = function (geos, mat) {
      const geo = mergeGeos(geos);
      geos.forEach(function (g) { g.dispose(); });
      if (!geo) return;
      geo.translate(-WHEEL_HUB.x, -WHEEL_HUB.y, -WHEEL_HUB.z);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      wheel.add(mesh);
    };
    wheelBuckets.forEach(function (geos, color) { addWheel(geos, matFor(color | 0)); });
    if (wheelGlass.length) {
      addWheel(wheelGlass, new THREE.MeshStandardMaterial({
        color: 0xd8ecff, emissive: 0x8fc0ee, emissiveIntensity: 0.4,
        transparent: true, opacity: 0.45, roughness: 0.16, depthWrite: false
      }));
    }
    wheel.position.set(
      (WHEEL_HUB.x - cx) * k,
      (WHEEL_HUB.y - y0) * k,
      (WHEEL_HUB.z - cz) * k
    );
    wheel.scale.setScalar(k);
    root.add(wheel);
    root.userData.wheel = wheel;
  }
  wheelBuckets.clear();
  wheelGlass.length = 0;

  /* 交给 scene.js：入夜点窗 */
  root.userData.voxelLit = litMats.slice();
  root.userData.voxelGlass = glassMesh;
  return root;
}
