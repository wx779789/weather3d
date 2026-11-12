# 交接文档 · weather3d（天气视界）

> **用途**：把本项目交给另一个 AI / 另一位开发者继续制作时，先读这一份。
> 本文自包含：项目定位、代码地图、建模规范、当前进度、待办、验收方法都在里面，不需要回溯历史对话。
> 最后更新：2026-11-12

---

## 0. 直接转发用的一段话

把下面整块复制给对方 AI 即可（它若不能联网，请连同仓库代码一起给）：

```
你接手一个已有的前端项目：天气视界（weather3d）。
—— 3D 城市天气可视化站，选城市后进入该城市地标的等距微缩 3D 场景，天空/云雨雪雾/灯光随真实天气变化。

代码仓库（公开）：https://github.com/wx779789/weather3d
线上站点：      https://wx779789.github.io/weather3d/
必读文档：      docs/index.md、docs/landmarks.md（地标建模）、docs/conventions.md（改动纪律）

技术栈：原生 ES Module + Three.js（仓库内 vendor 版本），零构建、零依赖，node server.js 起本地服务。
源码只在 public/；dist/ 是它的镜像，禁止手改 dist/。

当前任务：继续打磨 18 座城市的地标 3D 模型（宏大感与细节），方向是「低多边形微缩沙盘 + 建筑学层次」。
已知未完成：其余 17 城未逐城目视校核；屋面缺瓦垄；斗拱只有体块；夜景/雨雪没有专门材质。

动手前必读 docs/landmarks.md 的「通用构件库」与「调参速查」，新增模型必须复用已有构件，
不要裸写 THREE.Mesh，不要引入构建工具、框架或 npm 依赖，不要改 dist/。
```

---

## 1. 项目定位

| 项 | 内容 |
|---|---|
| 一句话 | 选城市 → 看该城市地标的 3D 等距微缩场景，天气实时驱动天空、降水、光照 |
| 覆盖城市 | **18 座**：北京、上海、广州、深圳、成都、西安、杭州、重庆、武汉、哈尔滨、拉萨、天津、南京、长沙、绍兴、厦门、莆田、兰州 |
| 视觉基调 | 低多边形微缩沙盘 + 建筑学层次（台基 / 柱廊 / 檐口 / 收分 / 塔刹） |
| 页面层级 | `index.html` 封面 → `select.html` 选城 → `scene.html` 3D 场景 |

---

## 2. 地址

| 类型 | 地址 |
|---|---|
| 代码仓库（**公开**） | https://github.com/wx779789/weather3d |
| 线上站点（GitHub Pages） | https://wx779789.github.io/weather3d/ |
| 备用托管（含后端代理） | https://renmai-planner.app.workbuddy.host/?sharecode=VWDFLQREDJ |
| 地标建模文档 | `docs/landmarks.md` |
| 知识库索引 | `docs/index.md` |

---

## 3. 技术栈与本地运行

- **原生 ES Module + Three.js**（`public/js/vendor/three.module.js`，仓库内自带，勿升级）
- **零构建、零依赖**：没有 webpack/vite/npm，改完刷新即生效
- 本地跑：`node server.js` → `http://127.0.0.1:8787`（Node 18+）
- `server.js` 兼做两件事：静态服务 + `/api/weather` 天气代理（中国天气网）

```bash
node server.js
# 直接看某个城市：http://127.0.0.1:8787/scene.html?city=beijing&wx=clear&hour=15
```

`scene.html` 支持 URL 参数固定场景，便于截图比对：`city` / `wx`（clear|cloudy|overcast|rain|snow|fog|haze|thunder）/ `hour`。

---

## 4. 目录结构

