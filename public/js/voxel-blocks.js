/* ══════════════════════════════════════════════════════════════════
   voxel-blocks.js —— 18 城「微缩街区」体素沙盘
   ------------------------------------------------------------------
   与 voxel-landmarks.js（单座地标）不同，这里搬的是**整块街区**：
   底板 / 马路 / 八间商铺 / 四栋主楼 / 露台连廊 / 摩天轮 / 巴士 /
   行道树与街心花园，地标落在街区东侧腾空的楼位上。

   源文件：voxel-block.html（本地微缩街区工程），由 .tmp/gen_block_module.py
   机械抽取而来，建模代码与源文件保持一致，便于两边同步。

   约束：
     · 只用 vendor/three.module.js，不引入任何依赖与构建工具
     · 所有方块按颜色合桶，最后每色 mergeGeos() 成一个 mesh
     · 归一化烘进内层 group，**不要改返回值的 scale**（scene.js 会覆盖）
   ══════════════════════════════════════════════════════════════════ */
import * as THREE from './vendor/three.module.js';

/* 目标尺寸：街区归一化到 10.4 宽，正好坐在站点沙盘 10.5 的铺装面上 */
const TARGET_W = 11.6;

/* 模块内可变状态：buildBlock() 期间指向当前 root */
let ROOT = null;
let CUR_I = 0;
const REPLACE_B4 = true;

/* ---- 自写几何合并（voxel 只用 position / normal / uv / index） ---- */
function mergeGeos(list) {
  const geos = list.filter(function (g) { return g && g.attributes && g.attributes.position; });
  if (!geos.length) return null;
  if (geos.length === 1) return geos[0].index ? geos[0].toNonIndexed() : geos[0];

  let total = 0;
  geos.forEach(function (g) {
    total += g.index ? g.index.count : g.attributes.position.count;
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  let po = 0, uo = 0;

  geos.forEach(function (g) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const u = g.attributes.uv;
    const idx = g.index;
    const cnt = idx ? idx.count : p.count;
    for (let i = 0; i < cnt; i++) {
      const k = idx ? idx.getX(i) : i;
      pos[po] = p.getX(k); pos[po + 1] = p.getY(k); pos[po + 2] = p.getZ(k);
      if (n) { nor[po] = n.getX(k); nor[po + 1] = n.getY(k); nor[po + 2] = n.getZ(k); }
      if (u) { uvs[uo] = u.getX(k); uvs[uo + 1] = u.getY(k); }
      po += 3; uo += 2;
    }
  });

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return out;
}

const C = {
  white:    0xfdfaf6,
  paper:    0xfbfcfe,
  pave:     0xd3dbe8,
  side:     0xeff3f8,
  road:     0xa9b5c7,
  curb:     0xe3e8f0,
  path:     0xf3e9d4,
  pathEdge: 0xdfd2b6,
  line:     0xffffff,

  blue:     0x4e9bea,
  blueDeep: 0x2c6fba,
  blueLite: 0x93cbf5,

  yellow:   0xf8c86e,
  yellowDeep:0xe0a64b,
  cream:    0xfff6e4,

  coral:    0xf58f7e,
  coralDeep:0xdb6e5e,

  berry:    0xd24572,
  berryDeep:0xab2c56,

  glass:     0xd7ecfb,
  glassDeep: 0xa7d4ef,

  green:    0x66c48f,
  greenDeep:0x3f9d6a,
  greenLite:0x92d8ad,
  grass:    0xb6e2c0,
  grassDeep:0x7cc79a,
  trunk:    0xc59a6c,
  trunkDeep:0xa87d54,
  soil:     0x9a7f63,

  metal:    0xbac4d2,
  wood:     0xe2c49c,
  dark:     0x4f5b6b,
  grey:     0xdde3ec
};
/* 颜色保持本地工程原值：站点在街区模式下会把光照降到本地工程的量级
   （见 scene.js 的 LIGHT_K / EXP_K），只有最亮的白面再轻压一档，
   避免 ACES 高光被削平时糊成一片死白。 */
/* 玻璃 / 窗带色：入夜点亮的对象 */
const LIT_COLORS = new Set([0xd7ecfb, 0x93cbf5, 0xa7d4ef]);
let litMats = [];

const BLOCK_TONE = new Map([
  [0xf1f5fb, 0xc6d2e2],   // 底板顶面
  [0xfbfcfe, 0xd8dfe9],   // C.paper
  [0xd3dbe8, 0xa9b6c8],   // C.pave
  [0xeff3f8, 0xd0dae6],   // C.side
  [0xe3e8f0, 0xc2ccda],   // C.curb
  [0xfdfaf6, 0xe2ddd2],   // C.white
  [0xfff6e4, 0xe6dcc8]    // C.cream
]);

function buildBlock() {
litMats = [];
const buckets = new Map();
const glassGeos = [];
const matCache = new Map();

function matFor(hex) {
  let m = matCache.get(hex);
  if (!m) {
    const mapped = BLOCK_TONE.get(hex);
    const col = new THREE.Color(mapped != null ? mapped : hex);
    /* ACES 会把中间调往灰里拉，稍补一点饱和度，彩色楼体才不发灰 */
    const hsl = { h: 0, s: 0, l: 0 };
    col.getHSL(hsl);
    col.setHSL(hsl.h, Math.min(1, hsl.s * 1.22), hsl.l);
    const lit = LIT_COLORS.has(hex);
    m = new THREE.MeshStandardMaterial({
      color: col,
      roughness: lit ? 0.42 : 0.9,
      metalness: lit ? 0.18 : 0.02,
      /* 窗带白天保持玻璃色，入夜由 scene.js 点亮成暖光 */
      emissive: lit ? 0xffd9a0 : 0x000000,
      emissiveIntensity: 0
    });
    if (lit) litMats.push(m);
    matCache.set(hex, m);
  }
  return m;
}

function push(geo, color) {
  let a = buckets.get(color);
  if (!a) { a = []; buckets.set(color, a); }
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

function box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  applyT(g, x, y, z, rx, ry, rz);
  push(g, color);
  return g;
}

function cyl(rt, rb, h, seg, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  applyT(g, x, y, z, rx, ry, rz);
  push(g, color);
  return g;
}

function sph(r, color, x, y, z, w = 10, h = 7) {
  const g = new THREE.SphereGeometry(r, w, h);
  g.translate(x, y, z);
  push(g, color);
  return g;
}

/* 透明玻璃（单独合并，能看见室内） */
function glass(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  applyT(g, x, y, z, rx, ry, rz);
  glassGeos.push(g);
}

function meshBox(parent, w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matFor(color));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function beam(parent, p1, p2, thick, color) {
  const a = new THREE.Vector3().fromArray(p1);
  const b = new THREE.Vector3().fromArray(p2);
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(thick, len, thick), matFor(color));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/* ═══════════════════════════════════════════════════════
   3. 构件
   ═══════════════════════════════════════════════════════ */
function windowsZ(cx, cz, width, y0, floors, fh, cols, glassCol, frame, winW, winH, dir = 1, startRow = 1) {
  const usable = width - 2.0;
  const step = cols > 1 ? usable / (cols - 1) : 0;
  const x0 = cx - usable / 2;
  for (let r = startRow; r < floors; r++) {
    const y = y0 + r * fh + fh * 0.56;
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * step;
      box(winW + 0.34, winH + 0.34, 0.14, frame, x, y, cz + dir * 0.08);
      box(winW, winH, 0.13, glassCol, x, y, cz + dir * 0.15);
      box(winW + 0.62, 0.15, 0.34, frame, x, y - winH / 2 - 0.21, cz + dir * 0.16);
    }
  }
}

function windowsX(cx, cz, depth, y0, floors, fh, cols, glassCol, frame, winW, winH, dir = 1, startRow = 1) {
  const usable = depth - 2.0;
  const step = cols > 1 ? usable / (cols - 1) : 0;
  const z0 = cz - usable / 2;
  for (let r = startRow; r < floors; r++) {
    const y = y0 + r * fh + fh * 0.56;
    for (let c = 0; c < cols; c++) {
      const z = z0 + c * step;
      box(0.14, winH + 0.34, winW + 0.34, frame, cx + dir * 0.08, y, z);
      box(0.13, winH, winW, glassCol, cx + dir * 0.15, y, z);
      box(0.34, 0.15, winW + 0.62, frame, cx + dir * 0.16, y - winH / 2 - 0.21, z);
    }
  }
}

function rail(axis, len, x, y, z, color = C.metal, h = 1.0) {
  const isX = axis === 'x';
  box(isX ? len : 0.1, 0.11, isX ? 0.1 : len, color, x, y + h, z);
  box(isX ? len : 0.08, 0.08, isX ? 0.08 : len, color, x, y + h * 0.52, z);
  const n = Math.max(2, Math.round(len / 1.25));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len / n) * i;
    box(0.09, h, 0.09, color, isX ? x + t : x, y + h / 2, isX ? z : z + t);
  }
}

/* 玻璃栏板 */
function glassRail(axis, len, x, y, z, h = 1.0) {
  const isX = axis === 'x';
  glass(isX ? len : 0.06, h, isX ? 0.06 : len, x, y + h / 2, z);
  box(isX ? len : 0.1, 0.09, isX ? 0.1 : len, C.metal, x, y + h, z);
}

function awning(x, y, z, width, depth, colors, dir = 1) {
  const n = Math.max(4, Math.round(width / 1.05));
  const sw = width / n;
  for (let i = 0; i < n; i++) {
    box(sw, 0.12, depth, colors[i % colors.length], x - width / 2 + sw / 2 + i * sw, y, z + dir * depth * 0.44, 0.28);
    box(sw, 0.34, 0.09, colors[i % colors.length], x - width / 2 + sw / 2 + i * sw, y - 0.25, z + dir * depth * 0.9);
  }
  box(width, 0.1, 0.1, C.metal, x, y + 0.14, z + dir * 0.1);
}

/* 小遮阳篷（露台用） */
function canopy(x, y, z, width, depth, colors) {
  const n = Math.max(3, Math.round(width / 1.2));
  const sw = width / n;
  for (let i = 0; i < n; i++) {
    box(sw, 0.1, depth, colors[i % colors.length], x - width / 2 + sw / 2 + i * sw, y, z + depth * 0.42, 0.22);
  }
  box(0.08, 0.08, depth, C.metal, x - width / 2 + 0.1, y - 0.24, z + depth * 0.42);
  box(0.08, 0.08, depth, C.metal, x + width / 2 - 0.1, y - 0.24, z + depth * 0.42);
}

function stairs(x, zStart, y0, steps, stepH, stepD, width, color, dir = 1) {
  for (let i = 0; i < steps; i++) {
    const y = y0 + (i + 1) * stepH;
    box(width, stepH, stepD + 0.02, color, x, y - stepH / 2, zStart + dir * (i * stepD + stepD / 2));
  }
  const runLen = steps * stepD;
  const rise = steps * stepH;
  const ang = Math.atan2(rise, runLen);
  const len = Math.hypot(runLen, rise);
  for (const s of [-1, 1]) {
    box(0.16, 0.3, len, C.white, x + s * (width / 2 + 0.08), y0 + rise / 2 - 0.22,
        zStart + dir * runLen / 2, -ang * dir, 0, 0);
    for (let i = 0; i <= steps; i += 2) {
      box(0.08, 0.95, 0.08, C.metal, x + s * (width / 2 + 0.08),
          y0 + i * stepH + 0.48, zStart + dir * (i * stepD));
    }
    box(0.08, 0.09, len, C.metal, x + s * (width / 2 + 0.08),
        y0 + rise / 2 + 0.95, zStart + dir * runLen / 2, -ang * dir, 0, 0);
  }
}

/* ── 绿化系统：树 / 灌木 / 绿篱 / 草坪 ───────────────── */
const PETALS = [0xf58f7e, 0xd24572, 0xfff6e4, 0xf8c86e, 0xdb6e5e, 0xeba7d0];

