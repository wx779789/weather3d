#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gh_sync.py —— weather3d 的提交工具

为什么存在：本机 github.com 不可达，`git push` 必定失败；只有 api.github.com 可用。
本脚本用 GitHub Git Data API（blob -> tree -> commit -> ref）把本地改动原子提交到 main，
并默认先把 public/ 同步为 dist/，提交后自动触发 GitHub Pages 重新构建。

用法：
    python tools/gh_sync.py -m "feat: 新增 XX 城市"
    python tools/gh_sync.py -m "chore: 测试" --dry-run
    python tools/gh_sync.py -m "..." --no-dist --wait

凭据：优先环境变量 GITHUB_TOKEN / GH_TOKEN，否则从本机 Git 凭据管理器读取。
"""

import argparse
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://api.github.com"
OWNER = "wx779789"
REPO = "weather3d"
BRANCH = "main"
PAGES_URL = "https://wx779789.github.io/weather3d/"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "public")
DIST_DIR = os.path.join(ROOT, "dist")

EXCLUDE_DIRS = {".git", "node_modules", "__pycache__", ".workbuddy", ".idea", ".vscode", ".venv"}
EXCLUDE_FILES = {".DS_Store", "Thumbs.db", "desktop.ini"}
FORBIDDEN_PATTERNS = (".env", ".pem", ".key", ".p12", "id_rsa", "credentials.json")
MAX_BLOB = 50 * 1024 * 1024  # GitHub blob 上限 50MB


# ---------------------------------------------------------------- 凭据

def load_token():
    for key in ("GITHUB_TOKEN", "GH_TOKEN"):
        val = os.environ.get(key, "").strip()
        if val:
            return val
    try:
        out = subprocess.run(
            ["git", "credential", "fill"],
            input="protocol=https\nhost=github.com\n\n",
            capture_output=True, text=True, timeout=30,
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        ).stdout
    except Exception:
        out = ""
    for line in out.splitlines():
        if line.startswith("password="):
            return line[len("password="):].strip()
    return ""


# ---------------------------------------------------------------- HTTP

def call(method, path, token, payload=None, retries=3):
    url = path if path.startswith("http") else API + path
    data = json.dumps(payload).encode() if payload is not None else None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", "Bearer " + token)
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                body = resp.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:400]
            if e.code in (502, 503, 504) and attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise SystemExit("HTTP %s %s %s\n%s" % (e.code, method, path, detail))
        except urllib.error.URLError as e:
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise SystemExit("网络错误 %s %s: %s" % (method, path, e))


# ---------------------------------------------------------------- 工具

def blob_sha(data: bytes) -> str:
    h = hashlib.sha1()
    h.update(b"blob %d\x00" % len(data))
    h.update(data)
    return h.hexdigest()


def walk_local():
    """返回 {相对路径(posix): 绝对路径}"""
    files = {}
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for name in filenames:
            if name in EXCLUDE_FILES:
                continue
            abs_path = os.path.join(dirpath, name)
            rel = os.path.relpath(abs_path, ROOT).replace(os.sep, "/")
            files[rel] = abs_path
    return files


def remote_latest(token):
    ref = call("GET", "/repos/%s/%s/git/ref/heads/%s" % (OWNER, REPO, BRANCH), token)
    sha = ref["object"]["sha"]
    commit = call("GET", "/repos/%s/%s/git/commits/%s" % (OWNER, REPO, sha), token)
    tree_sha = commit["tree"]["sha"]
    tree = call("GET", "/repos/%s/%s/git/trees/%s?recursive=1" % (OWNER, REPO, tree_sha), token)
    files = {n["path"]: n["sha"] for n in tree.get("tree", []) if n["type"] == "blob"}
    return sha, tree_sha, files


def sync_dist(verbose=True):
    """public/ -> dist/，并清理 dist 中多余文件"""
    if not os.path.isdir(SRC_DIR):
        raise SystemExit("找不到源目录 public/")
    if os.path.isdir(DIST_DIR):
        for dirpath, _, filenames in os.walk(DIST_DIR):
            for name in filenames:
                abs_path = os.path.join(dirpath, name)
                rel = os.path.relpath(abs_path, DIST_DIR)
                if not os.path.exists(os.path.join(SRC_DIR, rel)):
                    os.remove(abs_path)
                    if verbose:
                        print("  清理 dist/%s" % rel.replace(os.sep, "/"))
    os.makedirs(DIST_DIR, exist_ok=True)
    shutil.copytree(SRC_DIR, DIST_DIR, dirs_exist_ok=True)
    if verbose:
        print("public/ → dist/ 已同步")


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return "%.1f%s" % (n, unit) if unit != "B" else "%d%s" % (n, unit)
        n /= 1024.0


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser(description="通过 GitHub API 提交 weather3d")
    ap.add_argument("-m", "--message", required=True, help="commit message")
    ap.add_argument("--dry-run", action="store_true", help="只显示差异，不提交")
    ap.add_argument("--no-dist", action="store_true", help="跳过 public/ → dist/ 同步")
    ap.add_argument("--prune", action="store_true", help="删除远端存在但本地已删的文件")
    ap.add_argument("--wait", action="store_true", help="提交后等待 Pages 构建完成")
    args = ap.parse_args()

    token = load_token()
    if not token:
        raise SystemExit("未找到 GitHub 凭据：请设置 GITHUB_TOKEN 或登录 git credential manager")

    if not args.no_dist:
        sync_dist()
        print("")

    if os.getcwd() != ROOT:
        os.chdir(ROOT)

    print("读取远端 %s/%s@%s ..." % (OWNER, REPO, BRANCH))
    base_commit, base_tree, remote_files = remote_latest(token)
    print("  base commit: %s  (%d 个文件)" % (base_commit[:7], len(remote_files)))

    local_files = walk_local()

    uploads, skipped, blocked, wf_blocked = [], [], [], []
    for rel, abs_path in sorted(local_files.items()):
        if rel.startswith(".github/workflows/"):
            # 令牌无 workflow scope，GitHub 会以 404 拒绝写入工作流文件
            wf_blocked.append(rel)
            continue
        if any(p in rel.lower() or rel.lower().endswith(p) for p in FORBIDDEN_PATTERNS):
            blocked.append(rel)
            continue
        size = os.path.getsize(abs_path)
        if size > MAX_BLOB:
            skipped.append((rel, "超过 50MB"))
            continue
        with open(abs_path, "rb") as fh:
            data = fh.read()
        sha = blob_sha(data)
        if remote_files.get(rel) != sha:
            uploads.append((rel, data, sha, size))

    deletions = [] if not args.prune else sorted(set(remote_files) - set(local_files))

    if blocked:
        print("\n[拦截] 疑似敏感文件，已跳过：")
        for b in blocked:
            print("  ! " + b)
    if wf_blocked:
        print("\n[拦截] .github/workflows/ 下的文件已跳过：")
        for b in wf_blocked:
            print("  ! " + b)
        print("  原因：当前令牌无 workflow scope，GitHub 对工作流文件写入一律返回 404。")
        print("  升级路径见 docs/deployment.md「切回 Actions 发布」。")
    if skipped:
        print("\n[跳过] 体积超限：")
        for rel, why in skipped:
            print("  ! %s (%s)" % (rel, why))

    if not uploads and not deletions:
        print("\n没有需要提交的改动，退出。")
        return 0

    print("\n待提交 %d 个新增/修改%s：" % (len(uploads), "，%d 个删除" % len(deletions) if deletions else ""))
    for rel, _data, _sha, size in uploads:
        print("  M %-52s %8s" % (rel, human(size)))
    for rel in deletions:
        print("  D %s" % rel)
    total = sum(u[3] for u in uploads)
    print("  合计上传 %s" % human(total))

    if args.dry_run:
        print("\n--dry-run：未提交。")
        return 0

    print("\n上传 blob ...")
    tree_entries = []
    for i, (rel, data, sha, _size) in enumerate(uploads, 1):
        blob = call("POST", "/repos/%s/%s/git/blobs" % (OWNER, REPO), token,
                    {"content": base64.b64encode(data).decode("ascii"), "encoding": "base64"})
        tree_entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        print("  [%d/%d] %s" % (i, len(uploads), rel))
    for rel in deletions:
        tree_entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": None})

    print("\n创建 tree ...")
    tree = call("POST", "/repos/%s/%s/git/trees" % (OWNER, REPO), token,
                {"base_tree": base_tree, "tree": tree_entries})

    print("创建 commit ...")
    commit = call("POST", "/repos/%s/%s/git/commits" % (OWNER, REPO), token,
                  {"message": args.message, "tree": tree["sha"], "parents": [base_commit]})

    print("更新 ref/heads/%s ..." % BRANCH)
    call("PATCH", "/repos/%s/%s/git/refs/heads/%s" % (OWNER, REPO, BRANCH), token,
         {"sha": commit["sha"], "force": False})

    print("\n提交成功  %s" % commit["sha"][:7])
    print("  仓库   https://github.com/%s/%s" % (OWNER, REPO))
    print("  线上   %s" % PAGES_URL)

    if args.wait:
        print("\n等待 Pages 构建 ...")
        deadline = time.time() + 180
        last = None
        while time.time() < deadline:
            time.sleep(6)
            try:
                latest = call("GET", "/repos/%s/%s/pages/builds/latest" % (OWNER, REPO), token)
            except SystemExit:
                break
            status = latest.get("status")
            if status != last:
                print("  status=%s" % status)
                last = status
            if status in ("built", "errored"):
                break
        else:
            print("  超时，未等到构建完成，稍后自查。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