```
weather3d/
├─ index.html                  # Pages 跳板：根目录 → dist/
├─ .nojekyll                   # 关掉 Jekyll，否则 _ 开头文件会被吃掉
├─ server.js                   # 静态服务 + 天气代理
├─ public/                     # ★ 唯一源码目录
│  ├─ index.html               # 封面
│  ├─ select.html              # 城市选择（柔性弯曲卡片轮播）
│  ├─ scene.html               # 3D 场景
│  ├─ css/{base,cover,select,scene}.css
│  └─ js/
│     ├─ cities.js             # 18 城元数据（id/名称/天气代码/type/地标名/accent 色）
│     ├─ cardart.js            # 选城卡片的地标插画（Canvas 2D，另一套画法）
│     ├─ cover.js  select.js   # 封面与选城交互
│     ├─ scene.js              # ★ 3D 场景主控（1955 行）
│     ├─ landmarks.js          # ★ 地标建模（1210 行，11 函数 / 18 变体）
│     └─ vendor/three.module.js
├─ dist/                       # 发布产物，public/ 的镜像，禁止手改
├─ docs/                       # 知识库
└─ tools/gh_sync.py            # 提交工具（GitHub Data API）
```

---

## 5. 硬约束（违反会直接把线上弄坏）

1. **源码只改 `public/`**。`dist/` 是发布镜像，由 `tools/gh_sync.py` 自动同步；手改 `dist/` 会在下次同步时被覆盖。
2. **不要引入构建工具 / 框架 / npm 依赖**。这个项目的价值之一就是「一个 `node server.js` 就能跑」。
3. **不要升级 `vendor/three.module.js`**。现有代码依赖当前版本的 `outputColorSpace` 等行为。
4. **Pages 是「分支发布 + 根目录跳板」**，不是 Actions：站点根 = 仓库根，`index.html` 跳到 `dist/`。所以 `dist/` 目录名不能改。
5. **仓库必须保持 public**。免费账号的私有仓无法启用 Pages（实测 `422`）。
6. **令牌若无 `workflow` scope，GitHub 会以 404 静默拒绝写入 `.github/workflows/*`**（不是 403）。这是历史上踩过的坑，见 `docs/deployment.md`。
7. **线上没有 Node 运行时**。`/api/weather` 在 Pages 上必然 404，前端会自动降级到 Open-Meteo。要中国天气网口径的数据必须走备用托管。

---

## 6. 代码地图

### 6.1 `scene.js`（1955 行）关键锚点

| 行 | 内容 |
|---|---|
| 2 | `import { createLandmark } from './landmarks.js'` |
| 59 | `LANDMARK_SCALE = 1.58` —— 地标整体缩放 |
| 657-663 | `PAL`：7 种中式构件共用材质（gold/roofRed/wallRed/whiteWall/woodDark/brick/greenDome） |
| 686-693 | 地标创建与挂载：`createLandmark(...)` → `position.y = 0.2` → `scale = 1.58` |
| 775 起 | `PALETTES`：7 种天气的昼/夜天空与辉光配色 |
| 800 起 | `applyWeather()`：统一驱动天空、雾、太阳、曝光、环境贴图 |
| 1258 | 摩天轮动画：`landmark.userData.wheel.rotation.z += dt * 0.12` |
| 1782 / 1820 | 进入/退出第一人称时的地标缩放切换（0.98 / 1.32） |

### 6.2 `landmarks.js`（1210 行）

```
16  canvasTex     27  windowTex    45  brickTex      ← 程序化贴图
63  createLandmark({ city, MAT, PAL })
69    M            材质表（20 项）
101-274          14 个通用构件（bx/cyl/strut/roof/upturn/cornice/podium/
                  railing/colonnade/winPlane/archDoor/orb/finial）
279  buildGate     城楼 / 江南殿宇（天安门 / 夫子庙）
421  buildPagoda   塔与楼阁（大雁塔 / 雷峰塔 / 黄鹤楼 / 广化寺塔）
499  buildTvTower  电视塔（东方明珠 / 广州塔 / 天府塔）
626  buildTwin     双子塔（厦门世茂）
693  buildSkyline  超高层（平安 / 国金）
762  buildStilt    吊脚楼（洪崖洞）
827  buildDome     洋葱顶教堂（圣索菲亚）
907  buildPalace   宫堡（布达拉宫）
991  buildFerris   摩天轮（天津之眼，唯一有动效）
1074 buildBridge   桥（中山桥钢桁架 / 八字桥石拱）
1187 builders 分派表 → 1200 调用
```