/* 精致体素树：树池 + 分叉主干 + 四层错落树冠 + 花点 */
function tree(x, z, s = 1, y = 0) {
  /* 树池（有地面时才有） */
  box(1.9 * s, 0.26 * s, 1.9 * s, C.white, x, y + 0.13 * s, z);
  box(1.55 * s, 0.14 * s, 1.55 * s, C.soil, x, y + 0.3 * s, z);
  /* 主干 */
  box(0.46 * s, 2.5 * s, 0.46 * s, C.trunkDeep, x, y + 1.55 * s, z);
  /* 两根斜枝 */
  box(0.22 * s, 1.0 * s, 0.22 * s, C.trunk, x + 0.42 * s, y + 2.7 * s, z - 0.16 * s, 0, 0, -0.55);
  box(0.22 * s, 1.0 * s, 0.22 * s, C.trunk, x - 0.4 * s, y + 2.6 * s, z + 0.2 * s, 0.5, 0, 0.5);
  /* 树冠：从深到浅，逐层收小、错位 */
  box(3.0 * s, 1.05 * s, 3.0 * s, C.greenDeep, x, y + 3.25 * s, z);
  box(2.9 * s, 0.95 * s, 2.2 * s, C.greenDeep, x + 0.42 * s, y + 3.3 * s, z - 0.3 * s);
  box(2.5 * s, 1.0 * s, 2.5 * s, C.green, x + 0.26 * s, y + 4.05 * s, z - 0.22 * s);
  box(2.0 * s, 0.9 * s, 2.0 * s, C.green, x - 0.32 * s, y + 4.75 * s, z + 0.26 * s);
  box(1.25 * s, 0.72 * s, 1.25 * s, C.greenLite, x + 0.1 * s, y + 5.3 * s, z - 0.12 * s);
  /* 零星花点 */
  box(0.3 * s, 0.24 * s, 0.3 * s, PETALS[1], x + 1.0 * s, y + 4.0 * s, z + 0.9 * s);
  box(0.26 * s, 0.22 * s, 0.26 * s, PETALS[0], x - 1.05 * s, y + 4.5 * s, z - 0.5 * s);
  box(0.24 * s, 0.2 * s, 0.24 * s, PETALS[3], x + 0.2 * s, y + 4.35 * s, z + 1.1 * s);
}

/* 灌木丛：两三块圆球堆叠 */
function bush(x, z, s = 1, y = 0) {
  const g = new THREE.SphereGeometry(0.62 * s, 7, 5);
  push(g.translate(x, y + 0.5 * s, z), C.greenDeep);
  push(new THREE.SphereGeometry(0.44 * s, 7, 5).translate(x + 0.42 * s, y + 0.78 * s, z - 0.1 * s), C.green);
  if (s > 0.9) push(new THREE.SphereGeometry(0.3 * s, 6, 5).translate(x - 0.36 * s, y + 0.72 * s, z + 0.22 * s), C.greenLite);
}

/* 绿篱：沿 X 或 Z 的一条矮树墙，顶上点缀花 */
function hedge(x, z, len, axis = 'x', y = 0, tone = C.greenDeep) {
  const w = axis === 'x' ? len : 1.1;
  const d = axis === 'x' ? 1.1 : len;
  box(w, 0.95, d, tone, x, y + 0.48, z);
  box(w * 0.96, 0.22, d * 0.96, C.green, x, y + 1.02, z);
  const n = Math.max(2, Math.round(len / 1.1));
  for (let i = 0; i < n; i++) {
    const o = -len / 2 + len * (i + 0.5) / n;
    box(0.26, 0.2, 0.26, PETALS[i % PETALS.length],
        x + (axis === 'x' ? o : 0), y + 1.2, z + (axis === 'x' ? 0 : o));
  }
}

/* 草坪地块：浅绿地 + 深色边 + 草叶点 */
function lawn(x, z, w, d, y = 0.17) {
  box(w, 0.07, d, C.grass, x, y, z);
  box(w + 0.22, 0.05, d + 0.22, C.grassDeep, x, y - 0.04, z);
  const nx = Math.max(2, Math.round(w / 2.4)), nz = Math.max(2, Math.round(d / 2.4));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if ((i + j) % 3) continue;
    box(0.3, 0.16, 0.3, C.grassDeep,
        x - w / 2 + w * (i + 0.5) / nx, y + 0.12, z - d / 2 + d * (j + 0.5) / nz);
  }
}

/* 圆形花坛 */
function roundBed(x, z, r = 2.2, y = 0) {
  cyl(r, r + 0.1, 0.42, 18, C.white, x, y + 0.21, z);
  cyl(r - 0.26, r - 0.26, 0.12, 18, C.soil, x, y + 0.44, z);
  const n = Math.max(6, Math.round(r * 3.4));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * 0.6;
    box(0.34, 0.24, 0.34, C.greenDeep, x + Math.cos(a) * rr, y + 0.56, z + Math.sin(a) * rr);
    box(0.24, 0.2, 0.24, PETALS[i % PETALS.length], x + Math.cos(a) * rr, y + 0.74, z + Math.sin(a) * rr);
  }
  bush(x, z, 0.7, y + 0.42);
}

function planter(x, z, w = 2.2, d = 1.2, y = 0, tone = C.green) {
  box(w, 0.55, d, C.white, x, y + 0.28, z);
  box(w - 0.3, 0.16, d - 0.3, C.soil, x, y + 0.52, z);
  const n = Math.max(2, Math.round(w / 0.7));
  for (let i = 0; i < n; i++) {
    const bx = x - w / 2 + 0.35 + (w - 0.7) * (i / Math.max(1, n - 1));
    box(0.55, 0.5, 0.55, tone, bx, y + 0.85, z + (i % 2 ? 0.18 : -0.18));
  }
}

/* 花箱 / 花坛（带花） */
function flowerBox(x, y, z, w, d = 0.7, noPot = false) {
  if (!noPot) {
    box(w, 0.42, d, C.white, x, y + 0.21, z);
    box(w - 0.16, 0.1, d - 0.16, C.soil, x, y + 0.42, z);
  }
  const n = Math.max(2, Math.round(w / 0.62));
  const petals = [C.coral, C.berry, C.cream, C.yellow, C.coralDeep];
  for (let i = 0; i < n; i++) {
    const bx = x - w / 2 + 0.35 + (w - 0.7) * (i / Math.max(1, n - 1));
    box(0.46, 0.28, 0.46, C.greenDeep, bx, y + 0.58, z + (i % 2 ? 0.1 : -0.1));
    box(0.26, 0.2, 0.26, petals[i % petals.length], bx + 0.04, y + 0.78, z + (i % 2 ? 0.14 : -0.14));
  }
}

function tableSet(x, z, y = 0, seats = 2, tone = C.white, r = 0.85) {
  cyl(r, r, 0.11, 12, tone, x, y + 1.0, z);
  cyl(0.11, 0.11, 0.98, 8, C.metal, x, y + 0.49, z);
  cyl(0.45, 0.45, 0.07, 10, C.metal, x, y + 0.04, z);
  const dirs = seats === 4 ? [0, 1, 2, 3] : [0, 2];
  dirs.forEach(d => {
    const a = (d / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = x + Math.cos(a) * (r + 0.55);
    const cz = z + Math.sin(a) * (r + 0.55);
    box(0.58, 0.09, 0.58, C.wood, cx, y + 0.5, cz);
    box(0.58, 0.58, 0.09, C.wood, cx + Math.cos(a) * 0.28, y + 0.82, cz + Math.sin(a) * 0.28);
    box(0.07, 0.48, 0.07, C.metal, cx, y + 0.25, cz);
  });
}

function umbrella(x, z, y = 0, r = 2.0, tone = C.coral) {
  cyl(0.08, 0.08, 2.6, 8, C.metal, x, y + 1.3, z);
  cyl(0.14, r, 0.8, 8, tone, x, y + 2.65, z);
  cyl(0.09, 0.09, 0.14, 8, C.cream, x, y + 3.08, z);
  cyl(0.55, 0.55, 0.12, 10, C.metal, x, y + 0.06, z);
}

const glows = [];
function lamp(x, z) {
  box(0.4, 0.32, 0.4, C.dark, x, 0.16, z);
  box(0.18, 4.0, 0.18, C.dark, x, 2.1, z);
  box(1.4, 0.14, 0.14, C.dark, x + 0.6, 4.0, z);
  box(0.66, 0.16, 0.66, C.cream, x + 1.2, 3.9, z);
  const g = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.09, 0.58), new THREE.MeshBasicMaterial({ color: 0xfff0cc }));
  g.position.set(x + 1.2, 3.82, z);
  glows.push(g);
}

function bench(x, z, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  box(2.4, 0.14, 0.72, C.wood, x, 0.6, z, 0, ry, 0);
  box(2.4, 0.56, 0.12, C.wood, x - s * 0.32, 0.98, z - c * 0.32, 0, ry, 0);
  box(0.12, 0.5, 0.62, C.metal, x + c * 0.95, 0.3, z - s * 0.95);
  box(0.12, 0.5, 0.62, C.metal, x - c * 0.95, 0.3, z + s * 0.95);
}

function person(x, z, tone, ry = 0) {
  box(0.5, 0.72, 0.42, tone, x, 0.37, z, 0, ry, 0);
  box(0.44, 0.22, 0.38, C.dark, x, 0.11, z, 0, ry, 0);
  box(0.42, 0.4, 0.4, C.cream, x, 0.93, z, 0, ry, 0);
  box(0.44, 0.15, 0.44, tone, x, 1.16, z, 0, ry, 0);
}

/* 室内顶灯（自发光板，让室内不发黑） */
function ceilLight(x, y, z, w, d) {
  box(w, 0.06, d, 0xfff8e6, x, y, z);
  const g = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), new THREE.MeshBasicMaterial({ color: 0xfff7e2 }));
  g.position.set(x, y - 0.04, z);
  glows.push(g);
}

/* 招牌 */
const signGroup = new THREE.Group();
ROOT.add(signGroup);

function signTexture(text, bg, fg, ratio = 0.5) {
  const W = 512;
  const H = Math.max(64, Math.round(W * ratio));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = fg;
  ctx.font = '600 ' + Math.round(H * 0.48) + 'px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text || '', W / 2, H / 2 + 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  return tex;
}

function signPlane(text, x, y, z, w, h, bg, fg, ry = 0) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg, h / w) })
  );
  m.position.set(x, y, z);
  m.rotation.y = ry;
  signGroup.add(m);
}

/* 侧挂招牌（垂直于立面） */
function bladeSign(text, x, y, z, w, h, bg, fg) {
  box(0.1, h + 0.2, w + 0.2, C.white, x, y, z);
  signPlane(text, x, y, z + w / 2 + 0.07, w, h, bg, fg, 0);
  signPlane(text, x, y, z - w / 2 - 0.07, w, h, bg, fg, Math.PI);
  box(0.55, 0.07, 0.07, C.metal, x, y + h / 2 + 0.22, z);
}

/* 步道 */
function walkway(x1, x2, z1, z2, color = C.path) {
  const w = Math.abs(x2 - x1), d = Math.abs(z2 - z1);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  box(w, 0.1, d, color, cx, 0.16, cz);
  box(w + 0.5, 0.06, d + 0.5, C.pathEdge, cx, 0.11, cz);
}

/* ═══════════════════════════════════════════════════════
   4. 地面 / 道路 / 步道
   ═══════════════════════════════════════════════════════ */
/* 底板接触阴影交给站点场景的阴影系统，这里不再铺 420×420 的平面 */

/* 街区底板：收紧到建筑群外一圈，越靠边越像微缩沙盘 */
box(100, 1.6, 80, C.pave, 4, -0.8, -8);
box(96, 0.14, 76, 0xf1f5fb, 4, 0.02, -8);
box(104, 0.12, 64, C.paper, 2, 0.07, -13);
box(102, 0.2, 1.2, C.curb, 2, 0.11, 18.2);

box(92, 0.12, 8, C.road, 2, 0.06, 27);
box(92, 0.2, 7, C.side, 2, 0.1, 20.5);
box(92, 0.38, 0.45, C.curb, 2, 0.19, 23.1);
box(92, 0.28, 0.5, C.curb, 2, 0.19, 30.8);

for (let x = -42; x <= 46; x += 9) box(3.4, 0.05, 0.3, C.line, x, 0.11, 27);

/* 中央步道与支路 */
walkway(-42, 46, 5.2, 10.4);
walkway(-28, -24, -6.4, 5.2);
walkway(-6.2, -1.8, -8.4, 5.2);
walkway(14.2, 18.2, -3.9, 5.2);
walkway(32.2, 36.2, -15.9, 5.2);
box(12, 0.09, 12, C.path, 12, 0.15, 1.4);

/* ═══════════════════════════════════════════════════════
   5. 多层塔楼
   ═══════════════════════════════════════════════════════ */
