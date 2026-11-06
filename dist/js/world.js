import * as THREE from './vendor/three.module.js';

/* ==========================================================
   京都雪庭 · 雪见私汤（雪天 · 三渲二微缩场景）
   ========================================================== */

const params = new URLSearchParams(location.search);
const city = (window.cityById && window.cityById(params.get('city') || 'beijing')) || { name: '京都', accent: '#f2c078', type: 'gate' };

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb9c9dc, 0.008);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
camera.position.set(0, 2.35, 9.6);
camera.lookAt(0, 1.25, 0);

/* ---------- 卡通材质 ---------- */
function gradientMap(steps) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round((i / (steps - 1)) * 255);
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
const RAMP = gradientMap(4);
const toon = (color, opts = {}) => new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: RAMP }, opts));

const MAT = {
  wood: toon(0x9c6d43),
  woodDark: toon(0x5c3d27),
  woodLight: toon(0xc79a63),
  tatami: toon(0xc9b478),
  snow: toon(0xf6fbff, { emissive: 0x2b3f63, emissiveIntensity: 0.22 }),
  snowShade: toon(0xd8e3f7, { emissive: 0x24365a, emissiveIntensity: 0.18 }),
  stone: toon(0x6d7683),
  stoneDark: toon(0x4a525e),
  tile: toon(0x53606e),
  paper: toon(0xfff0d2, { emissive: 0xffc978, emissiveIntensity: 0.85 }),
  lantern: toon(0xffd9a0, { emissive: 0xffb257, emissiveIntensity: 1.6 }),
  water: new THREE.MeshStandardMaterial({ color: 0x3f8794, roughness: 0.18, metalness: 0.3, transparent: true, opacity: 0.94 }),
  cloth: toon(0x2f5f8a),
  leaf: toon(0x2f4d3c),
  leafDark: toon(0x23392c),
  trunk: toon(0x3b2c22),
  yukata: toon(0xdfe8f5)
};

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  (parent || scene).add(m);
  return m;
}


/* ---------- 夜空与星 ---------- */
{
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#050a16');
  g.addColorStop(0.55, '#0c1626');
  g.addColorStop(1, '#16233a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 420; i++) {
    const a = Math.random() * 0.9;
    ctx.fillStyle = 'rgba(220,235,255,' + a + ')';
    const r = Math.random() < 0.9 ? 1 : 1.8;
    ctx.beginPath(); ctx.arc(Math.random() * 1024, Math.random() * 300, r, 0, 6.28); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 20), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false }));
  sky.name = 'nightsky';
  scene.add(sky);
  scene.userData.sky = sky;
}

/* ---------- 背景：和纸 / 折屏 / 圆窗 / 雪林 / 布帘 ---------- */
function paperTexture(w, h, base, tint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, tint);
  g.addColorStop(1, base);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = 'rgba(120,110,95,' + (Math.random() * 0.05) + ')';
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 1);
  }
  return new THREE.CanvasTexture(c);
}

let wallMat = null;
const backdrop = new THREE.Group();
scene.add(backdrop);

// 和纸墙
{
  const tex = paperTexture(512, 512, '#e9e2d3', '#f6f1e4');
  wallMat = new THREE.MeshBasicMaterial({ map: tex });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 14), wallMat);
  wall.position.set(0, 5.2, -8.5);
  backdrop.add(wall);
}

// 折屏（左后）
{
  for (let i = 0; i < 4; i++) {
    const p = box(1.5, 3.1, 0.05, toon(0xf3ead6), -6.4 + i * 1.52, 1.6, -6.6 - i * 0.12, backdrop);
    p.rotation.y = 0.16 - i * 0.09;
  }
}

