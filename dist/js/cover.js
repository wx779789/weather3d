/* 封面：飘雾画布 + 镜面高光按钮（按钮着色器移植自 SpecularButton） */
(function () {
  'use strict';

  /* ---------------- mist ---------------- */
  const mist = document.getElementById('mist');
  if (mist) {
    const ctx = mist.getContext('2d');
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const parts = [];
    const resize = () => {
      w = mist.clientWidth; h = mist.clientHeight;
      mist.width = Math.round(w * dpr); mist.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const seed = () => {
      parts.length = 0;
      const n = Math.min(90, Math.round(w * h / 22000));
      for (let i = 0; i < n; i++) {
        parts.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.6 + Math.random() * 2.1,
          vx: -0.08 - Math.random() * 0.22,
          vy: 0.02 + Math.random() * 0.06,
          a: 0.08 + Math.random() * 0.35
        });
      }
    };
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.y > h + 10) p.y = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(190, 220, 255,' + p.a + ')';
        ctx.fill();
      }
      requestAnimationFrame(tick);
    };
    resize(); seed(); tick();
    window.addEventListener('resize', () => { resize(); seed(); });
  }

  /* ---------------- specular button ---------------- */
  const PAD = 24;
  const TAU = Math.PI * 2;

  const VERTEX = `#version 300 es
  in vec2 aPosition;
  void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

  const FRAGMENT = `#version 300 es
  precision highp float;
  uniform vec2 uCenter;
  uniform vec2 uHalf;
  uniform float uRadius;
  uniform float uPx;
  uniform float uSpot;
  uniform vec2 uEntry;
  uniform vec3 uLineColor;
  uniform vec3 uBaseColor;
  uniform float uIntensity;
  uniform vec2 uWindow;
  uniform float uThickness;
  uniform float uGlow;
  out vec4 outColor;

  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  float loopPosition(vec2 p, vec2 b, float r) {
    vec2 inner = b - r;
    float arc = 1.5707963 * r;
    float quarter = inner.x + inner.y + arc;
    vec2 a = abs(p);
    vec2 q = a - inner;
    float s = q.x > 0.0 && q.y > 0.0
      ? inner.y + atan(q.y, q.x) * r
      : (q.x > q.y ? min(a.y, inner.y) : inner.y + arc + inner.x - min(a.x, inner.x));
    if (p.x < 0.0) s = p.y >= 0.0 ? 2.0 * quarter - s : 2.0 * quarter + s;
    else if (p.y < 0.0) s = 4.0 * quarter - s;
    return s / max(4.0 * quarter, 0.0001);
  }

  float lobe(float position, float center) {
    float gap = abs(fract(position - center + 0.5) - 0.5);
    return 1.0 - smoothstep(uWindow.x, uWindow.x + uWindow.y, gap);
  }

  void main() {
    vec2 p = gl_FragCoord.xy - uCenter;
    float d = roundedBox(p, uHalf, uRadius);
    float position = loopPosition(p, uHalf, uRadius);
    float key = lobe(position, uSpot);
    float back = lobe(position, uSpot + 0.5);
    float streak = key + back * 0.45;
    float width = max(uThickness * uPx * mix(1.0, max(key, back), 0.6), 0.35);
    float band = smoothstep(-width - 0.6, -width + 0.6, d) * (1.0 - smoothstep(-0.6, 0.6, d));
    float hair = smoothstep(-uPx - 0.6, -uPx + 0.6, d) * (1.0 - smoothstep(-0.6, 0.6, d));
    float inside = 1.0 - smoothstep(-0.6, 0.6, d);
    vec2 pool = (p - uEntry) / (uHalf.y * vec2(1.6, 1.1));
    float glow = streak * 0.2 * exp(-abs(d + width * 0.5) / (5.0 * uPx)) + inside * 0.08 * exp(-dot(pool, pool));
    float light = clamp((band * streak + glow * uGlow) * uIntensity, 0.0, 1.0);
    vec4 base = vec4(uBaseColor, 1.0) * hair * 0.6;
    outColor = vec4(uLineColor, 1.0) * light + base * (1.0 - light);
  }`;

  const UNIFORMS = ['uCenter', 'uHalf', 'uRadius', 'uPx', 'uSpot', 'uEntry',
    'uLineColor', 'uBaseColor', 'uIntensity', 'uWindow', 'uThickness', 'uGlow'];

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const wrap01 = v => v - Math.floor(v);

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
    console.warn(gl.getShaderInfoLog(s));
    return null;
  }

  function createSpecular(button, opts) {
    const canvas = button.querySelector('.specular-button__light');
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
    if (!gl) return false;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    gl.attachShader(program, vs); gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;

    const uni = {};
    UNIFORMS.forEach(n => { uni[n] = gl.getUniformLocation(program, n); });

    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const o = Object.assign({
      lineColor: [0.86, 0.94, 1], baseColor: [0.32, 0.36, 0.44],
      intensity: 1, idleIntensity: 0.55, shineSize: 9, shineFade: 26,
      thickness: 1.15, glow: 1, speed: 0.6, proximity: 260
    }, opts || {});

    const view = { w: 1, h: 1, ratio: 1 };
    const pointer = { x: 0, y: 0, known: false };
    const state = { spot: 0, level: 0, press: 0, ready: false };
    let raf = 0, last = 0;

    const measure = () => {
      const r = button.getBoundingClientRect();
      view.w = Math.max(1, r.width); view.h = Math.max(1, r.height);
      view.ratio = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round((view.w + PAD * 2) * view.ratio);
      canvas.height = Math.round((view.h + PAD * 2) * view.ratio);
    };

    const draw = () => {
      const sx = canvas.width / (view.w + PAD * 2);
      const sy = canvas.height / (view.h + PAD * 2);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      const hx = (view.w / 2) * sx, hy = (view.h / 2) * sy;
      gl.uniform2f(uni.uCenter, (PAD + view.w / 2) * sx, (PAD + view.h / 2) * sy);
      gl.uniform2f(uni.uHalf, hx, hy);
      gl.uniform1f(uni.uRadius, Math.min(18, view.w / 2, view.h / 2) * sx);
      gl.uniform1f(uni.uPx, view.ratio);
      gl.uniform1f(uni.uSpot, state.spot);
      gl.uniform2f(uni.uEntry, 0, 0);
      gl.uniform3fv(uni.uLineColor, o.lineColor);
      gl.uniform3fv(uni.uBaseColor, o.baseColor);
      gl.uniform1f(uni.uIntensity, o.intensity * (state.level + state.press * 0.8));
      gl.uniform2f(uni.uWindow, o.shineSize / 360 + state.press * 0.06, o.shineFade / 360 + 0.0001);
      gl.uniform1f(uni.uThickness, o.thickness);
      gl.uniform1f(uni.uGlow, o.glow);

      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    };

    const aim = () => {
      if (!pointer.known) return 0;
      const r = button.getBoundingClientRect();
      const dx = pointer.x - (r.left + r.width / 2);
      const dy = pointer.y - (r.top + r.height / 2);
      const dist = Math.hypot(Math.max(Math.abs(dx) - r.width / 2, 0), Math.max(Math.abs(dy) - r.height / 2, 0));
      return clamp(1 - dist / o.proximity, 0, 1);
    };

    const frame = now => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const near = aim();
      state.spot = wrap01(state.spot + (o.speed / TAU) * dt * (1 + near * 0.6));
      const level = o.idleIntensity + (1 - o.idleIntensity) * near;
      state.level += (level - state.level) * (1 - Math.exp(-dt * 7));
      state.press *= Math.exp(-dt * 5);
      draw();
      raf = requestAnimationFrame(frame);
    };

    measure();
    state.spot = 0.12;
    state.level = o.idleIntensity;
    window.addEventListener('pointermove', e => {
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.known = true;
    }, { passive: true });
    button.addEventListener('pointerdown', () => { state.press = 1; });
    window.addEventListener('resize', measure);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(button);
    raf = requestAnimationFrame(frame);
    return true;
  }

  const hero = document.getElementById('heroArt');
  if (hero && window.drawCityArt && window.cityById) {
    window.drawCityArt(hero, window.cityById('beijing'));
  }

  const countEl = document.getElementById('cityCount');
  if (countEl && window.CITIES) countEl.textContent = window.CITIES.length;

  const enter = document.getElementById('enter');
  if (enter) {
    createSpecular(enter);
    enter.addEventListener('click', () => {
      document.body.style.transition = 'opacity .45s ease';
      document.body.style.opacity = '0.15';
      setTimeout(() => { location.href = 'select.html'; }, 380);
    });
  }
})();