function tower(o) {
  const { x, z, w, d, floors, fh = 3.2, body, trim, accent, cols = 4, sideCols = 3, plinth = C.white, openGround = false } = o;
  const Y0 = 0.85;
  const H = floors * fh;
  const top = Y0 + H;
  const gh = openGround ? fh : 0;

  box(w + 0.9, Y0 + 0.1, d + 0.9, plinth, x, (Y0 + 0.1) / 2, z);
  box(w, H - gh, d, body, x, Y0 + gh + (H - gh) / 2, z);

  for (let f = 1; f <= floors; f++) box(w + 0.26, 0.22, d + 0.26, trim, x, Y0 + f * fh, z);

  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    box(0.5, H - gh, 0.5, trim, x + sx * (w / 2 - 0.12), Y0 + gh + (H - gh) / 2, z + sz * (d / 2 - 0.12));
  });

  box(w + 0.95, 0.5, d + 0.95, trim, x, top + 0.25, z);

  windowsZ(x, z + d / 2, w, Y0, floors, fh, cols, C.glass, trim, 1.5, 1.7, 1, openGround ? 1 : 0);
  windowsZ(x, z - d / 2, w, Y0, floors, fh, cols, C.glass, trim, 1.5, 1.7, -1, 0);
  windowsX(x + w / 2, z, d, Y0, floors, fh, sideCols, C.glass, trim, 1.3, 1.7, 1, openGround ? 1 : 0);
  windowsX(x - w / 2, z, d, Y0, floors, fh, sideCols, C.glass, trim, 1.3, 1.7, -1, openGround ? 1 : 0);

  if (openGround) {
    box(w, gh, 0.6, body, x, Y0 + gh / 2, z - d / 2 + 0.3);
    box(0.6, gh, d, body, x - w / 2 + 0.3, Y0 + gh / 2, z);
    box(0.6, gh, d, body, x + w / 2 - 0.3, Y0 + gh / 2, z);
    box(0.75, gh, 0.75, C.white, x - w / 2 + 0.45, Y0 + gh / 2, z + d / 2 - 0.45);
    box(0.75, gh, 0.75, C.white, x + w / 2 - 0.45, Y0 + gh / 2, z + d / 2 - 0.45);
    box(0.75, gh, 0.75, C.white, x, Y0 + gh / 2, z + d / 2 - 0.45);
    box(w, 0.45, 0.8, C.white, x, Y0 + gh + 0.08, z + d / 2 - 0.45);
    box(w - 0.7, 0.08, d - 0.7, C.cream, x, Y0 + 0.04, z);
    box(5.2, 0.28, 1.1, C.white, x, Y0 - 0.14, z + d / 2 + 0.55);
    box(6.0, 0.28, 1.7, C.white, x, Y0 - 0.42, z + d / 2 + 0.85);
  } else {
    box(w - 3.2, 2.5, 0.22, C.glass, x, Y0 + 1.45, z + d / 2 + 0.05);
    for (let i = 1; i < 4; i++) {
      box(0.2, 2.5, 0.32, trim, x - (w - 3.2) / 2 + (w - 3.2) * i / 4, Y0 + 1.45, z + d / 2 + 0.1);
    }
    box(w - 4.4, 0.2, 2.0, accent, x, Y0 + 3.0, z + d / 2 + 1.0);
  }

  box(w, 1.0, 0.34, trim, x, top + 1.0, z + d / 2 - 0.17);
  box(w, 1.0, 0.34, trim, x, top + 1.0, z - d / 2 + 0.17);
  box(0.34, 1.0, d, trim, x - w / 2 + 0.17, top + 1.0, z);
  box(0.34, 1.0, d, trim, x + w / 2 - 0.17, top + 1.0, z);

  return { x, z, w, d, top, H, Y0, fh, gh };
}

function roofKit(x, z, top, w, d) {
  /* 屋顶草皮与露台铺装 */
  box(w * 0.44, 0.1, d * 0.48, C.grass, x - w * 0.25, top + 0.05, z + d * 0.24);
  box(w * 0.46, 0.14, d * 0.5, C.cream, x + w * 0.24, top + 0.07, z - d * 0.22);
  /* 水箱 / 空调机组 / 天线 */
  cyl(1.25, 1.25, 1.9, 10, C.cream, x - w * 0.24, top + 1.5, z - d * 0.2);
  box(2.0, 1.1, 1.7, C.metal, x + w * 0.22, top + 1.1, z - d * 0.14);
  box(0.14, 3.2, 0.14, C.metal, x + w * 0.3, top + 2.5, z + d * 0.2);
  sph(0.24, C.berry, x + w * 0.3, top + 4.1, z + d * 0.2, 8, 6);
  /* 屋顶花园：树 + 遮阳桌 + 花箱 */
  tree(x - w * 0.28, z + d * 0.24, 0.62, top + 0.1);
  tableSet(x + w * 0.12, z + d * 0.24, top + 0.14, 2, C.white, 0.55);
  umbrella(x + w * 0.12, z + d * 0.24, top + 0.14, 1.1, C.cream);
  flowerBox(x + w * 0.34, top + 0.14, z + d * 0.06, 2.0, 0.5);
  bush(x - w * 0.06, z - d * 0.32, 0.55, top + 0.1);
}

function balcony(x, z, w, y, color = C.white, depth = 1.8) {
  box(w, 0.24, depth, color, x, y, z);
  rail('x', w, x, y + 0.12, z + depth / 2 - 0.09, C.metal, 0.95);
  rail('z', depth, x - w / 2 + 0.09, y + 0.12, z, C.metal, 0.95);
  rail('z', depth, x + w / 2 - 0.09, y + 0.12, z, C.metal, 0.95);
  box(0.3, 0.7, 0.3, color, x - w / 2 + 0.45, y - 0.48, z + depth / 2 - 0.4);
  box(0.3, 0.7, 0.3, color, x + w / 2 - 0.45, y - 0.48, z + depth / 2 - 0.4);
  flowerBox(x + w * 0.26, y + 0.12, z + depth / 2 - 0.34, 1.3, 0.55);
}

/* ── B1 蓝楼（办公，底层开敞） ───────────────────────── */
const b1 = tower({ x: -26, z: -13, w: 16, d: 13, floors: 5, body: C.blue, trim: C.white, accent: C.blueDeep, cols: 4, sideCols: 3, openGround: true });
roofKit(b1.x, b1.z, b1.top, 16, 13);

/* 办公内景 */
(function office() {
  const fy = 0.95;
  /* 近景浅隔墙，避免室内黑洞 */
  box(15.4, 3.05, 0.4, C.cream, -26, fy + 1.5, -12.6);
  box(15.4, 0.35, 0.5, C.wood, -26, fy + 3.0, -12.6);
  ceilLight(-26, fy + 3.1, -9.6, 9.0, 4.0);
  /* 隔墙上的挂画 */
  box(2.4, 1.4, 0.1, C.white, -22.6, fy + 2.0, -12.38);
  box(2.0, 1.05, 0.06, C.blue, -22.6, fy + 2.0, -12.32);
  box(1.6, 0.75, 0.06, C.coral, -25.6, fy + 2.0, -12.32);
  box(1.6, 0.75, 0.06, C.yellow, -19.6, fy + 2.0, -12.32);
  box(4.4, 1.05, 1.1, C.cream, -22.4, fy + 0.53, -8.4);
  box(4.7, 0.12, 1.4, C.wood, -22.4, fy + 1.1, -8.4);
  box(0.06, 0.5, 0.9, C.blueDeep, -22.4, fy + 0.62, -7.88);
  box(0.9, 0.55, 0.62, C.dark, -23.4, fy + 1.28, -8.4);
  box(0.78, 0.42, 0.04, C.glassDeep, -23.4, fy + 1.28, -8.06);
  cyl(0.34, 0.28, 0.5, 8, C.white, -20.6, fy + 1.42, -8.4);
  sph(0.42, C.green, -20.6, fy + 1.86, -8.4, 8, 6);

  /* 左侧书墙 */
  box(0.5, 2.5, 4.6, C.wood, -33.3, fy + 1.25, -10.2);
  for (let i = 0; i < 4; i++) box(0.42, 0.08, 4.4, C.cream, -33.2, fy + 0.55 + i * 0.62, -10.2);
  const bookCols = [C.coral, C.blue, C.yellow, C.cream, C.berryDeep, C.greenDeep];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 14; j++) {
      box(0.3, 0.44, 0.28, bookCols[(i * 3 + j) % 6], -33.2, fy + 0.82 + i * 0.62, -12.2 + j * 0.3);
    }
  }

  /* 办公桌 */
  [[-30.0, -10.4], [-25.4, -10.9], [-20.6, -10.3]].forEach(([dx, dz], i) => {
    box(3.2, 0.12, 1.6, C.white, dx, fy + 0.78, dz);
    [[-1.4, -0.65], [1.4, -0.65], [-1.4, 0.65], [1.4, 0.65]].forEach(([lx, lz]) => {
      box(0.1, 0.72, 0.1, C.metal, dx + lx, fy + 0.4, dz + lz);
    });
    box(0.9, 0.56, 0.1, C.dark, dx - 0.2, fy + 1.14, dz - 0.62);
    box(0.8, 0.44, 0.04, C.glassDeep, dx - 0.2, fy + 1.14, dz - 0.7);
    box(0.1, 0.2, 0.1, C.metal, dx - 0.2, fy + 0.94, dz - 0.62);
    box(0.4, 0.4, 0.4, C.coral, dx - 0.2, fy + 0.55, dz + 1.15);
    box(0.4, 0.46, 0.08, C.coral, dx - 0.2, fy + 0.86, dz + 1.34);
    box(0.34, 0.06, 0.3, C.cream, dx + 1.1, fy + 0.86, dz + 0.2);
    if (i === 1) {
      box(0.5, 0.6, 0.45, C.cream, dx + 1.2, fy + 1.14, dz - 0.35);
      sph(0.3, C.greenDeep, dx + 1.2, fy + 1.5, dz - 0.35, 8, 6);
    }
  });

  box(11, 0.04, 5.2, C.white, -25.2, fy + 0.03, -9.8);
  box(0.1, 0.7, 0.1, C.metal, -30.0, fy + 2.95, -10.4);
  box(0.8, 0.22, 0.8, C.cream, -30.0, fy + 2.55, -10.4);
  box(0.1, 0.7, 0.1, C.metal, -20.6, fy + 2.95, -10.3);
  box(0.8, 0.22, 0.8, C.cream, -20.6, fy + 2.55, -10.3);
  cyl(0.5, 0.42, 0.9, 8, C.white, -19.2, fy + 0.45, -8.2);
  sph(0.95, C.greenDeep, -19.2, fy + 1.55, -8.2, 8, 6);
  cyl(0.4, 0.34, 0.7, 8, C.white, -31.6, fy + 0.35, -8.0);
  sph(0.75, C.green, -31.6, fy + 1.25, -8.0, 8, 6);
  box(4.8, 0.1, 0.12, C.cream, -22.4, fy + 2.9, -7.4);
})();

/* ── B2 黄楼（咖啡吧 + 露台 + 屋顶餐厅） ─────────────── */
const b2 = tower({ x: -4, z: -16, w: 18, d: 15, floors: 6, body: C.yellow, trim: C.cream, accent: C.yellowDeep, cols: 5, sideCols: 3, openGround: true });