// 圆窗（偏右）
{
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.11, 10, 64), MAT.woodDark);
  ring.position.set(4.5, 3.5, -7.4);
  backdrop.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 64), new THREE.MeshBasicMaterial({ color: 0xdfe9f6 }));
  disc.position.set(4.5, 3.5, -7.5);
  backdrop.add(disc);
  // 窗外雪林剪影
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 26; i++) {
    const x = 20 + Math.random() * 472;
    const hh = 90 + Math.random() * 190;
    ctx.fillStyle = 'rgba(126,150,178,' + (0.25 + Math.random() * 0.35) + ')';
    ctx.beginPath();
    ctx.moveTo(x, 470);
    ctx.lineTo(x - 16 - Math.random() * 10, 470 - hh * 0.6);
    ctx.lineTo(x - 5, 470 - hh * 0.62);
    ctx.lineTo(x, 470 - hh);
    ctx.lineTo(x + 6, 470 - hh * 0.6);
    ctx.lineTo(x + 17, 470 - hh * 0.62);
    ctx.closePath();
    ctx.fill();
  }
  // 低模雪林（放在圆窗后方，形成层次）
  const forest = new THREE.Group();
  forest.position.set(4.5, 1.2, -7.62);
  const sil = toon(0x9fb3c9);
  const silSnow = toon(0xdfe9f6);
  for (let i = 0; i < 9; i++) {
    const x = -1.9 + (i % 5) * 0.95 + (Math.random() - 0.5) * 0.3;
    const hgt = 2.2 + Math.random() * 2.4;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.5 + Math.random() * 0.2, hgt, 7), sil);
    t.position.set(x, hgt / 2 + 0.2, -Math.random() * 0.5);
    forest.add(t);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, hgt * 0.45, 7), silSnow);
    cap.position.set(x, hgt * 0.78 + 0.2, t.position.z);
    forest.add(cap);
  }
  backdrop.add(forest);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(2.28, 64), new THREE.MeshBasicMaterial({ color: 0xcfe0f2, transparent: true, opacity: 0.12 }));
  glass.position.set(4.5, 3.5, -7.4);
  backdrop.add(glass);
}

// 两侧布帘
{
  const mk = (x, flip) => {
    const g = new THREE.PlaneGeometry(2.6, 7.2, 1, 1);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xcfd9e6, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    m.position.set(x, 3.6, -6.2);
    m.rotation.y = flip ? -0.28 : 0.28;
    backdrop.add(m);
  };
  mk(-7.4, false); mk(7.6, true);
}

/* ---------- 雪地 ---------- */
const ground = new THREE.Mesh(new THREE.CircleGeometry(11, 64), MAT.snow);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

// 雪地起伏（浅色小丘，避免“雪球”感）
for (let i = 0; i < 26; i++) {
  const a = Math.random() * Math.PI * 2, r = 4.5 + Math.random() * 5;
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.9, 12, 8), MAT.snowShade);
  m.scale.y = 0.28;
  m.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
  m.receiveShadow = true;
  scene.add(m);
}

/* ---------- 木构住宅 ---------- */
const house = new THREE.Group();
house.position.set(-1.4, 0, -3.4);
scene.add(house);

