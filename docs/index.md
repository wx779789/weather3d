# 知识库索引 · weather3d

> 本目录是 `weather3d` 项目的代码知识库。**每次创作完成后必须同步更新**，规则见 [conventions.md](conventions.md)。

## 文档地图

| 文档 | 内容 | 何时需要读 |
|---|---|---|
| [handoff.md](handoff.md) | **交接文档**：项目定位、代码地图、建模规范、当前进度、待办、验收方法 | 换人/换 AI 接手时**先读这份** |
| [architecture.md](architecture.md) | 三层页面结构、JS 模块职责、渲染管线 | 改任何前端逻辑前 |
| [landmarks.md](landmarks.md) | **地标建模文档**：14 个通用构件、材质表、18 城分派、逐城拆解、调参速查 | 改 3D 模型、加城市前 |
| [data-pipeline.md](data-pipeline.md) | 天气数据三级链路：本地代理 → Open-Meteo → 演示数据 | 改数据源、接口、面板字段前 |
| [deployment.md](deployment.md) | 双通道发布：GitHub Pages 与 WorkBuddy 托管 | 发布、排查线上问题时 |
| [conventions.md](conventions.md) | 创作流程约定、`public/` 与 `dist/` 同步纪律 | **每次动手前** |
| [CHANGELOG.md](CHANGELOG.md) | 变更日志，一次创作一条 | 每次创作后追加 |
| [adr/](adr/) | 架构决策记录（ADR），不可逆决策才写 | 引入新依赖/改动部署形态前 |

## 项目一句话

「天气视界」——选择城市后进入该城市地标的 **3D 等距微缩场景**，天空、云雨雪雾、灯光随当地真实天气变化。

## 当前状态（2026-11-11）

- 覆盖城市：**18 座**（北京、上海、广州、深圳、成都、西安、杭州、重庆、武汉、哈尔滨、拉萨、天津、南京、长沙、绍兴、厦门、莆田、兰州）
- 线上地址：https://wx779789.github.io/weather3d/ （GitHub Pages 分支发布，推送 `main` 自动重建，根目录 `index.html` 跳板至 `dist/`）
- 备用地址：https://renmai-planner.app.workbuddy.host/?sharecode=VWDFLQREDJ
- 仓库性质：**公开**（2026-11-11 由私有转公开，用于解锁免费账号的 Pages）
- 运行方式：`node server.js`，零依赖，Node 18+

## 关键约束

1. **`public/` 是唯一源码目录**，`dist/` 是其镜像，仅供发布，禁止直接手改 `dist/`。
2. 本机 `github.com` 与 `raw.githubusercontent.com` 不可达，`git push` 会失败；提交统一走 `tools/gh_sync.py`（GitHub Data API）。
3. Pages 只托管静态文件，**没有 Node 运行时**，线上 `/api/weather` 必然 404，前端会自动降级到 Open-Meteo。
4. 令牌无 `workflow` scope，**无法提交 `.github/workflows/*`**（GitHub 以 404 静默拒绝），因此走分支发布而非 Actions，详见 [deployment.md](deployment.md)。