(function cafe() {
  const fy = 0.95;
  box(17.4, 3.05, 0.4, C.cream, -4, fy + 1.5, -14.4);
  ceilLight(-4, fy + 3.1, -10.4, 12.0, 5.0);
  /* 吧台后墙招牌 */
  box(6.0, 0.7, 0.12, C.berry, -5.2, fy + 2.95, -14.16);
  signPlane('COFFEE & BREAD', -5.2, fy + 2.95, -14.08, 4.6, 0.5, '#d24572', '#fff4e2');
  box(9.6, 1.15, 1.15, C.cream, -5.2, fy + 0.57, -11.6);
  box(10.0, 0.13, 1.45, C.wood, -5.2, fy + 1.2, -11.6);
  box(9.4, 0.5, 0.1, C.berry, -5.2, fy + 0.72, -10.98);
  box(1.1, 0.62, 0.75, C.metal, -8.2, fy + 1.58, -11.6);
  box(0.5, 0.28, 0.5, C.dark, -8.2, fy + 1.32, -11.6);
  box(0.45, 0.7, 0.45, C.cream, -7.2, fy + 1.62, -11.6);
  box(2.5, 0.32, 1.1, C.cream, -2.6, fy + 1.42, -11.6);
  glass(2.4, 0.75, 1.05, -2.6, fy + 1.95, -11.6);
  for (let i = 0; i < 4; i++) box(0.28, 0.22, 0.28, [C.berry, C.yellow, C.cream, C.coral][i], -3.5 + i * 0.55, fy + 1.72, -11.6);

  box(9.6, 1.7, 0.4, C.wood, -5.2, fy + 2.55, -13.1);
  for (let i = 0; i < 3; i++) box(9.2, 0.08, 0.4, C.cream, -5.2, fy + 2.0 + i * 0.5, -13.1);
  for (let i = 0; i < 16; i++) {
    cyl(0.11, 0.09, 0.2, 6, C.white, -9.2 + (i % 8) * 1.05, fy + 2.15 + Math.floor(i / 8) * 0.5, -13.1);
  }
  box(3.4, 1.1, 0.1, C.dark, -5.2, fy + 2.9, -13.02);
  for (let i = 0; i < 3; i++) box(2.6, 0.09, 0.04, C.cream, -5.2, fy + 2.62 - i * 0.24, -12.95);

  tableSet(-9.4, -9.6, fy, 2, C.cream, 0.78);
  tableSet(-5.6, -9.4, fy, 4, C.cream, 0.82);
  tableSet(-1.4, -9.6, fy, 2, C.cream, 0.78);
  [-9.4, -5.6, -1.4].forEach(px => {
    box(0.1, 1.0, 0.1, C.metal, px, fy + 3.1, -9.6);
    box(0.72, 0.3, 0.72, C.dark, px, fy + 2.5, -9.6);
    box(0.6, 0.06, 0.6, C.cream, px, fy + 2.36, -9.6);
  });
  cyl(0.55, 0.46, 1.0, 8, C.white, 2.4, fy + 0.5, -9.2);
  sph(1.05, C.green, 2.4, fy + 1.7, -9.2, 8, 6);
  box(0.12, 1.5, 1.1, C.dark, -12.6, fy + 1.6, -10.4);
  for (let i = 0; i < 3; i++) box(0.04, 0.08, 0.75, C.cream, -12.5, fy + 2.05 - i * 0.28, -10.4);

  /* 户外座位 */
  tableSet(-9.8, -3.4, 0, 2, C.white, 0.8);
  umbrella(-9.8, -3.4, 0, 1.9, C.cream);
  tableSet(-6.2, -2.2, 0, 2, C.white, 0.8);
  umbrella(-6.2, -2.2, 0, 1.9, C.berry);
  flowerBox(-12.6, 0, -4.4, 2.4, 0.8);
})();

/* 各层露台 */
(function terraces() {
  const zf = b2.z + b2.d / 2;
  const zc = zf + 1.0;
  [1, 2, 3, 4].forEach((lv, i) => {
    const y = b2.Y0 + lv * b2.fh;
    box(10.4, 0.18, 2.0, C.cream, b2.x, y, zc);
    rail('x', 10.4, b2.x, y + 0.09, zc + 0.95, C.cream, 0.9);
    rail('z', 2.0, b2.x - 5.15, y + 0.09, zc, C.cream, 0.9);
    rail('z', 2.0, b2.x + 5.15, y + 0.09, zc, C.cream, 0.9);
    tableSet(b2.x - 2.6, zc, y + 0.09, 2, C.white, 0.58);
    umbrella(b2.x - 2.6, zc, y + 0.09, 1.25, i % 2 ? C.berry : C.cream);
    flowerBox(b2.x + 2.6, y + 0.09, zc + 0.62, 3.0, 0.45);
    box(0.26, 1.3, 0.26, C.cream, b2.x - 4.9, y - 0.8, zc + 0.8);
    box(0.26, 1.3, 0.26, C.cream, b2.x + 4.9, y - 0.8, zc + 0.8);
    canopy(b2.x, y + 2.5, zf + 0.2, 7.0, 1.5, i % 2 ? [C.yellow, C.cream] : [C.cream, C.yellow]);
  });
  stairs(2.4, 1.6, 0, 13, 0.31, 0.6, 2.3, C.white, -1);
})();

/* 屋顶餐厅 */
(function roofDining() {
  const y = b2.top + 0.5;
  const cz = b2.z;
  box(15.4, 0.24, 9.8, 0xf0dcbe, b2.x, y + 0.12, cz);
  for (let i = 0; i < 9; i++) box(14.6, 0.05, 0.16, 0xe6cda6, b2.x, y + 0.26, cz - 4.0 + i * 1.0);
  [[-7.2, -4.4], [7.2, -4.4], [-7.2, 4.4], [7.2, 4.4], [0, -4.4], [0, 4.4]].forEach(([ox, oz]) => {
    box(0.34, 3.0, 0.34, C.white, b2.x + ox, y + 1.7, cz + oz);
  });
  glass(14.4, 2.8, 0.08, b2.x, y + 1.7, cz - 4.4);
  glass(0.08, 2.8, 8.8, b2.x - 7.2, y + 1.7, cz);
  glass(0.08, 2.8, 8.8, b2.x + 7.2, y + 1.7, cz);
  glassRail('x', 14.4, b2.x, y + 0.24, cz + 4.4, 1.0);

  for (let i = 0; i <= 10; i++) {
    box(0.22, 0.2, 9.4, C.cream, b2.x - 7.0 + i * 1.4, y + 3.28, cz);
  }
  box(15.0, 0.22, 0.26, C.cream, b2.x, y + 3.28, cz - 4.5);
  box(15.0, 0.22, 0.26, C.cream, b2.x, y + 3.28, cz + 4.5);

  box(6.2, 1.05, 1.0, C.berry, b2.x - 0.4, y + 0.76, cz - 3.3);
  box(6.5, 0.12, 1.2, C.cream, b2.x - 0.4, y + 1.36, cz - 3.3);
  for (let i = 0; i < 3; i++) cyl(0.1, 0.09, 0.18, 6, C.white, b2.x - 2.6 + i * 1.1, y + 1.5, cz - 3.3);

  tableSet(b2.x - 4.4, cz - 0.6, y + 0.24, 2, C.cream, 0.66);
  tableSet(b2.x - 1.2, cz + 0.6, y + 0.24, 2, C.cream, 0.66);
  tableSet(b2.x + 2.6, cz - 0.8, y + 0.24, 2, C.cream, 0.66);
  tableSet(b2.x + 5.4, cz + 1.2, y + 0.24, 2, C.cream, 0.66);
  flowerBox(b2.x + 5.8, y + 0.24, cz - 3.6, 1.8, 0.6);
  cyl(0.5, 0.42, 0.9, 8, C.white, b2.x - 6.2, y + 0.7, cz + 2.6);
  sph(0.9, C.green, b2.x - 6.2, y + 1.8, cz + 2.6, 8, 6);

  box(4.6, 0.9, 0.12, C.cream, b2.x, y + 2.9, cz + 4.5);
  signPlane('ROOFTOP', b2.x, y + 2.9, cz + 4.58, 3.6, 0.58, '#fff8ea', '#d24572');
})();

/* ── B4 珊瑚楼 ──────────────────────────────────────── */
/* B4 位置：REPLACE 模式把这栋楼腾空，留给地标 */
if (!REPLACE_B4) {
  const b4 = tower({ x: 34, z: -22, w: 13, d: 12, floors: 6, fh: 3.1, body: C.coral, trim: C.cream, accent: C.berry, cols: 3, sideCols: 3 });
  roofKit(b4.x, b4.z, b4.top, 13, 12);
  balcony(b4.x, b4.z + b4.d / 2 + 0.9, 7.2, b4.Y0 + 9.3 + 1.55, C.cream);
  balcony(b4.x, b4.z + b4.d / 2 + 0.9, 7.2, b4.Y0 + 15.5 + 1.55, C.cream);
}

/* ── B5 后侧高楼 ────────────────────────────────────── */
const b5 = tower({ x: 7, z: -33, w: 20, d: 10, floors: 7, fh: 3.4, body: C.blueLite, trim: C.white, accent: C.blue, cols: 5, sideCols: 2 });
box(3.6, 2.2, 3.0, C.blue, b5.x + 4.2, b5.top + 1.6, b5.z - 1.6);
box(4.0, 0.22, 3.4, C.white, b5.x + 4.2, b5.top + 2.8, b5.z - 1.6);
rail('x', 9.0, b5.x - 3.0, b5.top + 0.6, b5.z + b5.d / 2 - 0.2, C.white, 0.75);
flowerBox(b5.x - 3.0, b5.top + 0.6, b5.z + b5.d / 2 - 0.25, 6.6, 0.45, true);

/* ═══════════════════════════════════════════════════════
   6. 开放式建筑（剖开的中景楼）
   ═══════════════════════════════════════════════════════ */
(function openBuilding() {
  const cx = 16, cz = -10, w = 14, d = 12;
  const zBack = cz - d / 2, zFront = cz + d / 2;
  const H = 10.4;
  const slabs = [0.3, 3.7, 7.1];

  box(w, H, 0.65, C.coral, cx, H / 2 + 0.15, zBack + 0.32);
  box(0.65, H, d, C.coral, cx - w / 2 + 0.32, H / 2 + 0.15, cz);
  box(0.65, H, d, C.coral, cx + w / 2 - 0.32, H / 2 + 0.15, cz);
  slabs.forEach((y, i) => box(w - 0.2, 0.5, d - 0.2, i === 0 ? C.cream : C.white, cx, y, cz));
  box(w + 0.7, 0.55, d + 0.7, C.cream, cx, 10.5, cz);
  box(w + 1.0, 0.22, d + 1.0, C.coralDeep, cx, 10.86, cz);

  [cx - w / 2 + 0.4, cx, cx + w / 2 - 0.4].forEach(px => {
    box(0.62, H + 0.3, 0.62, C.white, px, (H + 0.3) / 2, zFront);
  });
  [3.95, 7.35, 10.2].forEach(y => box(w, 0.34, 0.55, C.white, cx, y, zFront));

  rail('x', w - 1.2, cx, 3.95 + 0.17, zFront, C.metal, 0.95);
  rail('x', w - 1.2, cx, 7.35 + 0.17, zFront, C.metal, 0.95);
  flowerBox(cx - 3.0, 3.95 + 0.17, zFront + 0.1, 3.2, 0.5, true);
  flowerBox(cx + 3.2, 7.35 + 0.17, zFront + 0.1, 2.8, 0.5, true);

  /* 室内楼梯 */
  stairs(cx - 4.4, -13.6, 0.55, 10, 0.315, 0.62, 2.4, C.white, 1);
  stairs(cx + 3.4, -14.2, 3.95, 10, 0.315, 0.62, 2.4, C.white, 1);

  /* 一层 */
  box(4.6, 1.15, 1.4, C.cream, cx - 3.4, 1.13, zBack + 2.4);
  box(4.9, 0.16, 1.7, C.wood, cx - 3.4, 1.79, zBack + 2.4);
  box(0.9, 0.5, 0.9, C.metal, cx - 5.0, 2.1, zBack + 2.4);
  for (let i = 0; i < 4; i++) cyl(0.13, 0.13, 0.3, 8, C.berry, cx - 2.2 + i * 0.42, 2.0, zBack + 2.4);
  box(3.4, 2.3, 0.5, C.wood, cx + 4.8, 1.7, zBack + 0.6);
  for (let i = 0; i < 3; i++) box(3.0, 0.1, 0.46, C.cream, cx + 4.8, 0.95 + i * 0.7, zBack + 0.62);
  box(3.4, 0.12, 2.4, C.coral, cx + 1.6, 0.62, cz + 3.0);
  box(2.8, 0.62, 1.0, C.blueLite, cx + 1.6, 0.95, cz + 4.0);
  box(2.8, 0.9, 0.3, C.blueLite, cx + 1.6, 1.25, cz + 4.45);
  box(1.7, 0.16, 1.1, C.wood, cx + 1.6, 0.86, cz + 2.0);
  tableSet(cx - 3.6, cz + 3.2, 0.55, 2, C.cream, 0.7);
  cyl(0.5, 0.42, 0.9, 8, C.cream, cx + 6.2, 1.0, zFront - 1.2);
  sph(0.95, C.green, cx + 6.2, 2.1, zFront - 1.2, 8, 6);

  /* 二层 */
  const y2 = 3.95;
  [[-4.2, 0.6], [-0.6, 0.6], [3.0, -2.6]].forEach(([ox, oz]) => {
    box(3.0, 0.14, 1.5, C.white, cx + ox, y2 + 0.78, cz + oz);
    [[-1.3, -0.6], [1.3, -0.6], [-1.3, 0.6], [1.3, 0.6]].forEach(([lx, lz]) => {
      box(0.12, 0.72, 0.12, C.metal, cx + ox + lx, y2 + 0.4, cz + oz + lz);
    });
    box(0.95, 0.62, 0.12, C.dark, cx + ox, y2 + 1.16, cz + oz - 0.25);
    box(0.85, 0.5, 0.04, C.glassDeep, cx + ox, y2 + 1.16, cz + oz - 0.32);
    box(0.42, 0.42, 0.42, C.coral, cx + ox + 1.1, y2 + 0.9, cz + oz + 1.1);
    box(0.42, 0.5, 0.1, C.coral, cx + ox + 1.1, y2 + 1.2, cz + oz + 1.3);
  });
  box(0.25, 1.9, 4.2, C.cream, cx + 5.6, y2 + 0.95, cz + 2.2);
  cyl(0.5, 0.42, 0.85, 8, C.cream, cx + 5.4, y2 + 0.43, cz - 3.4);
  sph(0.9, C.green, cx + 5.4, y2 + 1.5, cz - 3.4, 8, 6);

  /* 三层 */
  const y3 = 7.35;
  box(9.0, 2.4, 0.12, C.glassDeep, cx, y3 + 1.4, zBack + 0.75);
  for (let i = 0; i < 3; i++) box(0.12, 2.4, 0.16, C.white, cx - 4.5 + i * 4.5, y3 + 1.4, zBack + 0.78);
  [[-4.2, 1.6], [-0.4, 1.6]].forEach(([ox, oz]) => {
    box(2.2, 0.28, 1.1, C.white, cx + ox, y3 + 0.62, cz + oz);
    box(2.0, 0.1, 0.9, C.dark, cx + ox, y3 + 0.78, cz + oz);
    box(0.14, 1.0, 0.14, C.metal, cx + ox - 0.9, y3 + 1.1, cz + oz - 0.3);
    box(0.14, 1.0, 0.14, C.metal, cx + ox + 0.9, y3 + 1.1, cz + oz - 0.3);
    box(2.0, 0.14, 0.2, C.coral, cx + ox, y3 + 1.62, cz + oz - 0.3);
  });
  box(3.2, 0.16, 0.7, C.metal, cx + 4.2, y3 + 0.85, cz + 2.4);
  for (let i = 0; i < 5; i++) {
    cyl(0.2, 0.2, 0.3, 8, C.berryDeep, cx + 3.0 + i * 0.6, y3 + 1.05, cz + 2.4, 0, 0, Math.PI / 2);
  }
  box(2.4, 0.3, 0.9, C.coral, cx + 1.2, y3 + 0.65, cz - 2.6);
  box(0.3, 0.55, 0.7, C.metal, cx + 0.2, y3 + 0.3, cz - 2.6);
  for (let i = 0; i < 3; i++) box(1.0, 0.06, 2.0, i % 2 ? C.blueLite : C.coral, cx - 4.6 + i * 1.3, y3 + 0.33, cz + 4.2);
  [-3.0, 3.0].forEach(px => {
    box(0.16, 1.2, 0.16, C.metal, cx + px, y3 + 2.9, cz);
    box(0.9, 0.3, 0.9, C.cream, cx + px, y3 + 2.2, cz);
  });

  /* 屋顶露台 */
  const y4 = 10.75;
  rail('x', w, cx, y4, zFront - 0.2, C.white, 0.95);
  rail('z', d, cx - w / 2 + 0.2, y4, cz, C.white, 0.95);
  rail('z', d, cx + w / 2 - 0.2, y4, cz, C.white, 0.95);
  tableSet(cx - 2.6, cz - 1.0, y4, 2, C.cream);
  umbrella(cx - 2.6, cz - 1.0, y4, 2.0, C.coral);
  flowerBox(cx + 3.6, y4, cz + 2.2, 2.6, 0.7);
  tree(cx + 4.4, cz - 2.8, 0.8, y4);
})();

