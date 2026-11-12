/**
 * 天气视界 · 城市地标建模（18 城 / 11 种类型）
 * ---------------------------------------------------------------
 * 设计基调：低多边形微缩沙盘 + 建筑学层次（台基 / 柱廊 / 檐口 / 收分 / 塔刹）
 * 宏大感来源：
 *   1) 三级须弥座台基，把主体"供"起来
 *   2) 明确的水平檐口线 + 垂直柱廊，形成节奏与体量层次
 *   3) 顶部收束（塔刹 / 尖顶 / 航空灯），拉长视觉高度
 *   4) 建筑本体与人、树、车的比例差
 */

import * as THREE from './vendor/three.module.js';

/* ============================ 通用工具 ============================ */

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* 窗格立面：cols × rows，部分窗户点亮 */
function windowTex(cols, rows, litColor, litRatio = 0.58, bg = '#080e18') {
  const w = Math.min(256, Math.max(64, cols * 14));
  const h = Math.min(256, Math.max(48, rows * 14));
  return canvasTex(w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const on = Math.random() < litRatio;
        ctx.fillStyle = on ? litColor : 'rgba(38,64,96,0.42)';
        ctx.fillRect(k * cw + cw * 0.16, r * ch + ch * 0.18, cw * 0.68, ch * 0.6);
      }
    }
  });
}

/* 砖石纹理：细横缝 + 少量色差 */
function brickTex(base, seam, rows = 14) {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.06).toFixed(3) + ')';
      const bw = 10 + Math.random() * 22;
      ctx.fillRect(Math.random() * w, Math.random() * h, bw, 6 + Math.random() * 8);
    }
    ctx.strokeStyle = seam;
    ctx.lineWidth = 1;
    for (let i = 1; i < rows; i++) {
      const y = (h / rows) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  });
}

