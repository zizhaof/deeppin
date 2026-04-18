# Deeppin 开发：Mac × Telegram 怎么分工

deeppin 是单人项目，一个 Mac + 一部手机 + 一个 Oracle Free Tier。这份文档是 Mac CLI 和 Telegram bot 两个入口在 deeppin 这个项目上的具体分工，对应关系已经写在 CLAUDE.md 的 CI/CD 节——这份是实操视角。

> 通用的"Mac vs Telegram 怎么配合"原理写在 [claude-telegram/docs/workflow.md](https://github.com/zizhaof/claude-telegram/blob/main/docs/workflow.md)，这份只写 deeppin 特有的。

---

## Mac 上做什么

Mac 是主战场，因为 deeppin 的开发里以下几类活动**只有**在 Mac 上能做顺：

1. **完整 worktree 工作流**：`dpwt <branch>` 建 worktree 到 `~/workspace/deeppin-trees/<branch>/`（memory 里记过这个 helper）。切 worktree 比切 branch 干净——每个 feature 物理隔离。
2. **跑 integration test**：需要真实 Supabase 凭证 + 网络。
   ```
   cd backend
   TEST_BASE_URL=https://deeppin.duckdns.org \
   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
   pytest tests/integration/ -v
   ```
3. **看 Grafana / Prometheus UI**：
   - Grafana 公网有：`https://deeppin.duckdns.org/grafana/`
   - Prometheus 只回环，要 Mac 上开 tunnel：`ssh -L 9090:127.0.0.1:9090 oracle`
4. **review PR diff、改多文件、改 schema**：CLAUDE.md 明文规定 `backend/**` / `docker-compose.yml` / `nginx/**` / `scripts/**` / `.github/workflows/**` 改动必须走 branch + staging，这些都是 Mac 上的节奏。
5. **跑 SentenceTransformer / 嵌入模型本地调试**：bge-m3 4G，手机上跑不了，也没必要。

Mac 上典型会话：
```
dpwt feat/xxx                         # 开 worktree
cd ~/workspace/deeppin-trees/feat-xxx
claude                                # 开 Claude CLI
# 改 backend/** → pytest → git push
gh workflow run deploy-staging.yml -f branch=feat/xxx   # 或走 bot 下面说
# 验 staging → 开 PR 合 main → deploy-backend.yml 自动部 prod
```

---

## Telegram（claude-telegram bot）上做什么

bot 在 Oracle 上以 systemd 服务跑，和 deeppin 共机但**不同目录**（`/home/ubuntu/claude-telegram/` vs `/home/ubuntu/deeppin/`）。

三件事 Telegram 做起来比 Mac 顺：

### 1. 路上改小东西 + 推 staging

```
你: /workspace deeppin
你: 把 /api/threads 里那段错误消息改成 "session expired, please re-auth"
bot: [在 $WORKSPACES_ROOT/deeppin/chat-<id>/ 开 worktree，Claude 改完 push 到 chat-<id> 分支]
你: /deploy chat-<id>
bot: [调 gh workflow run deploy-staging.yml]
```

`/deploy` 要求 bot 的 `.env` 里配了 `GITHUB_TOKEN`（有 `repo` + `workflow` 权限），以及 workspace 已经 `/wsdeploy deploy-staging.yml`。配一次终身受用。

### 2. 看生产健康状态

bot 可以直接 WebFetch，在 Telegram 里看：
```
你: /readonly on
你: curl https://deeppin.duckdns.org/health/providers/keys 看看哪几个 provider 挂了
bot: [WebFetch 拉 JSON，Claude 解析给你结论]
```

**一定要先 `/readonly on`**——这是在让 bot 读**外部**内容，虽然是自己的生产 endpoint，但养成习惯最安全。

### 3. 紧急 restart

半夜告警，电脑没开：
```
你: /status
bot: workspace: deeppin, session: ..., ...
你: 让 oracle 那边 sudo systemctl restart deeppin-backend
bot: [Bash 执行]
```

这依赖 bot 自己有 ssh 到 oracle 的能力——设计上 bot 跑在 oracle 本机，所以实际上是 `docker compose restart backend`。

---

## 什么绝对不能在 Telegram 上做

- **改 Supabase 生产数据**：CLAUDE.md 明文禁止。
- **force push 到 main**：同上。
- **跳过 CI 门禁**（`--no-verify` 等）：同上。
- **大 refactor**：手机 review 不了 diff，很容易出漏洞。
- **改前端**：Next.js 项目 hot reload 看不到效果，等于盲写。

---

## 共享 Oracle 的拓扑

deeppin 和 claude-telegram bot 共用一台 Oracle Free Tier（4 核 24G ARM），但**完全不共用进程**：

| 服务 | 路径 | 进程 |
|---|---|---|
| deeppin prod | `/home/ubuntu/deeppin/` | Docker compose（backend / nginx / searxng / prometheus / grafana）|
| deeppin staging | `/home/ubuntu/deeppin-staging/` | Docker compose（project name `deeppin-staging`）|
| claude-telegram bot | `/home/ubuntu/claude-telegram/` | systemd service（无 Docker，直接 python venv）|

共享的只有：
- `hf-cache` named volume（deeppin prod + staging 共用 bge-m3 模型）
- Let's Encrypt 证书目录（nginx 容器 bind-mount）

bot 自己**不依赖** deeppin 服务，可以独立 restart，反过来也是。

---

## 典型周末节奏

### 周五晚，咖啡店
手机上想到"合并输出的结构化模式里，Markdown 缩进不对"。
```
你 → bot: /workspace deeppin
你 → bot: backend/services/merger.py 里 structured 模式的缩进逻辑看下，好像多了一级
bot: [Claude 读文件，找到 bug，改完 commit push 到 chat-<id>]
你 → bot: /deploy chat-<id>
[打开 staging-deeppin.duckdns.org，点合并，验证缩进对了]
```

### 周六早，Mac 接手
```
cd ~/workspace/deeppin
git fetch
git checkout chat-<id>
# review Claude 的改动，加个单测
# commit 一条清爽的 "fix: structured merge indent off-by-one"
git push
gh pr create
# 合并，deploy-backend.yml 自动部 prod
```

### 周日晚，监控
Grafana 半夜告警 Gemini RPD 耗尽。
```
手机 → bot: /status
你: 查一下 /health/providers/keys 现在情况（先开 /readonly on）
bot: [看状态，给你 summary]
# 决定：不用改代码，等白天 RPD 重置就好。关 /readonly off，回去睡。
```

---

## 起手脚本

新开发者（或者你换了机器）要搭 Mac × Telegram 双入口：

1. **Mac 侧**：
   ```
   # 装 Claude Code CLI
   # 装 gh + gh auth login
   # clone deeppin，按 CLAUDE.md 配 .env
   ```
2. **Oracle 侧**（一次性）：
   - 部 deeppin prod（compose up）
   - 部 claude-telegram bot（systemd，见 claude-telegram README）
3. **bot 里注册 deeppin workspace**：
   ```
   /addproject /home/ubuntu/deeppin deeppin
   /wsdeploy deploy-staging.yml
   ```
4. **测试回路**：手机上 `/status`，确认 bot 在。随便发句话看 Claude 能响应。
