# 发布与提交链路 · weather3d

## 一、本机网络的硬约束（先看这个，否则一定会踩坑）

| 域名 | 可达性 | 影响 |
|---|---|---|
| `github.com` | ❌ 超时 | `git clone / fetch / push` 全部失败（`Empty reply from server`） |
| `raw.githubusercontent.com` | ❌ 超时 | 无法直接取原始文件 |
| `api.github.com` | ✅ 正常 | **这是本机唯一可用的 GitHub 通道** |
| `codeload.github.com` | ✅ 正常 | 可下载仓库压缩包（需带 Token） |
| `wx779789.github.io` | ✅ 正常 | Pages 页面可访问 |

> 因此：**不要尝试 `git push`**。所有提交统一走 `tools/gh_sync.py`，它通过 `api.github.com` 的 Git Data API 直接写远端。

## 二、提交：tools/gh_sync.py

```bash
# 标准流程：把 public/ 同步到 dist/，然后把所有差异提交到 main
python tools/gh_sync.py -m "feat: 新增 XX 城市"

# 只看会改哪些文件，不实际提交
python tools/gh_sync.py -m "test" --dry-run

# 不覆盖 dist/（仅当你已手动确认 dist 就是最终产物时）
python tools/gh_sync.py -m "..." --no-dist
```

它做的事：

1. 读取凭据（优先环境变量 `GITHUB_TOKEN`，否则从本机 Git 凭据管理器取）。
2. 取远端 `main` 最新 commit → tree，逐文件比对 SHA1（git blob 算法）。
3. 只上传有差异的文件（图片等未变资源不会重复传，7MB 素材零开销）。
4. 一次 `POST /git/trees` + `POST /git/commits` + `PATCH /git/refs/heads/main`，**单 commit 原子提交**。
5. 提交后自动触发 Pages 构建。

**限制**：单文件上限 50MB；`.github/workflows/` 下的文件会被主动拦截（原因见第三节）；删除文件需显式加 `--prune`。

## 三、发布：GitHub Pages（主通道）

- 地址：**https://wx779789.github.io/weather3d/**
- 形态：`build_type = legacy`，源为 `main` 分支 **根目录 `/`**
- 触发：推送 `main` 后自动构建，通常 40–90 秒
- 前置条件：仓库须为 **public**（2026-11-11 已由 private 转 public；免费账号私有仓不支持 Pages）

### 为什么根目录有个跳板页

Pages 的分支发布只允许 `/`（仓库根）或 `/docs` 两个位置。站点产物在 `dist/`，根目录没有 `index.html`，所以放了一个极轻量的跳板 `index.html`（meta refresh + `location.replace`），把 `/weather3d/` 指向 `/weather3d/dist/index.html`。

- 根目录另有 `.nojekyll`，阻止 Jekyll 处理 `docs/` 里的 Markdown，也保证 `dist/js/vendor/` 等目录原样发布。
- 站点内部所有资源与链接均为相对路径，`dist/` 作为子目录发布不受影响。
- **代价**：地址会跳一次并变成 `/weather3d/dist/`。若必须消灭这一跳，见下方「升级路径」。

### 已排除的方案：GitHub Actions 发布

原计划用 `.github/workflows/pages.yml` 把 `dist/` 作为 artifact 发布（干净 URL、无跳板）。实测失败，根因明确：

> 令牌只带 `repo` scope。**GitHub 对缺少 `workflow` scope 的令牌写入 `.github/workflows/*` 一律返回 404**（不是 403，报错信息为 `{"message":"Not Found"}`，极易误判为路径写错）。

因此当前采用分支发布。工作流文件已保存为 `tools/pages-workflow.example.yml`（**不在 `.github/` 下，不参与构建**），`gh_sync.py` 也会主动拦截该目录的文件并提示原因。

### 升级路径：切回 Actions 发布（可选）

1. 新建一个 Classic PAT，勾选 **`repo` + `workflow`** 两个 scope。
2. 把 `tools/pages-workflow.example.yml` 移回 `.github/workflows/pages.yml`。
3. 执行：

```bash
curl -X PUT -H "Authorization: Bearer $NEW_TOKEN" -H "Content-Type: application/json" \
  -d '{"build_type":"workflow"}' \
  https://api.github.com/repos/wx779789/weather3d/pages
```

4. 之后可删除根目录跳板 `index.html`，站点即为 `/weather3d/` 直出。

### 历史坑位速查

| 现象 | 根因 | 处理 |
|---|---|---|
| `422 Your current plan does not support GitHub Pages for this repository` | 私有仓 + 免费账号 | 仓库转 public |
| `POST /git/trees` 返回 `404 Not Found` | 提交内容含 `.github/workflows/*` 且令牌无 `workflow` scope | 改分支发布，或换带 `workflow` 的令牌 |
| 站点 404 | 根目录无 `index.html` | 补跳板页或改用 Actions |

## 四、发布：WorkBuddy 托管（备用通道）

```
https://renmai-planner.app.workbuddy.host/?sharecode=VWDFLQREDJ
```

- 由本机 `node server.js` + 托管隧道提供，**带后端**，因此级别 1（中国天气网实时数据）可用，数据精度优于 Pages。
- 缺点：依赖本机开机与进程存活，链接参数需完整复制。
- 两者关系：Pages 用于「随时可开、稳定在线」；WorkBuddy 用于「要真实中国天气网数据」时对比验证。

## 五、回滚

Git Data API 提交同样产生正常 commit，回滚两种方式：

```bash
# 方式一：API 把 main 指回旧 commit（快，但会丢历史线性）
curl -X PATCH -H "Authorization: Bearer $TOKEN" \
  -d '{"sha":"<old_commit_sha>","force":true}' \
  https://api.github.com/repos/wx779789/weather3d/git/refs/heads/main

# 方式二（推荐）：本地 git 反向提交
git revert --no-edit <sha>   # 再用 tools/gh_sync.py 推上去
```

## 六、健康检查

| 检查项 | 命令/地址 |
|---|---|
| 本地服务 | `curl http://127.0.0.1:8787/health` |
| 本地天气接口 | `curl "http://127.0.0.1:8787/api/weather?code=101010100"` |
| Pages 状态 | `GET https://api.github.com/repos/wx779789/weather3d/pages/builds/latest` |
| 线上页面 | `curl -o /dev/null -w "%{http_code}" https://wx779789.github.io/weather3d/` |
