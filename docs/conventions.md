# 创作约定 · weather3d

> 用户在 2026-11-11 定下的常态要求：**每次创作完，代码写进知识库，并让线上页面实时更新。**
> 下面是把它拆成可执行、可核对的固定动作。

## 一、每次创作的标准动作（按顺序，缺一不可）

### 1. 改代码——只动 `public/`

- `public/` 是唯一源码目录。`dist/` 是发布镜像，**永远不要手改**。
- 新增城市：只改 `public/js/cities.js`；若引入新的 `type`，必须同时补 `public/js/cardart.js` 的插画分支。
- 新增天气特效：改 `public/js/scene.js` 的 `modeFromText()` 与对应粒子系统，并自测 `?wx=` 六个强制值。

### 2. 本地自测

```bash
node server.js                 # http://127.0.0.1:8787
```

必测清单：
- [ ] 封面 → 选城 → 场景 三跳无白屏、无控制台报错
- [ ] 改动涉及的天气模式用 `?wx=rain|snow|cloudy|fog|haze|clear` 逐个过一遍
- [ ] 昼夜表现用 `?hour=21` 验证
- [ ] 手机窄屏（375px）不错位

### 3. 更新知识库——这是「创作完成」的判定标准

| 改动类型 | 必须更新 |
|---|---|
| 任何改动 | `docs/CHANGELOG.md` 追加一条（日期 / 改了什么 / 为什么 / 影响面） |
| 改页面结构、JS 模块职责、渲染流程 | `docs/architecture.md` |
| 改数据源、接口字段、降级顺序 | `docs/data-pipeline.md` |
| 改工作流、托管方式、部署参数 | `docs/deployment.md` |
| 引入新依赖、更换部署形态、改目录契约等不可逆决策 | 新建 `docs/adr/000N-标题.md` |

**CHANGELOG 条目模板**：

```markdown
## 2026-11-11 · 标题一句话

- 变更：具体改了什么文件、什么行为
- 原因：为什么要改
- 影响：哪些页面/城市/模式受影响
- 提交：<commit sha 前 7 位>
```

### 4. 提交（一次 commit 完成代码 + 文档）

```bash
python tools/gh_sync.py -m "feat: 一句话标题"
```

- 脚本会把 `public/` 同步到 `dist/`，然后一次性提交全部差异，**不要分两次提交**。
- 提交前先 `--dry-run` 看一眼文件清单，确认没有误带无关文件。
- 提交成功后把 commit sha 回填到 CHANGELOG 那一行。

### 5. 确认线上已更新

```bash
curl -s "https://api.github.com/repos/wx779789/weather3d/pages/builds/latest" | grep -E '"status"|"duration"'
```

`status` 变为 `built` 后再访问 https://wx779789.github.io/weather3d/ 复核。构建期间状态为 `building`，通常 40–90 秒。

## 二、禁止事项

1. **禁止 `git push`**——本机 `github.com` 不可达，必然失败且浪费时间。用 `tools/gh_sync.py`。
2. **禁止直接改 `dist/`**——下次同步会被 `public/` 覆盖。
3. **禁止提交密钥**——仓库已公开，任何 Token/密钥一旦提交即视为泄露。`gh_sync.py` 会拦截 `.env`、`*.key`、`*.pem`。
4. **禁止删 `credits.json`**——18 张地标图均为 CC 授权，删掉署名即构成许可违规。
5. **禁止跳过 CHANGELOG**——没有 CHANGELOG 条目的创作视为未完成。

## 三、命名与风格基线

- 中文界面文案，术语保持与现有面板一致（实时 / 24 小时 / 未来 7 天）。
- CSS 沿用 `css/base.css` 的变量与 `grain / aurora / grid-floor` 等既有类，不新造平行体系。
- 新增城市 `accent` 取地标照片主色调，与既有 18 城保持同一饱和度区间。
- JS 保持 IIFE + 原生 DOM，**不引入构建工具与框架**（项目零依赖是刻意设计）。
