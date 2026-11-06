/**
 * 天气视界 · 3D 城市天气可视化
 * 零依赖 Node 静态服务器 + 中国天气网(weather.com.cn)数据代理
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36';

async function get(urlStr, referer) {
  const headers = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Connection': 'close'
  };
  if (referer) headers.Referer = referer;
  const res = await fetch(urlStr, { headers, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  // weather.com.cn 现在普遍返回 UTF-8，个别老接口是 GBK
  let text = buf.toString('utf8');
  if (/\uFFFD/.test(text.slice(0, 400))) {
    try {
      text = new TextDecoder('gbk').decode(buf);
    } catch (_) { /* keep utf8 */ }
  }
  return text;
}

function pick(text, re, i = 1) {
  const m = text.match(re);
  return m ? m[i] : '';
}

function sliceJson(text, marker) {
  const i = text.indexOf(marker);
  if (i < 0) return null;
  const start = text.indexOf('{', i);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let p = start; p < text.length; p++) {
    const ch = text[p];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, p + 1)); } catch (e) { return null; }
      }
    }
  }
  return null;
}

function parseDays(html) {
  const days = [];
  const re = /<li class="sky[^"]*">([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(html))) {
    const block = m[1];
    const label = pick(block, /<h1>([^<]*)<\/h1>/);
    const wea = pick(block, /<p title="([^"]*)" class="wea">/);
    const tem = pick(block, /<p class="tem">([\s\S]*?)<\/p>/);
    const hi = pick(tem, /<span>(-?\d+)℃<\/span>/);
    const lo = pick(tem, /<i>(-?\d+)℃<\/i>/);
    const wind = pick(block, /<i>([^<]*级)<\/i>/);
    const codeDay = pick(block, /class="png40 (d\d+)"/);
    const codeNight = pick(block, /class="png40 (n\d+)"/);
    if (!label && !wea) continue;
    days.push({
      label: label.replace(/\s+/g, ''),
      wea: wea || '—',
      hi: hi === '' ? null : Number(hi),
      lo: lo === '' ? null : Number(lo),
      wind: wind.replace(/<[^>]+>/g, ''),
      code: codeDay || '',
      codeNight: codeNight || ''
    });
  }
  return days.slice(0, 7);
}

function parseHours(text) {
  const data = sliceJson(text, 'hour3data=');
  if (!data || !Array.isArray(data['1d'])) return [];
  const out = [];
  for (const raw of data['1d']) {
    const parts = String(raw).split(',');
    if (parts.length < 4) continue;
    const [time, code, wea, temp, wd, wl] = parts;
    out.push({
      time: time.replace('日', '日 ').replace('时', ':00'),
      code: code || '',
      wea: wea || '',
      temp: Number(String(temp).replace('℃', '')) || 0,
      wd: wd || '',
      wl: wl || ''
    });
  }
  return out.slice(0, 8);
}

const cache = new Map();
const TTL = 5 * 60 * 1000;

async function weather(code) {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const base = 'http://www.weather.com.cn/';
  const idxUrl = `http://d1.weather.com.cn/weather_index/${code}.html`;
  const ref1d = `${base}weather1d/${code}.shtml`;

  const [idx, page1d, page7] = await Promise.all([
    get(idxUrl, ref1d).catch(() => ''),
    get(ref1d, base).catch(() => ''),
    get(`${base}weather/${code}.shtml`, base).catch(() => '')
  ]);

  const sk = sliceJson(idx, 'var dataSK =') || {};
  const today = sliceJson(idx, 'var cityDZ =') || {};
  const hours = parseHours(page1d);
  let days = parseDays(page7);

  if (!days.length) {
    const fc = sliceJson(idx, 'var fc =');
    if (fc && Array.isArray(fc.f)) {
      days = fc.f.slice(0, 7).map((d, i) => ({
        label: d.fj || '',
        wea: '—',
        hi: Number(d.fc) || null,
        lo: Number(d.fd) || null,
        wind: d.fg || '',
        code: 'd' + (d.fa || '00'),
        codeNight: 'n' + (d.fb || '00')
      }));
    }
  }

  const data = {
    ok: !!(sk.cityname || (today.weatherinfo && today.weatherinfo.city)),
    code,
    city: sk.cityname || (today.weatherinfo && today.weatherinfo.city) || '',
    now: {
      temp: Number(sk.temp) || null,
      wea: sk.weather || '',
      weaEn: sk.weathere || '',
      wd: sk.WD || '',
      ws: sk.WS || '',
      sd: sk.SD || '',
      qy: sk.qy || '',
      aqi: sk.aqi || '',
      njd: sk.njd || '',
      rain: sk.rain || '0',
      code: sk.weathercode || '',
      time: sk.time || '',
      date: sk.date || ''
    },
    hours,
    days,
    source: '中国天气网 weather.com.cn',
    fetchedAt: Date.now()
  };

  if (!data.ok) throw new Error('no data');

  cache.set(code, { at: Date.now(), data });
  return data;
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  let pathname = decodeURIComponent(parsed.pathname);

  if (pathname === '/api/weather') {
    const code = String(parsed.query.code || '').replace(/\D/g, '').slice(0, 12);
    if (!code) return json(res, 400, { ok: false, error: 'missing code' });
    try {
      const data = await weather(code);
      return json(res, 200, data);
    } catch (e) {
      return json(res, 502, { ok: false, error: String(e.message || e) });
    }
  }

  if (pathname === '/health') return json(res, 200, { ok: true, ts: Date.now() });

  if (pathname === '/') pathname = '/index.html';
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/js/vendor') ? 'public, max-age=86400' : 'no-cache'
    });
    res.end(buf);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[weather3d] http://127.0.0.1:${PORT}`);
});
