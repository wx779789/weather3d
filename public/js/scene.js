import * as THREE from './vendor/three.module.js';

/* =========================================================
   天气视界 · 3D 城市场景
   ========================================================= */

const params = new URLSearchParams(location.search);
const cityId = params.get('city') || 'beijing';
const city = window.cityById(cityId);
const FORCE_WX = params.get('wx');
const FORCE_HOUR = params.get('hour') ? parseFloat(params.get('hour')) : null;
const ACCENT = new THREE.Color(city.accent || '#7fe3ff');

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#05080f');
scene.fog = new THREE.FogExp2(0x0a1220, 0.014);

const FRUSTUM = 14.2;
let camera = null;
function makeCamera() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const aspect = w / h;
  camera = new THREE.OrthographicCamera(-FRUSTUM * aspect / 2, FRUSTUM * aspect / 2, FRUSTUM / 2, -FRUSTUM / 2, 0.1, 300);
  camera.position.set(17, 15.5, 17);
  camera.lookAt(0, 1.35, 0);
}
makeCamera();

/* ---------------- 天空 ---------------- */
const skyUniforms = {
  uTop: { value: new THREE.Color('#1a3a63') },
  uBottom: { value: new THREE.Color('#7fa8cf') },
  uGlow: { value: new THREE.Color('#ffb36b') },
  uGlowDir: { value: new THREE.Vector3(1, 0.2, 0.4).normalize() },
  uFlash: { value: 0 }
};

const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide,
  depthWrite: false,
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uGlow;
    uniform vec3 uGlowDir; uniform float uFlash;
    varying vec3 vDir;
    void main() {
      float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 col = mix(uBottom, uTop, pow(h, 0.85));
      float d = max(dot(normalize(vDir), normalize(uGlowDir)), 0.0);
      col += uGlow * pow(d, 14.0) * 0.65;
      col += uGlow * pow(d, 3.0) * 0.10;
      col += vec3(0.6, 0.75, 1.0) * uFlash;
      // 线性 -> sRGB（自定义 ShaderMaterial 不会被渲染器自动编码）
      vec3 srgb = mix(1.055 * pow(max(col, 0.0), vec3(0.41666)) - 0.055, 12.92 * col, step(col, vec3(0.0031308)));
      gl_FragColor = vec4(srgb, 1.0);
    }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 20), skyMat);
scene.add(sky);

/* 星空 */
const starGeo = new THREE.BufferGeometry();
{
  const N = 700;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.random() * 0.55 + 0.02;
    const r = 120;
    const theta = Math.acos(1 - v);
    pos[i * 3] = Math.sin(theta) * Math.cos(u) * r;
    pos[i * 3 + 1] = Math.cos(theta) * r;
    pos[i * 3 + 2] = Math.sin(theta) * Math.sin(u) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
const starMat = new THREE.PointsMaterial({ color: 0xcfe4ff, size: 1.15, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

/* 太阳 / 月亮 */
function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, outer);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const haloTexture = radialTexture('rgba(255,225,170,0.95)', 'rgba(255,180,90,0.35)');
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: radialTexture('rgba(255,246,214,1)', 'rgba(255,190,110,0.55)'),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
}));
sunSprite.scale.set(9, 9, 1);
scene.add(sunSprite);

/* ---------------- 灯光 ---------------- */
const hemi = new THREE.HemisphereLight(0x9fc4ff, 0x0c1524, 1.15);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff0d6, 2.0);
sun.position.set(14, 20, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0006;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x86b8ff, 0.9);
fill.position.set(-12, 8, -10);
scene.add(fill);

/* ---------------- 环境反射 ---------------- */
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
let envRT = null;
function updateEnv(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#' + top.getHexString());
  g.addColorStop(0.55, '#' + new THREE.Color().lerpColors(top, bottom, 0.7).getHexString());
  g.addColorStop(1, '#' + bottom.getHexString());
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (envRT) envRT.dispose();
  envRT = pmrem.fromEquirectangular(tex);
  scene.environment = envRT.texture;
  tex.dispose();
}

/* ---------------- 场景主体 ---------------- */
const pivot = new THREE.Group();
scene.add(pivot);

const MAT = {
  stone: new THREE.MeshStandardMaterial({ color: 0x0e1626, roughness: 0.9, metalness: 0.15 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x080e18, roughness: 0.95, metalness: 0.1 }),
  pave: new THREE.MeshStandardMaterial({ color: 0x2f4159, roughness: 0.6, metalness: 0.3 }),
  plaza: new THREE.MeshStandardMaterial({ color: 0x3b5170, roughness: 0.5, metalness: 0.35 }),
  road: new THREE.MeshStandardMaterial({ color: 0x1a2434, roughness: 0.3, metalness: 0.55 }),
  line: new THREE.MeshStandardMaterial({ color: 0xd8e6f5, roughness: 0.6, metalness: 0.1 }),
  green: new THREE.MeshStandardMaterial({ color: 0x24463c, roughness: 0.9 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x2c231c, roughness: 0.95 }),
  warm: new THREE.MeshStandardMaterial({ color: 0xffdca8, emissive: 0xffbe6a, emissiveIntensity: 2.4, roughness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x8fb6dd, emissive: 0x6fa8e0, emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.9, transparent: true, opacity: 0.85 }),
  car: new THREE.MeshStandardMaterial({ color: 0x2b3a52, roughness: 0.35, metalness: 0.7 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x0b0f16, roughness: 0.95 })
};

function box(w, h, d, mat, x, y, z, group) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  (group || pivot).add(m);
  return m;
}

function buildBase() {
  const base = new THREE.Group();

  const b1 = box(11.6, 0.16, 11.6, MAT.stoneDark, 0, -1.12, 0, base);
  const b2 = box(11.1, 0.9, 11.1, MAT.stone, 0, -0.62, 0, base);
  const top = box(10.5, 0.3, 10.5, MAT.pave, 0, -0.02, 0, base);
  const plaza = box(6.5, 0.32, 6.5, MAT.plaza, 0, 0.06, 0, base);

  // 道路
  box(10.5, 0.26, 1.8, MAT.road, 0, 0.05, 3.85, base);
  box(1.8, 0.26, 10.5, MAT.road, 3.85, 0.05, 0, base).position.y = 0.05;
  box(1.8, 0.26, 10.5, MAT.road, -3.85, 0.05, 0, base);

  // 车道虚线
  for (let i = -4; i <= 4; i++) {
    box(0.5, 0.03, 0.1, MAT.line, i * 0.9, 0.19, 3.85, base);
    box(0.1, 0.03, 0.5, MAT.line, 3.85, 0.19, i * 0.9, base);
    box(0.1, 0.03, 0.5, MAT.line, -3.85, 0.19, i * 0.9, base);
  }
  // 斑马线
  for (let i = 0; i < 6; i++) {
    box(0.22, 0.03, 1.5, MAT.line, 2.4 + i * 0.34, 0.19, 3.85, base);
  }

  // 地面辉光（湿滑反光）
  const glowGeo = new THREE.PlaneGeometry(10.4, 10.4);
  const glowMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.2;
  base.add(glow);
  base.userData.glow = glowMat;

  return base;
}
const base = buildBase();
pivot.add(base);

/* 岛体下方岩层 */
{
  const under = new THREE.Mesh(new THREE.ConeGeometry(7.05, 4.6, 8), MAT.stoneDark);
  under.rotation.x = Math.PI;
  under.rotation.y = Math.PI / 8;
  under.position.y = -3.35;
  under.castShadow = true;
  under.receiveShadow = true;
  pivot.add(under);

  const mid = new THREE.Mesh(new THREE.ConeGeometry(7.05, 0.55, 8), MAT.stone);
  mid.rotation.x = Math.PI;
  mid.rotation.y = Math.PI / 8;
  mid.position.y = -1.35;
  pivot.add(mid);
}

/* 平台边缘的青色描边 */
{
  const w = 10.5, y = 0.14, h = w / 2;
  const pts = [
    [-h, y, -h], [h, y, -h], [h, y, -h], [h, y, h],
    [h, y, h], [-h, y, h], [-h, y, h], [-h, y, -h],
    [-h, y, -h], [h, y, -h], [-h, y, h], [h, y, h]
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  const mat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.28 });
  pivot.add(new THREE.LineSegments(geo, mat));
  pivot.userData.edge = mat;
}

/* 背景补光 */
{
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture('rgba(140,200,255,0.55)', 'rgba(90,150,255,0.12)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45
  }));
  halo.position.set(0, 3, -26);
  halo.scale.set(46, 34, 1);
  scene.add(halo);
}

/* 水面 / 湿地面 */
const puddleMat = new THREE.MeshStandardMaterial({ color: 0x0d1a2b, metalness: 1, roughness: 0.06, transparent: true, opacity: 0 });
const puddles = new THREE.Group();
[[2.2, 2.4, 0.9], [-2.6, 1.7, 0.7], [1.4, -2.8, 1.0], [-1.9, -2.4, 0.6]].forEach(([x, z, r]) => {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), puddleMat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.21, z);
  puddles.add(m);
});
pivot.add(puddles);