**详细拆解见 `docs/landmarks.md`**，那里每个 builder 都写了构件顺序、关键尺寸、变体开关、可调参数。

---

## 7. 建模规范（新增/改模型必须遵守）

### 7.1 四条「宏大感」原则

1. 三级须弥座台基把主体「供」起来，不要平贴地面；
2. 水平檐口线 + 垂直柱廊，制造节奏与进深；
3. 顶部收束（塔刹 / 尖顶 / 航空灯），拉长视觉高度；
4. 守住建筑与人、树、车的比例差（行人高 0.2，地标主体常在 2–5.5）。

### 7.2 三条硬规矩

- **必须复用 §6.2 的 14 个构件**，新增模型不许裸写 `new THREE.Mesh(...)` 堆盒子（除非确实没有对应构件）。
- **逐段累加基准**：`const t1 = ph + 0.96`、`const roofY1 = t1 + 0.77`，不要写绝对坐标。改层高时只动一处。
- **对称构件用 `[-1,1].forEach`**，不要手写两遍。

### 7.3 常用尺度口径

| 项目 | 口径 |
|---|---|
| 地标总高 | ≤ 5.6（超过会顶出等距画幅） |
| 屋顶坡度 | `roof()` 的 `H/(W/2)` 应在 0.25–0.35，低于 0.25 会读成平板 |
| 翘角 | `upturn()` 的 `k` ≤ 1.2，超过会像铁丝 |
| 台基 | `podium()` 返回高度即 `ph`，主体一律从 `ph` 起建 |
| 层高 | 中式楼层 0.42–0.5；超高层段 0.78–1.6 |

---

## 8. 当前状态

### 8.1 18 城一览

| 城市 | type | 地标 | builder | 变体 | 校核状态 |
|---|---|---|---|---|---|
| 北京 | gate | 天安门 | buildGate | 非南京 | ✅ 已调 5 轮，目视通过 |
| 南京 | gate | 夫子庙 | buildGate | `id==='nanjing'` | ⚠️ 未目视 |
| 西安 | pagoda | 大雁塔 | buildPagoda | 7 层 | ⚠️ 未目视 |
| 杭州 | pagoda | 雷峰塔 | buildPagoda | 5 层 | ⚠️ 未目视 |
| 武汉 | pagoda | 黄鹤楼 | buildPagoda | `isTower`，5 层，底边 ×1.16 | ⚠️ 未目视 |
| 莆田 | pagoda | 广化寺塔 | buildPagoda | 7 层 | ⚠️ 未目视 |
| 上海 | tvTower | 东方明珠 | buildTvTower | `sphere` | ⚠️ 未目视 |
| 广州 | tvTower | 广州塔 | buildTvTower | `canton` | ⚠️ 未目视 |
| 成都 | tower | 天府塔 | buildTvTower | `plain` | ⚠️ 未目视 |
| 厦门 | twin | 世茂双子塔 | buildTwin | — | ⚠️ 未目视 |
| 深圳 | skyline | 平安金融中心 | buildSkyline | — | ⚠️ 未目视 |
| 长沙 | skyline | 国金中心 | buildSkyline | 同函数，仅尺寸差 | ⚠️ 未目视，**与深圳形态重复** |
| 重庆 | stilt | 洪崖洞 | buildStilt | — | ⚠️ 未目视 |
| 哈尔滨 | dome | 圣索菲亚 | buildDome | — | ⚠️ 未目视 |
| 拉萨 | palace | 布达拉宫 | buildPalace | — | ⚠️ 未目视 |
| 天津 | ferris | 天津之眼 | buildFerris | — | ⚠️ 未目视 |
| 兰州 | bridge | 中山桥 | buildBridge | 钢桁架 | ⚠️ 未目视 |
| 绍兴 | bridge | 八字桥 | buildBridge | 石拱 | ⚠️ 未目视 |

### 8.2 本轮已完成的重构

- 地标建模从 `scene.js` 抽出为独立模块 `landmarks.js`（原 550 行旧函数已删）；
- 台基、檐口、柱廊、斗拱、塔刹等层次全部补齐；屋顶坡度由约 9° 提到 28–30°；
- `LANDMARK_SCALE` 1.32 → **1.58**，相机俯角 41° → 35°（更接近正统等距）；
- 新增背侧轮廓光（强度 1.15），把建筑从深蓝背景中分离。

