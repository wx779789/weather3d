# 访问地址（代码块右上角可一键复制）

**线上网页（主）** —— GitHub Pages，推送 `main` 后自动构建：

```
https://wx779789.github.io/weather3d/
```

**线上网页（备用）** —— 走本机 `server.js`，带中国天气网真实数据，需本机开机：

```
https://renmai-planner.app.workbuddy.host/?sharecode=VWDFLQREDJ
```

**本仓库** —— 已转为公开仓库：

```
https://github.com/wx779789/weather3d
```

> `?sharecode=VWDFLQREDJ` 必须一起复制，只填域名会提示「链接不完整」。
> Pages 是纯静态托管，没有 Node 后端，数据由前端直连 Open-Meteo；要中国天气网口径的实时数据请用备用链接。
> 代码改完后运行 `python tools/gh_sync.py -m "说明"`，它会同步 `dist/` 并触发 Pages 重新构建。
> 本机 `github.com` 不可达，**不要用 `git push`**。详见 `docs/deployment.md`。

---

# 天气视界 · 3D 城市天气可视化（样例）

一座「会下雨的城市积木」：选择城市 → 进入该城市地标的 3D 等距微缩场景，天空、云、雨雪、雾与灯光随当地**真实天气**变化，右侧面板展示实时天气、24 小时与未来 7 天。

## 运行

```bash
node server.js          # 默认 http://127.0.0.1:8787
PORT=9000 node server.js
```

零依赖：Node 18+ 内置 `fetch` 即可，无需 npm install。three.js 已放在 `public/js/vendor/`，离线可用。

## 三个页面

| 页面 | 文件 | 说明 |
|---|---|---|
| 封面 | `public/index.html` | 标题「天气视界」+ 说明 + 镜面高光按钮（WebGL 着色器，移植自 `按钮.txt`）|
| 选城市 | `public/select.html` | 柔性弯曲卡片轮播（着色器移植自 `新建文本文档 (2).txt`），18 座城市，卡片插画为各地标 |
| 主场景 | `public/scene.html?city=beijing` | 等距 3D 微缩模型 + 天气效果 + 天气面板 |

## 数据来源

`server.js` 代理中国天气网（weather.com.cn），解决跨域与编码问题：

- 实时：`d1.weather.com.cn/weather_index/{code}.html`（`dataSK`）
- 24 小时：`www.weather.com.cn/weather1d/{code}.shtml`（`hour3data`，逐 3 小时 × 8 段）
- 7 天：`www.weather.com.cn/weather/{code}.shtml`
- 缓存 5 分钟；接口异常时前端退回演示数据并在面板标注「演示数据」

城市代码（101xxxxxx）均逐一校验过，见 `public/js/cities.js`。

## 天气 → 场景映射

`public/js/scene.js` 中 `modeFromText()` 由天气文本/代码判定：晴 / 多云 / 阴 / 雨 / 雷 / 雪 / 雾 / 霾，再驱动：

- 天空渐变与地平线辉光、星空、日月位置（按北京时间换算昼夜）
- 雨（1300 条线段）、雪（900 粒子）、云（精灵漂移）、贴地雾片、闪电
- 地面湿度（粗糙度/金属度）、水洼、路灯与窗户暖光、环境反射（PMREM）

## 调试参数

- `?wx=rain|snow|cloudy|fog|haze|clear` 强制天气
- `?hour=21` 强制时刻（便于截图）

## 目录

```
weather3d/
├─ server.js               # 静态服务 + 天气代理
├─ public/                 # 唯一源码目录
│  ├─ index.html select.html scene.html
│  ├─ css/{base,cover,select,scene}.css
│  └─ js/{cities,cardart,cover,select,scene}.js
│     └─ vendor/three.module.js
├─ dist/                   # public/ 的镜像，Pages 发布源（勿手改）
├─ docs/                   # 项目知识库，从 docs/index.md 读起
└─ tools/gh_sync.py        # 经 GitHub API 提交（替代 git push）
```

## 项目知识库

`docs/` 是随代码一起维护的知识库，每次改动必须同步更新：

| 文档 | 内容 |
|---|---|
| `docs/index.md` | 索引与当前状态 |
| `docs/architecture.md` | 三层页面结构与 3D 渲染管线 |
| `docs/data-pipeline.md` | 天气数据三级降级链路 |
| `docs/deployment.md` | 提交与双通道发布，含网络限制说明 |
| `docs/conventions.md` | 每次创作的固定动作与禁止事项 |
| `docs/CHANGELOG.md` | 变更日志 |

## 公网链接（临时）

cloudflared tunnel --url http://127.0.0.1:8787 启动的临时隧道（URL 形如 https://xxx.trycloudflare.com）。
- 电脑关机 / 关闭 cloudflared / 重启后 URL 会变化；
- 需要固定域名时，改用 Cloudflare 命名隧道或部署到静态托管 + 独立天气接口。