/* ---------------- 地标建筑 ---------------- */
function tree(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.08 * s, 0.5 * s, 6), MAT.trunk);
  trunk.position.y = 0.25 * s;
  trunk.castShadow = true;
  g.add(trunk);
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.32 * s, 0.9 * s, 7), MAT.green);
  leaves.position.y = 0.9 * s;
  leaves.castShadow = true;
  g.add(leaves);
  g.position.set(x, 0.2, z);
  return g;
}

function lamp(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.9, 8), MAT.stoneDark);
  pole.position.y = 0.95;
  pole.castShadow = true;
  g.add(pole);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), MAT.warm);
  head.position.y = 1.95;
  g.add(head);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85
  }));
  halo.scale.set(1.5, 1.5, 1);
  halo.position.y = 1.95;
  g.add(halo);
  const light = new THREE.PointLight(0xffc978, 0, 5.5, 2);
  light.position.set(0, 1.95, 0);
  g.add(light);
  g.userData.light = light;
  g.position.set(x, 0.2, z);
  return g;
}

const lamps = [lamp(2.55, 2.55), lamp(-2.55, 2.55), lamp(2.55, -2.55), lamp(-2.55, -2.55)];
lamps.forEach(l => pivot.add(l));

[[-4.4, -4.4], [-4.4, -3.6], [4.4, 4.4], [-2.9, -4.5], [4.5, -2.2]].forEach(([x, z], i) => pivot.add(tree(x, z, 0.9 + (i % 3) * 0.18)));

/* 小汽车 */
function car(x, z, rot) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 1.0), MAT.car);
  body.position.y = 0.26;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.5), MAT.glass);
  cabin.position.set(0, 0.45, -0.05);
  g.add(cabin);
  [[-0.22, 0.34], [0.22, 0.34], [-0.22, -0.34], [0.22, -0.34]].forEach(([dx, dz]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10), MAT.tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(dx, 0.16, dz);
    g.add(w);
  });
  g.position.set(x, 0.2, z);
  g.rotation.y = rot;
  return g;
}
pivot.add(car(2.6, 3.85, Math.PI * 0.5));
pivot.add(car(-1.2, 3.85, Math.PI * 0.5));
pivot.add(car(3.85, -2.4, 0));


/* ---------- 花草 ---------- */
const grassMat = new THREE.MeshStandardMaterial({ color: 0x2f6b48, roughness: 0.95 });
const grassMat2 = new THREE.MeshStandardMaterial({ color: 0x3f7d52, roughness: 0.95 });
const flowerMats = [0xe86a8a, 0xf0b45a, 0xd9a7ff, 0xfff2b0].map(c =>
  new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, roughness: 0.7 }));
const soilMat = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.98 });

function grassTuft(x, z, s) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.22 * s, 4), i % 2 ? grassMat2 : grassMat);
    blade.position.set((Math.random() - 0.5) * 0.16 * s, 0.1 * s, (Math.random() - 0.5) * 0.16 * s);
    blade.rotation.z = (Math.random() - 0.5) * 0.5;
    blade.castShadow = true;
    g.add(blade);
  }
  g.position.set(x, 0.2, z);
  return g;
}

function flowerBed(x, z, w, d) {
  const g = new THREE.Group();
  const soil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), soilMat);
  soil.position.y = 0.04;
  soil.receiveShadow = true;
  g.add(soil);
  const n = Math.round(w * d * 26);
  for (let i = 0; i < n; i++) {
    const fx2 = (Math.random() - 0.5) * (w - 0.1);
    const fz = (Math.random() - 0.5) * (d - 0.1);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 3), grassMat2);
    stem.position.set(fx2, 0.12, fz);
    g.add(stem);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), flowerMats[i % flowerMats.length]);
    head.position.set(fx2, 0.19, fz);
    g.add(head);
  }
  g.position.set(x, 0.2, z);
  return g;
}

function bush(x, z, s) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 * s, 0), i % 2 ? grassMat : grassMat2);
    b.position.set((Math.random() - 0.5) * 0.26 * s, 0.16 * s + Math.random() * 0.08, (Math.random() - 0.5) * 0.26 * s);
    b.castShadow = true;
    g.add(b);
  }
  g.position.set(x, 0.2, z);
  return g;
}

[[-3.1, 2.2], [3.1, -2.2], [-2.4, -3.2], [2.4, 2.9]].forEach(([x, z]) => pivot.add(flowerBed(x, z, 1.5, 0.55)));
[[-4.2, -1.2], [-4.0, 0.4], [1.6, -4.2], [3.4, -1.0]].forEach(([x, z], i) => pivot.add(bush(x, z, 0.9 + (i % 2) * 0.3)));
for (let i = 0; i < 16; i++) {
  const a = (i / 16) * Math.PI * 2;
  const r = 4.4 + (i % 3) * 0.2;
  pivot.add(grassTuft(Math.cos(a) * r, Math.sin(a) * r, 0.8 + (i % 4) * 0.12));
}

/* ---------- 行人 ---------- */
const SKIN = [0xe8c4a2, 0xd9b08c, 0xf0d3b8, 0xc99a72];
const people = [];

function buildPerson(seed) {
  const g = new THREE.Group();
  const palette = [0x2f4468, 0x5a4632, 0x6b3f4a, 0x3c5548, 0x8a7f6a, 0x394b63];
  const coatMat = new THREE.MeshStandardMaterial({ color: palette[seed % palette.length], roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x232a36, roughness: 0.95 });
  const skinMat = new THREE.MeshStandardMaterial({ color: SKIN[seed % SKIN.length], roughness: 0.85 });
  const hairMat = new THREE.MeshStandardMaterial({ color: seed % 3 === 0 ? 0x33241c : 0x14100e, roughness: 0.9 });

  // 躯干（上宽下窄）
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.2, 4, 10), coatMat);
  torso.position.y = 0.46;
  torso.castShadow = true;
  g.add(torso);

  // 头 + 头发
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.072, 14, 12), skinMat);
  head.position.y = 0.66;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.076, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.position.y = 0.672;
  g.add(hair);

  // 手臂
  const arms = [-1, 1].map(sx => {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.16, 3, 6), coatMat);
    arm.position.set(sx * 0.105, 0.45, 0);
    arm.rotation.z = sx * 0.12;
    arm.castShadow = true;
    g.add(arm);
    return arm;
  });

  // 腿（可摆动）
  const legs = [-1, 1].map(sx => {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.18, 3, 6), pantsMat);
    leg.position.set(sx * 0.042, 0.19, 0);
    leg.castShadow = true;
    g.add(leg);
    return leg;
  });

  // 伞
  const umbrella = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.14, 12), new THREE.MeshStandardMaterial({ color: seed % 2 ? 0x2f6fb0 : 0x3f7f63, roughness: 0.55, metalness: 0.25 }));
  canopy.position.y = 0.88;
  canopy.castShadow = true;
  umbrella.add(canopy);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.5, 5), new THREE.MeshStandardMaterial({ color: 0x9aa7b6 }));
  stick.position.y = 0.63;
  umbrella.add(stick);
  umbrella.visible = false;
  g.add(umbrella);

  g.userData = {
    coatMat, umbrella, arms, legs,
    phase: Math.random() * Math.PI * 2,
    speed: 0.1 + Math.random() * 0.1,
    axis: seed % 2
  };
  return g;
}

[[-4.55, 0], [-4.55, 1], [4.55, 2], [4.55, 3], [0.0, 4], [2.2, 5]].forEach(([z, i]) => {
  const person = buildPerson(i);
  person.position.set(-5 + Math.random() * 10, 0.2, z);
  pivot.add(person);
  people.push(person);
});


/* ---- 各地标 ---- */
const gold = new THREE.MeshStandardMaterial({ color: 0xc08b3e, roughness: 0.55, metalness: 0.45, emissive: 0x3a2408, emissiveIntensity: 0.55 });
const roofRed = new THREE.MeshStandardMaterial({ color: 0x8f3129, roughness: 0.75 });
const wallRed = new THREE.MeshStandardMaterial({ color: 0xa8443a, roughness: 0.8 });
const whiteWall = new THREE.MeshStandardMaterial({ color: 0xe4ddcc, roughness: 0.85 });
const woodDark = new THREE.MeshStandardMaterial({ color: 0x4a3527, roughness: 0.9 });
const brick = new THREE.MeshStandardMaterial({ color: 0x6d3a34, roughness: 0.9 });
const greenDome = new THREE.MeshStandardMaterial({ color: 0x3f8f74, roughness: 0.35, metalness: 0.6 });

function windowsPlane(w, h, cols, rows, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = Math.max(32, Math.round(128 * h / w));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a1220';
  ctx.fillRect(0, 0, c.width, c.height);
  const cw = c.width / cols, ch = c.height / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const on = Math.random() > 0.42;
      ctx.fillStyle = on ? color : 'rgba(40,70,110,0.35)';
      ctx.fillRect(k * cw + cw * 0.18, r * ch + ch * 0.2, cw * 0.64, ch * 0.56);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 });
}