/* ═══════════════════════════════════════════════════════
   7. 空中连廊
   ═══════════════════════════════════════════════════════ */
function doorway(x, y, z, ry, w = 1.6, h = 2.2) {
  const s = Math.sin(ry), c = Math.cos(ry);
  box(w + 0.5, h + 0.5, 0.12, C.white, x + s * 0.05, y + h / 2, z + c * 0.05, 0, ry, 0);
  box(w, h, 0.12, C.dark, x + s * 0.12, y + h / 2, z + c * 0.12, 0, ry, 0);
  box(w, h - 1.2, 0.06, C.glassDeep, x + s * 0.18, y + h / 2, z + c * 0.18, 0, ry, 0);
}

function skyBridge(x1, x2, z, y, color = C.white, width = 2.6) {
  const len = x2 - x1;
  const cx = (x1 + x2) / 2;
  box(len, 0.36, width, color, cx, y, z);
  glass(len, 0.95, 0.08, cx, y + 0.65, z + width / 2 - 0.07);
  glass(len, 0.95, 0.08, cx, y + 0.65, z - width / 2 + 0.07);
  box(len, 0.1, 0.1, C.metal, cx, y + 1.14, z + width / 2 - 0.07);
  box(len, 0.1, 0.1, C.metal, cx, y + 1.14, z - width / 2 + 0.07);
  for (let i = 0; i <= 4; i++) box(0.14, 0.3, width, C.metal, x1 + len * i / 4, y - 0.31, z);
  box(1.4, 0.3, width + 0.6, color, x1 + 0.5, y - 0.06, z);
  box(1.4, 0.3, width + 0.6, color, x2 - 0.5, y - 0.06, z);
}

skyBridge(-18.3, -12.7, -12.2, 9.9);
doorway(-18.02, 8.8, -12.2, -Math.PI / 2);
doorway(-12.98, 8.8, -12.2, Math.PI / 2);

skyBridge(5.2, 8.7, -9.4, 7.6);
doorway(5.02, 6.5, -9.4, Math.PI / 2);
doorway(8.98, 6.5, -9.4, -Math.PI / 2);

/* ═══════════════════════════════════════════════════════
   8. 前排商铺
   ═══════════════════════════════════════════════════════ */
const SHOP_Z = 14;
const SHOP_D = 7;

const shopDefs = [
  { x: -33, h: 5.2, body: C.coral,  accent: C.berryDeep,  label: 'CAFE',    fg: '#fff4e2', hero: 'cafe',   roof: 'seat' },
  { x: -24, h: 4.8, body: C.yellow, accent: C.coralDeep,  label: 'BAKERY',  fg: '#8a4a2f', hero: 'bakery', roof: 'garden' },
  { x: -15, h: 5.4, body: C.blue,   accent: C.blueDeep,   label: 'BOOKS',   fg: '#ffffff', hero: 'books',  roof: 'garden' },
  { x: -6,  h: 4.6, body: C.cream,  accent: C.berry,      label: 'FLOWERS', fg: '#cf3d6d', hero: null,     roof: 'garden' },
  { x: 3,   h: 5.0, body: C.yellow, accent: C.berryDeep,  label: 'DELI',    fg: '#8a4a2f', hero: null,     roof: 'seat' },
  { x: 12,  h: 4.6, body: C.blue,   accent: C.coral,      label: 'TOYS',    fg: '#ffffff', hero: null,     roof: 'garden' },
  { x: 21,  h: 5.2, body: C.coral,  accent: C.yellow,     label: 'MARKET',  fg: '#fff4e2', hero: null,     roof: 'seat' },
  { x: 30,  h: 4.6, body: C.cream,  accent: C.blue,       label: 'STUDIO',  fg: '#2c6fba', hero: null,     roof: 'garden' }
];

function shopInterior(kind, x, zf) {
  const y = 0.62;
  /* 明亮的店内背墙 */
  box(6.8, 3.3, 0.35, C.cream, x - 0.6, y + 1.75, zf - 2.55);
  ceilLight(x - 0.6, y + 3.35, zf - 1.3, 4.6, 1.6);
  if (kind === 'cafe') {
    box(3.6, 1.0, 0.9, C.cream, x - 0.6, y + 0.5, zf - 1.5);
    box(3.8, 0.1, 1.1, C.wood, x - 0.6, y + 1.05, zf - 1.5);
    box(0.7, 0.45, 0.55, C.metal, x - 1.8, y + 1.3, zf - 1.5);
    for (let i = 0; i < 3; i++) cyl(0.11, 0.1, 0.2, 6, C.berry, x + 0.5 + i * 0.4, y + 1.2, zf - 1.5);
    box(3.4, 1.5, 0.35, C.wood, x, y + 1.9, zf - 2.3);
    for (let i = 0; i < 2; i++) box(3.2, 0.07, 0.35, C.cream, x, y + 1.5 + i * 0.55, zf - 2.3);
    for (let i = 0; i < 8; i++) cyl(0.1, 0.08, 0.18, 6, C.white, x - 1.4 + i * 0.4, y + 1.62, zf - 2.3);
    box(0.9, 0.7, 0.5, C.dark, x + 1.9, y + 1.2, zf - 1.2);
  } else if (kind === 'bakery') {
    box(3.8, 0.9, 1.0, C.cream, x, y + 0.45, zf - 1.4);
    box(4.0, 0.1, 1.2, C.wood, x, y + 0.95, zf - 1.4);
    for (let i = 0; i < 7; i++) box(0.34, 0.24, 0.3, C.wood, x - 1.5 + i * 0.5, y + 1.12, zf - 1.4);
    box(3.6, 2.0, 0.4, C.wood, x, y + 1.9, zf - 2.35);
    for (let i = 0; i < 3; i++) box(3.4, 0.07, 0.4, C.cream, x, y + 1.25 + i * 0.55, zf - 2.35);
    for (let i = 0; i < 9; i++) box(0.3, 0.22, 0.28, C.yellow, x - 1.5 + i * 0.36, y + 1.4, zf - 2.35);
    box(0.8, 0.5, 0.4, C.cream, x + 2.0, y + 1.2, zf - 1.0);
  } else if (kind === 'books') {
    box(3.4, 2.3, 0.4, C.wood, x - 1.2, y + 1.3, zf - 2.3);
    for (let i = 0; i < 4; i++) box(3.2, 0.07, 0.4, C.cream, x - 1.2, y + 0.45 + i * 0.55, zf - 2.3);
    const cols2 = [C.coral, C.yellow, C.blueDeep, C.berryDeep, C.greenDeep, C.cream];
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 11; i++) {
        box(0.22, 0.4, 0.26, cols2[(r + i) % 6], x - 2.7 + i * 0.28, y + 0.68 + r * 0.55, zf - 2.3);
      }
    }
    box(2.0, 0.7, 0.9, C.wood, x + 1.6, y + 0.35, zf - 1.6);
    box(0.9, 0.12, 1.2, C.white, x + 1.6, y + 0.78, zf - 1.2);
  }
}