box(5.2, 0.22, 3.6, MAT.woodDark, 0, 0.11, 0, house);
box(5.0, 0.12, 3.5, MAT.tatami, 0, 0.26, 0, house);
// 柱子
[[-2.4, -1.6], [2.4, -1.6], [-2.4, 1.6], [2.4, 1.6]].forEach(([x, z]) => box(0.16, 2.5, 0.16, MAT.woodDark, x, 1.35, z, house));
// 后墙与侧墙
box(5.0, 2.4, 0.1, MAT.wood, 0, 1.4, -1.7, house);
box(0.1, 2.4, 3.4, MAT.wood, -2.5, 1.4, 0, house);
// 屋顶（覆雪）
{
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 3.9, 1.15, 4), MAT.tile);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.72;
  roof.position.y = 2.85;
  roof.castShadow = true;
  house.add(roof);
  const snowCap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 4.0, 0.2, 4), MAT.snow);
  snowCap.rotation.y = Math.PI / 4;
  snowCap.scale.z = 0.74;
  snowCap.position.y = 3.28;
  house.add(snowCap);
  box(0.14, 0.4, 0.14, MAT.woodDark, 0, 3.5, 0, house);
}
// 障子门（可看见室内）
{
  const shoji = new THREE.Group();
  shoji.position.set(0, 1.25, 1.72);
  house.add(shoji);
  for (let i = 0; i < 4; i++) {
    const px = -1.8 + i * 1.2;
    const frame = box(1.14, 2.2, 0.06, MAT.woodLight, px, 0, 0, shoji);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.06), MAT.paper);
    paper.position.set(px, 0, 0.04);
    shoji.add(paper);
    for (let k = 1; k < 3; k++) box(1.0, 0.02, 0.02, MAT.woodDark, px, -1.1 + k * 0.73, 0.06, shoji);
    for (let k = 1; k < 2; k++) box(0.02, 2.06, 0.02, MAT.woodDark, px + (k - 0.5) * 0.5, 0, 0.06, shoji);
  }
}
// 室内陈设
{
  const inner = new THREE.Group();
  inner.position.set(0, 0.3, -0.7);
  house.add(inner);
  // 榻榻米分块
  for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) box(2.1, 0.06, 1.0, MAT.tatami, -1.1 + i * 2.2, 0.03, -0.5 + k * 1.05, inner);
  // 被炉
  box(1.5, 0.4, 1.2, MAT.cloth, -0.2, 0.24, 0.1, inner);
  box(1.42, 0.06, 1.12, toon(0x3f74a8), -0.2, 0.45, 0.1, inner);
  // 茶具
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.09, 12), toon(0xf2efe6));
  cup.position.set(0.2, 0.52, 0.2); inner.add(cup);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 14), toon(0x6f4a34));
  pot.position.set(-0.55, 0.55, 0.15); inner.add(pot);
  // 书架 + 陶器
  box(1.0, 1.5, 0.35, MAT.woodDark, -1.8, 0.85, -1.2, inner);
  for (let i = 0; i < 3; i++) box(0.9, 0.04, 0.32, MAT.woodLight, -1.8, 0.45 + i * 0.42, -1.2, inner);
  for (let i = 0; i < 4; i++) box(0.16, 0.3, 0.16, toon([0x8d9aa8, 0xb98a5e, 0x6f8f7b, 0xc0b19a][i]), -2.1 + i * 0.2, 0.62, -1.18, inner);
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.34, 14), toon(0x5f6f7d));
  vase.position.set(0.9, 0.45, -1.3); inner.add(vase);
  // 挂着的浴衣
  const yuk = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.5), MAT.yukata);
  yuk.position.set(1.9, 1.35, -1.62); inner.add(yuk);
  // 阅读椅
  box(0.6, 0.08, 0.6, MAT.woodDark, 1.5, 0.42, -0.1, inner);
  box(0.08, 0.6, 0.6, MAT.woodDark, 1.75, 0.72, -0.1, inner);
  // 暖炉
  const stove = box(0.55, 0.6, 0.5, toon(0x3c3c42), 1.4, 0.4, -1.0, inner);
  stove.userData.stove = true;
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
  fire.position.set(1.4, 0.55, -0.76);
  fire.name = 'fire';
  inner.add(fire);
  const fireLight = new THREE.PointLight(0xffa04a, 1.6, 4.5, 2);
  fireLight.position.set(1.4, 0.7, -0.6);
  inner.add(fireLight);
  scene.userData.fire = fire;
  scene.userData.fireLight = fireLight;
}
// 提灯
[[-2.1, 2.05, 1.5], [2.1, 2.05, 1.5]].forEach(([x, y, z]) => {
  const l = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.42, 12), MAT.lantern);
  l.position.set(x, y, z);
  house.add(l);
  const pl = new THREE.PointLight(0xffb968, 0.9, 5, 2);
  pl.position.set(x, y, z);
  house.add(pl);
});


/* ---------- 主景：横展雪枝（递归分叉 + 雪团） ---------- */
const archGroup = new THREE.Group();
scene.add(archGroup);
{
  const trunkX = -5.4, trunkZ = -2.2;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.46, 3.6, 10), MAT.trunk);
  trunk.position.set(trunkX, 1.8, trunkZ);
  trunk.castShadow = true;
  archGroup.add(trunk);

  const clumps = [];
  function grow(startP, dir, len, rad, depth) {
    const endP = startP.clone().add(dir.clone().normalize().multiplyScalar(len));
    const mid = startP.clone().add(endP).multiplyScalar(0.5);
    const geo = new THREE.CylinderGeometry(rad * 0.74, rad, len, 6);
    const m = new THREE.Mesh(geo, MAT.trunk);
    m.position.copy(mid);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    m.castShadow = true;
    archGroup.add(m);
    // 枝上雪团
    const n = depth >= 2 ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const t = 0.25 + (i / n) * 0.7;
      const pnt = startP.clone().lerp(endP, t);
      pnt.y += rad * 0.9;
      pnt.x += (Math.random() - 0.5) * rad * 2.2;
      pnt.z += (Math.random() - 0.5) * rad * 2.2;
      clumps.push(pnt);
    }
    if (depth <= 0) return;
    const kids = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < kids; i++) {
      const nd = dir.clone()
        .add(new THREE.Vector3((Math.random() - 0.5) * 1.1, -0.3 - Math.random() * 0.5, (Math.random() - 0.5) * 1.1))
        .normalize();
      grow(endP.clone(), nd, len * (0.58 + Math.random() * 0.1), rad * 0.62, depth - 1);
    }
  }

  const tops = [
    [new THREE.Vector3(trunkX, 3.3, trunkZ), new THREE.Vector3(1, 0.55, -0.12), 1.9, 0.19, 3],
    [new THREE.Vector3(trunkX, 3.1, trunkZ), new THREE.Vector3(1, 0.32, 0.45), 1.7, 0.15, 3],
    [new THREE.Vector3(trunkX, 2.9, trunkZ), new THREE.Vector3(0.6, 0.5, 0.9), 1.4, 0.13, 2],
    [new THREE.Vector3(trunkX + 0.4, 3.5, trunkZ + 0.2), new THREE.Vector3(0.8, 0.75, 0.15), 1.5, 0.12, 2]
  ];
  tops.forEach(([p0, dir, len, rad, d]) => grow(p0, dir, len, rad, d));

  // 雪团实例化
  const cg = new THREE.SphereGeometry(0.13, 8, 6);
  const inst = new THREE.InstancedMesh(cg, MAT.snow, clumps.length);
  const mtx = new THREE.Matrix4();
  clumps.forEach((p, i) => {
    const k = 0.6 + Math.random() * 1.1;
    mtx.makeScale(k, k * 0.62, k);
    mtx.setPosition(p);
    inst.setMatrixAt(i, mtx);
  });
  inst.castShadow = true;
  inst.instanceMatrix.needsUpdate = true;
  archGroup.add(inst);
}