function buildLandmark() {
  const g = new THREE.Group();
  const t = city.type;

  /* ---- 公共材质 ---- */
  const steel = new THREE.MeshStandardMaterial({ color: 0xdae4f2, metalness: 0.9, roughness: 0.25, emissive: 0x1a2636, emissiveIntensity: 0.6 });
  const marble = new THREE.MeshStandardMaterial({ color: 0xe7e2d4, roughness: 0.8 });
  const tileGreen = new THREE.MeshStandardMaterial({ color: 0x2f6a52, roughness: 0.5, metalness: 0.3 });
  const brickDark = new THREE.MeshStandardMaterial({ color: 0x5c322d, roughness: 0.92 });

  /* 庑殿/攒尖屋顶：四棱台 */
  function hipRoof(W, D, H, mat, y) {
    const r = W / Math.SQRT2;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.36, r, H, 4), mat);
    m.rotation.y = Math.PI / 4;
    m.scale.z = D / W;
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }

  /* 飞檐翘角（四角小尖） */
  function tips(W, D, y, mat, size) {
    const k = size || 1;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.24 * k, 0.05 * k, 0.09 * k), mat);
      tip.position.set(sx * W * 0.5, y + 0.02, sz * D * 0.5);
      tip.rotation.y = Math.atan2(sz, sx) * 0.35;
      tip.rotation.z = sx * 0.22;
      tip.castShadow = true;
      g.add(tip);
    });
  }

  function winPanel(w, h, cols, rows, color, x, y, z, ry) {
    const mat = windowsPlane(w, h, cols, rows, color);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    g.add(m);
    return m;
  }

  /* ================= 北京 · 天安门 ================= */
  if (t === 'gate') {
    // 白色石台基
    box(3.9, 0.22, 1.9, marble, 0, 0.31, 0, g);
    box(3.6, 0.16, 1.7, marble, 0, 0.5, 0, g);
    // 红城墙
    box(3.7, 0.72, 1.55, wallRed, 0, 0.94, 0, g);
    box(3.8, 0.06, 1.62, gold, 0, 1.32, 0, g);
    // 五个券门
    for (let i = -2; i <= 2; i++) {
      const dw = i === 0 ? 0.34 : 0.26;
      const dh = i === 0 ? 0.5 : 0.42;
      box(dw, dh, 0.06, MAT.stoneDark, i * 0.62, 0.72, 0.79, g);
      box(dw + 0.04, 0.04, 0.06, marble, i * 0.62, 0.72 + dh / 2, 0.79, g);
    }
    // 城楼
    box(2.9, 0.4, 1.2, wallRed, 0, 1.55, 0, g);
    for (let i = -3; i <= 3; i++) box(0.05, 0.4, 0.05, gold, i * 0.36, 1.55, 0.6, g);
    winPanel(2.3, 0.2, 7, 1, '#ffd9a0', 0, 1.56, 0.615);
    // 下层屋檐
    hipRoof(3.3, 1.7, 0.24, gold, 1.95);
    tips(3.3, 1.7, 1.93, gold, 1.0);
    // 上层
    box(2.0, 0.42, 0.86, wallRed, 0, 2.22, 0, g);
    winPanel(1.6, 0.2, 6, 1, '#ffe0b0', 0, 2.22, 0.44);
    // 上层屋檐（攒尖）
    hipRoof(2.45, 1.2, 0.26, gold, 2.52);
    tips(2.45, 1.2, 2.5, gold, 0.8);
    // 正脊与宝顶
    box(0.85, 0.07, 0.32, gold, 0, 2.66, 0, g);
    box(0.04, 0.16, 0.04, MAT.warm, 0, 2.76, 0, g);
  }

  /* ================= 西安大雁塔 / 杭州雷峰塔 / 武汉黄鹤楼 ================= */
  if (t === 'pagoda') {
    const tall = city.id === 'wuhan' || city.id === 'nanjing' ? 1.15 : 1;
    box(2.2, 0.18, 2.2, MAT.stoneDark, 0, 0.29, 0, g);
    box(1.9, 0.14, 1.9, marble, 0, 0.45, 0, g);
    let y = 0.52;
    const tiers = city.id === 'wuhan' ? 5 : 7;
    for (let i = 0; i < tiers; i++) {
      const k = i / tiers;
      const w = (1.62 - k * 0.78) * tall;
      const bh = (0.42 - k * 0.03);
      // 塔身
      box(w, bh, w, i % 2 ? wallRed : woodDark, 0, y + bh / 2, 0, g);
      // 四面窗/门
      [[0, w / 2 + 0.005, 0], [0, -w / 2 - 0.005, Math.PI], [w / 2 + 0.005, 0, Math.PI / 2], [-w / 2 - 0.005, 0, -Math.PI / 2]]
        .forEach(([x, z, ry]) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.34, bh * 0.5), new THREE.MeshStandardMaterial({ color: 0xffcf8a, emissive: 0xffb060, emissiveIntensity: 1.2, roughness: 0.5 }));
          m.position.set(x, y + bh / 2, z);
          m.rotation.y = ry;
          g.add(m);
        });
      // 檐
      hipRoof(w * 1.34, w * 1.34, 0.085, i === 0 ? gold : tileGreen, y + bh + 0.04);
      tips(w * 1.34, w * 1.34, y + bh + 0.03, gold, 0.55);
      y += bh + 0.1;
    }
    // 塔刹
    box(0.05, 0.34, 0.05, gold, 0, y + 0.2, 0, g);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), MAT.warm);
    ball.position.y = y + 0.42;
    g.add(ball);
  }

  /* ================= 东方明珠 / 广州塔 / 天府塔 ================= */
  if (t === 'tvTower' || t === 'tower') {
    const variant = city.id === 'guangzhou' ? 'canton' : city.id === 'shanghai' ? 'sphere' : 'plain';

    // 基座
    const baseCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.86, 0.42, 8), new THREE.MeshStandardMaterial({ color: 0x2b3c55, roughness: 0.7, metalness: 0.35 }));
    baseCyl.position.y = 0.21;
    baseCyl.castShadow = true;
    g.add(baseCyl);

    if (variant === 'sphere') {
      // 三根斜撑 + 细塔身 + 三球（东方明珠）
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.25, 6), steel);
        leg.position.set(Math.cos(a) * 0.26, 0.86, Math.sin(a) * 0.26);
        leg.rotation.z = Math.cos(a) * 0.26;
        leg.rotation.x = -Math.sin(a) * 0.26;
        leg.castShadow = true;
        g.add(leg);
      }
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.14, 2.6, 10), steel);
      shaft.position.y = 1.6;
      shaft.castShadow = true;
      g.add(shaft);
      // 上下两个大球 + 顶端小球
      [[1.02, 0.40], [1.72, 0.27], [2.32, 0.15]].forEach(([yy, r]) => {
        const sp = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), steel);
        sp.position.y = yy;
        sp.castShadow = true;
        g.add(sp);
        const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.002, 0.012, 6, 40), MAT.warm);
        band.position.y = yy;
        band.rotation.x = Math.PI / 2;
        g.add(band);
      });
      box(0.03, 0.5, 0.03, MAT.line, 0, 2.75, 0, g);
    } else if (variant === 'canton') {
      // 广州塔：扭转格构
      const H = 3.25, base = 0.58, topR = 0.12;
      const N = 26;
      for (let i = 0; i < N; i++) {
        const k = i / (N - 1);
        const yy = 0.35 + k * H;
        const r = base * (1 - k) + topR * k;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 4, 26), steel);
        ring.position.y = yy;
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = k * 1.2;
        g.add(ring);
      }
      for (let j = 0; j < 9; j++) {
        const kind = j % 2 === 0;
        const a = (j / 9) * Math.PI * 2;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(Math.cos(a) * base, 0.35, Math.sin(a) * base),
          new THREE.Vector3(Math.cos(a + 0.35) * base * 0.72, 1.5, Math.sin(a + 0.35) * base * 0.72),
          new THREE.Vector3(Math.cos(a + 0.75) * base * 0.42, 2.5, Math.sin(a + 0.75) * base * 0.42),
          new THREE.Vector3(Math.cos(a + 1.1) * topR, 0.35 + H, Math.sin(a + 1.1) * topR)
        ]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.017, 4, false), kind ? steel : gold);
        tube.castShadow = true;
        g.add(tube);
      }
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.55, 6), steel);
      ant.position.y = 0.35 + H + 0.25;
      g.add(ant);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), MAT.warm);
      beacon.position.y = 0.35 + H + 0.52;
      g.add(beacon);
    } else {
      // 天府塔：细长塔 + 观光层
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, 3.0, 8), steel);
      shaft.position.y = 1.6;
      shaft.castShadow = true;
      g.add(shaft);
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.36, 0.14, 18), steel);
      deck.position.y = 2.28;
      deck.castShadow = true;
      g.add(deck);
      const deckLight = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 6, 30), MAT.warm);
      deckLight.position.y = 2.33;
      deckLight.rotation.x = Math.PI / 2;
      g.add(deckLight);
      box(0.035, 0.6, 0.035, MAT.line, 0, 3.15, 0, g);
    }
  }

  /* ================= 深圳平安 / 长沙国金 ================= */
  if (t === 'skyline') {
    // 主塔：锥形 + 冠顶
    const main = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 2.9, 4), MAT.glass);
    main.rotation.y = Math.PI / 4;
    main.position.y = 1.65;
    main.castShadow = true;
    g.add(main);
    // 主塔窗带
    for (let i = 0; i < 12; i++) {
      const w = 0.62 - i * 0.022;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.1), windowsPlane(w, 0.1, 6, 1, '#cfe6ff'));
      m.position.set(0, 0.5 + i * 0.2, 0.42 - i * 0.012);
      g.add(m);
    }
    box(0.06, 0.5, 0.06, MAT.line, 0, 3.3, 0, g);
    // 副塔
    const sub = [
      { x: -1.1, w: 0.52, h: 1.5 }, { x: 1.05, w: 0.46, h: 1.2 }, { x: 1.5, w: 0.4, h: 0.9 }, { x: -1.6, w: 0.38, h: 0.8 }
    ];
    sub.forEach((b) => {
      box(b.w, b.h, b.w, MAT.stone, b.x, b.h / 2 + 0.2, 0.1, g);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.8, b.h * 0.78), windowsPlane(b.w * 0.8, b.h * 0.78, 3, Math.round(b.h * 7), '#bcd9ff'));
      m.position.set(b.x, b.h / 2 + 0.2, 0.1 + b.w / 2 + 0.005);
      g.add(m);
    });
  }

  /* ================= 重庆洪崖洞 ================= */
  if (t === 'stilt') {
    // 崖体
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.35, 0.55, 6), MAT.stone);
    cliff.position.y = 0.28;
    cliff.scale.z = 0.7;
    cliff.castShadow = true;
    cliff.receiveShadow = true;
    g.add(cliff);

    const floors = 5;
    let y = 0.62;
    for (let i = 0; i < floors; i++) {
      const w = 2.9 - i * 0.22;
      const d = 1.1 - i * 0.06;
      // 吊脚柱
      for (let k = -1; k <= 1; k += 2) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 5), woodDark);
        post.position.set(k * w * 0.42, y - 0.13, d * 0.5);
        g.add(post);
      }
      // 楼体
      box(w, 0.46, d, i % 2 ? woodDark : new THREE.MeshStandardMaterial({ color: 0x7a5535, roughness: 0.85 }), 0, y + 0.23, 0, g);
      // 檐
      hipRoof(w * 1.1, d * 1.12, 0.07, new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.9 }), y + 0.49);
      tips(w * 1.1, d * 1.12, y + 0.47, gold, 0.5);
      // 暖窗
      winPanel(w * 0.86, 0.22, Math.round(w * 5), 1, '#ffce8a', 0, y + 0.23, d / 2 + 0.008);
      y += 0.46;
    }
    // 顶阁
    hipRoof(1.1, 0.7, 0.24, roofRed, y + 0.1);
    box(0.06, 0.16, 0.06, gold, 0, y + 0.3, 0, g);
  }

  /* ================= 哈尔滨圣索菲亚 ================= */
  if (t === 'dome') {
    // 主殿
    box(1.9, 1.05, 1.35, brick, 0, 0.72, 0, g);
    // 砖缝
    for (let i = 0; i < 6; i++) {
      box(1.94, 0.012, 1.38, brickDark, 0, 0.4 + i * 0.16, 0, g);
    }
    // 主穹顶（洋葱形）
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 18, 0, Math.PI * 2, 0, Math.PI / 1.75), greenDome);
    dome.position.y = 1.24;
    dome.castShadow = true;
    g.add(dome);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.14, 20), greenDome);
    neck.position.y = 1.24;
    g.add(neck);
    // 十字
    box(0.035, 0.3, 0.035, gold, 0, 1.98, 0, g);
    box(0.16, 0.03, 0.03, gold, 0, 2.06, 0, g);
    // 钟楼
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 1.1, 8), brick);
    tower.position.set(-1.15, 0.75, 0.2);
    tower.castShadow = true;
    g.add(tower);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.9), greenDome);
    cap.position.set(-1.15, 1.3, 0.2);
    g.add(cap);
    // 侧穹顶
    [-1, 1].forEach(sx => {
      const small = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.8), greenDome);
      small.position.set(sx * 0.72, 1.2, 0.55);
      g.add(small);
    });
    // 门
    box(0.44, 0.6, 0.08, MAT.stoneDark, 0.35, 0.5, 0.68, g);
    winPanel(1.2, 0.24, 5, 1, '#9fd0ff', 0, 1.0, 0.69);
  }

  /* ================= 拉萨布达拉宫 ================= */
  if (t === 'palace') {
    // 山体
    const hill = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 2.5, 0.75, 7), MAT.stone);
    hill.position.y = 0.38;
    hill.scale.z = 0.75;
    hill.receiveShadow = true;
    g.add(hill);
    // 白宫（两侧）
    box(2.3, 0.9, 1.2, whiteWall, 0, 1.22, 0, g);
    // 红宫（中间）
    box(1.45, 0.86, 1.0, roofRed, 0, 2.1, 0, g);
    // 金顶
    hipRoof(1.75, 1.2, 0.16, gold, 2.6);
    tips(1.75, 1.2, 2.58, gold, 0.75);
    hipRoof(1.0, 0.8, 0.16, gold, 2.82);
    // 窗（白宫 + 红宫）
    winPanel(2.0, 0.5, 10, 2, '#3a2a22', 0, 1.22, 0.605);
    winPanel(1.2, 0.5, 6, 2, '#2a1c18', 0, 2.1, 0.505);
    // 层间线
    box(2.34, 0.03, 1.23, MAT.stoneDark, 0, 1.62, 0, g);
    // 台阶
    for (let i = 0; i < 4; i++) box(0.7 - i * 0.06, 0.06, 0.1, marble, 0, 0.9 - i * 0.06, 0.72 + i * 0.05, g);
  }

  /* ================= 天津之眼 ================= */
  if (t === 'ferris') {
    // 桥面
    box(4.0, 0.14, 1.25, MAT.stone, 0, 0.28, 0, g);
    box(4.0, 0.05, 1.3, MAT.line, 0, 0.36, 0, g);
    for (let i = -3; i <= 3; i++) box(0.18, 0.14, 1.3, MAT.stoneDark, i * 0.55, 0.2, 0, g);
    // 轮
    const wheel = new THREE.Group();
    const R = 1.22;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.035, 6, 54), steel);
    wheel.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(R * 0.86, 0.018, 6, 48), steel);
    wheel.add(ring2);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, R, 4), steel);
      spoke.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0);
      spoke.rotation.z = a - Math.PI / 2;
      wheel.add(spoke);
      // 轿厢
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.13), new THREE.MeshStandardMaterial({ color: 0xf2f6ff, emissive: 0xffd9a0, emissiveIntensity: 1.1, roughness: 0.4 }));
      cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      wheel.add(cab);
    }
    wheel.position.set(0, 1.55, 0);
    g.add(wheel);
    g.userData.wheel = wheel;
    // 支架
    [-1, 1].forEach(sx => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.3, 6), MAT.stone);
      leg.position.set(sx * 0.36, 0.93, 0);
      leg.rotation.z = sx * 0.28;
      g.add(leg);
    });
  }

  /* ================= 兰州中山桥 ================= */
  if (t === 'bridge') {
    // 桥墩
    [-1.5, 0, 1.5].forEach(x => box(0.3, 0.42, 0.7, MAT.stone, x, 0.21, 0, g));
    // 桥面
    box(4.2, 0.12, 0.95, MAT.stone, 0, 0.5, 0, g);
    // 钢拱
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.05, 6, 26, Math.PI), steel);
    arch.position.y = 0.56;
    g.add(arch);
    const arch2 = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.04, 6, 28, Math.PI), steel);
    arch2.position.y = 0.56;
    g.add(arch2);
    // 桁架
    for (let i = -6; i <= 6; i++) {
      const x = i * 0.32;
      const h = Math.sqrt(Math.max(0, 1.05 * 1.05 - x * x));
      box(0.014, Math.max(0.06, h), 0.014, steel, x, 0.56 + Math.max(0.06, h) / 2, 0.42, g);
      box(0.014, Math.max(0.06, h), 0.014, steel, x, 0.56 + Math.max(0.06, h) / 2, -0.42, g);
    }
    // 栏杆 + 灯
    [-0.45, 0.45].forEach(z => {
      box(4.2, 0.02, 0.02, steel, 0, 0.92, z, g);
      for (let i = -3; i <= 3; i++) box(0.02, 0.3, 0.02, steel, i * 0.6, 0.77, z, g);
    });
    [-1.6, -0.55, 0.55, 1.6].forEach(x => {
      const lampPost = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), MAT.warm);
      lampPost.position.set(x, 1.0, 0.45);
      g.add(lampPost);
    });
  }

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