shopDefs.forEach((s, idx) => {
  const { x, h, body, accent, label, fg, hero, roof } = s;
  const w = 7.4, z = SHOP_Z, d = SHOP_D;
  const zf = z + d / 2;
  const top = 0.55 + h;

  box(w + 0.6, 0.55, d + 0.6, C.white, x, 0.28, z);
  box(w, h, d, body, x, 0.55 + h / 2, z);
  box(w + 0.44, 0.3, d + 0.44, C.white, x, top + 0.15, z);

  /* 门 */
  const dx = x + w / 2 - 1.35;
  box(1.5, 2.45, 0.34, C.white, dx, 1.78, zf + 0.03);
  box(1.2, 2.3, 0.3, accent, dx, 1.72, zf + 0.06);
  glass(0.75, 1.5, 0.06, dx - 0.16, 1.85, zf + 0.16);
  box(0.06, 0.28, 0.08, C.metal, dx + 0.42, 1.5, zf + 0.22);

  /* 橱窗 */
  const ww = w - 3.3;
  glass(ww, 2.3, 0.08, x - 1.45, 1.75, zf + 0.02);
  box(ww + 0.3, 0.16, 0.34, C.white, x - 1.45, 0.62, zf + 0.1);
  box(ww + 0.3, 0.18, 0.3, C.white, x - 1.45, 2.92, zf + 0.06);
  box(0.14, 2.4, 0.26, C.white, x - 1.45 - ww / 2, 1.75, zf + 0.08);
  box(0.14, 2.4, 0.26, C.white, x - 1.45 + ww / 2, 1.75, zf + 0.08);
  box(0.1, 2.3, 0.2, C.white, x - 1.45, 1.75, zf + 0.07);

  shopInterior(hero, x, zf);

  if (hero !== 'books') awning(x - 0.6, 3.52, zf + 0.5, w - 1.9, 1.55, [accent, C.cream]);

  const sw = Math.min(w - 2.4, 4.6);
  const bgHex = '#' + (accent === C.cream ? 'd24572' : accent.toString(16).padStart(6, '0'));
  box(sw + 0.34, 1.05, 0.22, bgHex, x - 0.5, top - 0.66, zf + 0.1);
  signPlane(label, x - 0.5, top - 0.66, zf + 0.23, sw, 0.62, bgHex, '#fffaf0');
  bladeSign(label, x - w / 2 + 0.42, 2.95, zf + 0.62, 0.95, 0.34, accent === C.cream ? C.berry : accent, '#fff8ea');

  /* 屋顶铺装：座位款米色木平台，花园款草皮 */
  box(w - 1.5, 0.1, d - 1.5, roof === 'seat' ? C.cream : C.grass, x, top + 0.32, z);
  if (roof === 'seat') {
    rail('x', w - 0.6, x, top + 0.34, zf - 0.35, C.white, 0.85);
    rail('z', d - 0.9, x - w / 2 + 0.3, top + 0.34, z, C.white, 0.85);
    rail('z', d - 0.9, x + w / 2 - 0.3, top + 0.34, z, C.white, 0.85);
    tableSet(x - 1.1, z - 0.6, top + 0.34, 2, C.cream, 0.7);
    flowerBox(x + 2.2, top + 0.34, z + 1.4, 1.8, 0.8);
  } else {
    flowerBox(x - 1.6, top + 0.34, z + 1.6, 2.4, 0.9);
    flowerBox(x + 1.8, top + 0.34, z - 1.6, 2.4, 0.9);
    box(1.2, 0.5, 1.0, C.metal, x + 0.2, top + 0.6, z - 0.3);
    box(1.6, 0.7, 1.4, C.white, x + 2.4, top + 0.7, z + 1.4);
  }

  if (hero === 'cafe') {
    tableSet(x - 2.0, 19.6, 0, 2, C.white, 0.75);
    umbrella(x - 2.0, 19.6, 0, 1.7, C.berry);
    tableSet(x + 1.2, 20.0, 0, 2, C.white, 0.7);
    flowerBox(x + 3.2, 0, 18.6, 1.6, 0.7);
  }
  if (hero === 'bakery') {
    bench(x - 2.4, 19.4, 0);
    flowerBox(x + 1.0, 0, 18.6, 2.4, 0.7);
    box(1.8, 0.9, 0.7, C.wood, x + 2.6, 0.45, 18.9);
    for (let i = 0; i < 4; i++) box(0.3, 0.22, 0.28, C.yellow, x + 1.9 + i * 0.4, 1.02, 18.9);
  }
  if (hero === 'books') {
    bench(x + 2.2, 19.2, 0);
    box(0.9, 1.6, 0.9, C.white, x - 2.8, 0.8, 19.0);
    for (let i = 0; i < 3; i++) box(0.6, 0.26, 0.55, C.blueDeep, x - 2.8, 1.72 + i * 0.01, 19.0);
  }
  if (!hero) {
    flowerBox(x - 2.6, 0, 18.5, 1.9, 0.65);
    flowerBox(x + 2.6, 0, 18.5, 1.9, 0.65);
    tableSet(x - 1.0, 20.2, 0, 2, C.white, 0.6);
    umbrella(x - 1.0, 20.2, 0, 1.25, idx % 2 ? C.berry : C.cream);
    if (idx % 3 === 0) tableSet(x + 1.9, 19.4, 0, 2, C.white, 0.55);
  }
});

/* ═══════════════════════════════════════════════════════
   9. 广场
   ═══════════════════════════════════════════════════════ */
(function fountain() {
  const x = 12, z = 1.4;
  cyl(3.3, 3.4, 0.7, 16, C.white, x, 0.35, z);
  cyl(2.9, 2.9, 0.18, 16, C.glassDeep, x, 0.68, z);
  cyl(0.55, 0.75, 1.4, 10, C.white, x, 1.05, z);
  cyl(1.4, 1.4, 0.18, 14, C.white, x, 1.82, z);
  cyl(0.28, 0.38, 0.8, 8, C.white, x, 2.28, z);
  sph(0.4, C.glassDeep, x, 2.7, z, 8, 6);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.6;
    box(1.7, 0.38, 0.8, C.cream, x + Math.cos(a) * 4.4, 0.19, z + Math.sin(a) * 4.4, 0, -a, 0);
  }
  flowerBox(x - 5.4, 0, z + 4.8, 3.0, 0.8);
  flowerBox(x + 5.2, 0, z + 4.8, 3.0, 0.8);
})();

(function kiosk() {
  const x = 27, z = 3.4;
  box(4.2, 0.3, 3.6, C.white, x, 0.15, z);
  box(3.8, 2.6, 3.2, C.coral, x, 1.6, z);
  glass(3.0, 1.5, 0.1, x, 1.55, z + 1.63);
  box(3.9, 0.36, 3.7, C.cream, x, 3.05, z);
  awning(x, 3.3, z + 1.5, 3.6, 1.5, [C.cream, C.berry]);
  box(2.6, 0.8, 0.2, C.cream, x, 2.6, z + 1.63);
  signPlane('ICE CREAM', x, 2.6, z + 1.75, 2.2, 0.5, '#fff8ea', '#d24572');
  for (let i = 0; i < 3; i++) {
    cyl(0.14, 0.05, 0.5, 6, C.wood, x - 1.0 + i * 0.5, 1.85, z + 1.9);
    sph(0.22, [C.cream, C.berry, C.green][i], x - 1.0 + i * 0.5, 2.18, z + 1.9, 8, 6);
  }
})();

/* 底板左缘树带（绕开摩天轮底座） */
tree(-45.0, 8.4, 1.02);
tree(-45.6, -26.0, 0.95);
tree(-45.0, -31.0, 0.82);

/* 街区左前的草坡与小广场：草坪 + 两棵树 + 圆形花坛 */
lawn(-30.5, 3.2, 9.2, 4.8, 0.17);
tree(-33.6, 1.2, 0.95);
tree(-27.2, 5.4, 0.8);
roundBed(-23.6, 9.0, 1.4);

/* 底板后缘树带：把建筑群的轮廓包住 */
[-43.0, -37.0, -31.0, -25.0, -19.0, -12.5, -6.0, 0.5, 7.0, 13.5, 20.0, 26.5, 33.0, 39.5, 46.0].forEach((x, i) => {
  if (i % 2) tree(x, -45.4, 0.78);
  else { bush(x - 0.6, -45.2, 0.85); bush(x + 1.4, -45.6, 0.7); }
});

tree(-14.5, 11.6, 0.9);
tree(31.0, 9.0, 0.95);
tree(2.0, 10.6, 0.75);
tree(45.5, 9.2, 0.86);

lawn(-17.6, 6.9, 7.2, 4.0, 0.17);
tree(-19.4, 5.6, 0.82);
roundBed(-14.0, 12.4, 1.35);

planter(-21.5, 4.4, 2.6, 1.1);
planter(-13.0, 4.2, 2.6, 1.1);
planter(6.8, 9.4, 2.4, 1.1);
planter(17.6, 9.6, 2.4, 1.1);
hedge(-19.0, 18.7, 5.6, 'x', 0.12);
hedge(9.6, 18.7, 5.2, 'x', 0.12);
bush(-36.5, 15.6, 1.0);
bush(38.0, 15.4, 0.95);
bench(-15.6, 9.6, 0);
bench(-1.4, 9.6, 0);
bench(22.0, 9.4, 0);

tableSet(-2.0, 6.4, 0, 2, C.white, 0.72);
umbrella(-2.0, 6.4, 0, 1.7, C.cream);
tableSet(2.2, 7.4, 0, 2, C.white, 0.72);

for (let i = 0; i < 3; i++) {
  cyl(0.06, 0.06, 0.9, 6, C.metal, -12 + i * 0.9, 0.45, 16.4);
  box(0.9, 0.08, 0.08, C.metal, -12 + i * 0.9, 0.9, 16.4);
}

/* 广场市集：两顶条纹摊位帐篷 */
function stall(x, z, c1, c2, ry = 0) {
  box(3.0, 0.62, 2.0, C.wood, x, 0.31, z, 0, ry, 0);
  box(2.7, 0.1, 1.75, C.cream, x, 0.66, z, 0, ry, 0);
  box(0.14, 2.1, 0.14, C.metal, x - 1.3, 1.1, z - 0.85);
  box(0.14, 2.1, 0.14, C.metal, x + 1.3, 1.1, z - 0.85);
  box(3.4, 0.16, 2.4, c1, x, 2.26, z, 0, ry, 0);
  box(3.4, 0.22, 0.3, c2, x, 2.16, z + 1.05, 0, ry, 0);
  for (let i = 0; i < 3; i++) box(0.5, 0.24, 0.4, [PETALS[3], PETALS[0], C.cream][i], x - 0.8 + i * 0.8, 0.83, z);
}
stall(-7.4, 3.0, C.cream, C.coral);
stall(-10.4, 6.4, C.yellow, C.berry, 0.18);

person(-2.6, 4.2, C.coral, 0.4);
person(6.4, 4.0, C.blue, 2.2);
person(-11.4, 6.6, C.blueLite, 0.2);
person(15.2, 7.6, C.berry, 2.6);
person(-24.0, 19.8, C.coral, 0.9);
person(33.0, 19.6, C.yellow, 2.4);
person(-6.2, 8.6, C.yellow, 1.7);
person(-8.6, 1.6, C.blueDeep, 2.9);
person(4.4, 9.2, C.coral, 0.6);
person(19.6, 19.4, C.berry, 1.4);
person(-19.6, 19.2, C.greenDeep, 2.2);
person(28.4, 20.4, C.blue, 0.8);
person(41.0, 19.8, C.coralDeep, 2.6);

lamp(-40, 22.0);
lamp(-15, 22.0);
lamp(11, 22.0);
lamp(36, 22.0);
lamp(50, 22.0);
tree(-27, 21.6, 0.8);
tree(-3, 21.6, 0.78);
tree(24.5, 21.6, 0.8);
tree(46, 21.6, 0.78);

/* ═══════════════════════════════════════════════════════
   10. 摩天轮
   ═══════════════════════════════════════════════════════ */
const wheelGroup = new THREE.Group();
wheelGroup.position.set(-34, 0, -29.5);
wheelGroup.scale.setScalar(0.86);
ROOT.add(wheelGroup);

const gondolas = [];
(function ferris() {
  const g = wheelGroup;
  const R = 11.2;
  const hubY = 14.6;

  meshBox(g, 26, 0.7, 15, C.cream, 0, 0.35, 0);
  meshBox(g, 24, 0.3, 13, C.paper, 0, 0.78, 0);
  for (let i = 0; i < 5; i++) meshBox(g, 0.14, 1.1, 0.14, C.metal, -6.5 + i * 3.0, 1.0, 6.2);
  meshBox(g, 12.4, 0.12, 0.12, C.metal, -0.5, 1.5, 6.2);

  [-1, 1].forEach(sz => {
    beam(g, [0, hubY, sz * 1.6], [-6.0, 0.9, sz * 2.6], 0.6, C.berry);
    beam(g, [0, hubY, sz * 1.6], [6.0, 0.9, sz * 2.6], 0.6, C.berry);
    beam(g, [-3.7, 7.0, sz * 2.1], [3.7, 7.0, sz * 2.1], 0.42, C.berryDeep);
  });
  beam(g, [-3.7, 7.0, -2.1], [-3.7, 7.0, 2.1], 0.4, C.berryDeep);
  beam(g, [3.7, 7.0, -2.1], [3.7, 7.0, 2.1], 0.4, C.berryDeep);

  const wheel = new THREE.Group();
  wheel.position.y = hubY;
  g.add(wheel);
  wheelGroup.userData.wheel = wheel;

  [-1.05, 1.05].forEach(sz => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(R, 0.36, 8, 56), matFor(C.berry));
    t.position.z = sz;
    t.castShadow = true;
    wheel.add(t);
    const t2 = new THREE.Mesh(new THREE.TorusGeometry(R - 2.2, 0.22, 6, 48), matFor(C.cream));
    t2.position.z = sz;
    wheel.add(t2);
  });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = Math.cos(a) * R, y = Math.sin(a) * R;
    beam(wheel, [x, y, -1.05], [x, y, 1.05], 0.22, C.cream);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    [-1.05, 1.05].forEach(sz => {
      beam(wheel, [0, 0, sz], [Math.cos(a) * (R - 0.2), Math.sin(a) * (R - 0.2), sz], 0.26, i % 2 ? C.cream : C.berryDeep);
    });
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 3.6, 16), matFor(C.cream));
  axle.rotation.x = Math.PI / 2;
  axle.castShadow = true;
  wheel.add(axle);
  const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 3.9, 12), matFor(C.berry));
  hubCap.rotation.x = Math.PI / 2;
  wheel.add(hubCap);

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const gd = new THREE.Group();
    gd.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    const main = i % 2 ? C.cream : C.berry;
    const trim = i % 2 ? C.berry : C.cream;
    meshBox(gd, 0.18, 1.1, 0.18, C.metal, 0, -0.55, 0);
    meshBox(gd, 2.6, 0.4, 2.6, C.white, 0, -1.15, 0);
    meshBox(gd, 2.4, 2.1, 2.4, main, 0, -2.15, 0);
    meshBox(gd, 2.44, 0.8, 2.44, C.glassDeep, 0, -1.95, 0);
    meshBox(gd, 2.7, 0.34, 2.7, trim, 0, -3.3, 0);
    wheel.add(gd);
    gondolas.push(gd);
  }
})();

