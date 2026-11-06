/* 城市卡片插画：等距微缩地标（Canvas 2D 绘制，无外部图片依赖） */
(function () {
  'use strict';

  const W = 512, H = 680;
  const CX = W / 2;
  const BASE = 496;          // 地标落地点
  const PLATE = 232;         // 平台半宽

  const C = {
    sky0: '#0a1424',
    sky1: '#060b15',
    plateTop: '#1b2740',
    plateTop2: '#101a2c',
    plateLeft: '#0d1524',
    plateRight: '#16233a',
    warm: '#ffcf8a',
    dark: '#0a0f19'
  };

  const hex2rgb = h => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgba = (h, a) => {
    const [r, g, b] = hex2rgb(h);
    return `rgba(${r},${g},${b},${a})`;
  };
  const mix = (h1, h2, t) => {
    const a = hex2rgb(h1), b = hex2rgb(h2);
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
  };

  function poly(ctx, pts, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function pick(pal, key) { return pal[key]; }

  /* 飞檐屋顶：中间高、两端上翘 */
  function eave(ctx, cx, y, w, h, fill, edge) {
    const half = w / 2;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.quadraticCurveTo(cx - half * 0.55, y - h * 0.35, cx - half * 0.30, y - h);
    ctx.lineTo(cx + half * 0.30, y - h);
    ctx.quadraticCurveTo(cx + half * 0.55, y - h * 0.35, cx + half, y);
    ctx.quadraticCurveTo(cx + half * 0.5, y + h * 0.18, cx, y + h * 0.2);
    ctx.quadraticCurveTo(cx - half * 0.5, y + h * 0.18, cx - half, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1.2; ctx.stroke(); }
  }

  function windows(ctx, x, y, w, h, cols, rows, glow) {
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const on = ((r * 7 + c * 13 + Math.round(x)) % 5) > 1;
        ctx.fillStyle = on ? glow : 'rgba(120,160,215,0.10)';
        ctx.fillRect(x + c * cw + cw * 0.22, y + r * ch + ch * 0.24, cw * 0.56, ch * 0.5);
      }
    }
  }

  /* ---------------- 地标 ---------------- */
  const shapes = {
    /* 天安门 / 城楼 */
    gate(ctx, pal, s) {
      const w = 300 * s, h = 210 * s, x = CX, y = BASE;
      const accent = pal.accent;
      // 城台
      const g = ctx.createLinearGradient(0, y - 110 * s, 0, y);
      g.addColorStop(0, mix('#8f3630', '#5d2320', 0.15));
      g.addColorStop(1, '#3d1714');
      ctx.fillStyle = g;
      ctx.fillRect(x - w / 2, y - h * 0.52, w, h * 0.52);
      // 城台装饰带
      ctx.fillStyle = rgba(accent, 0.22);
      ctx.fillRect(x - w / 2, y - h * 0.53, w, 5 * s);
      // 五个门洞
      for (let i = -2; i <= 2; i++) {
        const dw = (i === 0 ? 34 : 26) * s, dh = (i === 0 ? 62 : 50) * s;
        const dx = x + i * w * 0.15;
        ctx.beginPath();
        ctx.moveTo(dx - dw / 2, y);
        ctx.lineTo(dx - dw / 2, y - dh * 0.72);
        ctx.quadraticCurveTo(dx, y - dh * 1.05, dx + dw / 2, y - dh * 0.72);
        ctx.lineTo(dx + dw / 2, y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(4,6,10,0.88)';
        ctx.fill();
        ctx.strokeStyle = rgba(accent, 0.18);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // 城楼
      const tw = w * 0.72, tx = x;
      ctx.fillStyle = '#7c2f2a';
      ctx.fillRect(tx - tw / 2, y - h * 0.66, tw, h * 0.14);
      // 柱子
      ctx.fillStyle = '#4a1a17';
      for (let i = -3; i <= 3; i++) ctx.fillRect(tx + i * tw * 0.13 - 3 * s, y - h * 0.66, 6 * s, h * 0.14);
      // 窗
      windows(ctx, tx - tw * 0.32, y - h * 0.64, tw * 0.64, h * 0.1, 7, 1, rgba(C.warm, 0.55));

      // 下层屋檐
      eave(ctx, tx, y - h * 0.665, tw * 1.22, 24 * s, mix('#e6b96f', '#b98a3d', 0.35), rgba(accent, 0.45));
      // 上层墙体
      ctx.fillStyle = '#6d2622';
      ctx.fillRect(tx - tw * 0.34, y - h * 0.80, tw * 0.68, h * 0.135);
      windows(ctx, tx - tw * 0.28, y - h * 0.775, tw * 0.56, h * 0.09, 6, 1, rgba(C.warm, 0.6));
      // 上层屋檐
      eave(ctx, tx, y - h * 0.805, tw * 0.94, 20 * s, '#f2d295', rgba(accent, 0.4));
      // 正脊
      ctx.fillStyle = '#e9c47f';
      ctx.fillRect(tx - tw * 0.30, y - h * 0.895, tw * 0.60, 6 * s);
      ctx.fillStyle = rgba(accent, 0.85);
      ctx.fillRect(tx - 2 * s, y - h * 0.95, 4 * s, 18 * s);
      // 轮廓光
      ctx.strokeStyle = rgba(accent, 0.5);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.lineTo(x - w / 2, y - h * 0.52);
      ctx.stroke();
    },

    /* 塔：大雁塔 / 雷峰塔 / 黄鹤楼 */
    pagoda(ctx, pal, s) {
      const accent = pal.accent;
      const tiers = 7;
      const baseW = 150 * s;
      let y = BASE;
      // 台基
      ctx.fillStyle = '#20293c';
      ctx.fillRect(CX - baseW * 0.78, y - 14 * s, baseW * 1.56, 14 * s);
      for (let i = 0; i < tiers; i++) {
        const t = i / tiers;
        const tw = baseW * (1 - t * 0.46);
        const th = 26 * s;
        y -= th;
        // 塔身
        const g = ctx.createLinearGradient(CX - tw / 2, 0, CX + tw / 2, 0);
        g.addColorStop(0, mix('#7a5a3a', '#2a2033', 0.1));
        g.addColorStop(1, '#1b2333');
        ctx.fillStyle = g;
        ctx.fillRect(CX - tw / 2, y, tw, th);
        // 窗
        ctx.fillStyle = rgba(C.warm, 0.55);
        ctx.fillRect(CX - tw * 0.1, y + th * 0.3, tw * 0.2, th * 0.36);
        // 檐
        eave(ctx, CX, y + 2 * s, tw * 1.34, 12 * s, i % 2 ? '#c98f45' : '#e0ab5c', rgba(accent, 0.45));
        y -= 6 * s;
      }
      // 塔刹
      ctx.fillStyle = '#e8c07a';
      ctx.fillRect(CX - 3 * s, y - 26 * s, 6 * s, 26 * s);
      ctx.beginPath();
      ctx.arc(CX, y - 30 * s, 5 * s, 0, Math.PI * 2);
      ctx.fillStyle = rgba(accent, 0.9);
      ctx.fill();
    },

    /* 东方明珠 / 广州塔 / 天府塔 */
    tvTower(ctx, pal, s, variant) {
      const accent = pal.accent;
      const top = BASE - 330 * s;
      // 底座
      poly(ctx, [[CX - 60 * s, BASE], [CX + 60 * s, BASE], [CX + 26 * s, BASE - 46 * s], [CX - 26 * s, BASE - 46 * s]], '#22304a');
      ctx.strokeStyle = rgba(accent, 0.25);
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(CX - 58 * s + i * 6 * s, BASE);
        ctx.lineTo(CX - 16 * s + i * 8 * s, BASE - 46 * s);
        ctx.stroke();
      }

      if (variant === 'canton') {
        // 广州塔：扭转的格构
        const g = ctx.createLinearGradient(CX - 30 * s, 0, CX + 30 * s, 0);
        g.addColorStop(0, rgba(accent, 0.35));
        g.addColorStop(0.5, rgba(accent, 0.85));
        g.addColorStop(1, rgba(accent, 0.35));
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.4 * s;
        for (let i = 0; i < 11; i++) {
          const t = i / 10;
          const yy = BASE - 46 * s - t * (BASE - 46 * s - top);
          const rx = (26 - t * 16) * s;
          ctx.beginPath();
          ctx.ellipse(CX, yy, rx, rx * 0.26, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = rgba(accent, 0.55);
        ctx.lineWidth = 1.6 * s;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(CX + Math.cos(a) * 26 * s, BASE - 46 * s);
          ctx.lineTo(CX + Math.cos(a) * 10 * s, top);
          ctx.stroke();
        }
        ctx.fillStyle = rgba(accent, 0.95);
        ctx.fillRect(CX - 2 * s, top - 34 * s, 4 * s, 34 * s);
      } else if (variant === 'sphere') {
        // 东方明珠：三球
        ctx.fillStyle = '#2a3752';
        ctx.fillRect(CX - 13 * s, top + 40 * s, 26 * s, BASE - 46 * s - top - 40 * s);
        // 支撑腿
        ctx.fillStyle = '#1c2740';
        [-1, 1].forEach(sd => {
          ctx.beginPath();
          ctx.moveTo(CX + sd * 12 * s, BASE - 160 * s);
          ctx.lineTo(CX + sd * 62 * s, BASE);
          ctx.lineTo(CX + sd * 40 * s, BASE);
          ctx.lineTo(CX + sd * 4 * s, BASE - 150 * s);
          ctx.closePath();
          ctx.fill();
        });
        ctx.strokeStyle = rgba(accent, 0.18);
        ctx.lineWidth = 1;
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(CX + i * 3.5 * s, top + 40 * s);
          ctx.lineTo(CX + i * 3.5 * s, BASE - 150 * s);
          ctx.stroke();
        }
        const balls = [[0.30, 42], [0.55, 26], [0.80, 16]];
        balls.forEach(([t, r]) => {
          const yy = BASE - 46 * s - t * (BASE - 46 * s - top);
          const rr = r * s;
          const grd = ctx.createRadialGradient(CX - rr * 0.35, yy - rr * 0.35, rr * 0.15, CX, yy, rr);
          grd.addColorStop(0, '#ffffff');
          grd.addColorStop(0.35, rgba(accent, 0.95));
          grd.addColorStop(1, rgba(accent, 0.25));
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(CX, yy, rr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = rgba(accent, 0.6);
          ctx.lineWidth = 1;
          ctx.stroke();
        });
        ctx.fillStyle = rgba(accent, 0.9);
        ctx.fillRect(CX - 2 * s, top - 30 * s, 4 * s, 34 * s);
      } else {
        // 天府塔：细长塔 + 观景台
        ctx.fillStyle = '#243149';
        poly(ctx, [[CX - 12 * s, BASE - 46 * s], [CX + 12 * s, BASE - 46 * s], [CX + 5 * s, top], [CX - 5 * s, top]], '#243149');
        ctx.fillStyle = rgba(accent, 0.85);
        ctx.beginPath();
        ctx.ellipse(CX, top + 96 * s, 26 * s, 9 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(CX - 2 * s, top - 26 * s, 4 * s, 40 * s);
      }
    },

    /* 现代天际线：深圳平安 / 长沙国金 */
    skyline(ctx, pal, s) {
      const accent = pal.accent;
      const towers = [
        { x: -96, w: 56, h: 150, a: 0.35 },
        { x: -38, w: 64, h: 236, a: 0.95 },
        { x: 26, w: 46, h: 176, a: 0.45 },
        { x: 82, w: 52, h: 120, a: 0.3 }
      ];
      towers.forEach(t => {
        const x = CX + t.x * s, w = t.w * s, h = t.h * s;
        const g = ctx.createLinearGradient(x, BASE - h, x + w, BASE);
        g.addColorStop(0, mix('#31425f', accent, t.a * 0.55));
        g.addColorStop(1, '#131c2c');
        ctx.fillStyle = g;
        ctx.fillRect(x - w / 2, BASE - h, w, h);
        windows(ctx, x - w / 2 + w * 0.14, BASE - h + h * 0.1, w * 0.72, h * 0.8, 3, Math.round(h / 26), rgba(C.warm, 0.4 + t.a * 0.3));
        if (t.a > 0.9) {
          ctx.fillStyle = rgba(accent, 0.9);
          ctx.fillRect(x - 1.5 * s, BASE - h - 30 * s, 3 * s, 30 * s);
        }
      });
    },

    /* 洪崖洞：层叠吊脚楼 */
    stilt(ctx, pal, s) {
      const accent = pal.accent;
      // 崖体
      poly(ctx, [[CX - 190 * s, BASE], [CX + 190 * s, BASE], [CX + 150 * s, BASE - 60 * s], [CX - 160 * s, BASE - 54 * s]], '#141d2e');
      const floors = 5;
      for (let i = 0; i < floors; i++) {
        const t = i / floors;
        const w = (330 - i * 26) * s;
        const y = BASE - 48 * s - i * 46 * s;
        const g = ctx.createLinearGradient(0, y, 0, y + 44 * s);
        g.addColorStop(0, mix('#6b4a2e', '#3a2a22', 0.2));
        g.addColorStop(1, '#241a17');
        ctx.fillStyle = g;
        ctx.fillRect(CX - w / 2, y - 44 * s, w, 44 * s);
        // 檐
        eave(ctx, CX, y - 44 * s, w * 1.08, 12 * s, '#3b2a22', rgba(accent, 0.35));
        // 暖窗
        const n = Math.round(w / (26 * s));
        for (let k = 0; k < n; k++) {
          const wx = CX - w / 2 + (k + 0.5) * (w / n) - 6 * s;
          ctx.fillStyle = ((k + i) % 3 === 0) ? 'rgba(120,90,60,0.6)' : rgba(C.warm, 0.85);
          ctx.fillRect(wx, y - 34 * s, 12 * s, 16 * s);
        }
      }
      // 顶阁
      eave(ctx, CX, BASE - 48 * s - floors * 46 * s + 2 * s, 120 * s, 16 * s, '#5a3f2a', rgba(accent, 0.5));
    },

    /* 圣索菲亚：洋葱顶教堂 */
    dome(ctx, pal, s) {
      const accent = pal.accent;
      const w = 210 * s, h = 200 * s, y = BASE;
      // 主体
      const g = ctx.createLinearGradient(CX - w / 2, 0, CX + w / 2, 0);
      g.addColorStop(0, '#6a3a35');
      g.addColorStop(1, '#3a1f1d');
      ctx.fillStyle = g;
      ctx.fillRect(CX - w / 2, y - h * 0.55, w, h * 0.55);
      // 砖纹
      ctx.strokeStyle = 'rgba(255,220,200,0.06)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(CX - w / 2, y - i * h * 0.068);
        ctx.lineTo(CX + w / 2, y - i * h * 0.068);
        ctx.stroke();
      }
      // 主穹顶
      const dg = ctx.createRadialGradient(CX - 26 * s, y - h * 0.78, 8 * s, CX, y - h * 0.72, 70 * s);
      dg.addColorStop(0, '#8fd3a8');
      dg.addColorStop(0.6, '#3f7d64');
      dg.addColorStop(1, '#1c3b31');
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.ellipse(CX, y - h * 0.55, w * 0.3, h * 0.28, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(CX - w * 0.3, y - h * 0.56, w * 0.6, 6 * s);
      // 十字
      ctx.strokeStyle = rgba(accent, 0.85);
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(CX, y - h * 0.83);
      ctx.lineTo(CX, y - h * 0.95);
      ctx.moveTo(CX - 8 * s, y - h * 0.91);
      ctx.lineTo(CX + 8 * s, y - h * 0.91);
      ctx.stroke();
      // 侧塔
      [-1, 1].forEach(side => {
        const tx = CX + side * w * 0.42;
        ctx.fillStyle = '#4a2825';
        ctx.fillRect(tx - 16 * s, y - h * 0.5, 32 * s, h * 0.5);
        ctx.fillStyle = '#6fa98a';
        ctx.beginPath();
        ctx.ellipse(tx, y - h * 0.5, 16 * s, 20 * s, 0, Math.PI, 0);
        ctx.fill();
      });
      // 门
      ctx.fillStyle = 'rgba(6,8,12,0.8)';
      ctx.fillRect(CX - 16 * s, y - 46 * s, 32 * s, 46 * s);
    },

    /* 布达拉宫 */
    palace(ctx, pal, s) {
      const accent = pal.accent;
      // 山体
      poly(ctx, [[CX - 200 * s, BASE], [CX + 200 * s, BASE], [CX + 120 * s, BASE - 70 * s], [CX - 130 * s, BASE - 60 * s]], '#121a29');
      // 白宫
      const wy = BASE - 150 * s;
      ctx.fillStyle = '#ded7c6';
      ctx.fillRect(CX - 150 * s, wy, 300 * s, 90 * s);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(CX - 150 * s, wy + 84 * s, 300 * s, 6 * s);
      // 红宫
      ctx.fillStyle = '#8f3129';
      ctx.fillRect(CX - 54 * s, wy - 60 * s, 132 * s, 60 * s);
      // 金顶
      eave(ctx, CX + 12 * s, wy - 60 * s, 150 * s, 16 * s, '#e0b45f', rgba(accent, 0.6));
      eave(ctx, CX + 12 * s, wy - 76 * s, 110 * s, 14 * s, '#f0cd85', rgba(accent, 0.4));
      // 窗
      for (let i = -5; i <= 5; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(30,20,18,0.85)' : 'rgba(255,235,190,0.55)';
        ctx.fillRect(CX + i * 26 * s - 5 * s, wy + 22 * s, 10 * s, 18 * s);
      }
      for (let i = -2; i <= 2; i++) {
        ctx.fillStyle = 'rgba(20,12,10,0.85)';
        ctx.fillRect(CX + 8 * s + i * 24 * s - 4 * s, wy - 44 * s, 8 * s, 16 * s);
      }
    },

    /* 天津之眼 */
    ferris(ctx, pal, s) {
      const accent = pal.accent;
      const cx = CX, cy = BASE - 190 * s, r = 150 * s;
      // 桥面
      ctx.fillStyle = '#1b2537';
      ctx.fillRect(CX - 230 * s, BASE - 34 * s, 460 * s, 34 * s);
      ctx.strokeStyle = rgba(accent, 0.25);
      ctx.lineWidth = 1;
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(CX + i * 50 * s, BASE - 34 * s);
        ctx.lineTo(CX + i * 50 * s, BASE);
        ctx.stroke();
      }
      // 轮
      ctx.strokeStyle = rgba(accent, 0.85);
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.6 * s;
      ctx.strokeStyle = rgba(accent, 0.45);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const x1 = cx + Math.cos(a) * r * 0.72, y1 = cy + Math.sin(a) * r * 0.72;
        const x2 = cx + Math.cos(a) * r, y2 = cy + Math.sin(a) * r;
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = rgba(accent, 0.4);
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();
        // 轿厢
        ctx.fillStyle = rgba(C.warm, 0.9);
        ctx.beginPath();
        ctx.arc(x2, y2, 4.5 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // 支架
      ctx.strokeStyle = '#2c3c58';
      ctx.lineWidth = 6 * s;
      ctx.beginPath();
      ctx.moveTo(CX - 60 * s, BASE - 34 * s); ctx.lineTo(cx, cy);
      ctx.moveTo(CX + 60 * s, BASE - 34 * s); ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.fillStyle = rgba(accent, 0.9);
      ctx.beginPath(); ctx.arc(cx, cy, 7 * s, 0, Math.PI * 2); ctx.fill();
    },

    /* 中山桥：钢桁架拱桥 */
    bridge(ctx, pal, s) {
      const accent = pal.accent;
      // 水面
      ctx.fillStyle = 'rgba(20,40,60,0.55)';
      ctx.fillRect(0, BASE + 6 * s, W, 60 * s);
      // 桥面
      ctx.fillStyle = '#1e2941';
      ctx.fillRect(CX - 230 * s, BASE - 34 * s, 460 * s, 22 * s);
      // 拱
      ctx.strokeStyle = rgba(accent, 0.8);
      ctx.lineWidth = 5 * s;
      ctx.beginPath();
      ctx.arc(CX, BASE - 24 * s, 150 * s, Math.PI, 0);
      ctx.stroke();
      ctx.strokeStyle = rgba(accent, 0.45);
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(CX, BASE - 24 * s, 168 * s, Math.PI * 1.02, -0.02);
      ctx.stroke();
      // 竖杆
      for (let i = -6; i <= 6; i++) {
        const x = CX + i * 24 * s;
        const yArc = BASE - 24 * s - Math.sqrt(Math.max(0, (150 * s) ** 2 - (x - CX) ** 2));
        ctx.beginPath();
        ctx.moveTo(x, BASE - 34 * s);
        ctx.lineTo(x, Math.max(yArc, BASE - 140 * s));
        ctx.strokeStyle = rgba(accent, 0.3);
        ctx.lineWidth = 1.4 * s;
        ctx.stroke();
      }
      // 灯
      for (let i = -2; i <= 2; i++) {
        ctx.fillStyle = rgba(C.warm, 0.85);
        ctx.beginPath();
        ctx.arc(CX + i * 90 * s, BASE - 44 * s, 3.4 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const VARIANTS = { shanghai: 'sphere', guangzhou: 'canton', chengdu: 'plain' };

  function drawArt(canvas, city) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const accent = city.accent || '#7fe3ff';
    const pal = { accent: accent };

    ctx.clearRect(0, 0, W, H);

    // 夜空
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#070d18');
    sky.addColorStop(0.55, '#0a1526');
    sky.addColorStop(1, '#060a13');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // 光晕
    const halo = ctx.createRadialGradient(CX, BASE - 140, 10, CX, BASE - 120, 300);
    halo.addColorStop(0, rgba(accent, 0.30));
    halo.addColorStop(0.45, rgba(accent, 0.10));
    halo.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    // 云层（海报感）
    for (let i = 0; i < 5; i++) {
      const cx = (i * 137 + 60) % W;
      const cy = 120 + ((i * 53) % 150);
      const cw = 160 + (i % 3) * 70;
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw);
      g2.addColorStop(0, rgba(accent, 0.10));
      g2.addColorStop(0.5, 'rgba(120,150,190,0.06)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 0.42);
      ctx.beginPath();
      ctx.arc(0, 0, cw, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 星点
    for (let i = 0; i < 70; i++) {
      const x = (i * 137.5) % W;
      const y = (i * 61.7) % (BASE - 190);
      ctx.fillStyle = `rgba(214,232,255,${0.06 + ((i * 31) % 60) / 420})`;
      ctx.fillRect(x, y, 1.4, 1.4);
    }

    // 远处城市剪影
    ctx.fillStyle = 'rgba(10,17,28,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, BASE);
    for (let x = 0; x <= W; x += 18) {
      const hh = 10 + ((x * 7919) % 46);
      ctx.lineTo(x, BASE - 40 - hh);
    }
    ctx.lineTo(W, BASE);
    ctx.closePath();
    ctx.fill();

    // 等距平台（三层）
    const pl = PLATE, ph = PLATE * 0.5, th = 26;
    poly(ctx, [[CX, BASE - ph], [CX + pl, BASE], [CX, BASE + ph], [CX - pl, BASE]], '#0f1828');
    poly(ctx, [[CX - pl, BASE], [CX, BASE + ph], [CX, BASE + ph + th], [CX - pl, BASE + th]], C.plateLeft);
    poly(ctx, [[CX + pl, BASE], [CX, BASE + ph], [CX, BASE + ph + th], [CX + pl, BASE + th]], C.plateRight);
    poly(ctx, [[CX, BASE - ph], [CX + pl, BASE], [CX, BASE + ph], [CX - pl, BASE]], C.plateTop);

    // 平台网格
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(CX, BASE - ph); ctx.lineTo(CX + pl, BASE);
    ctx.lineTo(CX, BASE + ph); ctx.lineTo(CX - pl, BASE);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = rgba(accent, 0.10);
    ctx.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(CX + i * (pl / 4), BASE - ph + Math.abs(i) * (ph / 4));
      ctx.lineTo(CX + i * (pl / 4), BASE + ph - Math.abs(i) * (ph / 4));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(CX - pl + Math.abs(i) * (pl / 4), BASE + i * (ph / 4));
      ctx.lineTo(CX + pl - Math.abs(i) * (pl / 4), BASE + i * (ph / 4));
      ctx.stroke();
    }
    // 平台顶部渐变
    const tg = ctx.createLinearGradient(0, BASE - ph, 0, BASE + ph);
    tg.addColorStop(0, 'rgba(40,60,95,0.35)');
    tg.addColorStop(1, 'rgba(8,12,20,0.55)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, BASE - ph, W, ph * 2);
    ctx.restore();

    // 平台边缘光
    ctx.strokeStyle = rgba(accent, 0.45);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(CX - pl, BASE); ctx.lineTo(CX, BASE + ph);
    ctx.lineTo(CX + pl, BASE);
    ctx.stroke();

    // 地标投影
    ctx.save();
    ctx.translate(0, BASE + 6);
    ctx.scale(1, 0.34);
    const sh = ctx.createRadialGradient(CX, 0, 4, CX, 0, 150);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(CX, 0, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 地标本体
    const shape = shapes[city.type] || shapes.skyline;
    shape(ctx, pal, 1.12, VARIANTS[city.id]);

    // 地标底部反光
    const floorGlow = ctx.createRadialGradient(CX, BASE + 10, 4, CX, BASE + 10, 190);
    floorGlow.addColorStop(0, rgba(accent, 0.22));
    floorGlow.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = floorGlow;
    ctx.fillRect(0, BASE - 120, W, 260);

    // 暗角 + 底部渐隐
    const vig = ctx.createRadialGradient(CX, H * 0.42, H * 0.18, CX, H * 0.46, H * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // 颗粒（噪点）
    ctx.save();
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = i % 3 ? '#ffffff' : '#000000';
      ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }
    ctx.restore();

    const fade = ctx.createLinearGradient(0, H - 150, 0, H);
    fade.addColorStop(0, 'rgba(5,8,15,0)');
    fade.addColorStop(1, 'rgba(5,8,15,0.9)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, H - 150, W, 150);

    return canvas;
  }

  window.drawCityArt = drawArt;
})();