const landmark = buildLandmark();
landmark.position.set(0, 0.22, 0);
landmark.scale.setScalar(1.32);
pivot.add(landmark);

/* ---------------- 天气特效 ---------------- */
const rainGroup = new THREE.Group();
pivot.add(rainGroup);
const RAIN_N = 1300;
const rainPos = new Float32Array(RAIN_N * 6);
const rainVel = new Float32Array(RAIN_N);
for (let i = 0; i < RAIN_N; i++) {
  const x = (Math.random() - 0.5) * 20;
  const z = (Math.random() - 0.5) * 20;
  const y = Math.random() * 14;
  rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
  rainPos[i * 6 + 3] = x; rainPos[i * 6 + 4] = y - 0.45; rainPos[i * 6 + 5] = z;
  rainVel[i] = 9 + Math.random() * 7;
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0, depthWrite: false });
const rain = new THREE.LineSegments(rainGeo, rainMat);
rain.visible = false;
rainGroup.add(rain);

/* 雪 */
const SNOW_N = 900;
const snowPos = new Float32Array(SNOW_N * 3);
const snowSeed = new Float32Array(SNOW_N);
for (let i = 0; i < SNOW_N; i++) {
  snowPos[i * 3] = (Math.random() - 0.5) * 20;
  snowPos[i * 3 + 1] = Math.random() * 14;
  snowPos[i * 3 + 2] = (Math.random() - 0.5) * 20;
  snowSeed[i] = Math.random() * Math.PI * 2;
}
const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const flakeTex = radialTexture('rgba(255,255,255,1)', 'rgba(220,240,255,0.7)');
const snowMat = new THREE.PointsMaterial({ size: 0.24, map: flakeTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
const snow = new THREE.Points(snowGeo, snowMat);
snow.visible = false;
pivot.add(snow);

/* 云 */
const cloudTex = radialTexture('rgba(255,255,255,0.95)', 'rgba(200,220,245,0.35)');
const clouds = new THREE.Group();
for (let i = 0; i < 14; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0, depthWrite: false }));
  const a = Math.random() * Math.PI * 2;
  const r = 8 + Math.random() * 9;
  s.position.set(Math.cos(a) * r, 6.5 + Math.random() * 4, Math.sin(a) * r);
  const sc = 4 + Math.random() * 4;
  s.scale.set(sc, sc * 0.55, 1);
  s.userData = { speed: 0.15 + Math.random() * 0.2, a, r };
  clouds.add(s);
}
scene.add(clouds);

