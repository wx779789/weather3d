/* 城市选择：柔性弯曲卡片轮播（着色器思路移植自 FlexCarousel） */
(async function () {
  'use strict';
  const cities = window.CITIES;
  const canvas = document.getElementById('stage');
  const capName = document.getElementById('capName');
  const capLandmark = document.getElementById('capLandmark');
  const capProvince = document.getElementById('capProvince');
  const idxEl = document.getElementById('idx');
  const totalEl = document.getElementById('total');
  totalEl.textContent = String(cities.length).padStart(2, '0');

  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
  if (!gl) {
    document.body.innerHTML = '<div style="padding:40px;color:#fff">当前浏览器不支持 WebGL2，请用 Chrome / Edge 打开。</div>';
    return;
  }

  const CARD_VERT = `#version 300 es
  in vec3 position;
  in vec2 uv;
  uniform vec4 uRect;      // cx, cy, halfW, halfH  (css px, y down)
  uniform vec2 uResolution;
  out vec2 vUv;
  out vec2 vLocal;
  void main() {
    vUv = uv;
    vLocal = vec2(position.x, -position.y) * uRect.zw;
    vec2 px = uRect.xy + vLocal;
    gl_Position = vec4(px.x / uResolution.x * 2.0 - 1.0, 1.0 - px.y / uResolution.y * 2.0, 0.0, 1.0);
  }`;

  const CARD_FRAG = `#version 300 es
  precision highp float;
  uniform sampler2D tMap;
  uniform vec2 uSize;
  uniform vec2 uImage;
  uniform float uRadius;
  uniform float uAlpha;
  uniform float uReady;
  uniform float uShift;
  uniform float uDpr;
  uniform vec3 uPlaceholder;
  in vec2 vUv;
  in vec2 vLocal;
  out vec4 fragColor;

  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    float sd = roundedBox(vLocal, uSize * 0.5, min(uRadius, min(uSize.x, uSize.y) * 0.5));
    float mask = clamp(0.5 - sd * uDpr, 0.0, 1.0);
    vec2 local = vLocal / uSize + 0.5;
    float cardAspect = uSize.x / uSize.y;
    float imageAspect = uImage.x / max(uImage.y, 1.0);
    vec2 scale = imageAspect > cardAspect ? vec2(cardAspect / imageAspect, 1.0) : vec2(1.0, imageAspect / cardAspect);
    scale /= 1.02;
    vec2 uv = vec2(local.x, 1.0 - local.y);
    uv = (uv - 0.5) * scale + 0.5;
    uv.x += uShift * (1.0 - scale.x) * 0.5;
    vec3 image = texture(tMap, uv).rgb;
    vec3 color = mix(uPlaceholder, image, uReady);
    float alpha = mask * uAlpha;
    fragColor = vec4(color * alpha, alpha);
  }`;

  const LENS_VERT = `#version 300 es
  in vec2 aPosition;
  void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

  const LENS_FRAG = `#version 300 es
  precision highp float;
  uniform sampler2D tScene;
  uniform vec2 uResolution;
  uniform vec2 uCenter;
  uniform vec2 uHalf;
  uniform float uExponent;
  uniform float uInner;
  uniform float uOuter;
  uniform float uFlow;
  uniform float uDispersion;
  uniform float uStrength;
  out vec4 fragColor;

  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 uv = frag / uResolution;
    vec2 rel = frag - vec2(uCenter.x, uResolution.y - uCenter.y);
    vec2 k = max(abs(rel) / uHalf, vec2(1e-5));
    float nd = pow(pow(k.x, uExponent) + pow(k.y, uExponent), 1.0 / uExponent);
    vec2 grad = pow(k, vec2(uExponent - 1.0)) * sign(rel) / uHalf * pow(nd, 1.0 - uExponent);
    float glen = max(length(grad), 1e-6);
    float edge = (nd - 1.0) / glen;
    vec2 outward = grad / glen;
    vec2 along = vec2(-outward.y, outward.x);

    float t = clamp((edge + uInner) / (uInner + uOuter), 0.0, 1.0);
    float ramp = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    float slope = 16.0 * t * t * (1.0 - t) * (1.0 - t);
    float side = sign(rel.x + 1e-5);
    float lift = ramp * side * uFlow * uStrength;
    vec2 swirl = along * along.y * side * slope * uFlow * uStrength * 0.35;
    vec2 drift = vec2(0.0, -lift) - swirl;
    vec2 shifted = uv + drift / uResolution;

    vec2 spread = vec2(0.0, side * slope * uFlow * uStrength) / uResolution * uDispersion;
    vec3 col;
    col.r = texture(tScene, shifted + spread).r;
    col.g = texture(tScene, shifted).g;
    col.b = texture(tScene, shifted - spread).b;
    float a = texture(tScene, shifted).a;
    fragColor = vec4(col, a);
  }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  const cardProg = program(CARD_VERT, CARD_FRAG);
  const lensProg = program(LENS_VERT, LENS_FRAG);

  const cardU = {};
  ['uRect', 'uResolution', 'uSize', 'uImage', 'uRadius', 'uAlpha', 'uReady', 'uShift', 'uDpr', 'uPlaceholder']
    .forEach(n => { cardU[n] = gl.getUniformLocation(cardProg, n); });
  const lensU = {};
  ['uResolution', 'uCenter', 'uHalf', 'uExponent', 'uInner', 'uOuter', 'uFlow', 'uDispersion', 'uStrength']
    .forEach(n => { lensU[n] = gl.getUniformLocation(lensProg, n); });

  // 卡片四边形
  const quad = gl.createBuffer();
  const quadData = new Float32Array([
    // x, y, u, v
    -1, -1, 0, 0,
    1, -1, 1, 0,
    1, 1, 1, 1,
    -1, -1, 0, 0,
    1, 1, 1, 1,
    -1, 1, 0, 1
  ]);
  const cardVao = gl.createVertexArray();
  gl.bindVertexArray(cardVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 12);
  gl.bindVertexArray(null);

  // 全屏三角形
  const triBuf = gl.createBuffer();
  const triVao = gl.createVertexArray();
  gl.bindVertexArray(triVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // 场景帧缓冲
  const fbo = gl.createFramebuffer();
  const fboTex = gl.createTexture();
  let fboW = 2, fboH = 2;

  // 卡片纹理
  const loadImg = src => new Promise(resolve => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
  const photos = await Promise.all(cities.map(c => loadImg('img/' + c.id + '.jpg')));

  const textures = cities.map((city, idx) => {
    const c = document.createElement('canvas');
    window.drawCityArt(c, city, photos[idx]);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  });

  const ART_ASPECT = 512 / 680;
  const view = { w: 1, h: 1, dpr: 1 };
  const layout = { cardH: 300, cardW: 226, gap: 20, step: 246, span: 0, maxX: 1 };

  const state = {
    pos: 0, vel: 0, target: 0, dragging: false,
    pointerX: 0, startX: 0, startPos: 0, moved: 0,
    active: 0, lastX: 0, lastT: 0
  };

  function resize() {
    view.w = canvas.clientWidth;
    view.h = canvas.clientHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);

    layout.cardH = Math.min(view.h * 0.56, view.w * 0.84);
    layout.cardW = layout.cardH * ART_ASPECT;
    layout.gap = Math.max(16, view.w * 0.012);
    layout.step = layout.cardW + layout.gap;
    layout.span = cities.length * layout.step;
    layout.maxX = layout.span / 2;

    fboW = Math.max(2, canvas.width);
    fboH = Math.max(2, canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fboW, fboH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  const wrapSigned = (v, size) => ((((v + size / 2) % size) + size) % size) - size / 2;

  function cardX(i) {
    return wrapSigned((i - state.pos) * layout.step, layout.span);
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(cardProg);
    gl.uniform2f(cardU.uResolution, view.w, view.h);
    gl.uniform1f(cardU.uDpr, view.dpr);
    gl.uniform3f(cardU.uPlaceholder, 0.06, 0.09, 0.14);
    gl.uniform1f(cardU.uRadius, 20);
    gl.uniform1f(cardU.uShift, 0);
    gl.uniform1f(cardU.uReady, 1);
    gl.uniform2f(cardU.uImage, 512, 680);

    const cx = view.w / 2, cy = view.h * 0.47;
    for (let i = 0; i < cities.length; i++) {
      const x = cardX(i);
      const d = Math.abs(x);
      if (d > view.w * 0.85) continue;
      const t = Math.min(1, d / (view.w * 0.62));
      const alpha = Math.pow(1 - t, 1.35);
      if (alpha <= 0.01) continue;
      const scale = 1 - t * 0.14;
      const dy = t * t * 26;
      const cw = layout.cardW * scale;
      const ch = layout.cardH * scale;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[i]);
      gl.uniform4f(cardU.uRect, cx + x, cy + dy, cw / 2, ch / 2);
      gl.uniform2f(cardU.uSize, cw, ch);
      gl.uniform1f(cardU.uAlpha, alpha);
      gl.bindVertexArray(cardVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // 弯曲镜头
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(lensProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.uniform1i(gl.getUniformLocation(lensProg, 'tScene'), 0);
    const dp = view.dpr;
    gl.uniform2f(lensU.uResolution, view.w * dp, view.h * dp);
    gl.uniform2f(lensU.uCenter, cx * dp, cy * dp);
    gl.uniform2f(lensU.uHalf, layout.cardW * dp * 0.58, layout.cardH * dp * 0.58);
    gl.uniform1f(lensU.uExponent, 2.8);
    gl.uniform1f(lensU.uInner, Math.min(layout.cardW, layout.cardH) * dp * 0.10);
    gl.uniform1f(lensU.uOuter, Math.min(layout.cardW, layout.cardH) * dp * 0.26);
    gl.uniform1f(lensU.uFlow, 1);
    gl.uniform1f(lensU.uDispersion, 0.05);
    gl.uniform1f(lensU.uStrength, 10 * dp);
    gl.bindVertexArray(triVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function activeIndex() {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < cities.length; i++) {
      const d = Math.abs(wrapSigned(i - state.pos, cities.length));
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function updateCaption() {
    const i = activeIndex();
    if (i === state.active && capName.textContent === cities[i].name) return;
    state.active = i;
    const c = cities[i];
    capName.style.opacity = 0;
    setTimeout(() => {
      capName.textContent = c.name;
      capLandmark.textContent = c.landmark;
      capProvince.textContent = c.province;
      idxEl.textContent = String(i + 1).padStart(2, '0');
      capName.style.opacity = 1;
    }, 90);
  }

  let lastW = 0, lastH = 0;
  function tick() {
    if (canvas.clientWidth !== lastW || canvas.clientHeight !== lastH) {
      lastW = canvas.clientWidth; lastH = canvas.clientHeight;
      if (lastW > 0 && lastH > 0) resize();
    }
    if (!state.dragging) {
      const k = 0.14;
      state.pos += (state.target - state.pos) * k;
      if (Math.abs(state.target - state.pos) < 0.0004) state.pos = state.target;
    }
    draw();
    updateCaption();
    requestAnimationFrame(tick);
  }

  /* ---------- 交互 ---------- */
  canvas.addEventListener('pointerdown', e => {
    state.dragging = true;
    state.pointerX = e.clientX;
    state.startX = e.clientX;
    state.startPos = state.pos;
    state.moved = 0;
    state.lastX = e.clientX;
    state.lastT = performance.now();
    state.vel = 0;
    canvas.classList.add('dragging');
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', e => {
    if (!state.dragging) return;
    const dx = e.clientX - state.startX;
    state.moved = Math.max(state.moved, Math.abs(dx));
    const raw = state.startPos - dx / layout.step;
    state.pos = raw;
    const now = performance.now();
    const dt = Math.max(1, now - state.lastT);
    state.vel = (e.clientX - state.lastX) / dt;
    state.lastX = e.clientX;
    state.lastT = now;
  });

  canvas.addEventListener('pointerup', e => {
    if (!state.dragging) return;
    state.dragging = false;
    canvas.classList.remove('dragging');
    const fling = -state.vel * 6;
    const next = Math.round(state.pos + fling);
    state.target = next;
    state.pos = state.pos + (next - state.pos) * 0.001;
    if (state.moved < 6) {
      // 点击：判断点在哪张卡上
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      let best = null, bestD = Infinity;
      for (let i = 0; i < cities.length; i++) {
        const d = Math.abs(cardX(i) - px);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best !== null && bestD < layout.cardW * 0.75) {
        const idx = best;
        state.target = idx;
        go(idx);
        return;
      }
    }
    updateCaption();
  });

  canvas.addEventListener('pointercancel', () => {
    state.dragging = false;
    canvas.classList.remove('dragging');
    state.target = Math.round(state.pos);
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    state.target += Math.sign(e.deltaY) * 0.6;
    state.target = Math.round(state.target);
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { state.target = Math.round(state.pos) + 1; e.preventDefault(); }
    if (e.key === 'ArrowLeft') { state.target = Math.round(state.pos) - 1; e.preventDefault(); }
    if (e.key === 'Enter') go(activeIndex());
  });

  function go(i) {
    const city = cities[(i % cities.length + cities.length) % cities.length];
    document.body.style.transition = 'opacity .4s ease';
    document.body.style.opacity = '0.1';
    setTimeout(() => { location.href = 'scene.html?city=' + city.id; }, 320);
  }

  /* ---------- 定位当前城市 ---------- */
  const locateBtn = document.getElementById('locateBtn');
  const locateText = document.getElementById('locateText');

  function haversine(a, b, c, d) {
    const R = 6371, toRad = x => x * Math.PI / 180;
    const dLat = toRad(c - a), dLon = toRad(d - b);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function nearestCity(lat, lng) {
    let best = 0, bestD = Infinity;
    cities.forEach((c, i) => {
      const d = haversine(lat, lng, c.lat, c.lng);
      if (d < bestD) { bestD = d; best = i; }
    });
    return { index: best, km: bestD };
  }

  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el.__t);
    el.__t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function goTo(index, km) {
    const n = cities.length;
    // 选择离当前位置最近的一圈
    let delta = ((index - state.pos) % n + n) % n;
    if (delta > n / 2) delta -= n;
    state.target = Math.round(state.pos) + delta;
    const c = cities[index];
    toast('已定位到 ' + c.name + (km ? ' · 距离约 ' + Math.round(km) + ' km' : ''));
  }

  function locate(manual) {
    if (!navigator.geolocation) {
      if (manual) toast('当前浏览器不支持定位');
      return;
    }
    if (manual) {
      locateBtn.classList.add('busy');
      locateText.textContent = '定位中…';
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        const { index, km } = nearestCity(latitude, longitude);
        goTo(index, km);
        locateBtn.classList.remove('busy');
        locateBtn.classList.add('ok');
        locateText.textContent = '已定位 · ' + cities[index].name;
      },
      err => {
        locateBtn.classList.remove('busy');
        if (manual) {
          locateText.textContent = '定位失败，点此重试';
          toast(err.code === 1 ? '定位权限被拒绝，可在浏览器设置里允许' : '定位失败，请检查网络或 GPS');
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  }

  if (locateBtn) {
    locateBtn.addEventListener('click', () => locate(true));
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(r => {
        if (r.state === 'granted') locate(false);
      }).catch(() => {});
    }
  }

  window.addEventListener('resize', () => { resize(); });
  resize();
  state.pos = 0;
  state.target = 0;
  tick();
  window.addEventListener('orientationchange', () => setTimeout(resize, 300));
})();
