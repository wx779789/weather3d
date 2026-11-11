# ADR-0001：用 GitHub Pages + Data API 取代 git push

- **状态**：已采纳
- **日期**：2026-11-11
- **决策者**：王鑫（用户）、助手

## 背景

项目原先只有「本机 `node server.js` + WorkBuddy 托管隧道」一种在线形态，依赖本机开机，且链接带 sharecode 参数。用户要求每次创作后线上页面实时更新，并指定以 GitHub Pages 承载。

同时存在两个硬约束：

1. 仓库为 private，GitHub 免费账号明确拒绝为其启用 Pages（API 返回 `422 Your current plan does not support GitHub Pages for this repository`）。
2. 本机网络封锁 `github.com` 与 `raw.githubusercontent.com`，`git push` 报 `Empty reply from server`；仅 `api.github.com`、`codeload.github.com` 可达。

## 决策

1. **仓库转为 public**，以符合免费账号 Pages 的使用条件。
2. **Pages 采用 `build_type=workflow`**，由 `.github/workflows/pages.yml` 上传 `dist/` 作为站点产物，而非从分支根目录直接发布。
3. **提交改走 Git Data API**（blob → tree → commit → ref），封装为 `tools/gh_sync.py`。

## 备选方案与取舍

| 方案 | 优点 | 否决原因 |
|---|---|---|
| 单独建一个 public 部署仓，主仓保持私有 | 源码不外泄 | 用户明确选择「仓库改公开」，两仓维护成本更高 |
| 保持私有，只用 WorkBuddy 托管 | 无需改仓库可见性，且保留中国天气网实时数据 | 依赖本机常开，链接带参数，不符合「随时可打开」 |
| Pages 从 `main` 根目录发布（`path=/`） | 配置最简单 | 根目录无 `index.html`，站点会 404；需额外加重定向跳板，URL 变丑 |
| 配置本机代理让 `git push` 走通 | 保留原生 git 工作流 | 代理对 `github.com` 稳定黑洞，反复测试均失败，不可依赖 |

## 后果

**正向**：
- 提交与发布全自动，单 commit 原子完成「代码 + 知识库」更新。
- 线上站点不再依赖本机开机。
- 因只上传差异文件，7MB 图片素材不会重复传输。

**负向**：
- **源码公开**：18 城地标图与全部前端逻辑对所有人可见。图片均为 CC 授权且 `credits.json` 保留署名，许可合规。
- **线上无后端**：`/api/weather` 在 Pages 上必然 404，线上数据实际来自 Open-Meteo，AQI 显示 `--`，风力口径由「几级」变为 `km/h`。需真实中国天气网数据时只能用 WorkBuddy 链接对照。
- **提交脚本成为单点**：`tools/gh_sync.py` 若失效，只能等网络恢复后手动 push。

## 复核触发条件

出现以下任一情况时重新评估本决策：

- 仓库需要重新转为私有（则 Pages 立刻失效，必须切回 WorkBuddy 托管或升级套餐）。
- 线上必须提供中国天气网数据（需改为外部 Serverless 代理 + 静态前端）。
- 单文件超过 GitHub 50MB blob 上限（当前最大文件 1.3MB，尚远）。

## 补记（实施当日修正）

原计划由 `.github/workflows/pages.yml` 以 `build_type=workflow` 发布 `dist/`。实施时 `POST /git/trees` 稳定返回 `404 Not Found`，逐项二分后定位：**提交内容包含 `.github/workflows/pages.yml`，而令牌仅带 `repo` scope，GitHub 对工作流文件的写入以 404 拒绝**。

据此将发布方式修正为 **`build_type=legacy` + `main` 根目录**，并增加根目录跳板 `index.html` 与 `.nojekyll`。该修正引入两项已知代价：

1. 站点入口多一次客户端跳转，`/weather3d/` 最终落到 `/weather3d/dist/`。
2. 根目录同时承载「跳板 + 发布源」，目录语义略不纯粹。

若后续换成带 `workflow` scope 的令牌，可按 [deployment.md](../deployment.md) 的升级路径切回 Actions 发布，届时上述两项代价同时消除。