/* ═══════════════════════════════════════════════════════
   11. 巴士站 / 车辆
   ═══════════════════════════════════════════════════════ */
(function busStop() {
  const x = 30, z = 21.6;
  box(9.6, 0.34, 4.2, C.side, x, 0.17, z);
  box(9.6, 0.12, 2.6, C.curb, x, 0.36, z - 0.6);
  box(0.2, 3.0, 0.2, C.metal, x - 3.6, 1.5, z - 1.5);
  box(0.2, 3.0, 0.2, C.metal, x + 3.6, 1.5, z - 1.5);
  box(8.6, 0.3, 3.4, C.coral, x, 3.15, z - 0.3);
  box(8.6, 0.16, 0.4, C.cream, x, 3.0, z + 1.3);
  glass(7.4, 1.9, 0.1, x, 1.9, z - 1.6);
  box(7.4, 0.14, 0.18, C.metal, x, 2.9, z - 1.6);
  box(5.2, 0.16, 0.9, C.wood, x, 0.9, z - 1.0);
  box(0.3, 0.5, 0.7, C.metal, x - 2.2, 0.62, z - 1.0);
  box(0.3, 0.5, 0.7, C.metal, x + 2.2, 0.62, z - 1.0);
  box(0.16, 3.4, 0.16, C.metal, x + 4.7, 1.7, z + 1.1);
  box(1.5, 1.05, 0.12, C.berry, x + 4.7, 3.1, z + 1.1);
  signPlane('BUS', x + 4.7, 3.1, z + 1.17, 1.15, 0.52, '#d24572', '#fff4e2');
})();

const bus = new THREE.Group();
(function makeBus() {
  const g = bus;
  meshBox(g, 13.4, 2.7, 2.7, C.cream, 0, 2.05, 0);
  meshBox(g, 13.6, 0.55, 2.8, C.coral, 0, 1.05, 0);
  meshBox(g, 12.4, 0.95, 2.78, C.glassDeep, 0, 2.5, 0);
  meshBox(g, 13.6, 0.36, 2.86, C.coral, 0, 3.5, 0);
  meshBox(g, 3.0, 0.9, 2.74, C.blueDeep, 0, 2.45, 0.02);
  [[-4.2, 1.42], [4.0, 1.42], [-4.2, -1.42], [4.0, -1.42]].forEach(([x, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.34, 12), matFor(C.dark));
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.62, z);
    g.add(w);
  });
  g.position.set(-48, 0, 28.5);
})();
ROOT.add(bus);

function makeCar(color, z, speed, startX) {
  const g = new THREE.Group();
  meshBox(g, 3.8, 0.95, 1.85, color, 0, 0.85, 0);
  meshBox(g, 2.3, 0.85, 1.75, color, -0.15, 1.6, 0);
  meshBox(g, 2.0, 0.6, 1.8, C.glassDeep, -0.15, 1.72, 0);
  [[-1.25, 0.98], [1.25, 0.98], [-1.25, -0.98], [1.25, -0.98]].forEach(([x, z2]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 10), matFor(C.dark));
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.45, z2);
    g.add(w);
  });
  g.position.set(startX, 0, z);
  ROOT.add(g);
  return { g, speed };
}
const cars = [
  makeCar(C.berry, 25.2, -9, 44),
  makeCar(C.yellow, 25.2, -7.2, -20),
  makeCar(C.blue, 28.8, 8.5, 40),
  makeCar(C.coral, 28.8, 6.8, -44),
  makeCar(C.white, 25.2, -8.4, 10)
];

glows.forEach(g => ROOT.add(g));


/* ═══════════════════════════════════════════════════════
   11.5 城市地标：十八座外来地标，接入街区同一套堆块系统
   ═══════════════════════════════════════════════════════ */

/* 地标专用补充色 */
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
  water:    0x93cbec,
  waterDeep:0x6aaed8,
  sand:     0xe9d4a6,
  tile:     0x7d8794,
  tileDeep: 0x5f6874,
  brick:    0xc25a46,
  brickDeep:0xa2453a
};

/* 地标一律按 0.52 缩到街区尺度；GY 是地标所在的地面高度 */
const SC = 0.72;
const GY = 0.24;
let OX = 0, OZ = 0;

function B(w, h, d, color, x, y, z, rx, ry, rz) {
  const g = new THREE.BoxGeometry(w * SC, h * SC, d * SC);
  applyT(g, OX + x * SC, GY + y * SC, OZ + z * SC, rx || 0, ry || 0, rz || 0);
  push(g, color);
  return g;
}

function CY(rt, rb, h, seg, color, x, y, z, rx, ry, rz) {
  const g = new THREE.CylinderGeometry(rt * SC, rb * SC, h * SC, seg);
  applyT(g, OX + x * SC, GY + y * SC, OZ + z * SC, rx || 0, ry || 0, rz || 0);
  push(g, color);
  return g;
}

function SP(r, color, x, y, z, w, h) {
  const g = new THREE.SphereGeometry(r * SC, w || 14, h || 9);
  g.translate(OX + x * SC, GY + y * SC, OZ + z * SC);
  push(g, color);
  return g;
}

function GLS(w, h, d, x, y, z, rx, ry, rz) {
  const g = new THREE.BoxGeometry(w * SC, h * SC, d * SC);
  applyT(g, OX + x * SC, GY + y * SC, OZ + z * SC, rx || 0, ry || 0, rz || 0);
  glassGeos.push(g);
}

/* 任意两点之间的杆件 */
function STRUT(w, d, color, x1, y1, z1, x2, y2, z2) {
  x1 *= SC; y1 *= SC; z1 *= SC; x2 *= SC; y2 *= SC; z2 *= SC;
  const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  if (len < 0.001) return;
  const g = new THREE.BoxGeometry(w * SC, len, d * SC);
  g.translate(0, len / 2, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  m.setPosition(OX + x1, GY + y1, OZ + z1);
  g.applyMatrix4(m);
  push(g, color);
}

function FRUSTUM(w, d, h, shrink, color, seg, x, y, z, ry) {
  const g = new THREE.CylinderGeometry(Math.SQRT1_2 * shrink, Math.SQRT1_2, h * SC, seg || 4, 1);
  if ((seg || 4) === 4) g.rotateY(Math.PI / 4);
  g.scale(w * SC, 1, d * SC);
  g.translate(0, h * SC / 2, 0);
  applyT(g, OX + x * SC, GY + y * SC, OZ + z * SC, 0, ry || 0, 0);
  push(g, color);
}

function PYR(w, d, h, color, seg, x, y, z, ry) {
  const g = new THREE.CylinderGeometry(0, Math.SQRT1_2, h * SC, seg || 4, 1);
  if ((seg || 4) === 4) g.rotateY(Math.PI / 4);
  g.scale(w * SC, 1, d * SC);
  g.translate(0, h * SC / 2, 0);
  applyT(g, OX + x * SC, GY + y * SC, OZ + z * SC, 0, ry || 0, 0);
  push(g, color);
}

function ROOF(w, d, h, cEave, cRoof, x, y, z, seg) {
  seg = seg || 4;
  FRUSTUM(w * 1.03, d * 1.03, h * 0.30, 0.72, cEave, seg, x, y, z);
  PYR(w * 0.73, d * 0.73, h * 0.72, cRoof, seg, x, y + h * 0.30, z);
}

function COLS(x0, x1, n, z, y0, h, c, r) {
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? x0 : x0 + (x1 - x0) * i / (n - 1);
    CY(r || 0.32, r || 0.32, h, 8, c, x, y0 + h / 2, z);
  }
}

function RAIL(w, d, x, y, z, c, h) {
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

function ARCH(cx, cy, r, thick, depth, n, color, z) {
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (i + 0.5) / n;
    B(thick * 1.02, thick, depth, color,
      cx + Math.cos(a) * (r + thick / 2), cy + Math.sin(a) * (r + thick / 2), z || 0,
      0, 0, a - Math.PI / 2);
  }
}

function WATER(w, d, x, z, y) {
  B(w, 0.5, d, X.water, x, (y || 0) + 0.25, z);
  B(w, 0.18, d * 0.62, X.waterDeep, x, (y || 0) + 0.52, z);
}