/* ---------- 雪堆（池岸 / 廊边） ---------- */
function snowMound(x, z, r, h) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), MAT.snow);
  m.scale.set(1, h / r, 0.85);
  m.position.set(x, h * 0.55, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
}
[[1.2, 2.9, 0.55, 0.34], [2.2, 2.75, 0.5, 0.3], [4.4, 2.4, 0.6, 0.36],
 [4.6, 1.1, 0.5, 0.28], [-0.9, 2.4, 0.45, 0.26], [0.2, 3.0, 0.4, 0.24],
 [5.1, 3.0, 0.7, 0.4], [-2.2, 3.2, 0.5, 0.3]].forEach(([x, z, r, h]) => snowMound(x, z, r, h));

/* ---------- 木廊（缘侧）与提灯 ---------- */
{
  const deck = new THREE.Group();
  deck.position.set(0.9, 0, 1.2);
  scene.add(deck);
  box(4.6, 0.12, 2.2, MAT.woodLight, 0, 0.06, 0, deck);
  for (let i = -2; i <= 2; i++) box(0.08, 0.1, 2.2, MAT.woodDark, i * 1.1, 0.13, 0, deck);
  [[-2.1, 0.95], [2.1, 0.95], [-2.1, -0.95], [2.1, -0.95]].forEach(([x, z]) => {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.34, 10), MAT.lantern);
    l.position.set(x, 0.36, z);
    deck.add(l);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.1, 10), MAT.snow);
    cap.position.set(x, 0.58, z);
    deck.add(cap);
    const pl = new THREE.PointLight(0xffb060, 1.1, 3.4, 2);
    pl.position.set(x, 0.45, z);
    deck.add(pl);
  });
}

/* ---------- 雪树 ---------- */
function snowTree(x, z, scale, pine) {
  const g = new THREE.Group();
  const trunkH = (pine ? 1.1 : 1.8) * scale;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.1 * scale, trunkH, 8), MAT.trunk);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);

  const tiers = pine ? 3 : 4;
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i * 0.2;
    const h = (pine ? 0.85 : 1.05) * scale * (1 - i * 0.08);
    const r = (pine ? 0.72 : 0.62) * scale * k;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h * 1.7, 9), i % 2 ? MAT.leaf : MAT.leafDark);
    cone.position.y = trunkH * 0.55 + i * h * 0.72;
    cone.castShadow = true;
    g.add(cone);
    // 枝头积雪（只盖上半层，露树皮）
    const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.92, h * 0.78, 9, 1, true), MAT.snow);
    snow.position.y = cone.position.y + h * 0.42;
    snow.rotation.y = 0.2;
    g.add(snow);
    // 垂枝雪挂
    for (let j = 0; j < 4; j++) {
      const a = Math.random() * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06 * scale, 0.26 * scale, 6), MAT.snowShade);
      spike.position.set(Math.cos(a) * r * 0.8, cone.position.y + h * 0.1, Math.sin(a) * r * 0.8);
      spike.rotation.z = Math.cos(a) * 0.3;
      g.add(spike);
    }
  }
  g.position.set(x, 0, z);
  g.userData.tree = true;
  scene.add(g);
  return g;
}

const trees = [];
[[-4.6, -2.6, 1.25], [-5.4, -0.6, 1.05], [4.9, -2.2, 1.2], [5.6, -0.3, 1.0],
 [-3.4, 2.6, 0.9], [3.6, 2.9, 0.95], [-6.2, 1.8, 1.1], [6.4, 1.9, 1.15],
 [-1.2, -5.4, 1.35], [2.2, -5.2, 1.2], [0.6, -6.4, 1.05]]
  .forEach(([x, z, s]) => trees.push(snowTree(x, z, s, false)));
