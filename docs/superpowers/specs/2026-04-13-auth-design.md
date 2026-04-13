# Auth Design — Deeppin
Date: 2026-04-13

## 需求总结

- 登录方式：Google OAuth（仅此一种）
- 数据隔离：每个用户只能看到自己的 sessions
- 未登录行为：首页可浏览，点「新建对话」跳转 `/login`，`/chat/*` 路由强制登录
- 后端鉴权：所有接口必须携带有效 JWT，否则 401
- 安全策略：应用层（JWT 验证）+ 数据库层（RLS）双重防护

---

## 架构

```
用户浏览器
  │
  ├── 未登录 → /login → Google OAuth → /auth/callback → 写 cookie → 跳回
  │
  └── 已登录 → 请求携带 JWT (Authorization: Bearer <token>)
                  │
                  ▼
            FastAPI Depends(get_current_user)
            验证 JWT → 提取 user_id → 创建用户身份 Supabase 客户端
                  │
                  ▼
            Supabase DB (RLS 开启)
            auth.uid() = user_id → 只返回本人数据
```

---

## 数据库变更（Migration）

```sql
-- 1. sessions 表加 user_id
ALTER TABLE sessions
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- 2. 开启 RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own sessions"
  ON sessions FOR ALL
  USING (user_id = auth.uid());

ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own threads"
  ON threads FOR ALL
  USING (
    session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid())
  );

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own messages"
  ON messages FOR ALL
  USING (
    thread_id IN (
      SELECT t.id FROM threads t
      JOIN sessions s ON s.id = t.session_id
      WHERE s.user_id = auth.uid()
    )
  );

ALTER TABLE thread_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own summaries"
  ON thread_summaries FOR ALL
  USING (
    thread_id IN (
      SELECT t.id FROM threads t
      JOIN sessions s ON s.id = t.session_id
      WHERE s.user_id = auth.uid()
    )
  );
```

---

## 后端变更

### 新增文件

**`backend/dependencies/__init__.py`**（空文件）

**`backend/dependencies/auth.py`**
- `get_current_user(authorization: str = Header(...))` — FastAPI dependency
- 用 service_role client 验证 JWT 有效性（`auth.get_user(token)`）
- 提取 `user_id`
- 用 ANON_KEY + 用户 JWT 创建临时 Supabase 客户端（让 RLS 生效）
- 返回 `(user_id: str, sb: Client)`
- 无效 token → raise `HTTPException(401)`

### 改造现有路由

所有路由加 `auth = Depends(get_current_user)`，用返回的 `(user_id, sb)` 替换原有的 `get_supabase()` 调用：

| 文件 | 主要改动 |
|------|---------|
| `routers/sessions.py` | create_session 写入 user_id；list/get 用 user JWT 客户端（RLS 自动过滤） |
| `routers/threads.py` | 全部接口注入 auth |
| `routers/stream.py` | 全部接口注入 auth |
| `routers/merge.py` | 全部接口注入 auth |
| `routers/attachments.py` | 全部接口注入 auth |
| `routers/search.py` | 全部接口注入 auth |

### 环境变量新增

```
SUPABASE_ANON_KEY=xxx   # 前端公开 key，用于创建用户身份客户端
```

（原有 `SUPABASE_SERVICE_ROLE_KEY` 保留，仅用于 JWT 验证和管理操作）

---

## 前端变更

### 新增依赖

```
@supabase/ssr
@supabase/supabase-js
```

### 新增文件

**`frontend/lib/supabase.ts`** — 浏览器端 Supabase 客户端单例（`createBrowserClient`）

**`frontend/app/login/page.tsx`** — 登录页
- 居中显示 Deeppin logo + 「用 Google 账号继续」按钮
- 调用 `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`

**`frontend/app/auth/callback/route.ts`** — OAuth 回调 Route Handler
- 接收 `?code=xxx`
- `supabase.auth.exchangeCodeForSession(code)`
- `redirect('/')`

**`frontend/middleware.ts`** — Next.js 中间件
- 保护 `/chat/*`：无 session → redirect `/login`
- 自动刷新过期 token（`@supabase/ssr` 标准做法）

### 改造现有文件

**`frontend/lib/api.ts`**
- 所有请求函数自动从 Supabase session 取 `access_token`
- 加入 `Authorization: Bearer <token>` header

**`frontend/app/page.tsx`**
- 顶栏右侧加用户头像 + 退出登录按钮（已登录时显示）
- 「新建对话」按钮：未登录 → `router.push('/login')`，已登录 → 原有逻辑

**`frontend/app/chat/[sessionId]/page.tsx`**
- 页面顶层检查 session，未登录 → redirect `/login`（middleware 已覆盖，这里是双保险）

---

## 测试覆盖

**`backend/tests/test_auth.py`**（新增）
- 无 token → 401
- 无效 token → 401
- 有效 token → 正常返回 user_id 和 sb 客户端

**现有测试**：所有路由测试需要 mock `get_current_user` dependency，注入假的 `(user_id, mock_sb)`

---

## Supabase 控制台配置

1. Authentication → Providers → Google → 开启，填入 Client ID / Secret
2. Authentication → URL Configuration → 加入回调地址：
   - 开发：`http://localhost:3000/auth/callback`
   - 生产：`https://deeppin.vercel.app/auth/callback`