---

## 9. 待办（按优先级）

| 优先级 | 事项 | 落点 |
|---|---|---|
| P0 | **逐城目视校核 17 城**，修明显穿模/比例失衡 | 逐城截图，见 §10 |
| P0 | 长沙与深圳、成都与沪穗**形态重复**，拆变体 | `buildSkyline` / `buildTvTower` |
| P1 | 屋面**瓦垄纹理**缺失，金瓦/灰瓦都是光面 | `roof()` 内加程序化条纹贴图 |
| P1 | 斗拱只有体块，没有出跳进深 | `buildPagoda` 的斗拱层 / `colonnade` |
| P2 | 夜景/雨雪无专门材质：窗光分层、湿面反光 | `applyWeather()` 联动材质 |
| P2 | `winPlane`/`windowTex` 每次新建 Canvas 纹理，有显存隐患 | 加贴图缓存池 |
| P3 | 建筑可交互（点选构件高亮、悬浮说明） | 参考「可互动 3D 小镇」的交互感 |
| P3 | 选城卡片 `cardart.js` 与 3D 模型风格未对齐 | 两套画法需统一视觉语言 |

---

## 10. 验收与自测

### 10.1 单城截图（无头浏览器）

```bash
# Windows + Edge 示例
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1400,880 --virtual-time-budget=8000 \
  --screenshot="out.png" \
  "http://127.0.0.1:8787/scene.html?city=beijing&wx=clear&hour=15"
```

### 10.2 逐城检查清单

对每座城看四件事：

1. **是否被裁切**：总高有没有顶出画幅，台基有没有被地面吃掉；
2. **轮廓是否成立**：屋顶坡度、收分、塔刹是否读得出「那栋楼」；
3. **穿模**：柱廊穿墙、屋檐穿主体、栏杆浮空；
4. **比例**：与人（0.2 高）、树、车的比例是否可信。

### 10.3 提交

```bash
python tools/gh_sync.py -m "feat: 说明"          # 自动 public→dist 同步 + 差异提交
python tools/gh_sync.py -m "chore: 预演" --dry-run
python tools/gh_sync.py -m "..." --wait           # 等 Pages 构建完成
```

---

## 11. 已知问题与坑

1. **本机 `github.com` / `raw.githubusercontent.com` 不可达**（`git push` 必失败）。这是原维护者的网络环境，接手方若网络正常可直接 `git push`；不正常则用 `tools/gh_sync.py`（GitHub Data API + codeload 下载）。
2. **令牌缺 `workflow` scope** 时，写 `.github/workflows/*` 会被 GitHub 以 **404 静默拒绝**，报错信息不会说是权限问题。
3. **Pages 入口有一次跳转**：`/weather3d/` → `/weather3d/dist/`。要消除跳转需改回 Actions 发布，需要 `workflow` scope 的令牌，方案留档在 `tools/pages-workflow.example.yml`。
4. **README 里的「15 座城市」是旧数据**，实际 18 座（已修正）。
5. **图片素材为 CC 授权**，`dist/img/credits.json` 保留署名，公开仓库合规，**不要删除 credits.json**。
6. 长沙/深圳共用 `buildSkyline`，改其中一城会同时影响另一城 —— 改之前先拆变体。

---

## 12. 文档体系

| 文档 | 内容 |
|---|---|
| `docs/index.md` | 知识库索引、当前状态、关键约束 |
| `docs/architecture.md` | 三层页面、模块职责、渲染管线 |
| `docs/data-pipeline.md` | 天气数据三级链路（代理 → Open-Meteo → 演示数据） |
| `docs/landmarks.md` | **地标建模**：构件库、材质、18 城分派、逐城拆解、调参速查 |
| `docs/deployment.md` | 双通道发布、提交流程、历史坑位 |
| `docs/conventions.md` | 创作流程约定（每次改完必须走完的步骤） |
| `docs/CHANGELOG.md` | 变更日志 |
| `docs/adr/` | 架构决策记录 |