/* 雾片（贴地薄雾） */
const mistTex = radialTexture('rgba(220,235,255,0.5)', 'rgba(200,220,245,0.12)');
const mist = new THREE.Group();
for (let i = 0; i < 8; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0, depthWrite: false }));
  s.position.set((Math.random() - 0.5) * 12, 0.5 + Math.random() * 1.2, (Math.random() - 0.5) * 12);
  s.scale.set(7, 3, 1);
  s.userData = { a: Math.random() * Math.PI * 2, r: 3 + Math.random() * 4 };
  mist.add(s);
}
scene.add(mist);

/* ---------------- 天气状态 ---------------- */
let hourNow = 12;
let currentTemp = 18;
let currentPrecip = 0;

const W = {
  mode: 'clear',
  night: 0,
  wind: 0.2,
  wet: 0,
  thunder: false,
  intensity: 1
};

const PALETTES = {
  clear:   { day: ['#3f7fc4', '#bcd9f0'], night: ['#050c1a', '#17304f'], glowDay: '#ffd9a0', glowNight: '#8fbaff' },
  cloudy:  { day: ['#5b7695', '#c3d2e2'], night: ['#070f1d', '#1a2a45'], glowDay: '#ffe0b0', glowNight: '#8fbaff' },
  overcast:{ day: ['#4b5665', '#9aa6b4'], night: ['#090e17', '#182434'], glowDay: '#d9c9a8', glowNight: '#7ea6d6' },
  rain:    { day: ['#26313f', '#5c6d80'], night: ['#060c16', '#14243a'], glowDay: '#a9bccd', glowNight: '#6f97c9' },
  snow:    { day: ['#54688a', '#c9d8e8'], night: ['#08101d', '#1e3150'], glowDay: '#e8f1ff', glowNight: '#9dc3f0' },
  fog:     { day: ['#6b7887', '#c2ccd6'], night: ['#0a1018', '#1d2733'], glowDay: '#dfe8f2', glowNight: '#8aa6c8' },
  haze:    { day: ['#7a7566', '#cfc6b2'], night: ['#0d0f12', '#242321'], glowDay: '#e6d7b8', glowNight: '#9a8f7a' }
};

function modeFromText(wea, code, precip) {
  const s = (wea || '') + ' ' + (code || '');
  if (/雷/.test(s)) return 'thunder';
  if (precip > 0.15 && /雪/.test(s) === false) return 'rain';
  if (/雪/.test(s)) return 'snow';
  if (/雨/.test(s)) return 'rain';
  if (/雾|霾|沙|尘/.test(s)) return /霾|沙|尘/.test(s) ? 'haze' : 'fog';
  if (/阴/.test(s)) return 'overcast';
  if (/云/.test(s)) return 'cloudy';
  return 'clear';
}

function applyWeather(w) {
  let mode = w.mode;
  const p = (typeof w.precip === 'number' ? w.precip : currentPrecip) || 0;
  if (mode === 'clear' || mode === 'cloudy') {
    if (p > 0.15) mode = /雪/.test(w.wea || '') ? 'snow' : 'rain';
  }
  currentPrecip = p;
  const night = 1 - dayFactor(hourNow);
  const pal = PALETTES[mode === 'thunder' ? 'rain' : mode] || PALETTES.clear;
  const pair = night > 0.55 ? pal.night : pal.day;

  const top = new THREE.Color(pair[0]);
  const bottom = new THREE.Color(pair[1]);
  skyUniforms.uTop.value.copy(top);
  skyUniforms.uBottom.value.copy(bottom);
  skyUniforms.uGlow.value.set(night > 0.55 ? pal.glowNight : pal.glowDay);
  scene.fog.color.copy(bottom).multiplyScalar(0.8);
  scene.fog.density = mode === 'fog' ? 0.045 : mode === 'haze' ? 0.032 : mode === 'rain' ? 0.02 : 0.012;

  const sunPos = sunSprite.position;
  const horiz = new THREE.Vector3(sunPos.x, 0, sunPos.z).normalize();
  skyUniforms.uGlowDir.value.copy(new THREE.Vector3(horiz.x, 0.12, horiz.z).normalize());

  updateEnv(top, bottom);

  hemi.intensity = night > 0.55 ? 0.85 : 1.25;
  sun.intensity = night > 0.55 ? 0.35 : ({ clear: 2.4, cloudy: 1.5, overcast: 1.0, rain: 0.8, snow: 1.6, fog: 1.1, haze: 1.2 }[mode] || 2.0);
  sun.color.set(night > 0.55 ? 0x8fb0e0 : (mode === 'clear' ? 0xfff0d0 : 0xdfe6f0));
  fill.intensity = night > 0.55 ? 0.6 : 0.35;

  starMat.opacity = Math.max(0, night * 1.1 - (mode === 'clear' ? 0 : 0.85));
  sunSprite.material.opacity = mode === 'overcast' || mode === 'rain' ? 0.0 : (mode === 'clear' ? 1 : 0.35);
  sunSprite.material.color.set(night > 0.55 ? 0xa8c8ff : 0xffffff);

  // 雨
  const rainy = mode === 'rain' || mode === 'thunder';
  rain.visible = rainy;
  rainMat.opacity = rainy ? 0.55 : 0;
  // 雪
  const snowy = mode === 'snow';
  snow.visible = snowy;
  snowMat.opacity = snowy ? 0.9 : 0;
  // 云
  clouds.children.forEach((c, i) => {
    c.material.opacity = (mode === 'clear' ? 0.18 : mode === 'cloudy' ? 0.55 : mode === 'overcast' ? 0.75 : 0.85) * (night > 0.55 ? 0.6 : 1);
  });
  // 雾片
  mist.children.forEach(m => {
    m.material.opacity = (mode === 'fog' ? 0.55 : mode === 'haze' ? 0.45 : rainy ? 0.25 : 0.06);
  });

  // 潮湿地面
  W.wet = rainy ? 1 : snowy ? 0.45 : 0;
  MAT.road.roughness = rainy ? 0.18 : 0.32;
  MAT.road.metalness = rainy ? 0.85 : 0.5;
  MAT.pave.roughness = rainy ? 0.3 : 0.62;
  MAT.pave.metalness = rainy ? 0.55 : 0.25;
  puddleMat.opacity = rainy ? 0.85 : 0;
  puddles.visible = rainy;

  // 行人：按温度换衣、雨雪打伞
  const chilly = currentTemp;
  const coatColor = chilly <= 0 ? 0x27324a : chilly <= 8 ? 0x4a3a2e : chilly <= 15 ? 0x33465f : chilly <= 22 ? 0x5a6f8c : 0xcfc7b4;
  const withUmbrella = rainy || snowy;
  people.forEach((per) => {
    per.userData.coatMat.color.setHex(coatColor);
    per.userData.umbrella.visible = withUmbrella;
  });

  // 全屏天气层
  fx.mode = mode;
  fx.night = night;
  fx.intensity = rainy ? Math.min(1, 0.35 + p / 6) : snowy ? Math.min(1, 0.35 + p / 3) : 0;
  fxSeed();

  // 夜灯
  const lampOn = night > 0.35 || mode === 'overcast' || rainy || mode === 'fog';
  lamps.forEach(l => { l.userData.light.intensity = lampOn ? 6 : 0; });
  MAT.warm.emissiveIntensity = lampOn ? 2.6 : 0.6;
  base.userData.glow.opacity = rainy ? 0.12 : 0.05;

  W.mode = mode;
  W.thunder = mode === 'thunder';
}

