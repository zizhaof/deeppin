# 合并输出 — 线程树选择器设计文档

**日期**：2026-04-13  
**状态**：已确认，待实现

---

## 概述

在合并输出弹窗中，新增一个可交互的 SVG 树形图，允许用户在生成合并报告前选择要纳入的子问题（子线程）。节点的默认选中状态由一次 LLM 调用根据摘要相关性自动判断。

---

## 一、后端

### 1. 新增端点：`POST /api/sessions/{session_id}/relevance`

**职责**：一次性评估所有子线程与主线的相关性，返回每个子线程的默认选中状态。

**处理流程**：
1. 查主线（depth=0）的 `thread_summaries`；若缺失则取最近 10 条消息拼接后调用 summarizer 生成摘要。
2. 查所有子线程（depth > 0）的 `thread_summaries`；缺失的线程同样先生成摘要再使用。
3. 将主线摘要 + 各子线程摘要一起送入一次 LLM 调用，prompt 要求按 JSON 数组返回结构化结果：
   ```json
   [
     {"thread_id": "uuid", "selected": true, "reason": "与主题高度相关"},
     {"thread_id": "uuid", "selected": false, "reason": "偏离主题，讨论性能细节"}
   ]
   ```
4. 直接返回 JSON（非 SSE），因结果小且需整体解析。

**响应体**：
```typescript
Array<{
  thread_id: string;
  selected: boolean;
  reason: string;
}>
```

**错误处理**：LLM 解析失败时，默认所有子线程 `selected: true`。

---

### 2. 修改端点：`POST /api/sessions/{session_id}/merge`

`MergeRequest` 新增可选字段：
```python
thread_ids: list[str] | None = None
# None = 合并全部子线程（向后兼容）
# 有值 = 仅合并指定 thread_id 的子线程
```

后端在查询子线程时加 `.in_("id", thread_ids)` 过滤（当 `thread_ids` 非 None 时）。

---

## 二、前端

### 1. 弹窗尺寸自适应

弹窗宽高根据树的实际尺寸动态计算：

```
树宽 = 每层最多节点数 × (节点宽 130 + 间距 20) + padding 64
树高 = 层数 × (节点高 50 + 层间距 85) + padding 64

弹窗宽 = min(树宽 + 40, 90vw, 但不小于 400)
弹窗高 = min(树高 + 180, 85vh, 但不小于 360)
（180 = header 40 + format bar 44 + footer 44 + 余量）
```

窗口 resize 时重新计算并更新弹窗尺寸。

---

### 2. 可平移 SVG Canvas（`MergeTreeCanvas.tsx`）

新建独立组件，封装 SVG 树渲染与平移逻辑。

**平移交互**：
- 鼠标滚轮（`deltaY`）→ 垂直平移
- Shift + 滚轮 / 触控板横向滑动（`deltaX`）→ 水平平移
- 鼠标拖拽（mousedown + mousemove）→ 任意方向平移
- 平移范围 clamp：不允许超出树的边界（留 32px 余量）
- 初始状态：树小于视口时居中显示；树大于视口时从左上角开始

**组件 Props**：
```typescript
interface Props {
  threads: Thread[];
  selected: Set<string>;         // 已选 thread ID 集合
  onToggle: (id: string) => void; // 点击节点反选回调
}
```

---

### 3. 节点视觉设计

**根节点（主线）**：
- 尺寸：110 × 40，圆角 12
- 背景：`#1e1b4b`，边框：`rgba(99,102,241,0.5)`
- 文字：`主线对话`，居中，`#c7d2fe`
- 不可点击，永远不参与反选

**子线程节点**：
- 尺寸：130 × 50，圆角 9
- 已选背景：`#1e1b4b`，边框：`rgba(99,102,241,0.3)`，带 glow filter
- 未选背景：`#18181b`，边框：`rgba(255,255,255,0.06)`，半透明
- 左对齐内容：
  - Title（粗体，10px，最多 11 字截断）
  - Anchor text（8.5px，dimmer，最多 16 字截断）
- 右上角状态点：已选绿色 `#4ade80`，未选灰色 `#3f3f46`
- 底部 relevance 进度条（2.5px 高，`rel >= 0.6` 用 indigo，否则用灰色）
- 外圈 glow ring（已选时显示，`rgba(99,102,241,0.15)`）

**连线**：
- 已选：`rgba(99,102,241,0.35)`，实线 1.5px
- 未选：`rgba(255,255,255,0.06)`，虚线 4-3

---

### 4. MergeOutput.tsx 改动

**新增 props**：
```typescript
threads: Thread[]   // 从 chat page 传入，用于构建树
```

**新增状态**：
```typescript
const [relevanceLoaded, setRelevanceLoaded] = useState(false);
const [selected, setSelected] = useState<Set<string>>(new Set());
```

**流程**：
1. 弹窗打开时（`useEffect` on mount）：调用 `/relevance` 端点
2. 加载期间显示骨架态（树形区域显示 loading 动画）
3. 拿到结果后设置 `selected` 初始值，渲染 `MergeTreeCanvas`
4. 用户点击节点 → `setSelected(prev => toggle)`
5. 点「合并 N 个子问题」→ 将 `[...selected]` 作为 `thread_ids` 传给 `sendMergeStream`

**文案变更**（全局）：
- `x 个角度` → `x 个子问题`
- 生成按钮：`合并 x 个子问题`
- 底部标签：`已选 x / n 个子问题`
- `pinCount` 相关文字同步更新

---

### 5. chat/[sessionId]/page.tsx 改动

向 `MergeOutput` 传入 `threads` prop：
```tsx
<MergeOutput
  sessionId={sessionId}
  threads={threads}         // 新增
  pinCount={...}
  onClose={...}
/>
```

---

## 三、文件变动清单

| 文件 | 变动类型 |
|------|---------|
| `backend/routers/merge.py` | 修改：新增 `thread_ids` 过滤 |
| `backend/routers/relevance.py` | 新建：relevance 端点 |
| `backend/main.py` | 修改：注册 relevance router |
| `frontend/components/MergeTreeCanvas.tsx` | 新建：SVG 树 + pan 逻辑 |
| `frontend/components/MergeOutput.tsx` | 修改：自适应尺寸、调用 relevance、集成树组件、文案 |
| `frontend/app/chat/[sessionId]/page.tsx` | 修改：传 `threads` 给 MergeOutput |
| `frontend/lib/api.ts` | 修改：新增 `getRelevance()` 函数 |
| `frontend/lib/sse.ts` | 修改：`sendMergeStream` 接受 `thread_ids` 参数 |

---

## 四、不在范围内

- 缩放（zoom in/out）— 不实现，pan 已满足导航需求
- 节点拖拽重排 — 不实现
- 子问题嵌套折叠 — 不实现，树形图直接展开全部