[[-4.0, 1.4, 0.85], [4.2, 1.2, 0.8], [-2.6, -4.4, 0.9], [3.0, -4.6, 0.85]]
  .forEach(([x, z, s]) => trees.push(snowTree(x, z, s, true)));

/* ---------- 露天温泉 ---------- */
const onsen = new THREE.Group();
onsen.position.set(2.9, 0, 1.9);
scene.add(onsen);

{
  // 水面
  const waterGeo = new THREE.PlaneGeometry(3.1, 3.1, 36, 36);
  const water = new THREE.Mesh(waterGeo, MAT.water);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.16;
  water.name = 'water';
  water.userData.base = waterGeo.attributes.position.array.slice();
  onsen.add(water);

  // 涟漪环
  water.userData.ripples = [];
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.09, 24), new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(-1.3, 0.17, 0.2);
    ring.userData.t = i * 0.9;
    onsen.add(ring);
    water.userData.ripples.push(ring);
  }

  // 粗石围合（不规则大小）
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.2;
    const r = 1.6 + Math.random() * 0.22;
    const s = 0.34 + Math.random() * 0.26;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), MAT.stone);
    rock.position.set(Math.cos(a) * r, 0.14 + Math.random() * 0.08, Math.sin(a) * r);
    rock.scale.set(1, 0.72 + Math.random() * 0.3, 1);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    rock.receiveShadow = true;
    onsen.add(rock);
    // 石上积雪
    const cap = new THREE.Mesh(new THREE.SphereGeometry(s * 0.92, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), MAT.snow);
    cap.position.copy(rock.position);
    cap.position.y += s * 0.28;
    cap.scale.set(1, 0.5, 1);
    onsen.add(cap);
  }

  // 竹筒注水
  const bamboo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 10), toon(0x8fa86a));
  bamboo.position.set(-1.7, 0.95, 0.1);
  bamboo.rotation.z = -0.55;
  onsen.add(bamboo);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), MAT.woodDark);
  stand.position.set(-2.05, 0.45, 0.1);
  onsen.add(stand);
  // 水流
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0xcdeaf5, transparent: true, opacity: 0.65 }));
  stream.position.set(-1.42, 0.5, 0.24);
  stream.rotation.z = 0.16;
  onsen.add(stream);

  // 汤雾
  const steamTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0.22, depthWrite: false }));
    s.position.set((Math.random() - 0.5) * 1.8, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 1.6);
    s.scale.set(1.2, 0.9, 1);
    s.userData = { p: Math.random() * 9, base: s.position.y };
    onsen.add(s);
  }
  // 暖光
  const warm = new THREE.PointLight(0xffb268, 1.4, 5, 2);
  warm.position.set(0, 0.9, 0);
  onsen.add(warm);
}

/* 踏石 + 矮灯 + 木桶 */
{
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.12, 9), MAT.stoneDark);
    s.position.set(1.1 + i * 0.42, 0.06, 1.3 - i * 0.28);
    s.rotation.y = i;
    s.receiveShadow = true;
    scene.add(s);
  }
  const lamp = new THREE.Group();
  lamp.position.set(0.4, 0, 2.2);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), MAT.woodDark);
  post.position.y = 0.3; lamp.add(post);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), MAT.lantern);
  head.position.y = 0.75; lamp.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), MAT.snow);
  cap.position.y = 0.95; lamp.add(cap);
  scene.add(lamp);

  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.2, 12), MAT.woodLight);
  bucket.position.set(1.15, 0.1, 0.55); scene.add(bucket);
  const towel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.16), toon(0xf4f6fa));
  towel.position.set(1.45, 0.12, 0.62); scene.add(towel);
}


/* ---------- 雪地闪光 ---------- */
{
  const N = 420;
  const pos = new Float32Array(N * 3);
  const ph = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 9;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 0.02 + Math.random() * 0.06;
    pos[i * 3 + 2] = Math.sin(a) * r;
    ph[i] = Math.random() * 6.28;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.045, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, map: (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(210,235,255,0.6)'); g.addColorStop(1, 'rgba(210,235,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })() });
  window.__sparkle = new THREE.Points(geo, mat);
  window.__sparkle.userData.ph = ph;
  scene.add(window.__sparkle);
}