/* 地标不再单独做地块，直接站在城市地面上（避免"停车位方框"） */
function PLATE(px, pz) {}

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
  [-16.5, 16.5].forEach(x => {
    B(6.0, 4.6, 8.0, X.chRed, x, 3.9, -1.2);
    B(6.4, 0.7, 8.4, X.gold, x, 6.4, -1.2);
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
  WATER(40, 7.0, 0, 16.2, 0);

  /* 台基 */
  CY(8.0, 9.0, 1.3, 8, X.stone, 0, 6.2, 0);
  B(15, 0.4, 0.9, C.white, 0, 6.9, 8.4);

  let y = 6.9, r = 6.6;
  for (let i = 0; i < 5; i++) {
    const h = 4.5 - i * 0.12;
    CY(r, r, h, 8, C.berryDeep, 0, y + h / 2, 0);
    /* 红柱 */
    for (let a = 0; a < 8; a++) {
      const ang = Math.PI * 2 * a / 8 + Math.PI / 8;
      CY(0.26, 0.26, h, 8, C.coral, Math.cos(ang) * r * 0.99, y + h / 2, Math.sin(ang) * r * 0.99);
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
  FRUSTUM(32, 20, 9.0, 0.88, 0xd9c6a4, 4, 0, 0.8, -3.0);
  B(30, 1.2, 19, 0x6fae86, 0, 9.3, -3.0);

  /* 江面 */
  WATER(40, 6.0, 0, 13.6);

  /* 五层吊脚楼，逐层退台 */
  for (let i = 0; i < 5; i++) {
    const y = 1.6 + i * 5.0;
    const z = 5.4 - i * 1.5;
    const w = 27 - i * 2.6;
    /* 木构主体 */
    B(w, 4.2, 7.0, 0xc98f5c, 0, y + 2.1, z);
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
    FRUSTUM(w + 3.6, 10.4, 1.5, 0.9, 0x9c7a5e, 4, 0, y + 4.2, z);
    FRUSTUM(w + 2.2, 9.0, 0.5, 0.96, 0x7d5c45, 4, 0, y + 5.7, z);
    /* 栏杆平台 */
    B(w + 4.0, 0.3, 2.6, 0xc98f5c, 0, y + 0.15, z + 4.6);
    RAIL(w + 3.6, 0, 0, y + 0.3, z + 5.8, X.brickDeep, 0.8);
    /* 红灯笼 */
    for (let k = 0; k < 6; k++) {
      const x = -w / 2 + 2.2 + (w - 4.4) * k / 5;
      CY(0.05, 0.05, 0.7, 6, C.dark, x, y + 4.0, z + 5.5);
      SP(0.95, 0xd8452f, x, y + 3.2, z + 5.5, 10, 7);
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
  B(9.0, 3.4, 6.0, 0xc98f5c, 0, 27.3, -2.4);
  FRUSTUM(12.6, 8.6, 1.6, 0.9, 0x9c7a5e, 4, 0, 29.0, -2.4);
  PYR(10.2, 7.0, 2.4, 0x7d5c45, 4, 0, 30.5, -2.4);

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

  /* 双圈 */
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
}

/* ── 17 兰州 · 中山桥 ──────────────────────────────── */
function lmLanzhou() {
  /* 黄河 */
  WATER(40, 16.0, 0, 0);
  B(40, 0.6, 0.9, X.sand, 0, 0.62, 8.2);
  B(40, 0.6, 0.9, X.sand, 0, 0.62, -8.2);

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
  WATER(40, 15.0, 0, 2.0);
  /* 两岸石驳 */
  B(40, 1.6, 3.4, 0x9e9782, 0, 0.8, -7.4);
  B(40, 1.6, 3.4, 0x9e9782, 0, 0.8, 11.4);
  B(40, 0.4, 3.4, 0xc6bfab, 0, 1.7, -7.4);
  B(40, 0.4, 3.4, 0xc6bfab, 0, 1.7, 11.4);

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
    B(w, 0.6, 6.8, 0xc6bfab, 0, y, 0.4);
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
  [[-14.2, -8.6], [-8.0, -8.6], [8.4, -8.6], [14.4, -8.6]].forEach(([x, z]) => {
    B(5.2, 4.8, 4.6, C.white, x, 4.0, z);
    FRUSTUM(6.0, 5.4, 1.4, 0.86, X.tile, 4, x, 6.4, z);
  });
  [[-14.6, 12.6], [14.6, 12.6]].forEach(([x, z]) => {
    B(5.6, 4.4, 4.4, C.white, x, 4.0, z);
    FRUSTUM(6.4, 5.2, 1.4, 0.86, X.tile, 4, x, 6.2, z);
    B(1.6, 2.0, 0.2, C.wood, x, 3.8, z - 2.25);
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


/* ═══════════════════════════════════════════════════════
   5. 地标入场：每个街区副本里放一座
   ═══════════════════════════════════════════════════════ */
const LM_LIST = [
  { f: lmGate,      zh: '北京 · 天安门',      en: 'TIANANMEN · BEIJING' },
  { f: lmTemple,    zh: '南京 · 夫子庙',      en: 'FUZIMIAO · NANJING' },
  { f: lmXian,      zh: '西安 · 大雁塔',      en: 'WILD GOOSE PAGODA · XIAN' },
  { f: lmHangzhou,  zh: '杭州 · 雷峰塔',      en: 'LEIFENG PAGODA · HANGZHOU' },
  { f: lmWuhan,     zh: '武汉 · 黄鹤楼',      en: 'YELLOW CRANE TOWER · WUHAN' },
  { f: lmPutian,    zh: '莆田 · 广化寺塔',    en: 'GUANGHUA PAGODA · PUTIAN' },
  { f: lmShanghai,  zh: '上海 · 东方明珠',    en: 'ORIENTAL PEARL · SHANGHAI' },
  { f: lmGuangzhou, zh: '广州 · 广州塔',      en: 'CANTON TOWER · GUANGZHOU' },
  { f: lmChengdu,   zh: '成都 · 天府塔',      en: 'TIANFU TOWER · CHENGDU' },
  { f: lmXiamen,    zh: '厦门 · 世茂双子塔',  en: 'SHIMAO TWIN TOWERS · XIAMEN' },
  { f: lmShenzhen,  zh: '深圳 · 平安金融中心', en: 'PING AN FINANCE · SHENZHEN' },
  { f: lmChangsha,  zh: '长沙 · 国金中心',    en: 'CHANGSHA IFS' },
  { f: lmChongqing, zh: '重庆 · 洪崖洞',      en: 'HONGYADONG · CHONGQING' },
  { f: lmHarbin,    zh: '哈尔滨 · 圣索菲亚',  en: 'SAINT SOPHIA · HARBIN' },
  { f: lmLhasa,     zh: '拉萨 · 布达拉宫',    en: 'POTALA PALACE · LHASA' },
  { f: lmTianjin,   zh: '天津 · 天津之眼',    en: 'TIANJIN EYE' },
  { f: lmLanzhou,   zh: '兰州 · 中山桥',      en: 'ZHONGSHAN BRIDGE · LANZHOU' },
  { f: lmShaoxing,  zh: '绍兴 · 八字桥',      en: 'BAZI BRIDGE · SHAOXING' }
];

const LM = LM_LIST[CUR_I];

/* 地标场地：REPLACE 模式落在腾空的楼位上，否则在街区东侧的广场 */
const SLOT = REPLACE_B4 ? { x: 35, z: -21 } : { x: 46, z: 0 };
let LMB = null;   /* 地标归一后的大小，供取景使用 */
if (REPLACE_B4) {
  box(27, 0.1, 23, C.side, SLOT.x, 0.12, SLOT.z);
  box(26.4, 0.06, 22.4, C.path, SLOT.x, 0.16, SLOT.z);
  /* 地标前的绿化小广场，填掉右侧空铺装 */
  lawn(44.0, 5.0, 9.0, 7.0, 0.18);
  tree(46.2, 2.2, 1.0);
  tree(41.4, 8.0, 0.86);
  roundBed(41.6, 12.6, 1.5);
  bench(48.6, 7.6, -Math.PI / 2);
  bush(38.8, 2.6, 0.95);
}
(function landmarkPad() {
  if (REPLACE_B4) return;
  const X = SLOT.x, Z = SLOT.z;

  /* 广场铺装 */
  box(30, 0.14, 30, C.side, X, 0.1, Z);
  box(28.4, 0.1, 28.4, C.path, X, 0.15, Z);
  /* 四周石带 */
  box(31, 0.2, 1.0, C.curb, X, 0.14, Z + 14.6);
  box(31, 0.2, 1.0, C.curb, X, 0.14, Z - 14.6);
  box(1.0, 0.2, 30, C.curb, X + 15.0, 0.14, Z);

  /* 四角树池 */
  [[-13.0, -13.0], [13.0, -13.0], [-13.0, 13.0], [13.0, 13.0]].forEach(([dx, dz]) => {
    box(2.8, 0.6, 2.8, C.white, X + dx, 0.4, Z + dz);
    box(2.4, 0.24, 2.4, C.greenDeep, X + dx, 0.66, Z + dz);
    tree(X + dx, Z + dz, 0.72, 0.72);
  });

  /* 临街一侧的树列，把广场收住 */
  [34.0, 41.5, 49.0, 56.5].forEach((x, i) => {
    tree(x, Z + 16.4, 0.78, 0.0);
    if (i % 2 === 0) flowerBox(x + 3.7, 0, Z + 16.4, 2.6, 0.85);
  });
  lawn(X - 9.5, Z + 10.6, 6.0, 4.0, 0.18);
  lawn(X + 9.0, Z - 10.8, 5.6, 4.0, 0.18);

  /* 广场家具 */
  bench(X - 13.2, Z + 5.0, Math.PI / 2);
  bench(X - 13.2, Z - 5.0, Math.PI / 2);
  bench(X + 3.0, Z - 13.4, Math.PI);
  lamp(X - 7.0, Z + 13.6);
  lamp(X + 7.0, Z + 13.6);
  roundBed(X + 12.4, Z + 1.0, 1.6);
  bush(X - 11.6, Z - 8.4, 1.0);
  bush(X + 11.4, Z - 7.0, 0.9);
  person(X - 10.0, Z + 7.0, C.blue, 1.1);
  person(X - 7.4, Z - 8.0, C.coral, 2.4);
  person(X + 8.5, Z + 10.6, C.yellow, 0.7);
})();

/* 记录入桶前的进度，用来量这座地标的真实体量 */
const _bk = new Map();
for (const [c, arr] of buckets) _bk.set(c, arr.length);
const _g0 = glassGeos.length;

OX = SLOT.x; OZ = SLOT.z;
LM.f();
OX = 0; OZ = 0;

/* 统一尺度：每座都缩放到与街区楼体相称的高度，宽度不超过广场 */
(function normalizeLandmark() {
  const lb = new THREE.Box3();
  let n = 0;
  for (const [c, arr] of buckets) {
    const st = _bk.get(c) || 0;
    for (let i = st; i < arr.length; i++) { arr[i].computeBoundingBox(); lb.union(arr[i].boundingBox); n++; }
  }
  for (let i = _g0; i < glassGeos.length; i++) {
    glassGeos[i].computeBoundingBox(); lb.union(glassGeos[i].boundingBox); n++;
  }
  if (!n || lb.isEmpty()) return;

  const h = Math.max(1, lb.max.y - lb.min.y);
  const w = Math.max(lb.max.x - lb.min.x, lb.max.z - lb.min.z);
  const TARGET_H = 43, MAX_W = 30;
  let k = TARGET_H / h;
  if (w * k > MAX_W) k = MAX_W / w;
  /* 横向再放宽一点，矮胖的桥/宫殿和细高的塔都不会显得单薄 */
  const kxz = k * 1.08;

  if (Math.abs(k - 1) > 0.02) {
    const ax = SLOT.x, ay = 0.24, az = SLOT.z;
    const scaleGeo = g => {
      g.translate(-ax, -ay, -az);
      g.scale(kxz, k, kxz);
      g.translate(ax, ay, az);
    };
    for (const [c, arr] of buckets) {
      const st = _bk.get(c) || 0;
      for (let i = st; i < arr.length; i++) scaleGeo(arr[i]);
    }
    for (let i = _g0; i < glassGeos.length; i++) scaleGeo(glassGeos[i]);

    /* 重新量一次，供取景 */
    lb.makeEmpty();
    for (const [c, arr] of buckets) {
      const st = _bk.get(c) || 0;
      for (let i = st; i < arr.length; i++) { arr[i].computeBoundingBox(); lb.union(arr[i].boundingBox); }
    }
    for (let i = _g0; i < glassGeos.length; i++) { glassGeos[i].computeBoundingBox(); lb.union(glassGeos[i].boundingBox); }
  }
  LMB = lb;
})();

  /* ═══════════════════════════════════════════════════════
     12. 合并：按颜色合桶，每种色一个 mesh
     ═══════════════════════════════════════════════════════ */
  const cityGroup = new THREE.Group();
  for (const entry of buckets) {
    const color = entry[0], geos = entry[1];
    const merged = mergeGeos(geos);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, matFor(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    cityGroup.add(mesh);
    geos.forEach(function (g) { g.dispose(); });
  }
  buckets.clear();

  let glassMesh = null;
  if (glassGeos.length) {
    const gm = mergeGeos(glassGeos);
    glassMesh = new THREE.Mesh(gm, new THREE.MeshStandardMaterial({
      color: 0xdff2ff, transparent: true, opacity: 0.34,
      roughness: 0.12, metalness: 0.0, depthWrite: false,
      emissive: 0xdff2ff, emissiveIntensity: 0.06
    }));
    glassMesh.renderOrder = 2;
    cityGroup.add(glassMesh);
    glassGeos.forEach(function (g) { g.dispose(); });
    glassGeos.length = 0;
  }

  ROOT.add(cityGroup);
  return { cityGroup: cityGroup, glass: glassMesh, wheel: wheelGroup,
           gondolas: gondolas, bus: bus, cars: cars };
}

/* ---- 城市 id → 地标序号（顺序与 voxel-block.html 的 LM_LIST 一致） ---- */
const CITY_INDEX = {
  beijing: 0, nanjing: 1, xian: 2, hangzhou: 3, wuhan: 4, putian: 5,
  shanghai: 6, guangzhou: 7, chengdu: 8, xiamen: 9, shenzhen: 10,
  changsha: 11, chongqing: 12, haerbin: 13, lasa: 14, tianjin: 15,
  lanzhou: 16, shaoxing: 17
};

/**
 * 造一座微缩街区。
 * @param {{city?:{id?:string}}} opts
 * @returns {THREE.Group} root —— 已归一化、底面贴 y=0、水平居中
 *    - root.userData.update(dt, t)  驱动摩天轮 / 巴士 / 车辆
 *    - root.userData.glass          玻璃幕墙 mesh（入夜可提自发光）
 */
export function createVoxelBlock(opts) {
  const id = (opts && opts.city && opts.city.id) || 'beijing';
  CUR_I = CITY_INDEX[id] != null ? CITY_INDEX[id] : 0;

  const root = new THREE.Group();
  ROOT = root;
  const parts = buildBlock();
  ROOT = null;

  /* ---- 归一化：烘进内层 group，外层 scale 留给 scene.js ---- */
  const holder = new THREE.Group();
  while (root.children.length) holder.add(root.children[0]);

  const bb = new THREE.Box3().setFromObject(holder);
  const size = bb.getSize(new THREE.Vector3());
  const k = TARGET_W / Math.max(0.001, size.x);
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;

  holder.scale.setScalar(k);
  holder.position.set(-cx * k, -bb.min.y * k, -cz * k);
  root.add(holder);

  root.userData.voxelBlock = {
    width: size.x * k,
    depth: size.z * k,
    height: size.y * k,
    glass: parts.glass,
    wheel: parts.wheel,
    lit: litMats.slice()
  };

  /* 摩天轮 / 巴士 / 车辆：由 scene.js 的渲染循环驱动 */
  let t = 0;
  root.userData.update = function (dt) {
    t += dt;
    if (parts.wheel && parts.wheel.userData.wheel) {
      const w = parts.wheel.userData.wheel;
      w.rotation.z = t * 0.11;
      parts.gondolas.forEach(function (gd, i) {
        gd.rotation.z = -w.rotation.z + Math.sin(t * 1.6 + i) * 0.025;
      });
    }
    parts.bus.position.x = -48 + ((t * 6.5) % 96);
    const span = 96;
    parts.cars.forEach(function (c) {
      let x = c.g.position.x + c.speed * dt;
      if (x > 48) x -= span;
      if (x < -48) x += span;
      c.g.position.x = x;
    });
  };

  return root;
}