/* ---------------- 时间 ---------------- */
function shanghaiParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
  });
  const parts = fmt.formatToParts(d);
  const get = k => (parts.find(p => p.type === k) || {}).value || '';
  return {
    y: +get('year'), mo: +get('month'), d: +get('day'),
    h: +get('hour') % 24, mi: +get('minute'), s: +get('second'),
    wd: get('weekday')
  };
}

function dayFactor(h) {
  // 0 = 夜, 1 = 白天
  if (h < 5) return 0;
  if (h < 7) return (h - 5) / 2 * 0.9;
  if (h < 17) return 1;
  if (h < 19.5) return 1 - (h - 17) / 2.5;
  return 0;
}

function updateSun(hour) {
  const t = (hour - 6) / 12; // 0..1 白天
  const ang = Math.PI * t;
  const x = Math.cos(ang) * 70;
  const y = Math.sin(ang) * 55 + 6;
  sunSprite.position.set(x, Math.max(4, y), 30);
  const lx = Math.cos(ang) * 18;
  const ly = Math.max(3, Math.sin(ang) * 22);
  sun.position.set(lx, ly, 12);
  sun.color.setHSL(0.09, 0.55, 0.72);
}

/* ---------------- 交互：拖动旋转 ---------------- */
let dragging = false, lastX = 0, spinVel = 0, userSpin = 0, idleTimer = 0;
canvas.addEventListener('pointerdown', e => {
  dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId);
  idleTimer = 0;
});
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  spinVel = dx * 0.006;
  userSpin += spinVel;
  idleTimer = 6;
});
canvas.addEventListener('pointerup', e => { dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} });
canvas.addEventListener('pointercancel', () => { dragging = false; });


/* ---------------- 全屏天气层（雨 / 雪 / 晴 / 雾） ---------------- */
const fxCanvas = document.getElementById('wxfx');
const fxCtx = fxCanvas ? fxCanvas.getContext('2d') : null;
const fx = { mode: 'clear', intensity: 0, night: 0, drops: [], flakes: [], t: 0, flash: 0 };

