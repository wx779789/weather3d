/* 环境音：风 / 雨 / 雪 / 雷（WebAudio 合成，无需音频文件） */
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let started = false;
  let nodes = null;
  let current = 'none';
  let muted = false;

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(6);
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 120;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.0;

    // 风的呼吸（LFO 调制滤波）
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();

    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.0;

    src.connect(hp);
    hp.connect(lp);
    lp.connect(windGain);
    windGain.connect(master);
    hp.connect(rainGain);
    rainGain.connect(master);

    src.start();

    nodes = { src, lp, hp, windGain, rainGain, lfo };
    started = true;
  }

  function ramp(param, value, time) {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(Math.max(0.0001, value), t + (time || 1.2));
  }

  const PRESET = {
    none:     { wind: 0.0,  rain: 0.0,  lp: 600 },
    clear:    { wind: 0.045, rain: 0.0, lp: 900 },
    cloudy:   { wind: 0.06, rain: 0.0,  lp: 800 },
    overcast: { wind: 0.075, rain: 0.0, lp: 700 },
    rain:     { wind: 0.05, rain: 0.16, lp: 700 },
    thunder:  { wind: 0.06, rain: 0.22, lp: 800 },
    snow:     { wind: 0.03, rain: 0.02, lp: 500 },
    fog:      { wind: 0.02, rain: 0.0,  lp: 380 },
    haze:     { wind: 0.02, rain: 0.0,  lp: 420 },
    forest:   { wind: 0.05, rain: 0.0,  lp: 620 }
  };

  function apply(mode, level) {
    if (!started) return;
    const p = PRESET[mode] || PRESET.none;
    const k = level === undefined ? 1 : level;
    ramp(master.gain, muted ? 0 : 0.9, 1.4);
    ramp(nodes.windGain.gain, p.wind * k, 2.0);
    ramp(nodes.rainGain.gain, p.rain * k, 1.6);
    ramp(nodes.lp.frequency, p.lp, 2.0);
  }

  function thunder() {
    if (!started || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(2.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
    src.connect(lp); lp.connect(g); g.connect(ctx.destination);
    src.start(t); src.stop(t + 2.2);
  }

  window.Ambient = {
    setMode(mode, level) {
      current = mode;
      if (!started) return;
      apply(mode, level);
    },
    /* 必须在用户手势里调用一次 */
    start(mode) {
      if (started) { if (ctx.state === 'suspended') ctx.resume(); apply(mode || current); return; }
      try { build(); apply(mode || current); } catch (e) { /* 不支持就静音 */ }
    },
    thunder,
    toggle() {
      muted = !muted;
      if (started) ramp(master.gain, muted ? 0 : 0.9, 0.4);
      return muted;
    },
    get muted() { return muted; },
    get ready() { return started; }
  };
})();