/* ---------- 暖光泛光（伪 Bloom 精灵） ---------- */
{
  const mkGlow = () => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,224,170,0.95)');
    g.addColorStop(0.3, 'rgba(255,190,110,0.45)');
    g.addColorStop(1, 'rgba(255,170,90,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  };
  const tex = mkGlow();
  const spots = [
    [-1.4 - 2.1, 2.05, -3.4 + 1.5], [-1.4 + 2.1, 2.05, -3.4 + 1.5],
    [0.9 - 2.1, 0.36 + 0.0, 1.2 + 0.95], [0.9 + 2.1, 0.36, 1.2 + 0.95],
    [0.9 - 2.1, 0.36, 1.2 - 0.95], [0.9 + 2.1, 0.36, 1.2 - 0.95],
    [0.4, 0.75, 2.2]
  ];
  spots.forEach(([x, y, z]) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75 }));
    sp.position.set(x, y, z);
    sp.scale.set(1.5, 1.5, 1);
    sp.userData.glow = true;
    scene.add(sp);
  });
  // 屋内暖光
  const inner = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  inner.position.set(-1.4, 1.5, -2.2);
  inner.scale.set(3.4, 2.0, 1);
  scene.add(inner);
  window.__glowSprites = scene.children.filter(o => o.isSprite && o.userData.glow);
}

/* ---------- 城市地标剪影（模型后方） ---------- */
{
  const g = new THREE.Group();
  g.position.set(0.9, 1.1, -7.2);
  g.scale.setScalar(1.5);
  const silhouette = toon(0x9fb0c6);
  const accent = new THREE.Color(city.accent || '#f2c078');
  const winMat = new THREE.MeshBasicMaterial({ color: accent });
  const t = city.type || 'gate';

  if (t === 'gate') {
    box(3.4, 1.0, 0.7, silhouette, 0, 0.5, 0, g);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 2.1, 0.7, 4), silhouette);
    roof.rotation.y = Math.PI / 4; roof.position.y = 1.35; roof.scale.z = 0.4; g.add(roof);
  } else if (t === 'pagoda') {
    for (let i = 0; i < 5; i++) {
      const w = 1.6 - i * 0.24;
      box(w, 0.42, w, silhouette, 0, 0.3 + i * 0.55, 0, g);
      const e = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.72, 0.12, 4), silhouette);
      e.rotation.y = Math.PI / 4; e.position.y = 0.56 + i * 0.55; g.add(e);
    }
  } else if (t === 'tvTower' || t === 'tower') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.2, 3.2, 8), silhouette);
    shaft.position.y = 1.6; g.add(shaft);
    [[1.2, 0.42], [2.0, 0.28], [2.7, 0.18]].forEach(([y, r]) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), winMat);
      s.position.y = y; g.add(s);
    });
  } else if (t === 'twin') {
    [-0.55, 0.55].forEach(x => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.0, 0.4), silhouette);
      b.position.set(x, 1.5, 0); g.add(b);
    });
    box(1.2, 0.09, 0.2, winMat, 0, 2.0, 0, g);
  } else if (t === 'stilt' || t === 'skyline' || t === 'ferris' || t === 'bridge' || t === 'dome' || t === 'palace') {
    // 通用天际线剪影 + 主色窗光
    [[-1.3, 1.5], [-0.4, 2.4], [0.6, 1.8], [1.5, 1.1]].forEach(([x, h], i) => {
      box(0.7, h, 0.6, silhouette, x, h / 2, 0, g);
      for (let k = 0; k < 4; k++) box(0.5, 0.04, 0.02, winMat, x, 0.3 + k * 0.4, 0.31, g);
    });
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  scene.add(g);
}

/* ---------- 雪 ---------- */
function snowLayer(count, size, spread, speed, opacity) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 1] = Math.random() * 12;
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.6;
    seed[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const tex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.translate(32, 32);
    for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke(); }
    return new THREE.CanvasTexture(c);
  })();
  const mat = new THREE.PointsMaterial({ size, map: tex, transparent: true, opacity, depthWrite: false, sizeAttenuation: true, alphaTest: 0.02 });
  const pts = new THREE.Points(geo, mat);
  pts.userData = { count, speed, seed, spread };
  scene.add(pts);
  return pts;
}
const snowNear = snowLayer(820, 0.2, 18, 0.55, 1.0);
const snowFar = snowLayer(1200, 0.09, 30, 0.3, 0.7);

/* ---------- 灯光与时间段 ---------- */
const hemi = new THREE.HemisphereLight(0xdfeaff, 0x8fa2b8, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dd, 2.0);
sun.position.set(-6, 9, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
sun.shadow.bias = -0.0008;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x7f9fe0, 0.75);
fill.position.set(5, 4, -5);
scene.add(fill);