function fxResize() {
  if (!fxCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fxCanvas.width = Math.round(canvas.clientWidth * dpr);
  fxCanvas.height = Math.round(canvas.clientHeight * dpr);
  fx.dpr = dpr;
}
window.addEventListener('resize', fxResize);

function fxSeed() {
  const w = fxCanvas ? fxCanvas.width : 0, h = fxCanvas ? fxCanvas.height : 0;
  fx.drops = [];
  fx.flakes = [];
  const n = Math.round(120 + 260 * fx.intensity);
  for (let i = 0; i < n; i++) {
    fx.drops.push({ x: Math.random() * w, y: Math.random() * h, l: 12 + Math.random() * 26 * (0.5 + fx.intensity), v: 600 + Math.random() * 700 });
  }
  const m = Math.round(80 + 220 * fx.intensity);
  for (let i = 0; i < m; i++) {
    fx.flakes.push({ x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 2.4, v: 30 + Math.random() * 60, p: Math.random() * 9 });
  }
}

function fxUpdate(dt) {
  if (!fxCanvas || !fxCtx) return;
  if (fxCanvas.width !== Math.round(canvas.clientWidth * (fx.dpr || 1))) fxResize();
  const w = fxCanvas.width, h = fxCanvas.height;
  const ctx = fxCtx;
  ctx.clearRect(0, 0, w, h);
  fx.t += dt;

  // 晴：太阳光晕
  if (fx.mode === 'clear' || fx.mode === 'cloudy') {
    const day = 1 - fx.night;
    if (day > 0.15) {
      const sx = w * 0.82, sy = h * 0.12, R = Math.min(w, h) * 0.42;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      g.addColorStop(0, 'rgba(255,240,200,' + (0.55 * day) + ')');
      g.addColorStop(0.25, 'rgba(255,215,150,' + (0.16 * day) + ')');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // 光束
      ctx.save();
      ctx.translate(sx, sy);
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3 + Math.sin(fx.t * 0.05 + i) * 0.03);
        const lg = ctx.createLinearGradient(0, 0, R * 1.1, 0);
        lg.addColorStop(0, 'rgba(255,235,190,' + (0.10 * day) + ')');
        lg.addColorStop(1, 'rgba(255,235,190,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(R * 1.1, -R * 0.06);
        ctx.lineTo(R * 1.1, R * 0.06);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    } else {
      const g = ctx.createRadialGradient(w * 0.8, h * 0.14, 0, w * 0.8, h * 0.14, Math.min(w, h) * 0.3);
      g.addColorStop(0, 'rgba(190,220,255,0.18)');
      g.addColorStop(1, 'rgba(190,220,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // 雨
  if (fx.mode === 'rain' || fx.mode === 'thunder' || fx.mode === 'snow') {
    if ((fx.mode === 'rain' || fx.mode === 'thunder') && fx.drops.length) {
      ctx.lineCap = 'round';
      for (const d of fx.drops) {
        d.y += d.v * dt * (0.6 + fx.intensity * 0.8);
        d.x += d.v * dt * 0.12;
        if (d.y > h) { d.y = -20; d.x = Math.random() * w; }
        if (d.x > w) d.x = 0;
        ctx.strokeStyle = 'rgba(190,225,255,' + (0.14 + 0.3 * fx.intensity) + ')';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.l * 0.18, d.y - d.l);
        ctx.stroke();
      }
    }
    if (fx.mode === 'snow' && fx.flakes.length) {
      for (const f of fx.flakes) {
        f.y += f.v * dt * (0.5 + fx.intensity);
        f.x += Math.sin(fx.t * 0.8 + f.p) * 12 * dt;
        if (f.y > h) { f.y = -10; f.x = Math.random() * w; }
        ctx.fillStyle = 'rgba(240,248,255,' + (0.35 + 0.35 * fx.intensity) + ')';
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 底部水汽
    const g = ctx.createLinearGradient(0, h * 0.72, 0, h);
    g.addColorStop(0, 'rgba(150,190,240,0)');
    g.addColorStop(1, 'rgba(150,190,240,' + (0.06 + 0.10 * fx.intensity) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
  }

  // 雾
  if (fx.mode === 'fog' || fx.mode === 'haze') {
    for (let i = 0; i < 3; i++) {
      const y = h * (0.45 + i * 0.16);
      const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
      g.addColorStop(0, 'rgba(210,225,240,0)');
      g.addColorStop(0.5, 'rgba(210,225,240,0.10)');
      g.addColorStop(1, 'rgba(210,225,240,0)');
      ctx.fillStyle = g;
      const off = Math.sin(fx.t * 0.2 + i) * 40;
      ctx.fillRect(off - 40, y - 60, w + 80, 120);
    }
  }
}

/* ---------------- 渲染循环 ---------------- */
const clock = new THREE.Clock();
let flashT = 0, flashTimer = 3;

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (!dragging) {
    userSpin += spinVel;
    spinVel *= 0.94;
    if (idleTimer > 0) idleTimer -= dt;
    else userSpin += dt * 0.045;
  }
  pivot.rotation.y = userSpin;

  // 雨
  if (rain.visible) {
    const p = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_N; i++) {
      let y = p[i * 6 + 1] - rainVel[i] * dt;
      if (y < -0.2) {
        y = 11 + Math.random() * 4;
        const x = (Math.random() - 0.5) * 20;
        const z = (Math.random() - 0.5) * 20;
        p[i * 6] = x; p[i * 6 + 2] = z;
        p[i * 6 + 3] = x; p[i * 6 + 5] = z;
      }
      p[i * 6 + 1] = y;
      p[i * 6 + 4] = y - 0.5;
      p[i * 6] += W.wind * 0.02;
      p[i * 6 + 3] = p[i * 6];
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // 雪
  if (snow.visible) {
    const p = snowGeo.attributes.position.array;
    for (let i = 0; i < SNOW_N; i++) {
      p[i * 3 + 1] -= dt * (0.5 + (i % 5) * 0.06);
      p[i * 3] += Math.sin(t * 0.8 + snowSeed[i]) * dt * 0.25;
      p[i * 3 + 2] += Math.cos(t * 0.6 + snowSeed[i]) * dt * 0.18;
      if (p[i * 3 + 1] < 0) {
        p[i * 3 + 1] = 12 + Math.random() * 3;
        p[i * 3] = (Math.random() - 0.5) * 18;
        p[i * 3 + 2] = (Math.random() - 0.5) * 18;
      }
    }
    snowGeo.attributes.position.needsUpdate = true;
  }

  // 云
  clouds.children.forEach(c => {
    c.userData.a += dt * 0.012 * c.userData.speed * 6;
    c.position.x = Math.cos(c.userData.a) * c.userData.r;
    c.position.z = Math.sin(c.userData.a) * c.userData.r;
  });

  // 雾片
  mist.children.forEach(m => {
    m.userData.a += dt * 0.06;
    m.position.x = Math.cos(m.userData.a) * m.userData.r;
    m.position.z = Math.sin(m.userData.a) * m.userData.r;
  });

  // 行人行走
  people.forEach((per, i) => {
    const u = per.userData;
    if (u.axis === 0) {
      per.position.z += u.speed * dt;
      if (per.position.z > 4.9) per.position.z = -4.9;
      per.rotation.y = 0;
    } else {
      per.position.x += u.speed * dt;
      if (per.position.x > 4.9) per.position.x = -4.9;
      per.rotation.y = Math.PI / 2;
    }
    per.position.y = 0.2 + Math.abs(Math.sin(t * 4.5 + u.phase)) * 0.018;
    const swing = Math.sin(t * 4.5 + u.phase) * 0.5;
    if (u.legs) {
      u.legs[0].rotation.x = swing * 0.8;
      u.legs[1].rotation.x = -swing * 0.8;
      u.legs[0].position.z = Math.sin(swing) * 0.04;
      u.legs[1].position.z = -Math.sin(swing) * 0.04;
    }
    if (u.arms) {
      u.arms[0].rotation.x = -swing * 0.7;
      u.arms[1].rotation.x = swing * 0.7;
    }
  });

  // 摩天轮转动
  if (landmark.userData.wheel) landmark.userData.wheel.rotation.z += dt * 0.12;

  // 闪电
  if (W.thunder) {
    flashTimer -= dt;
    if (flashTimer <= 0) {
      flashTimer = 3 + Math.random() * 5;
      flashT = 1;
    }
    if (flashT > 0) {
      flashT -= dt * 3.2;
      const v = Math.max(0, flashT) * (Math.random() > 0.5 ? 1 : 0.4);
      skyUniforms.uFlash.value = v * 0.55;
      sun.intensity = (W.night > 0.5 ? 0.35 : 0.8) + v * 3;
    } else {
      skyUniforms.uFlash.value = 0;
    }
  } else {
    skyUniforms.uFlash.value = 0;
  }

  fxUpdate(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

/* ---------------- 尺寸 ---------------- */
function onResize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  const f = Math.max(h < 760 ? 16.5 : FRUSTUM, 12.6 / Math.max(aspect, 0.35));
  camera.lookAt(0, aspect < 0.9 ? -0.6 : 1.35, 0);
  camera.left = -f * aspect / 2;
  camera.right = f * aspect / 2;
  camera.top = f / 2;
  camera.bottom = -f / 2;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

/* ---------------- 数据 & UI ---------------- */
const ICONS = {
  sun: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="6.2" fill="#ffd479"/><g stroke="#ffd479" stroke-width="1.8" stroke-linecap="round"><path d="M16 3.5v3.2M16 25.3v3.2M3.5 16h3.2M25.3 16h3.2M7.2 7.2l2.3 2.3M22.5 22.5l2.3 2.3M24.8 7.2l-2.3 2.3M9.5 22.5l-2.3 2.3"/></g></svg>`,
  moon: `<svg viewBox="0 0 32 32" fill="none"><path d="M22 20.5A9 9 0 0 1 11.5 10a9.2 9.2 0 1 0 10.5 10.5Z" fill="#cfe0ff"/></svg>`,
  cloud: `<svg viewBox="0 0 32 32" fill="none"><path d="M9.5 23.5h13a4.5 4.5 0 0 0 .4-9 6.5 6.5 0 0 0-12.5-1.2 4.6 4.6 0 0 0-.9 10.2Z" fill="#cfd9e6"/></svg>`,
  cloudy: `<svg viewBox="0 0 32 32" fill="none"><circle cx="12" cy="12" r="4.6" fill="#ffd479"/><path d="M11 24h12.4a4.2 4.2 0 0 0 .3-8.4 6 6 0 0 0-11.5-1 4.3 4.3 0 0 0-1.2 9.4Z" fill="#c9d4e2"/></svg>`,
  overcast: `<svg viewBox="0 0 32 32" fill="none"><path d="M8 15.5h12a4 4 0 0 0 .2-8 5.6 5.6 0 0 0-10.8-1 4 4 0 0 0-1.4 9Z" fill="#98a6b6"/><path d="M12 25h13a4.4 4.4 0 0 0 .2-8.8 6.2 6.2 0 0 0-11.9-1A4.5 4.5 0 0 0 12 25Z" fill="#c2ccd8"/></svg>`,
  rain: `<svg viewBox="0 0 32 32" fill="none"><path d="M9 18h13.4a4.3 4.3 0 0 0 .2-8.6 6.2 6.2 0 0 0-11.8-1A4.4 4.4 0 0 0 9 18Z" fill="#b9c8d8"/><g stroke="#7fc6ff" stroke-width="1.9" stroke-linecap="round"><path d="M11 21.5 9.6 26M16 21.5 14.6 26M21 21.5 19.6 26"/></g></svg>`,
  heavyrain: `<svg viewBox="0 0 32 32" fill="none"><path d="M9 17h13.4a4.3 4.3 0 0 0 .2-8.6 6.2 6.2 0 0 0-11.8-1A4.4 4.4 0 0 0 9 17Z" fill="#a9b9c9"/><g stroke="#6fb8ff" stroke-width="2.2" stroke-linecap="round"><path d="M10 20.5 8.2 26.5M15 20.5 13.2 26.5M20 20.5 18.2 26.5M24.6 20.5 22.8 26.5"/></g></svg>`,
  thunder: `<svg viewBox="0 0 32 32" fill="none"><path d="M9 16h13.4a4.3 4.3 0 0 0 .2-8.6 6.2 6.2 0 0 0-11.8-1A4.4 4.4 0 0 0 9 16Z" fill="#a9b9c9"/><path d="M17.4 15.5 12.6 23h4l-1.4 5.4 6.6-8.9h-4.2l1.8-4Z" fill="#ffcf5c"/></svg>`,
  snow: `<svg viewBox="0 0 32 32" fill="none"><path d="M9 17h13.4a4.3 4.3 0 0 0 .2-8.6 6.2 6.2 0 0 0-11.8-1A4.4 4.4 0 0 0 9 17Z" fill="#c8d6e6"/><g stroke="#dff0ff" stroke-width="1.7" stroke-linecap="round"><path d="M11 22.5v4M9.2 23.6l3.6 1.8M12.8 23.6l-3.6 1.8M20 22.5v4M18.2 23.6l3.6 1.8M21.8 23.6l-3.6 1.8"/></g></svg>`,
  fog: `<svg viewBox="0 0 32 32" fill="none"><g stroke="#c6d2e0" stroke-width="2" stroke-linecap="round"><path d="M6 13h20M8 18h18M5 23h16M10 28h14"/></g></svg>`,
  haze: `<svg viewBox="0 0 32 32" fill="none"><g stroke="#cbbd9e" stroke-width="2" stroke-linecap="round"><path d="M6 12h18M9 17h17M5 22h15M10 27h14"/></g></svg>`,
  wind: `<svg viewBox="0 0 32 32" fill="none"><g stroke="#c6d8ee" stroke-width="2" stroke-linecap="round"><path d="M5 12h13a4 4 0 1 0-4-4M5 19h17a4 4 0 1 1-4 4M5 26h9"/></g></svg>`
};

function iconFor(wea, isNight) {
  const s = wea || '';
  if (/雷/.test(s)) return ICONS.thunder;
  if (/雪/.test(s)) return ICONS.snow;
  if (/暴雨|大雨/.test(s)) return ICONS.heavyrain;
  if (/雨/.test(s)) return ICONS.rain;
  if (/雾/.test(s)) return ICONS.fog;
  if (/霾|沙|尘/.test(s)) return ICONS.haze;
  if (/阴/.test(s)) return ICONS.overcast;
  if (/云/.test(s)) return ICONS.cloudy;
  if (/风/.test(s)) return ICONS.wind;
  return isNight ? ICONS.moon : ICONS.sun;
}

const el = id => document.getElementById(id);
const panelEl = document.getElementById('panel');
const panelToggle = document.getElementById('panelToggle');
if (panelToggle && panelEl) {
  if (window.innerWidth <= 860) {
    panelEl.classList.add('collapsed');
    panelToggle.textContent = '展开';
  }
  panelToggle.addEventListener('click', () => {
    const collapsed = panelEl.classList.toggle('collapsed');
    panelToggle.textContent = collapsed ? '展开' : '收起';
  });
}

el('cityName').textContent = city.name;
el('landmark').textContent = city.landmark;
el('province').textContent = city.province;
document.title = city.name + ' · 天气视界';

function renderHours(hours) {
  const box = el('hours');
  box.innerHTML = hours.map((h, i) => `
    <div class="hour${i === 0 ? ' now' : ''}">
      <div class="hour-t">${(h.time.split('日')[1] || h.time).trim().slice(0, 5)}</div>
      <div class="hour-i">${iconFor(h.wea, /n\d/.test(h.code))}</div>
      <div class="hour-v">${h.temp}°</div>
    </div>`).join('');
}

function weekdayShort(label, idx) {
  const m = label.match(/(\d+)日/);
  if (label.includes('今天')) return '今天';
  if (label.includes('明天')) return '明天';
  if (label.includes('后天')) return '后天';
  return label.replace(/（.*?）/g, '').replace('日', '日');
}

function renderDays(days) {
  const box = el('days');
  box.innerHTML = days.map((d, i) => {
    const hi = d.hi === null ? (d.lo !== null ? d.lo : '--') : d.hi;
    const lo = d.lo === null ? '--' : d.lo;
    return `<div class="day">
      <div class="day-l">${weekdayShort(d.label || '', i)}</div>
      <div class="day-i">${iconFor(d.wea, /n\d/.test(d.codeNight || ''))}</div>
      <div class="day-w">${d.wea}</div>
      <div class="day-t">${hi}°<i> / ${lo}°</i></div>
    </div>`;
  }).join('');
}

function clothingAdvice(t) {
  if (t === null || t === undefined) return '—';
  if (t <= 0) return '羽绒服 / 厚棉衣';
  if (t <= 8) return '棉衣 + 毛衣';
  if (t <= 15) return '风衣 / 夹克';
  if (t <= 22) return '长袖 + 薄外套';
  if (t <= 28) return '短袖 / 薄裙';
  return '短袖 + 防晒';
}

function umbrellaAdvice(mode) {
  if (mode === 'thunder') return '雷雨，记得带伞';
  if (mode === 'rain') return '有雨，记得带伞';
  if (mode === 'snow') return '有雪，带伞防滑';
  if (mode === 'fog' || mode === 'haze') return '能见度低，注意出行';
  if (mode === 'cloudy' || mode === 'overcast') return '建议备把伞';
  return '无需带伞，注意防晒';
}

function renderNow(now) {
  el('temp').textContent = now.temp === null ? '--' : Math.round(now.temp);
  el('weaText').textContent = now.wea || '--';
  el('nowIcon').innerHTML = iconFor(now.wea, W.night > 0.5);
  el('wind').textContent = (now.wd || '--') + (now.ws ? ' ' + now.ws : '');
  el('hum').textContent = now.sd || '--';
  el('aqi').textContent = now.aqi || '--';
  el('pres').textContent = now.qy ? now.qy + 'hPa' : '--';
  el('updated').textContent = '更新于 ' + (now.time || '--:--');
  currentTemp = now.temp === null ? 18 : now.temp;
  el('tipCloth').textContent = clothingAdvice(now.temp);
  el('tipUmbrella').textContent = umbrellaAdvice(W.mode);
}

let lastHour = -1;
function tickClock() {
  const p = shanghaiParts();
  el('clock').textContent = `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}:${String(p.s).padStart(2, '0')}`;
  el('clockDate').textContent = `${p.y}.${String(p.mo).padStart(2, '0')}.${String(p.d).padStart(2, '0')} ${p.wd}`;

  const hourF = FORCE_HOUR !== null ? FORCE_HOUR : p.h + p.mi / 60;
  const night = 1 - dayFactor(hourF);
  if (Math.abs(hourF - lastHour) > 0.02) {
    lastHour = hourF;
    hourNow = hourF;
    W.night = night;
    updateSun(hourF);
    streakNight(night);
  }
}

let currentWeather = null;
function streakNight(n) {
  // 夜色变化只影响光照/颜色，不重建几何
  if (currentWeather) applyWeather(Object.assign({}, currentWeather, { _n: n }));
}


/* 静态托管时的兜底数据源：Open-Meteo（CORS 开放，无需密钥） */
const WMO = [
  [/^0$/, '晴'], [/^1$/, '晴间多云'], [/^2$/, '多云'], [/^3$/, '阴'],
  [/^(45|48)$/, '雾'], [/^(51|53|55|56|57)$/, '毛毛雨'],
  [/^(61|63)$/, '小雨'], [/^65$/, '大雨'], [/^(66|67)$/, '冻雨'],
  [/^(71|73)$/, '小雪'], [/^75$/, '大雪'], [/^77$/, '雪粒'],
  [/^(80|81)$/, '阵雨'], [/^82$/, '强阵雨'], [/^(85|86)$/, '阵雪'],
  [/^(95)$/, '雷阵雨'], [/^(96|99)$/, '雷阵雨伴冰雹']
];
function wmoText(code) {
  const c = String(code);
  for (const [re, t] of WMO) if (re.test(c)) return t;
  return '多云';
}
const WD = ['北风', '东北风', '东风', '东南风', '南风', '西南风', '西风', '西北风'];
function windDir(deg) {
  return WD[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

async function fetchOpenMeteo() {
  const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + city.lat + '&longitude=' + city.lng +
    '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,precipitation' +
    '&hourly=temperature_2m,weather_code,precipitation' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    '&timezone=Asia%2FShanghai&forecast_days=8';
  const r = await fetch(u);
  if (!r.ok) throw new Error('open-meteo ' + r.status);
  const d = await r.json();
  const now = d.current;
  const nowIdx = (d.hourly.time || []).findIndex(t => t.slice(0, 13) === (now.time || '').slice(0, 13));
  const hours = [];
  for (let i = 0; i < 8; i++) {
    const k = (nowIdx >= 0 ? nowIdx : 0) + i * 3;
    if (k >= d.hourly.time.length) break;
    hours.push({
      time: d.hourly.time[k].slice(11, 16),
      wea: wmoText(d.hourly.weather_code[k]),
      temp: Math.round(d.hourly.temperature_2m[k]),
      code: d.hourly.weather_code[k] >= 50 ? 'n50' : 'd00'
    });
  }
  const days = d.daily.time.slice(0, 7).map((t, i) => ({
    label: i === 0 ? '今天' : i === 1 ? '明天' : i === 2 ? '后天' : t.slice(5).replace('-', '日'),
    wea: wmoText(d.daily.weather_code[i]),
    hi: Math.round(d.daily.temperature_2m_max[i]),
    lo: Math.round(d.daily.temperature_2m_min[i]),
    codeDay: 'd' + d.daily.weather_code[i]
  }));
  return {
    ok: true,
    city: city.name,
    now: {
      temp: Math.round(now.temperature_2m),
      wea: wmoText(now.weather_code),
      precip: now.precipitation || 0,
      wd: windDir(now.wind_direction_10m),
      ws: Math.round(now.wind_speed_10m) + 'km/h',
      sd: Math.round(now.relative_humidity_2m) + '%',
      qy: Math.round(now.surface_pressure || 1013),
      aqi: '--',
      time: (now.time || '').slice(11, 16),
      code: String(now.weather_code)
    },
    hours,
    days,
    source: 'Open-Meteo',
    fallback: true
  };
}

async function load() {
  let data = null;
  try {
    const res = await fetch('/api/weather?code=' + city.code);
    data = await res.json();
    if (!data.ok) throw new Error('no data');
  } catch (e1) {
    try {
      data = await fetchOpenMeteo();
      el('srcState').textContent = 'Open-Meteo';
    } catch (e2) {
      data = null;
    }
  }
  if (data) {
    try {
    currentWeather = {
      mode: FORCE_WX || modeFromText(data.now.wea, data.now.code, data.now.precip),
      thunder: /雷/.test(data.now.wea || ''),
      precip: typeof data.now.precip === 'number' ? data.now.precip : 0,
      wea: data.now.wea || ''
    };
    // 用当前天气初始化
    applyWeather(currentWeather);
    renderNow(data.now);
    renderHours(data.hours);
    renderDays(data.days);
    if (!data.fallback) el('srcState').textContent = '实时';
    } catch (e) { }
  } else {
    // 兜底：展示演示数据，避免空白
    const demo = {
      now: { temp: 18, wea: '晴', wd: '东南风', ws: '2级', sd: '45%', qy: '1012', aqi: '42', time: '--:--' },
      hours: Array.from({ length: 8 }, (_, i) => ({ time: `${String((new Date().getHours() + i * 3) % 24).padStart(2, '0')}:00`, wea: '晴', temp: 18 + i - 2, code: 'd00' })),
      days: [
        { label: '今天', wea: '晴', hi: 22, lo: 12 }, { label: '明天', wea: '多云', hi: 21, lo: 13 },
        { label: '后天', wea: '小雨', hi: 18, lo: 11 }, { label: '周五', wea: '阴', hi: 17, lo: 10 },
        { label: '周六', wea: '晴', hi: 20, lo: 9 }, { label: '周日', wea: '晴', hi: 21, lo: 10 },
        { label: '周一', wea: '多云', hi: 19, lo: 11 }
      ]
    };
    currentWeather = { mode: 'clear' };
    applyWeather(currentWeather);
    renderNow(demo.now);
    renderHours(demo.hours);
    renderDays(demo.days);
    el('srcState').textContent = '演示数据';
  }
  el('loading').classList.add('done');
  setTimeout(() => el('loading').remove(), 800);
}

fxResize();
fxSeed();
animate();
tickClock();
setInterval(tickClock, 1000);
load();

/* 首次进入时的视角轻微动画 */
let intro = 0;
const introTimer = setInterval(() => {
  intro += 0.02;
  if (intro > 1) { clearInterval(introTimer); return; }
  userSpin = -0.6 + intro * 0.6;
}, 16);
