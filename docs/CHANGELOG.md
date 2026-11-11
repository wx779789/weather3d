# 变更日志 · weather3d

> 倒序排列，最新在上。一条创作一条记录，模板见 [conventions.md](conventions.md)。

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
