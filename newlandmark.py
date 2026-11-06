import io, re

p = "scene.js"
s = io.open(p, encoding="utf-8").read()

start = s.index("function buildLandmark() {")
end = s.index("const landmark = buildLandmark();")

new = r'''function buildLandmark() {
  const g = new THREE.Group();
  const t = city.type;

  /* ---- 公共材质 ---- */
  const steel = new THREE.MeshStandardMaterial({ color: 0xd9e6f6, metalness: 0.92, roughness: 0.22, emissive: ACCENT, emissiveIntensity: 0.10 });
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
    hipRoof(3.5, 1.75, 0.26, gold, 1.82);
    tips(3.5, 1.75, 1.8, gold, 1.1);
    // 上层
    box(2.1, 0.34, 0.9, wallRed, 0, 2.02, 0, g);
    winPanel(1.7, 0.18, 6, 1, '#ffe0b0', 0, 2.02, 0.46);
    // 上层屋檐（攒尖）
    hipRoof(2.8, 1.35, 0.3, gold, 2.28);
    tips(2.8, 1.35, 2.26, gold, 0.85);
    // 正脊与宝顶
    box(0.9, 0.08, 0.34, gold, 0, 2.44, 0, g);
    box(0.04, 0.16, 0.04, MAT.warm, 0, 2.55, 0, g);
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
      const bh = (0.34 - k * 0.03);
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
      hipRoof(w * 1.55, w * 1.55, 0.12, i === 0 ? gold : tileGreen, y + bh + 0.05);
      tips(w * 1.55, w * 1.55, y + bh + 0.04, gold, 0.7);
      y += bh + 0.13;
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
      const H = 3.05, base = 0.42, topR = 0.1;
      const N = 22;
      for (let i = 0; i < N; i++) {
        const k = i / (N - 1);
        const yy = 0.35 + k * H;
        const r = base * (1 - k) + topR * k;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 4, 26), steel);
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
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.014, 4, false), kind ? steel : gold);
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
      box(w, 0.4, d, i % 2 ? woodDark : brickDark, 0, y + 0.2, 0, g);
      // 檐
      hipRoof(w * 1.16, d * 1.18, 0.1, roofRed, y + 0.42);
      tips(w * 1.16, d * 1.18, y + 0.4, gold, 0.6);
      // 暖窗
      winPanel(w * 0.86, 0.2, Math.round(w * 5), 1, '#ffce8a', 0, y + 0.2, d / 2 + 0.008);
      y += 0.44;
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
    box(2.5, 0.95, 1.25, whiteWall, 0, 1.28, 0, g);
    // 红宫（中间）
    box(1.35, 0.55, 1.05, roofRed, 0, 2.02, 0, g);
    // 金顶
    hipRoof(1.7, 1.25, 0.22, gold, 2.36);
    tips(1.7, 1.25, 2.34, gold, 0.8);
    hipRoof(1.15, 0.85, 0.2, gold, 2.6);
    // 窗（白宫 + 红宫）
    winPanel(2.2, 0.5, 11, 2, '#3a2a22', 0, 1.28, 0.63);
    winPanel(1.1, 0.3, 5, 1, '#2a1c18', 0, 2.02, 0.53);
    // 层间线
    box(2.54, 0.03, 1.28, MAT.stoneDark, 0, 1.66, 0, g);
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

'''

s = s[:start] + new + s[end:]
io.open(p, "w", encoding="utf-8").write(s)
print("rewrote buildLandmark, len", len(s))