const PRESETS = {
  7:  { sky: 0xd8e4ef, fog: 0xcbd8e6, sun: 0xe8f2ff, sunI: 1.9, hemi: 1.25, fillI: 0.55, exposure: 1.15, warm: 1.0 },
  18: { sky: 0xf1c79a, fog: 0xe6b98f, sun: 0xffb066, sunI: 2.6, hemi: 0.95, fillI: 0.45, exposure: 1.22, warm: 1.5 },
  22: { sky: 0x0d1526, fog: 0x18233a, sun: 0x8fb4ff, sunI: 0.55, hemi: 0.42, fillI: 0.5, exposure: 1.28, warm: 2.2 }
};

let hour = 7;
function applyHour(h) {
  hour = h;
  const t = h <= 12 ? (h - 5) / 7 : 1 - Math.min(1, (h - 12) / 10);
  const night = h >= 20 ? 1 : h <= 7 ? 0 : (h - 7) / 13;
  const cS = new THREE.Color(PRESETS[7].sky).lerp(new THREE.Color(PRESETS[22].sky), night);
  scene.background = cS;
  scene.fog.color.copy(cS).lerp(new THREE.Color(0xffffff), 0.25 * (1 - night));
  const warmK = h < 16 ? 0.6 : 1;
  sun.color.setHSL(0.09, 0.35 + 0.25 * warmK, 0.72 - 0.3 * night);
  sun.intensity = 2.0 * (1 - night * 0.82);
  sun.position.set(-7 + Math.cos((h / 24) * Math.PI * 2) * 4, 7 + t * 3, 5);
  hemi.intensity = 1.05 - night * 0.62;
  hemi.color.set(h > 17 || h < 6 ? 0x9fb6d8 : 0xe6f0ff);
  renderer.toneMappingExposure = 1.02 - night * 0.14;
  if (wallMat) { const k = 0.16 + 0.84 * (1 - night); wallMat.color.setRGB(k, k * 0.98, k * 1.04); }
  if (scene.userData.sky) scene.userData.sky.material.color.setScalar(0.35 + 0.65 * (1 - night));
  scene.fog.color.setRGB(0.09 + 0.55 * (1 - night), 0.13 + 0.58 * (1 - night), 0.20 + 0.60 * (1 - night));
  MAT.paper.emissiveIntensity = 0.30 + night * 0.30;
  MAT.lantern.emissiveIntensity = 0.8 + night * 1.0;
  if (scene.userData.fireLight) scene.userData.fireLight.intensity = 0.9 + night * 0.9;
  document.getElementById('clock').textContent =
    String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60)).padStart(2, '0');
}

/* ---------- 交互 ---------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const footprints = [];
const bathState = { on: false };

function addFootprint(pt) {
  if (footprints.length > 120) {
    const old = footprints.shift();
    scene.remove(old);
  }
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), new THREE.MeshBasicMaterial({ color: 0xb9cee4, transparent: true, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.random() * Math.PI;
  m.position.set(pt.x, 0.012, pt.z);
  m.scale.set(1, 1.4, 1);
  scene.add(m);
  footprints.push(m);
}

let burst = null;
function snowBurst(pt) {
  const n = 90;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = pt.x; pos[i * 3 + 1] = pt.y; pos[i * 3 + 2] = pt.z;
    vel.push(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.4, (Math.random() - 0.5) * 1.6));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 1, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.userData.vel = vel;
  pts.userData.life = 1.2;
  scene.add(pts);
  burst = pts;
}

function enterBath() {
  bathState.on = true;
  document.getElementById('exitBath').classList.remove('hidden');
  const p = onsen.position;
  camera.position.set(p.x - 1.2, 0.55, p.z + 1.6);
  camera.lookAt(p.x, 0.35, p.z);
}
function exitBath() {
  bathState.on = false;
  document.getElementById('exitBath').classList.add('hidden');
  camera.position.set(0, 2.35, 9.6);
  camera.lookAt(0, 1.25, 0);
}

canvas.addEventListener('pointerdown', e => {
  if (window.Ambient) window.Ambient.start('snow');
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const treeHit = raycaster.intersectObjects(trees, true)[0];
  if (treeHit) { snowBurst(treeHit.point); return; }

  const waterHit = raycaster.intersectObject(onsen.getObjectByName('water'), true)[0];
  if (waterHit) { if (!bathState.on) enterBath(); return; }

  const stoveHit = raycaster.intersectObjects(scene.children, true)
    .find(h => h.object.userData && h.object.userData.stove);
  if (stoveHit) {
    const fire = scene.userData.fire;
    const light = scene.userData.fireLight;
    if (fire) { fire.scale.setScalar(1.5); setTimeout(() => fire.scale.setScalar(1), 400); }
    if (light) { light.intensity += 1.5; setTimeout(() => { light.intensity = Math.max(1, light.intensity - 1.5); }, 700); }
    return;
  }

  const groundHit = raycaster.intersectObject(ground, false)[0];
  if (groundHit) addFootprint(groundHit.point);
});

document.getElementById('exitBath').addEventListener('click', exitBath);

/* ---------- UI ---------- */
document.querySelectorAll('.presets button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.presets button').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    const h = Number(btn.dataset.t);
    document.getElementById('timeSlider').value = h;
    applyHour(h);
  });
});
document.getElementById('timeSlider').addEventListener('input', e => {
  const h = Number(e.target.value);
  document.querySelectorAll('.presets button').forEach(b => b.classList.toggle('on', Number(b.dataset.t) === Math.round(h)));
  applyHour(h);
});

