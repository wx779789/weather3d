/* 封面：飘雾 + 标题激光折射 + 镜面按钮（按钮着色器移植自 SpecularButton） */
(function () {
  'use strict';

  /* ---------------- 飘雾 ---------------- */
  const mist = document.getElementById('mist');
  if (mist) {
    const ctx = mist.getContext('2d');
    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const parts = [];
    const resize = () => {
      w = mist.clientWidth; h = mist.clientHeight;
      mist.width = Math.round(w * dpr); mist.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts.length = 0;
      const n = Math.min(90, Math.round(w * h / 22000));
      for (let i = 0; i < n; i++) {
        parts.push({
          x: Math.random() * w, y: Math.random() * h,
          r: 0.6 + Math.random() * 2.0,
          vx: -0.08 - Math.random() * 0.2,
          vy: 0.02 + Math.random() * 0.06,
          a: 0.08 + Math.random() * 0.32
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
    resize(); tick();
    window.addEventListener('resize', resize);
  }

  /* ---------------- 标题激光 ---------------- */
  const titleEl = document.querySelector('.hero-title');
  const laserCanvas = document.getElementById('laser');
  if (titleEl && laserCanvas) {
    const gl = laserCanvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, depth: false });
    if (gl) startLaser(gl, titleEl, laserCanvas);
  }

  function startLaser(gl, title, canvas) {
    const VS = `#version 300 es
      in vec2 aPos;
      void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

    const FS = `#version 300 es
      precision highp float;
      uniform sampler2D tText;
      uniform vec2 uSize;
      uniform float uTime;
      out vec4 fragColor;

      void main() {
        vec2 uv = gl_FragCoord.xy / uSize;
        uv.y = 1.0 - uv.y;

        float t = fract(uTime * 0.12);
        float beam = mix(-0.4, 1.4, t);
        float tilt = (uv.y - 0.5) * 0.30;
        float dx = uv.x + tilt - beam;
        float near = exp(-dx * dx * 60.0);
        float core = exp(-dx * dx * 900.0);

        vec2 off = vec2(0.012 * near, 0.0);
        float aR = texture(tText, uv + off).a;
        float aG = texture(tText, uv).a;
        float aB = texture(tText, uv - off).a;

        vec3 base = mix(vec3(1.0, 1.0, 1.0), vec3(0.58, 0.80, 1.0), clamp(uv.y * 1.1, 0.0, 1.0));
        vec3 col = base * aG;
        col += vec3(1.0, 0.36, 0.46) * aR * near * 0.55;
        col += vec3(0.36, 0.76, 1.0) * aB * near * 0.80;

        float mask = smoothstep(0.04, 0.42, max(max(aG, aR), aB));
        float hot = core * mask;
        col += vec3(0.85, 0.97, 1.0) * hot * 1.9;
        col += vec3(0.45, 0.85, 1.0) * near * mask * 0.25;

        float alpha = clamp(aG + hot * 0.9, 0.0, 1.0);
        fragColor = vec4(col * alpha, alpha);
      }`;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;

    const buf = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const tex = gl.createTexture();
    const uText = gl.getUniformLocation(prog, 'tText');
    const uSize = gl.getUniformLocation(prog, 'uSize');
    const uTime = gl.getUniformLocation(prog, 'uTime');

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let ready = false;
    let w = 0, h = 0;

    function buildTexture() {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2) return;
      canvas.width = Math.max(2, Math.round(rect.width * dpr));
      canvas.height = Math.max(2, Math.round(rect.height * dpr));

      const c = document.createElement('canvas');
      c.width = canvas.width; c.height = canvas.height;
      const ctx = c.getContext('2d');
      const cs = getComputedStyle(title);
      const size = parseFloat(cs.fontSize);
      const spacing = parseFloat(cs.letterSpacing) || 0;
      ctx.font = `${cs.fontWeight} ${size * dpr}px ${cs.fontFamily}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = (spacing * dpr) + 'px';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(title.textContent.trim(), c.width / 2, c.height / 2);

      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      ready = true;
    }

    function sync() {
      const rect = canvas.getBoundingClientRect();
      if (Math.abs(rect.width - w) > 1 || Math.abs(rect.height - h) > 1) {
        w = rect.width; h = rect.height;
        buildTexture();
      }
    }

    const start = performance.now();
    function frame(now) {
      sync();
      if (ready) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(uText, 0);
        gl.uniform2f(uSize, canvas.width, canvas.height);
        gl.uniform1f(uTime, (now - start) / 1000);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    window.addEventListener('resize', () => { w = 0; h = 0; });
    if (document.fonts) document.fonts.ready.then(() => { w = 0; h = 0; });
  }

  /* ---------------- 镜面按钮 ---------------- */
  const PAD = 24;
  const TAU = Math.PI * 2;
  const VERTEX = `#version 300 es
  in vec2 aPosition;
  void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

  const FRAGMENT = `#version 300 es
  precision highp float;
  uniform vec2 uCenter; uniform vec2 uHalf; uniform float uRadius; uniform float uPx;
  uniform float uSpot; uniform vec2 uEntry; uniform vec3 uLineColor; uniform vec3 uBaseColor;
  uniform float uIntensity; uniform vec2 uWindow; uniform float uThickness; uniform float uGlow;
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
    vec2 pool = (p - uEntry) / (uHalf.y * vec2(1.6, 1.1));
    float glow = streak * 0.2 * exp(-abs(d + width * 0.5) / (5.0 * uPx)) + hair * 0.08 * exp(-dot(pool, pool));
    float light = clamp((band * streak + glow * uGlow) * uIntensity, 0.0, 1.0);
    vec4 base = vec4(uBaseColor, 1.0) * hair * 0.6;
    outColor = vec4(uLineColor, 1.0) * light + base * (1.0 - light);
  }`;

  const UNIFORMS = ['uCenter', 'uHalf', 'uRadius', 'uPx', 'uSpot', 'uEntry',
    'uLineColor', 'uBaseColor', 'uIntensity', 'uWindow', 'uThickness', 'uGlow'];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const wrap01 = v => v - Math.floor(v);

  function createSpecular(button, opts) {
    const canvas = button.querySelector('.specular-button__light');
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
    if (!gl) return;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.bindAttribLocation(prog, 0, 'aPosition');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;

    const uni = {};
    UNIFORMS.forEach(n => { uni[n] = gl.getUniformLocation(prog, n); });

    const buf = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
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
    const state = { spot: 0.12, level: o.idleIntensity, press: 0 };
    let last = 0;

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
      gl.useProgram(prog);
      gl.uniform2f(uni.uCenter, (PAD + view.w / 2) * sx, (PAD + view.h / 2) * sy);
      gl.uniform2f(uni.uHalf, (view.w / 2) * sx, (view.h / 2) * sy);
      gl.uniform1f(uni.uRadius, Math.min(view.h / 2, view.w / 2) * sx);
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
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const near = aim();
      state.spot = wrap01(state.spot + (o.speed / TAU) * dt * (1 + near * 0.6));
      const level = o.idleIntensity + (1 - o.idleIntensity) * near;
      state.level += (level - state.level) * (1 - Math.exp(-dt * 7));
      state.press *= Math.exp(-dt * 5);
      draw();
      requestAnimationFrame(frame);
    };

    measure();
    window.addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.known = true; }, { passive: true });
    button.addEventListener('pointerdown', () => { state.press = 1; });
    window.addEventListener('resize', measure);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(button);
    requestAnimationFrame(frame);
  }

  const countEl = document.getElementById('cityCount');
  if (countEl && window.CITIES) countEl.textContent = window.CITIES.length;

  const enter = document.getElementById('enter');
  if (enter) {
    createSpecular(enter);
    enter.addEventListener('click', () => {
      document.body.style.transition = 'opacity .45s ease';
      document.body.style.opacity = '0.1';
      setTimeout(() => { location.href = 'select.html'; }, 360);
    });
  }
})();