export function createLandmark({ city, MAT, PAL }) {
  const g = new THREE.Group();
  const t = city.type;
  const id = city.id;

  /* ---------------- 材质 ---------------- */
  const M = {
    gold: PAL.gold,
    roofRed: PAL.roofRed,
    wallRed: PAL.wallRed,
    whiteWall: PAL.whiteWall,
    woodDark: PAL.woodDark,
    brick: PAL.brick,
    greenDome: PAL.greenDome,

    marble: new THREE.MeshStandardMaterial({ color: 0xd6cfbe, roughness: 0.78, metalness: 0.06 }),
    marbleShade: new THREE.MeshStandardMaterial({ color: 0xafa795, roughness: 0.84 }),
    granite: new THREE.MeshStandardMaterial({ color: 0x8f9aa8, roughness: 0.86, metalness: 0.12 }),
    graniteDark: new THREE.MeshStandardMaterial({ color: 0x5b6673, roughness: 0.9, metalness: 0.14 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xdde7f4, metalness: 0.92, roughness: 0.22, emissive: 0x18242f, emissiveIntensity: 0.55 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x8d9bab, metalness: 0.85, roughness: 0.34 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd8a74e, metalness: 0.85, roughness: 0.3, emissive: 0x3a2606, emissiveIntensity: 0.6 }),
    redLacquer: new THREE.MeshStandardMaterial({ color: 0xa8362c, roughness: 0.52, metalness: 0.12, emissive: 0x2a0a06, emissiveIntensity: 0.4 }),
    tileGray: new THREE.MeshStandardMaterial({ color: 0x4a5666, roughness: 0.62, metalness: 0.25 }),
    tileGold: new THREE.MeshStandardMaterial({ color: 0xb0822f, roughness: 0.5, metalness: 0.72, emissive: 0x2e1c06, emissiveIntensity: 0.45 }),
    glassCurtain: new THREE.MeshStandardMaterial({ color: 0xa8c8e8, metalness: 0.9, roughness: 0.14, emissive: 0x6fa8e0, emissiveIntensity: 0.28, envMapIntensity: 1.7 }),
    glassWarm: new THREE.MeshStandardMaterial({ color: 0xffd9a4, emissive: 0xffb469, emissiveIntensity: 1.9, roughness: 0.35 }),
    glowAccent: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(city.accent || '#7fe3ff'), emissiveIntensity: 2.6, roughness: 0.3 }),
    lampWarm: new THREE.MeshStandardMaterial({ color: 0xffe6bd, emissive: 0xffbc6a, emissiveIntensity: 2.5, roughness: 0.4 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.95, metalness: 0.08 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x4b3f33, roughness: 0.95 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x6f5a3c, metalness: 0.6, roughness: 0.45, emissive: 0x1a1006, emissiveIntensity: 0.4 }),
    jade: new THREE.MeshStandardMaterial({ color: 0x4e9c86, roughness: 0.3, metalness: 0.5, emissive: 0x0d2a22, emissiveIntensity: 0.5 })
  };

  /* ---------------- 基础操作 ---------------- */

  /** 加一个盒子并返回 mesh */
  function bx(w, h, d, mat, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }

  /** 圆柱 / 圆台 */
  function cyl(rTop, rBot, h, seg, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }

  /** 任意两点之间的杆件（用于垂脊、斜撑、桅杆） */
  function strut(a, b, r, mat) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-5) return null;
    const m = new THREE.Mesh(new THREE.BoxGeometry(r, len, r), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    m.castShadow = true;
    g.add(m);
    return m;
  }

  /** 四棱台屋顶（庑殿 / 攒尖），ridge 控制正脊宽度比 */
  function roof(W, D, H, mat, y, ridge = 0.34) {
    const r = W / Math.SQRT2;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * ridge, r, H, 4), mat);
    m.rotation.y = Math.PI / 4;
    m.scale.z = D / W;
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);

    // —— 屋面细节：四条垂脊 + 檐口封边，避免屋顶读成一块平板 ——
    const apexY = y + H * 0.5, baseY = y - H * 0.5;
    const rm = (mat === M.tileGold) ? M.brass : M.graniteDark;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      strut(
        new THREE.Vector3(sx * W * 0.47, baseY + 0.012, sz * D * 0.47),
        new THREE.Vector3(0, apexY + 0.012, 0),
        0.02, rm
      );
    });
    const fh = Math.min(0.03, H * 0.16);
    bx(W, fh, 0.028, rm, 0, baseY + fh / 2, D * 0.5);
    bx(W, fh, 0.028, rm, 0, baseY + fh / 2, -D * 0.5);
    bx(0.028, fh, D, rm, W * 0.5, baseY + fh / 2, 0);
    bx(0.028, fh, D, rm, -W * 0.5, baseY + fh / 2, 0);
    return m;
  }

  /** 四方翘角（起翘的檐角，尺度要克制，否则会读成"铁丝"） */
  function upturn(W, D, y, mat, k = 1) {
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.15 * k, 0.055 * k, 0.1 * k), mat);
      tip.position.set(sx * W * 0.455, y + 0.045 * k, sz * D * 0.455);
      tip.rotation.y = Math.atan2(sz, sx) * 0.35;
      tip.rotation.z = sx * 0.46;
      tip.castShadow = true;
      g.add(tip);
    });
  }

  /** 檐口线脚：略大于墙体的薄板，形成水平阴影 */
  function cornice(w, d, y, mat, t = 0.035, grow = 0.06) {
    return bx(w + grow, t, d + grow, mat, 0, y, 0);
  }

  /** 须弥座台基：三级收分 + 可选台阶 */
  function podium(W, D, h, { steps = true, mats = [M.marbleShade, M.marble, M.marbleShade] } = {}) {
    const t1 = h * 0.42, t2 = h * 0.34, t3 = h * 0.24;
    bx(W, t1, D, mats[0], 0, t1 / 2, 0);
    // 层间阴影凹槽：让台基读成"三层石作"而不是一块白台
    bx(W * 0.995, 0.012, D * 0.995, M.graniteDark, 0, t1 - 0.004, 0);
    bx(W * 0.955, t2, D * 0.955, mats[1], 0, t1 + t2 / 2, 0);
    bx(W * 0.95, 0.012, D * 0.95, M.graniteDark, 0, t1 + t2 - 0.004, 0);
    bx(W * 0.91, t3, D * 0.91, mats[2], 0, t1 + t2 + t3 / 2, 0);
    // 台基压顶线
    bx(W * 0.925, 0.022, D * 0.925, M.marble, 0, h - 0.008, 0);
    if (steps) {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const sh = h / n;
        bx(W * 0.24, sh, 0.12, M.marble, 0, sh * (i + 0.5), D * 0.46 + 0.06 + i * 0.1);
      }
    }
    return h;
  }

  /** 一圈栏杆 */
  function railing(W, D, y, mat, h = 0.14, gap = 0.26) {
    const nx = Math.max(2, Math.round(W / gap));
    const nz = Math.max(2, Math.round(D / gap));
    bx(W, 0.018, 0.018, mat, 0, y + h, D / 2);
    bx(W, 0.018, 0.018, mat, 0, y + h, -D / 2);
    bx(0.018, 0.018, D, mat, W / 2, y + h, 0);
    bx(0.018, 0.018, D, mat, -W / 2, y + h, 0);
    for (let i = 0; i <= nx; i++) {
      const x = -W / 2 + (W / nx) * i;
      bx(0.012, h, 0.012, mat, x, y + h / 2, D / 2);
      bx(0.012, h, 0.012, mat, x, y + h / 2, -D / 2);
    }
    for (let i = 1; i < nz; i++) {
      const z = -D / 2 + (D / nz) * i;
      bx(0.012, h, 0.012, mat, W / 2, y + h / 2, z);
      bx(0.012, h, 0.012, mat, -W / 2, y + h / 2, z);
    }
  }

  /** 一排列柱 */
  function colonnade(n, span, y, h, r, mat, z, ry) {
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + (span / (n - 1)) * i;
      cyl(r, r * 1.08, h, 8, mat, x, y + h / 2, z);
      // 柱头
      bx(r * 2.6, 0.022, r * 2.6, M.brass, x, y + h + 0.011, z);
    }
    if (ry) { /* 仅正面使用，保留签名 */ }
  }

  /** 窗格立面片 */
  function winPlane(w, h, cols, rows, color, x, y, z, ry, ratio) {
    const tex = windowTex(cols, rows, color, ratio == null ? 0.58 : ratio);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.62, roughness: 0.55
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    g.add(m);
    return m;
  }

  /** 拱门：矩形 + 半圆顶 */
  function archDoor(w, h, mat, x, y, z, depth = 0.05) {
    bx(w, h, depth, mat, x, y + h / 2, z);
    const half = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, depth, 12, 1, false, 0, Math.PI), mat);
    half.rotation.x = Math.PI / 2;
    half.rotation.z = Math.PI;
    half.position.set(x, y + h, z);
    g.add(half);
  }

  /** 发光球（航空灯 / 宝珠） */
  function orb(r, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }

  /** 塔刹：刹杆 + 相轮 + 宝珠 */
  function finial(y, scale = 1) {
    const s = scale;
    cyl(0.014 * s, 0.02 * s, 0.34 * s, 8, M.brass, 0, y + 0.17 * s, 0);
    [0, 1, 2].forEach((i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry((0.075 - i * 0.016) * s, 0.011 * s, 6, 18), M.gold);
      ring.position.y = y + (0.1 + i * 0.075) * s;
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    });
    orb(0.045 * s, M.lampWarm, 0, y + 0.4 * s, 0);
  }

  /* ============================================================
     1. 城楼 / 江南殿宇 —— 北京天安门、南京夫子庙
     ============================================================ */
  function buildGate() {
    const nanjing = id === 'nanjing';

    // 三层汉白玉台基
    const ph = podium(4.6, 2.45, 0.44);

    if (!nanjing) {
      /* ---------- 天安门 ---------- */
      // 红色城台（略收分）
      bx(3.86, 0.96, 1.66, M.wallRed, 0, ph + 0.48, 0);
      bx(3.74, 0.12, 1.58, M.wallRed, 0, ph + 1.0, 0);
      // 城台压顶 + 垛口（尺度收小，避免锯齿感）
      bx(3.92, 0.045, 1.74, M.marbleShade, 0, ph + 0.96, 0);
      for (let i = -8; i <= 8; i++) {
        bx(0.075, 0.07, 0.055, M.wallRed, i * 0.21, ph + 1.02, 0.83);
        bx(0.075, 0.07, 0.055, M.wallRed, i * 0.21, ph + 1.02, -0.83);
      }

      // 五个券门：石券框 + 暗门洞 + 微弱门内光
      const doorDark = new THREE.MeshStandardMaterial({ color: 0x2a1a16, roughness: 0.92 });
      const doorGlow = new THREE.MeshStandardMaterial({ color: 0xffdcae, emissive: 0xffb877, emissiveIntensity: 0.85, roughness: 0.6 });
      for (let i = -2; i <= 2; i++) {
        const dw = i === 0 ? 0.3 : 0.22;
        const dh = i === 0 ? 0.4 : 0.33;
        const dx = i * 0.62;
        // 券框
        bx(dw + 0.09, dh + 0.04, 0.05, M.marbleShade, dx, ph + 0.06 + (dh + 0.04) / 2, 0.83);
        // 门洞
        archDoor(dw, dh, doorDark, dx, ph + 0.07, 0.86, 0.06);
        // 门内透光
        bx(dw * 0.8, dh * 0.72, 0.02, doorGlow, dx, ph + 0.07 + dh * 0.36, 0.9);
        // 券脸石线
        const ring = new THREE.Mesh(new THREE.TorusGeometry(dw * 0.52, 0.016, 4, 16, Math.PI), M.marble);
        ring.position.set(dx, ph + 0.07 + dh, 0.87);
        g.add(ring);
      }

      // 城楼下层：柱廊 + 檐口
      const t1 = ph + 1.02;
      bx(3.1, 0.5, 1.2, M.redLacquer, 0, t1 + 0.25, 0);
      colonnade(9, 2.9, t1 + 0.03, 0.46, 0.033, M.redLacquer, 0.61);
      winPlane(2.45, 0.3, 11, 2, '#ffd9a0', 0, t1 + 0.26, 0.625, 0, 0.6);
      cornice(3.14, 1.24, t1 + 0.5, M.brass, 0.03, 0.09);

      // 下层檐（庑殿，坡度约 28°）
      const roofY1 = t1 + 0.52 + 0.25;
      roof(3.32, 1.52, 0.5, M.tileGold, roofY1, 0.46);
      upturn(3.32, 1.52, roofY1 - 0.21, M.tileGold, 1.05);
      // 正脊 + 吻兽
      bx(1.5, 0.07, 0.14, M.gold, 0, roofY1 + 0.27, 0);
      [-1, 1].forEach((sx) => bx(0.08, 0.11, 0.1, M.gold, sx * 0.73, roofY1 + 0.31, 0));

      // 上层：7 间
      const t2 = roofY1 + 0.2;
      bx(2.16, 0.46, 0.92, M.redLacquer, 0, t2 + 0.23, 0);
      colonnade(7, 2.0, t2 + 0.03, 0.42, 0.026, M.redLacquer, 0.47);
      // 匾额
      bx(0.56, 0.18, 0.028, M.brass, 0, t2 + 0.3, 0.478);
      bx(0.44, 0.1, 0.012, M.lampWarm, 0, t2 + 0.3, 0.492);
      cornice(2.2, 0.96, t2 + 0.46, M.brass, 0.026, 0.08);

      // 上层攒尖檐（坡度约 30°）
      const roofY2 = t2 + 0.48 + 0.22;
      roof(2.3, 1.12, 0.42, M.tileGold, roofY2, 0.34);
      upturn(2.3, 1.12, roofY2 - 0.19, M.tileGold, 0.85);
      bx(0.78, 0.06, 0.13, M.gold, 0, roofY2 + 0.24, 0);
      // 宝顶
      bx(0.16, 0.09, 0.16, M.gold, 0, roofY2 + 0.31, 0);
      finial(roofY2 + 0.34, 1.0);

      // 两侧华表
      [-1, 1].forEach((sx) => {
        const hx = sx * 1.92;
        cyl(0.058, 0.078, 0.16, 8, M.marbleShade, hx, ph + 0.08, 0.68);
        cyl(0.04, 0.048, 1.05, 10, M.marble, hx, ph + 0.68, 0.68);
        bx(0.2, 0.042, 0.028, M.marble, hx, ph + 1.05, 0.68);
        bx(0.042, 0.14, 0.028, M.marble, hx, ph + 1.11, 0.68);
        orb(0.032, M.brass, hx, ph + 1.22, 0.68);
      });

      // 石狮
      [-1, 1].forEach((sx) => {
        bx(0.15, 0.09, 0.15, M.marbleShade, sx * 1.42, ph + 0.05, 1.0);
        bx(0.12, 0.14, 0.12, M.marble, sx * 1.42, ph + 0.17, 1.0);
        orb(0.055, M.marble, sx * 1.42, ph + 0.29, 1.0);
      });
    } else {
      /* ---------- 夫子庙：白墙灰瓦 + 红柱前廊 ---------- */
      const wallGray = new THREE.MeshStandardMaterial({ color: 0xdcd6c6, roughness: 0.88 });

      // 主殿
      bx(3.3, 0.72, 1.5, wallGray, 0, ph + 0.36, -0.12);
      cornice(3.34, 1.54, ph + 0.72, M.tileGray, 0.04, 0.1);
      // 红柱前廊
      colonnade(7, 2.9, ph + 0.02, 0.7, 0.038, M.redLacquer, 0.62);
      bx(3.24, 0.06, 0.9, M.woodDark, 0, ph + 0.72, 0.36);
      // 殿内暖光
      winPlane(2.6, 0.4, 9, 2, '#ffcf8c', 0, ph + 0.38, 0.34, 0, 0.7);

      // 重檐歇山
      const ry = ph + 0.78;
      roof(3.7, 2.0, 0.34, M.tileGray, ry, 0.3);
      upturn(3.7, 2.0, ry - 0.02, M.tileGray, 1.2);
      bx(2.2, 0.05, 0.12, M.tileGray, 0, ry + 0.34, 0);
      const ry2 = ry + 0.16;
      roof(2.7, 1.5, 0.3, M.tileGray, ry2 + 0.18, 0.28);
      upturn(2.7, 1.5, ry2 + 0.14, M.tileGray, 0.9);
      finial(ry2 + 0.42, 0.7);

      // 两侧配殿
      [-1, 1].forEach((sx) => {
        bx(0.86, 0.42, 0.9, wallGray, sx * 1.72, ph + 0.21, -0.5);
        roof(1.06, 1.06, 0.16, M.tileGray, ph + 0.46, 0.3);
        // 移到侧面
        const rf = g.children[g.children.length - 1];
        rf.position.x = sx * 1.72;
        rf.position.z = -0.5;
        colonnade(2, 0.6, ph + 0.02, 0.4, 0.022, M.redLacquer, -0.02);
        const cols = g.children.slice(-5, -3);
        cols.forEach((c, i) => { c.position.x = sx * 1.72 + (i - 0.5) * 0.42; c.position.z = -0.06; });
      });

      // 前牌坊
      const pz = 1.28;
      [-1, 1].forEach((sx) => cyl(0.035, 0.04, 0.86, 8, M.redLacquer, sx * 0.42, ph + 0.43, pz));
      bx(1.1, 0.06, 0.08, M.redLacquer, 0, ph + 0.9, pz);
      roof(1.2, 0.34, 0.16, M.tileGray, ph + 0.96, 0.3).position.z = pz;
      bx(0.44, 0.16, 0.02, M.brass, 0, ph + 0.78, pz + 0.01);

      // 石阶与石灯
      [-1, 1].forEach((sx) => {
        cyl(0.07, 0.09, 0.1, 8, M.marble, sx * 1.35, ph + 0.05, 1.0);
        cyl(0.05, 0.055, 0.24, 8, M.marble, sx * 1.35, ph + 0.22, 1.0);
        bx(0.16, 0.14, 0.16, M.marble, sx * 1.35, ph + 0.41, 1.0);
        bx(0.09, 0.09, 0.09, M.lampWarm, sx * 1.35, ph + 0.43, 1.0);
      });
    }
  }

  /* ============================================================
     2. 塔 —— 西安大雁塔 / 杭州雷峰塔 / 武汉黄鹤楼 / 莆田广化寺塔
     ============================================================ */
  function buildPagoda() {
    const isTower = id === 'wuhan';                      // 黄鹤楼：楼阁式
    const isLeifeng = id === 'hangzhou';
    const tiers = isTower ? 5 : (isLeifeng ? 5 : 7);

    // 须弥座
    const ph = podium(2.6, 2.6, 0.46, { steps: true });

    // 石栏
    railing(2.3, 2.3, ph, M.marble, 0.13);

    let y = ph + 0.02;
    // 塔身底边逐层收分
    const w0 = 1.7 * (isTower ? 1.16 : 1);

    for (let i = 0; i < tiers; i++) {
      const k = i / Math.max(1, tiers - 1);
      const w = w0 * (1 - k * 0.42);
      const bh = isTower ? 0.46 : 0.4 - k * 0.024;

      // 塔身（红柱白墙：上半木构、下半砖石）
      bx(w, bh, w, i % 2 ? M.woodDark : M.wallRed, 0, y + bh / 2, 0);
      // 平座（外挑回廊）
      if (i > 0) {
        bx(w + 0.12, 0.03, w + 0.12, M.woodDark, 0, y + 0.015, 0);
        // 栏杆
        railing(w + 0.1, w + 0.1, y + 0.02, M.woodDark, 0.09);
      }

      // 四面拱门 + 暖光
      [[0, w / 2 + 0.006, 0], [0, -w / 2 - 0.006, Math.PI], [w / 2 + 0.006, 0, Math.PI / 2], [-w / 2 - 0.006, 0, -Math.PI / 2]]
        .forEach(([x, z, ry]) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.3, bh * 0.52),
            new THREE.MeshStandardMaterial({ color: 0xffcf8a, emissive: 0xffb060, emissiveIntensity: 1.35, roughness: 0.5 }));
          m.position.set(x, y + bh * 0.46, z);
          m.rotation.y = ry;
          g.add(m);
          // 拱券线脚
          const arc = new THREE.Mesh(new THREE.TorusGeometry(w * 0.16, 0.008, 4, 12, Math.PI), M.brass);
          arc.position.set(x + (ry === Math.PI / 2 ? 0.004 : 0), y + bh * 0.72, z + (ry === 0 ? 0.004 : 0));
          arc.rotation.y = ry;
          g.add(arc);
        });

      // 斗拱层：一圈小方块
      const nb = Math.round(w / 0.1);
      for (let j = 0; j < nb; j++) {
        const p = -w / 2 + (w / nb) * (j + 0.5);
        bx(0.055, 0.045, 0.04, M.brass, p, y + bh - 0.03, w / 2 + 0.012);
        bx(0.055, 0.045, 0.04, M.brass, p, y + bh - 0.03, -w / 2 - 0.012);
        bx(0.04, 0.045, 0.055, M.brass, w / 2 + 0.012, y + bh - 0.03, p);
        bx(0.04, 0.045, 0.055, M.brass, -w / 2 - 0.012, y + bh - 0.03, p);
      }

      // 出檐
      const ew = w * 1.4;
      roof(ew, ew, 0.09, i === 0 ? M.tileGold : M.tileGray, y + bh + 0.045);
      upturn(ew, ew, y + bh + 0.03, M.tileGray, 0.6);

      // 檐角风铃
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        cyl(0.012, 0.012, 0.05, 5, M.brass, sx * ew * 0.46, y + bh + 0.005, sz * ew * 0.46);
        orb(0.02, M.bronze, sx * ew * 0.46, y + bh - 0.03, sz * ew * 0.46);
      });

      y += bh + 0.115;
    }

    // 塔刹
    const capW = w0 * 0.58 * 1.1;
    roof(capW, capW, 0.16, M.tileGold, y + 0.06, 0.24);
    upturn(capW, capW, y + 0.02, M.gold, 0.5);
    finial(y + 0.16, 1.25);
  }

  /* ============================================================
     3. 电视塔 / 细长塔 —— 上海明珠、广州塔、成都天府塔
     ============================================================ */
  function buildTvTower() {
    const variant = id === 'guangzhou' ? 'canton' : id === 'shanghai' ? 'sphere' : 'plain';

    // 八角基座 + 环形广场
    const ph = 0.34;
    cyl(1.05, 1.22, ph, 8, M.graniteDark, 0, ph / 2, 0);
    cyl(1.08, 1.08, 0.035, 8, M.glowAccent, 0, ph + 0.01, 0);
    cyl(0.92, 1.0, 0.07, 8, M.granite, 0, ph + 0.04, 0);
    // 基座环廊柱
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      cyl(0.022, 0.026, 0.32, 6, M.steelDark, Math.cos(a) * 1.12, ph + 0.16, Math.sin(a) * 1.12);
    }
    // 环形屋顶
    const ringRoof = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.045, 6, 32), M.steelDark);
    ringRoof.position.y = ph + 0.33;
    ringRoof.rotation.x = Math.PI / 2;
    g.add(ringRoof);

    const y0 = ph + 0.08;

    if (variant === 'sphere') {
      /* 东方明珠：三球 + 斜撑 */
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.075, 1.5, 6), M.steel);
        leg.position.set(Math.cos(a) * 0.3, y0 + 0.75, Math.sin(a) * 0.3);
        leg.rotation.z = Math.cos(a) * 0.3;
        leg.rotation.x = -Math.sin(a) * 0.3;
        leg.castShadow = true;
        g.add(leg);
      }
      cyl(0.085, 0.16, 2.9, 12, M.steel, 0, y0 + 1.55, 0);
      // 塔身竖缝
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        bx(0.012, 2.7, 0.012, M.steelDark, Math.cos(a) * 0.13, y0 + 1.55, Math.sin(a) * 0.13);
      }
      [[1.0, 0.46], [1.78, 0.3], [2.42, 0.16]].forEach(([yy, r], idx) => {
        const sp = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), M.steel);
        sp.position.y = y0 + yy;
        sp.castShadow = true;
        g.add(sp);
        // 球面水平环带（窗带）
        for (let b = 0; b < (idx === 0 ? 3 : 2); b++) {
          const t = new THREE.Mesh(new THREE.TorusGeometry(r * Math.cos((b - 0.6) * 0.4), 0.012, 4, 44), b % 2 ? M.glowAccent : M.steelDark);
          t.position.y = y0 + yy + (b - 0.6) * r * 0.45;
          t.rotation.x = Math.PI / 2;
          g.add(t);
        }
        // 赤道灯带
        const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.004, 0.013, 5, 44), M.glowAccent);
        band.position.y = y0 + yy;
        band.rotation.x = Math.PI / 2;
        g.add(band);
      });
      // 天线 + 航空灯
      cyl(0.012, 0.02, 0.62, 6, M.steel, 0, y0 + 2.85, 0);
      orb(0.035, M.lampWarm, 0, y0 + 3.18, 0);
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 10), M.brass);
        b.position.y = y0 + 2.72 + i * 0.1; b.rotation.x = Math.PI / 2; g.add(b);
      }
    } else if (variant === 'canton') {
      /* 广州塔：扭转格构 + 天线桅杆 */
      const H = 3.6, base = 0.62, topR = 0.1;
      const N = 30;
      for (let i = 0; i < N; i++) {
        const k = i / (N - 1);
        const yy = y0 + 0.1 + k * H;
        const r = base * (1 - k) + topR * k;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.017, 4, 28), i % 5 === 0 ? M.glowAccent : M.steel);
        ring.position.y = yy;
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = k * 1.35;
        g.add(ring);
      }
      for (let j = 0; j < 11; j++) {
        const kind = j % 2 === 0;
        const a = (j / 11) * Math.PI * 2;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(Math.cos(a) * base, y0 + 0.1, Math.sin(a) * base),
          new THREE.Vector3(Math.cos(a + 0.38) * base * 0.72, y0 + 1.5, Math.sin(a + 0.38) * base * 0.72),
          new THREE.Vector3(Math.cos(a + 0.8) * base * 0.4, y0 + 2.7, Math.sin(a + 0.8) * base * 0.4),
          new THREE.Vector3(Math.cos(a + 1.2) * topR, y0 + 0.1 + H, Math.sin(a + 1.2) * topR)
        ]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 26, 0.018, 4, false), kind ? M.steel : M.brass);
        tube.castShadow = true;
        g.add(tube);
      }
      // 观光平台
      [1.55, 2.75].forEach((yy) => {
        const d = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.09, 20), M.steelDark);
        d.position.y = y0 + yy; g.add(d);
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.014, 5, 30), M.lampWarm);
        t.position.y = y0 + yy + 0.05; t.rotation.x = Math.PI / 2; g.add(t);
      });
      cyl(0.014, 0.024, 0.8, 6, M.steel, 0, y0 + H + 0.5, 0);
      orb(0.04, M.lampWarm, 0, y0 + H + 0.93, 0);
    } else {
      /* 天府塔：细长塔 + 双观光层 + 尖顶 */
      cyl(0.1, 0.26, 3.3, 10, M.steel, 0, y0 + 1.72, 0);
      // 塔身竖缝
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        bx(0.01, 3.1, 0.01, M.steelDark, Math.cos(a) * 0.16, y0 + 1.72, Math.sin(a) * 0.16);
      }
      // 观光层
      [[2.42, 0.52, 0.44], [3.06, 0.32, 0.26]].forEach(([yy, rb, rt]) => {
        const deck = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, 0.16, 20), M.steel);
        deck.position.y = y0 + yy; deck.castShadow = true; g.add(deck);
        const t = new THREE.Mesh(new THREE.TorusGeometry(rb * 0.98, 0.017, 5, 34), M.lampWarm);
        t.position.y = y0 + yy + 0.08; t.rotation.x = Math.PI / 2; g.add(t);
        const t2 = new THREE.Mesh(new THREE.TorusGeometry(rb * 0.98, 0.017, 5, 34), M.lampWarm);
        t2.position.y = y0 + yy - 0.08; t2.rotation.x = Math.PI / 2; g.add(t2);
      });
      // 尖顶
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.6, 8), M.steel);
      spire.position.y = y0 + 3.62; g.add(spire);
      cyl(0.008, 0.014, 0.4, 6, M.steel, 0, y0 + 3.98, 0);
      orb(0.032, M.lampWarm, 0, y0 + 4.2, 0);
    }
  }

  /* ============================================================
     4. 双子塔 —— 厦门世茂
     ============================================================ */
  function buildTwin() {
    // 裙楼
    podium(3.4, 2.2, 0.34, { steps: true });
    bx(2.9, 0.28, 1.68, M.graniteDark, 0, 0.34 + 0.14, 0);
    cornice(2.96, 1.74, 0.62, M.steelDark, 0.03, 0.1);
    // 裙楼雨棚
    bx(3.0, 0.03, 0.34, M.glassCurtain, 0, 0.52, 0.98);
    for (let i = -2; i <= 2; i++) cyl(0.012, 0.012, 0.2, 5, M.steelDark, i * 0.6, 0.42, 1.1);

    const shell = new THREE.MeshStandardMaterial({
      color: 0xd8e8f8, metalness: 0.88, roughness: 0.16,
      emissive: 0x8fc4ff, emissiveIntensity: 0.22, envMapIntensity: 1.8
    });

    [-1, 1].forEach((side) => {
      const x = side * 0.78;
      const segs = [
        { w: 0.6, h: 1.6, y: 0.62, d: 0.46 },
        { w: 0.54, h: 1.15, y: 2.22, d: 0.4 },
        { w: 0.47, h: 0.78, y: 3.37, d: 0.34 }
      ];
      segs.forEach((sg, si) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(sg.w, sg.h, sg.d), shell);
        b.position.set(x, sg.y + sg.h / 2, 0);
        b.castShadow = true; b.receiveShadow = true;
        g.add(b);
        // 层间线脚：每 0.1 一条
        const rows = Math.round(sg.h / 0.1);
        for (let r = 1; r < rows; r++) {
          bx(sg.w + 0.008, 0.006, sg.d + 0.008, M.steelDark, x, sg.y + r * 0.1, 0);
        }
        // 段间檐口
        if (si < 2) cornice(sg.w, sg.d, sg.y + sg.h, M.steelDark, 0.018, 0.05).position.x = x;
      });

      // 帆形冠顶
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.56, 14, 1, false), shell);
      crown.position.set(x, 4.15, 0);
      crown.scale.set(0.82, 1, 0.62);
      crown.rotation.z = side * 0.05;
      crown.castShadow = true;
      g.add(crown);
      // 冠顶收边
      const crownLine = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.01, 4, 20), M.lampWarm);
      crownLine.position.set(x, 3.9, 0);
      crownLine.rotation.x = Math.PI / 2;
      g.add(crownLine);

      // 立面竖梃
      for (let i = -2; i <= 2; i++) bx(0.011, 3.4, 0.011, M.steelDark, x + i * 0.1, 2.1, 0.24);
      // 亮窗（正反两面）
      winPlane(0.44, 3.3, 4, 24, '#dcefff', x, 2.14, 0.235);
      const back = winPlane(0.44, 3.3, 4, 24, '#dcefff', x, 2.14, -0.235, Math.PI);
      // 塔顶航空灯
      orb(0.032, M.lampWarm, x, 4.46, 0);
      back.userData.keep = true;
    });

    // 空中连廊
    bx(1.56, 0.13, 0.32, M.glassCurtain, 0, 2.62, 0);
    bx(1.58, 0.02, 0.34, M.lampWarm, 0, 2.7, 0);
    bx(1.58, 0.02, 0.34, M.lampWarm, 0, 2.54, 0);
  }

  /* ============================================================
     5. 超高层天际线 —— 深圳平安、长沙国金
     ============================================================ */
  function buildSkyline() {
    podium(3.8, 3.0, 0.32, { steps: true });
    const y0 = 0.32;

    // 主塔：四棱锥台 + 冠顶
    const mainH = 3.5;
    const main = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.54, mainH, 4), M.glassCurtain);
    main.rotation.y = Math.PI / 4;
    main.position.y = y0 + mainH / 2;
    main.castShadow = true;
    g.add(main);
    // 主塔竖向棱线
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.014, mainH, 0.014), M.steelDark);
      line.position.set(sx * 0.34, y0 + mainH / 2, sz * 0.34);
      line.rotation.y = Math.PI / 4;
      g.add(line);
    });
    // 主塔窗带
    for (let i = 0; i < 16; i++) {
      const w = 0.66 - i * 0.019;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.055), (() => {
        const tex = windowTex(Math.round(w * 14), 1, '#cfe6ff', 0.62);
        return new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.5 });
      })());
      m.position.set(0, y0 + 0.42 + i * 0.2, 0.48 - i * 0.0105);
      g.add(m);
    }
    // 冠顶
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 4), M.steel);
    crown.rotation.y = Math.PI / 4;
    crown.position.y = y0 + mainH + 0.21;
    g.add(crown);
    const crownBand = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.014, 4, 20), M.glowAccent);
    crownBand.position.y = y0 + mainH + 0.02;
    crownBand.rotation.x = Math.PI / 2;
    g.add(crownBand);
    cyl(0.012, 0.018, 0.55, 6, M.steel, 0, y0 + mainH + 0.65, 0);
    orb(0.03, M.lampWarm, 0, y0 + mainH + 0.94, 0);

    // 停机坪
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 16), M.steelDark);
    pad.position.set(0, y0 + mainH + 0.02, 0);
    g.add(pad);

    // 副塔群
    const subs = [
      { x: -1.28, z: 0.35, w: 0.56, h: 1.7, d: 0.5 },
      { x: 1.2, z: 0.5, w: 0.5, h: 1.35, d: 0.46 },
      { x: 1.55, z: -0.55, w: 0.44, h: 1.0, d: 0.42 },
      { x: -1.5, z: -0.6, w: 0.42, h: 0.86, d: 0.4 },
      { x: -0.55, z: -1.15, w: 0.38, h: 0.66, d: 0.36 }
    ];
    subs.forEach((b) => {
      bx(b.w, b.h, b.d, M.granite, b.x, y0 + b.h / 2, b.z);
      cornice(b.w, b.d, y0 + b.h, M.steelDark, 0.02, 0.04).position.set(b.x, y0 + b.h, b.z);
      // 窗带正面
      winPlane(b.w * 0.84, b.h * 0.84, 3, Math.max(4, Math.round(b.h * 8)), '#bcd9ff', b.x, y0 + b.h / 2, b.z + b.d / 2 + 0.005);
      // 侧面
      const side = winPlane(b.d * 0.84, b.h * 0.84, 3, Math.max(4, Math.round(b.h * 8)), '#bcd9ff', b.x + b.w / 2 + 0.005, y0 + b.h / 2, b.z, Math.PI / 2);
      side.userData.keep = true;
      // 屋顶设备
      bx(b.w * 0.4, 0.05, b.d * 0.4, M.steelDark, b.x, y0 + b.h + 0.03, b.z);
    });
  }

  /* ============================================================
     6. 吊脚楼群 —— 重庆洪崖洞
     ============================================================ */
  function buildStilt() {
    // 崖体（多层岩台）
    const cliffLayers = [[2.4, 2.9, 0.3], [2.15, 2.6, 0.3], [1.9, 2.3, 0.28]];
    let cy = 0;
    cliffLayers.forEach(([rt, rb, h]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 7), M.rock);
      m.position.y = cy + h / 2;
      m.scale.z = 0.72;
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      // 岩层线
      const l = new THREE.Mesh(new THREE.CylinderGeometry(rt * 1.01, rt * 1.01, 0.012, 7), M.graniteDark);
      l.position.y = cy + h; l.scale.z = 0.72; g.add(l);
      cy += h;
    });
    // 崖壁下部吊脚柱
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      cyl(0.026, 0.03, 0.42, 5, M.woodDark, Math.cos(a) * 1.78, 0.2, Math.sin(a) * 1.35);
    }

    const floors = 7;
    let y = cy + 0.02;
    for (let i = 0; i < floors; i++) {
      const k = i / floors;
      const w = 3.1 - k * 0.55 + (i % 2 ? 0.06 : -0.04);
      const d = 1.15 - k * 0.14;
      const woodTone = i % 2 ? M.woodDark : new THREE.MeshStandardMaterial({ color: 0x7d5735, roughness: 0.86 });

      // 吊脚柱
      for (let kk = -1; kk <= 1; kk += 2) {
        cyl(0.028, 0.028, 0.2, 5, M.woodDark, kk * w * 0.42, y - 0.1, d * 0.5);
      }
      // 楼体
      bx(w, 0.44, d, woodTone, 0, y + 0.22, 0);
      // 出檐
      const rw = w * 1.12;
      roof(rw, d * 1.16, 0.075, new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.92 }), y + 0.475);
      upturn(rw, d * 1.16, y + 0.455, M.tileGray, 0.5);
      // 暖窗（正反面）
      winPlane(w * 0.88, 0.22, Math.round(w * 6), 1, '#ffce8a', 0, y + 0.22, d / 2 + 0.008, 0, 0.78);
      // 红灯笼
      for (let n = -1; n <= 1; n++) {
        orb(0.026, new THREE.MeshStandardMaterial({ color: 0xff5a44, emissive: 0xff3a22, emissiveIntensity: 2.2, roughness: 0.5 }),
          n * w * 0.3, y + 0.4, d / 2 + 0.02);
      }
      // 栏杆
      railing(w * 0.98, d * 0.96, y + 0.46, M.woodDark, 0.07);
      y += 0.44 + (i === floors - 1 ? 0 : 0.012);
    }

    // 顶部阁楼
    bx(1.3, 0.3, 0.8, M.woodDark, 0, y + 0.15, 0);
    roof(1.5, 0.95, 0.28, M.roofRed, y + 0.42);
    upturn(1.5, 0.95, y + 0.33, M.gold, 0.7);
    finial(y + 0.5, 0.7);

    // 底部栈道入口
    bx(0.9, 0.12, 0.4, M.woodDark, 0, cy + 0.06, 1.62);
    for (let i = -1; i <= 1; i += 2) cyl(0.022, 0.022, 0.3, 5, M.woodDark, i * 0.4, cy - 0.09, 1.7);
  }

  /* ============================================================
     7. 洋葱顶教堂 —— 哈尔滨圣索菲亚
     ============================================================ */
  function buildDome() {
    const brickM = new THREE.MeshStandardMaterial({
      map: brickTex('#7a4136', 'rgba(30,16,14,0.35)', 16),
      roughness: 0.88
    });

    // 台基 + 台阶
    podium(3.0, 2.1, 0.3, { steps: true });
    const y0 = 0.3;

    // 主殿（收分 + 砖纹）
    bx(2.0, 1.0, 1.4, brickM, 0, y0 + 0.5, 0);
    bx(1.94, 1.15, 1.34, brickM, 0, y0 + 1.35, 0);
    cornice(2.02, 1.42, y0 + 1.0, M.marbleShade, 0.04, 0.06);
    cornice(1.96, 1.36, y0 + 1.92, M.marbleShade, 0.035, 0.06);

    // 圆拱窗排（正面）
    for (let i = -1; i <= 1; i++) {
      archDoor(0.2, 0.3, M.glassWarm, i * 0.6, y0 + 0.35, 0.71, 0.03);
    }
    for (let i = -2; i <= 2; i++) {
      // 上层拱窗
      archDoor(0.15, 0.24, M.glassWarm, i * 0.36, y0 + 1.5, 0.685, 0.03);
      // 下层拱窗
      if (Math.abs(i) === 2) archDoor(0.15, 0.22, M.glassWarm, i * 0.36, y0 + 0.62, 0.715, 0.03);
    }

    // 鼓座 + 主穹顶
    cyl(0.6, 0.64, 0.16, 16, brickM, 0, y0 + 2.0, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 28, 20, 0, Math.PI * 2, 0, Math.PI / 1.62), M.greenDome);
    dome.position.y = y0 + 2.05;
    dome.castShadow = true;
    g.add(dome);
    // 穹顶肋
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.009, 4, 20, Math.PI * 0.62), M.brass);
      rib.position.y = y0 + 2.05;
      rib.rotation.y = a;
      rib.rotation.x = Math.PI / 2;
      rib.rotation.z = 0;
      g.add(rib);
    }
    // 顶饰十字
    cyl(0.02, 0.02, 0.34, 6, M.gold, 0, y0 + 2.86, 0);
    bx(0.16, 0.028, 0.028, M.gold, 0, y0 + 2.92, 0);
    bx(0.028, 0.1, 0.028, M.gold, 0, y0 + 2.98, 0);

    // 钟楼
    bx(0.52, 1.2, 0.52, brickM, -1.32, y0 + 0.6, 0.28);
    cornice(0.56, 0.56, y0 + 1.2, M.marbleShade, 0.03, 0.05).position.x = -1.32;
    // 时钟面
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), new THREE.MeshStandardMaterial({ color: 0xf2e6c8, emissive: 0xffdca8, emissiveIntensity: 1.1, roughness: 0.5 }));
    clock.position.set(-1.32, y0 + 1.42, 0.545);
    g.add(clock);
    bx(0.008, 0.07, 0.004, M.steelDark, -1.32, y0 + 1.45, 0.552);
    bx(0.05, 0.008, 0.004, M.steelDark, -1.31, y0 + 1.42, 0.552);
    // 钟楼小穹顶
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14, 0, Math.PI * 2, 0, Math.PI / 1.85), M.greenDome);
    cap.position.set(-1.32, y0 + 1.28, 0.28);
    g.add(cap);
    cyl(0.01, 0.01, 0.2, 5, M.gold, -1.32, y0 + 1.6, 0.28);
    bx(0.1, 0.02, 0.02, M.gold, -1.32, y0 + 1.66, 0.28);

    // 侧穹顶
    [-1, 1].forEach((sx) => {
      cyl(0.19, 0.2, 0.1, 12, brickM, sx * 0.78, y0 + 0.9, 0.62);
      const small = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.75), M.greenDome);
      small.position.set(sx * 0.78, y0 + 0.95, 0.62);
      g.add(small);
      cyl(0.008, 0.008, 0.12, 5, M.gold, sx * 0.78, y0 + 1.12, 0.62);
    });

    // 正门台阶与门廊
    for (let i = 0; i < 3; i++) bx(0.7, 0.05, 0.1, M.marble, 0, y0 - 0.02 - i * 0.05, 0.78 + i * 0.09);
  }

  /* ============================================================
     8. 宫堡 —— 拉萨布达拉宫
     ============================================================ */
  function buildPalace() {
    // 山体（多面岩台，收分）
    [[2.5, 3.0, 0.42], [2.2, 2.6, 0.32], [1.9, 2.25, 0.26]].forEach(([rt, rb, h], i, arr) => {
      const yy = arr.slice(0, i).reduce((s, a) => s + a[2], 0);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 7), M.rock);
      m.position.y = yy + h / 2;
      m.scale.z = 0.7;
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    });
    const y0 = 0.42 + 0.32 + 0.26;

    // 白宫（两层，逐层收分）
    bx(2.5, 0.62, 1.25, M.whiteWall, 0, y0 + 0.31, 0);
    bx(2.4, 0.5, 1.18, M.whiteWall, 0, y0 + 0.87, 0);
    // 边玛墙（红棕压顶带）
    const bianma = new THREE.MeshStandardMaterial({ color: 0x6d3128, roughness: 0.9 });
    bx(2.44, 0.09, 1.21, bianma, 0, y0 + 1.15, 0);
    // 层间线
    bx(2.54, 0.025, 1.28, M.marbleShade, 0, y0 + 0.63, 0);

    // 红宫（居中，略高）
    bx(1.3, 0.82, 0.95, M.roofRed, 0, y0 + 1.62, -0.02);
    bx(1.2, 0.14, 0.88, bianma, 0, y0 + 2.08, -0.02);

    // 窗洞：梯形黑窗（布达拉宫标志性）
    const winMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.95 });
    function trapezoidWin(w, h, x, y, z) {
      const shape = new THREE.Shape();
      shape.moveTo(-w * 0.34, 0);
      shape.lineTo(w * 0.34, 0);
      shape.lineTo(w * 0.42, h);
      shape.lineTo(-w * 0.42, h);
      shape.closePath();
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), winMat);
      m.position.set(x, y, z);
      g.add(m);
      // 窗楣
      bx(w * 0.9, 0.022, 0.02, M.marbleShade, x, y + h + 0.014, z + 0.004);
    }
    // 白宫窗阵
    for (let r = 0; r < 2; r++) {
      for (let i = -5; i <= 5; i++) {
        if (Math.abs(i) <= 1 && r === 0) continue;  // 中央留门
        trapezoidWin(0.1, 0.13, i * 0.2, y0 + 0.14 + r * 0.56, 0.63);
      }
    }
    // 红宫窗阵
    for (let r = 0; r < 2; r++) {
      for (let i = -2; i <= 2; i++) trapezoidWin(0.095, 0.12, i * 0.2, y0 + 1.32 + r * 0.36, 0.47);
    }

    // 中央门洞与台阶
    archDoor(0.2, 0.34, winMat, 0, y0 + 0.02, 0.635, 0.04);
    for (let i = 0; i < 5; i++) {
      bx(0.5 - i * 0.02, 0.05, 0.1, M.marbleShade, 0, y0 - 0.02 - i * 0.05, 0.72 + i * 0.09);
    }

    // 三座金顶
    [[0, y0 + 2.18, 0.62, 0.66], [-0.42, y0 + 2.12, 0.42, 0.46], [0.42, y0 + 2.12, 0.42, 0.46]].forEach(([x, y, w, d]) => {
      roof(w, d, 0.16, M.tileGold, y + 0.08);
      upturn(w, d, y + 0.02, M.gold, 0.6);
      finial(y + 0.16, 0.75);
    });

    // 两侧附属白房
    [-1, 1].forEach((sx) => {
      bx(0.5, 0.4, 0.7, M.whiteWall, sx * 1.28, y0 + 0.2, 0.28);
      bx(0.5, 0.03, 0.72, M.gold, sx * 1.28, y0 + 0.41, 0.28);
      for (let i = 0; i < 2; i++) trapezoidWin(0.09, 0.11, sx * 1.28, y0 + 0.08 + i * 0.18, 0.64);
    });

    // 经幡杆
    [-1, 1].forEach((sx) => {
      cyl(0.012, 0.016, 0.9, 5, M.woodDark, sx * 1.7, y0 + 0.45, 0.7);
      [0, 1, 2, 3].forEach((i) => {
        bx(0.1, 0.07, 0.004, [M.roofRed, M.tileGold, M.jade, M.whiteWall][i], sx * 1.7 + 0.06, y0 + 0.8 - i * 0.08, 0.7);
      });
    });
  }

  /* ============================================================
     9. 摩天轮 —— 天津之眼
     ============================================================ */
  function buildFerris() {
    // 桥面
    bx(4.4, 0.16, 1.3, M.granite, 0, 0.24, 0);
    bx(4.44, 0.035, 1.34, M.steelDark, 0, 0.335, 0);
    // 桥墩
    [-2.0, -1.0, 0, 1.0, 2.0].forEach((x) => {
      bx(0.2, 0.32, 1.2, M.graniteDark, x, 0.08, 0);
    });
    // 桥面栏杆
    [-1, 1].forEach((sz) => {
      bx(4.4, 0.02, 0.02, M.steel, 0, 0.52, sz * 0.62);
      for (let i = -8; i <= 8; i++) bx(0.014, 0.18, 0.014, M.steel, i * 0.26, 0.43, sz * 0.62);
    });
    // 桥面灯柱
    [-1.9, -0.7, 0.7, 1.9].forEach((x) => {
      [-1, 1].forEach((sz) => {
        cyl(0.012, 0.014, 0.34, 5, M.steelDark, x, 0.5, sz * 0.62);
        orb(0.03, M.lampWarm, x, 0.68, sz * 0.62);
      });
    });

    // A 字支架
    [-1, 1].forEach((sx) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 1.62, 6), M.steel);
      leg.position.set(sx * 0.44, 1.05, 0);
      leg.rotation.z = sx * 0.3;
      leg.castShadow = true;
      g.add(leg);
      const leg2 = leg.clone();
      leg2.rotation.z = -sx * 0.3;
      leg2.position.z = 0;
      g.add(leg2);
    });
    bx(0.9, 0.05, 0.05, M.steelDark, 0, 1.5, 0);

    // 轮
    const wheel = new THREE.Group();
    const R = 1.5;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.038, 8, 64), M.steel);
    wheel.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(R * 0.88, 0.016, 6, 56), M.steelDark);
    wheel.add(ring2);
    // 轮缘灯带
    const lightRing = new THREE.Mesh(new THREE.TorusGeometry(R, 0.014, 5, 64), M.glowAccent);
    wheel.add(lightRing);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12), M.steelDark);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);

    const N = 24;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      // 辐条
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, R, 4), M.steel);
      spoke.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0);
      spoke.rotation.z = a - Math.PI / 2;
      wheel.add(spoke);
      // 轿厢
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.095, 0.12), new THREE.MeshStandardMaterial({
        color: 0xf2f6ff, emissive: 0xffd9a0, emissiveIntensity: 1.4, roughness: 0.4
      }));
      cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      cab.castShadow = true;
      wheel.add(cab);
      // 悬挂杆
      const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 4), M.steelDark);
      hang.position.set(Math.cos(a) * R, Math.sin(a) * R + 0.07, 0);
      wheel.add(hang);
    }
    wheel.position.set(0, 1.95, 0);
    g.add(wheel);
    g.userData.wheel = wheel;

    // 桥头灯
    [-2.15, 2.15].forEach((x) => {
      cyl(0.03, 0.04, 0.6, 6, M.steelDark, x, 0.62, 0);
      orb(0.05, M.lampWarm, x, 0.96, 0);
    });
  }

  /* ============================================================
     10. 桥 —— 兰州中山桥 / 绍兴八字桥
     ============================================================ */
  function buildBridge() {
    const stoneArch = id === 'shaoxing';

    if (stoneArch) {
      /* 绍兴八字桥：石拱桥 */
      // 河岸
      [-1, 1].forEach((sz) => {
        bx(3.6, 0.16, 0.5, M.graniteDark, 0, 0.08, sz * 1.05);
      });
      // 三孔拱
      const spans = [-1.05, 0, 1.05];
      spans.forEach((x, i) => {
        const r = i === 1 ? 0.42 : 0.3;
        const arch = new THREE.Mesh(new THREE.TorusGeometry(r, 0.075, 6, 22, Math.PI), M.granite);
        arch.position.set(x, 0.18, 0);
        arch.rotation.z = 0;
        g.add(arch);
        // 拱圈石线
        const line = new THREE.Mesh(new THREE.TorusGeometry(r + 0.06, 0.014, 4, 22, Math.PI), M.marbleShade);
        line.position.set(x, 0.18, 0.02);
        g.add(line);
      });
      // 桥面（拱起）
      for (let i = -7; i <= 7; i++) {
        const x = i * 0.28;
        const hh = 0.62 - Math.abs(x) * 0.075;
        bx(0.29, 0.1, 0.6, M.granite, x, hh, 0);
        // 栏板
        [-1, 1].forEach((sz) => {
          bx(0.29, 0.14, 0.05, M.marbleShade, x, hh + 0.12, sz * 0.3);
        });
        // 望柱
        if (Math.abs(i) % 3 === 0) {
          [-1, 1].forEach((sz) => {
            bx(0.05, 0.2, 0.06, M.marble, x, hh + 0.15, sz * 0.3);
            orb(0.026, M.marble, x, hh + 0.27, sz * 0.3);
          });
        }
      }
      // 桥台与台阶
      [-1, 1].forEach((sx) => {
        bx(0.5, 0.3, 0.66, M.granite, sx * 2.15, 0.15, 0);
        for (let i = 0; i < 3; i++) bx(0.5, 0.05, 0.1, M.marbleShade, 0, 0.1 + i * 0.07, 0);
      });
      // 河边柳树意象的灯
      [-1, 1].forEach((sx) => {
        cyl(0.03, 0.035, 0.5, 6, M.woodDark, sx * 1.85, 0.25, 0.9);
        orb(0.05, M.lampWarm, sx * 1.85, 0.55, 0.9);
      });
    } else {
      /* 兰州中山桥：钢桁架拱桥 */
      // 桥墩
      [-1.6, -0.55, 0.55, 1.6].forEach((x) => {
        bx(0.26, 0.44, 0.8, M.graniteDark, x, 0.22, 0);
        bx(0.32, 0.05, 0.86, M.granite, x, 0.46, 0);
      });
      // 桥面
      bx(4.4, 0.12, 0.96, M.granite, 0, 0.54, 0);
      bx(4.44, 0.02, 1.0, M.steelDark, 0, 0.61, 0);

      // 双层钢拱
      [[1.15, 0.05], [1.45, 0.038]].forEach(([R, t]) => {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(R, t, 6, 30, Math.PI), M.steel);
        arch.position.y = 0.6;
        arch.castShadow = true;
        g.add(arch);
        const archB = arch.clone();
        archB.position.z = 0;
        archB.scale.z = 1;
        g.add(archB);
      });
      // 拱肋横向联系
      for (let i = -5; i <= 5; i++) {
        const x = i * 0.28;
        const h = Math.sqrt(Math.max(0, 1.15 * 1.15 - x * x));
        if (h > 0.1) bx(0.016, 0.016, 0.42, M.steelDark, x, 0.6 + h, 0);
      }
      // 吊杆与桁架
      for (let i = -6; i <= 6; i++) {
        const x = i * 0.32;
        const h = Math.sqrt(Math.max(0, 1.15 * 1.15 - x * x));
        [-1, 1].forEach((sz) => {
          bx(0.013, Math.max(0.05, h), 0.013, M.steel, x, 0.6 + Math.max(0.05, h) / 2, sz * 0.44);
        });
        // 桥面下方斜撑
        if (i % 2 === 0 && i !== 6) {
          const brace = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.012), M.steelDark);
          brace.position.set(x + 0.16, 0.5, 0);
          g.add(brace);
        }
      }
      // 栏杆
      [-0.47, 0.47].forEach((z) => {
        bx(4.4, 0.018, 0.018, M.steel, 0, 0.92, z);
        bx(4.4, 0.014, 0.014, M.steel, 0, 0.78, z);
        for (let i = -9; i <= 9; i++) bx(0.012, 0.3, 0.012, M.steel, i * 0.24, 0.78, z);
      });
      // 桥头灯柱（中山桥标志性）
      [-1.9, -0.9, 0.9, 1.9].forEach((x) => {
        [-1, 1].forEach((sz) => {
          cyl(0.016, 0.02, 0.42, 6, M.steelDark, x, 0.76, sz * 0.47);
          bx(0.07, 0.09, 0.07, M.steelDark, x, 0.99, sz * 0.47);
          orb(0.032, M.lampWarm, x, 1.0, sz * 0.47);
          // 灯罩
          bx(0.1, 0.012, 0.1, M.steelDark, x, 1.05, sz * 0.47);
        });
      });
    }
  }

  /* ============================================================
     分派
     ============================================================ */
  const builders = {
    gate: buildGate,
    pagoda: buildPagoda,
    tvTower: buildTvTower,
    tower: buildTvTower,
    twin: buildTwin,
    skyline: buildSkyline,
    stilt: buildStilt,
    dome: buildDome,
    palace: buildPalace,
    ferris: buildFerris,
    bridge: buildBridge
  };
  (builders[t] || buildGate)();

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return g;
}
