# 架构说明 · weather3d

## 一、三层页面流程

```
index.html（封面） ──点击「进入城市选择」──▶ select.html（选城市） ──选中卡片──▶ scene.html?city={id}
```

| 层 | 文件 | 主要实现 | 体积 |
|---|---|---|---|
| 封面 | `public/index.html` + `css/cover.css` + `js/cover.js` | 极光背景、地面网格、雾气 canvas、镜面高光按钮（WebGL 着色器）、标题激光扫描 | cover.js ≈16KB |
| 选城 | `public/select.html` + `css/select.css` + `js/select.js` | 柔性弯曲卡片轮播（着色器变形），18 张地标卡片 | select.js ≈20KB |
| 场景 | `public/scene.html` + `css/scene.css` + `js/scene.js` | three.js 等距 3D 微缩模型 + 天气特效 + 右侧天气面板 | scene.js ≈97KB |

## 二、JS 模块职责

| 模块 | 职责 | 依赖 |
|---|---|---|
| `js/cities.js` | 城市元数据单一数据源：`id / name / province / code / type / landmark / accent / lat / lng` | 无（挂在 `window.CITIES`） |
| `js/cardart.js` | 按 `type`（gate / tvTower / skyline / tower / pagoda / stilt / dome / palace / ferris / bridge / twin）程序化生成地标插画 | 无 |
| `js/cover.js` | 封面交互：按钮着色器、激光、雾气、进入选城 | cities.js |
| `js/select.js` | 卡片轮播、弯曲着色器、跳转场景 | cities.js、cardart.js |
| `js/scene.js` | 3D 场景构建、天气特效、数据加载与面板渲染 | three.module.js、cities.js、landmarks.js、voxel-landmarks.js、voxel-blocks.js |
| `js/voxel-blocks.js` | **默认**场景主体：18 城整块微缩街区（底板/街道/商铺/主楼/摩天轮/绿化 + 地标） | three.module.js |
| `js/voxel-landmarks.js` | 单座体素地标，`?models=voxel` 启用 | three.module.js |
| `js/landmarks.js` | 备选地标模型：低多边形写实版（台基/檐口/柱廊/塔刹），`?models=classic` 启用 | three.module.js |
| `js/audio.js` | 环境音（可选） | 无 |
| `js/vendor/three.module.js` | three.js 本地副本，离线可用 | — |

**新增城市只需改 `js/cities.js` 一处**，选城卡片、`?city=` 路由、天气请求、地标模型都会自动生效——前提是 `type` 落在 `cardart.js` 已有类型内，否则插画会退化为通用样式。

## 三、3D 场景渲染管线（scene.js）

1. **搭骨架**：等距正交相机 + 圆角地块 + 地标模型（按 `type` 参数化生成，非外部模型文件）。
2. **定天气**：`modeFromText(weaText, weatherCode, precip)` 把天气文本/代码归一到 8 种模式——晴 / 多云 / 阴 / 雨 / 雷 / 雪 / 雾 / 霾。
3. **上效果**（由模式驱动）：
   - 天空渐变、地平线辉光、星空、日月光照与位置（按北京时间换算昼夜）
   - 雨：约 1300 条线段；雪：约 900 粒子；云：精灵漂移；雾：贴地雾片；雷：随机闪光
   - 地面材质：湿度影响粗糙度/金属度，雨后生成水洼，路灯与窗户暖光，PMREM 环境反射
4. **填面板**：实时温湿度风力、24 小时（逐 3 小时 ×8）、未来 7 天。

## 四、目录契约

```
weather3d/
├─ server.js                 # 静态服务 + 天气代理（PORT 默认 8787）
├─ public/                   # ★ 唯一源码目录
│  ├─ index.html select.html scene.html
│  ├─ css/{base,cover,select,scene}.css
│  ├─ js/{cities,cardart,cover,select,scene,audio}.js
│  ├─ js/vendor/three.module.js
│  └─ img/*.jpg + credits.json   # 18 城地标照片，CC 授权署名
├─ dist/                     # public/ 的镜像，Pages 发布源，禁止手改
├─ docs/                     # ★ 本知识库
├─ tools/gh_sync.py          # API 提交工具
└─ .github/workflows/pages.yml
```

## 五、已知技术债务

1. `public/` 与 `dist/` 双份存储，靠脚本同步，存在忘记同步的风险（已在 `conventions.md` 固化为必做步骤）。
2. `scene.js` 单文件约 96KB，未做模块拆分，改动时容易相互影响。
3. 线上 Pages 无后端，`/api/weather` 走不通，只能依赖 Open-Meteo 兜底（见 [data-pipeline.md](data-pipeline.md)）。
4. 调试参数 `?wx=` / `?hour=` 保留在生产代码中，未做环境隔离。
