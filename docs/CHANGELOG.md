# 变更日志 · weather3d

> 倒序排列，最新在上。一条创作一条记录，模板见 [conventions.md](conventions.md)。

## 2026-11-12 · 地标建模文档 + 18 城模型重写（待发布）

- **变更**
  - 新增 `docs/landmarks.md`：14 个通用构件签名与陷阱、材质表、18 城分派表、11 个 builder 的逐段拆解（含关键尺寸）、调参速查、6 条已知限制。
  - 地标建模从 `scene.js` 抽出为独立模块 `public/js/landmarks.js`（1210 行，11 个函数 / 18 变体）。
  - 宏大感改造：三级须弥座台基、屋顶坡度由约 9° 提到 28–30°、垂脊与檐口封边、柱廊与斗拱层、塔刹与航空灯；`LANDMARK_SCALE` 1.32 → 1.58。
  - 相机俯角 41° → 35°，接近正统等距；新增背侧轮廓光（强度 1.15）。
- **原因**：用户要求「放大图中建筑宏大感 + 美化每个城市的 3D 模型」，参考可互动 3D 小镇的微缩质感。
- **影响**：18 城全部换模型；`scene.js` 仅保留调用与动画（摩天轮 `1258`）。旧建模函数已删除。
- **验证**：北京场景单帧截图目视通过（屋顶坡度、券门、台基、华表均正常）；其余 17 城尚未逐城目视校核。
- **状态**：**本地改动，未提交**。等用户确认建模方向后统一提交并触发 Pages 重建。

## 2026-11-11 · 建立知识库与 Pages 自动发布链路

- **变更**
  - 新增 `docs/` 知识库：索引、架构、数据链路、发布流程、创作约定、ADR、变更日志。
  - 新增 `tools/gh_sync.py`：经 GitHub Data API 提交，绕开本机不可达的 `github.com`。
  - 新增根目录 `index.html` 跳板与 `.nojekyll`：Pages 分支发布只认根目录，跳板把 `/weather3d/` 导到 `dist/index.html`。
  - 新增 `tools/pages-workflow.example.yml`：Actions 发布方案留档（当前不可用，见下）。
  - 仓库由 private 转 **public**（解除免费账号 Pages 限制）。
  - `README.md` 修正城市数 15 → 18，补充 Pages 地址与提交流程。
- **原因**：用户要求「每次创作完把代码写进知识库，并实时更新网站页面」。原仓库无自动发布能力，且本机 `git push` 因网络封锁不可用，需另建提交通道。
- **踩坑记录**
  - `POST /pages` 指定 `source.branch=main, path=/` 被拒：`422` 免费账号不支持私有仓 Pages → 转 public 解决。
  - `POST /git/trees` 持续 `404 Not Found`：定位为提交内容含 `.github/workflows/pages.yml`，而令牌缺 `workflow` scope，GitHub 以 404 静默拒绝 → 改分支发布 + 根目录跳板。
- **影响**：不影响任何页面渲染与交互逻辑；仅新增基础设施。线上站点入口多一次跳转。
- **验证**：Pages 构建 `built`，https://wx779789.github.io/weather3d/ 返回 200 并跳转至 `dist/`。
- **提交**：见仓库 commit 历史