const soundBtn = document.getElementById('soundBtn');
const soundText = document.getElementById('soundText');
soundBtn.addEventListener('click', () => {
  if (!window.Ambient) return;
  if (!window.Ambient.ready) { window.Ambient.start('snow'); soundBtn.classList.remove('off'); return; }
  const muted = window.Ambient.toggle();
  soundBtn.classList.toggle('off', muted);
  soundText.textContent = muted ? '静音' : '声音';
});

document.getElementById('cityName').textContent = city.name + ' · 雪见';
document.title = city.name + ' · 京都雪庭 · 雪见私汤';

/* ---------- 尺寸 & 循环 ---------- */
function onResize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  [snowNear, snowFar].forEach(pts => {
    const arr = pts.geometry.attributes.position.array;
    const { count, speed, seed, spread } = pts.userData;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= (speed + (i % 5) * 0.05) * dt * 2;
      arr[i * 3] += Math.sin(t * 0.7 + seed[i]) * dt * 0.25;
      arr[i * 3 + 2] += Math.cos(t * 0.5 + seed[i]) * dt * 0.15;
      if (arr[i * 3 + 1] < -0.2) {
        arr[i * 3 + 1] = 11 + Math.random() * 3;
        arr[i * 3] = (Math.random() - 0.5) * spread;
        arr[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.6;
      }
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  onsen.children.forEach(c => {
    if (c.isSprite) {
      c.position.y += dt * 0.12;
      if (c.position.y > c.userData.base + 1.2) c.position.y = c.userData.base;
      c.material.opacity = 0.18 + Math.sin(t * 0.9 + c.userData.p) * 0.06;
    }
  });

  if (burst) {
    burst.userData.life -= dt;
    const arr = burst.geometry.attributes.position.array;
    burst.userData.vel.forEach((v, i) => {
      v.y -= 2.2 * dt;
      arr[i * 3] += v.x * dt;
      arr[i * 3 + 1] += v.y * dt;
      arr[i * 3 + 2] += v.z * dt;
    });
    burst.geometry.attributes.position.needsUpdate = true;
    burst.material.opacity = Math.max(0, burst.userData.life / 1.2);
    if (burst.userData.life <= 0) { scene.remove(burst); burst = null; }
  }

  if (scene.userData.fire) {
    scene.userData.fire.scale.y = 1 + Math.sin(t * 9) * 0.12;
    scene.userData.fire.rotation.y = t * 2;
  }

  if (!bathState.on) {
    camera.position.x = Math.sin(t * 0.06) * 0.35;
    camera.lookAt(0, 1.25, 0);
  }

  // 水面波动
  {
    const w = onsen.getObjectByName('water');
    if (w) {
      const arr = w.geometry.attributes.position.array;
      const base = w.userData.base;
      for (let i = 0; i < arr.length; i += 3) {
        const x = base[i], y = base[i + 1];
        arr[i + 2] = Math.sin(x * 4.2 + t * 1.6) * 0.012 + Math.cos(y * 3.6 - t * 1.2) * 0.01;
      }
      w.geometry.attributes.position.needsUpdate = true;
      w.geometry.computeVertexNormals();
      w.userData.ripples.forEach((r, i) => {
        r.userData.t += dt;
        const k = r.userData.t % 2.4;
        const s2 = 0.4 + k * 1.1;
        r.scale.setScalar(s2);
        r.material.opacity = Math.max(0, 0.5 - k * 0.36);
      });
    }
  }

  if (window.__sparkle) window.__sparkle.material.opacity = 0.45 + Math.sin(t * 2.2) * 0.2;
  if (window.__glowSprites) {
    const k = 0.45 + (hour >= 19 || hour <= 6 ? 0.55 : 0);
    window.__glowSprites.forEach((sp, i) => { sp.material.opacity = k * (0.75 + Math.sin(t * 1.6 + i) * 0.12); });
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

applyHour(22);
animate();
document.getElementById('loading').classList.add('done');
setTimeout(() => { const l = document.getElementById('loading'); if (l) l.remove(); }, 900);
