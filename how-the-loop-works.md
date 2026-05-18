# How the Loop Works — Ralph Loop 核心原理深度解析

## 一句话定义

> Ralph Loop = **Bash while 循环** × **全新 Agent 实例** × **文件持久化状态**

每一轮迭代，一个"无记忆"的新 Agent 启动，读取文件快速定位，做一件事，写回文件，退出。外循环检测完成信号，决定是否开始下一轮。

---

## 为什么需要这个？——上下文窗口的本质问题

### 内存分配模型

LLM 的上下文窗口类似于计算机内存，但只有 `malloc()`，没有 `free()`：

```
传统编程:
  malloc(buffer)      → 分配内存
  process(buffer)     → 使用
  free(buffer)        → 释放 ✅ 可以复用

LLM 上下文:
  read_file("x.py")   → 分配 (无法释放)
  tool_call("ls")     → 输出追加 (无法释放)
  read_file("y.py")   → 继续累积 (无法释放)
  ...
  [context full]      → 质量急剧下降 ❌
```

### The Dumb Zone（愚钝区）

```
上下文使用率:  0%          40%         70%       100%
                │───────────┤───────────┤──────────│
性能:          [  高质量稳定输出  ][警戒区][  愚钝区  ]
                                          ↑
                                   此处开始：
                                   • 遗忘早期规范
                                   • 幻觉增加
                                   • 上下文腐化
                                   • 错误决策
```

**Ralph 的解法**：在 Agent 进入愚钝区之前，主动清空上下文，启动新实例。

---

## 循环的完整执行流程

```
初始状态:
  prd.json     ← 所有 passes: false
  progress.txt ← 空
  AGENTS.md    ← 初始约定
  git          ← 干净初始提交

┌──────────────────────────────────────────────────────────────────┐
│                    RALPH OUTER LOOP                               │
│                                                                   │
│  ┌─ 迭代 #1 ──────────────────────────────────────────────────┐  │
│  │                                                             │  │
│  │  ralph.sh: cat CLAUDE.md | claude --dangerously-skip-...   │  │
│  │                                                             │  │
│  │  ┌── 新鲜 Agent 实例 (零记忆) ────────────────────────┐    │  │
│  │  │                                                    │    │  │
│  │  │  STARTUP RITUAL (强制):                            │    │  │
│  │  │    1. pwd                                          │    │  │
│  │  │    2. git log --oneline -5                         │    │  │
│  │  │    3. cat progress.txt                             │    │  │
│  │  │    4. cat prd.json → 找优先级最高的未完成 Story    │    │  │
│  │  │    5. bash init.sh                                 │    │  │
│  │  │    6. Smoke test (验证环境正常)                    │    │  │
│  │  │                                                    │    │  │
│  │  │  IMPLEMENTATION:                                   │    │  │
│  │  │    → 选定 Story: auth-001                          │    │  │
│  │  │    → 写代码                                        │    │  │
│  │  │    → dev-browser 验证                             │    │  │
│  │  │    → 更新 prd.json: passes: true                  │    │  │
│  │  │    → git commit                                    │    │  │
│  │  │    → 追加 progress.txt                             │    │  │
│  │  │    → 更新 AGENTS.md (如有新发现)                  │    │  │
│  │  │                                                    │    │  │
│  │  │  OUTPUT:                                           │    │  │
│  │  │    "Implemented auth-001. 49 stories remain."      │    │  │
│  │  │    <promise>COMPLETE</promise>                     │    │  │
│  │  └────────────────────────────────────────────────────┘    │  │
│  │                                                             │  │
│  │  ralph.sh 检测: grep "<promise>COMPLETE</promise>"         │  │
│  │    → Found! 检验 prd.json → 仍有 49 pending → 继续循环     │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                           ↓                                       │
│  ┌─ 迭代 #2 ──────────────────────────────────────────────────┐  │
│  │  全新 Agent，零记忆，读文件定位 → Story auth-002 → 实现     │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                           ↓                                       │
│              ... N 次迭代 ...                                      │
│                           ↓                                       │
│  ┌─ 迭代 #N ──────────────────────────────────────────────────┐  │
│  │  全新 Agent → 读 prd.json → 所有 passes: true → 输出       │  │
│  │  <promise>COMPLETE</promise>                                │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                           ↓                                       │
│  ralph.sh: grep 找到信号 + prd.json 验证全通过 → EXIT 0 ✅      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 完成信号机制——`<promise>COMPLETE</promise>`

### 为什么是这个格式？

```xml
<promise>COMPLETE</promise>
```

1. **XML 标签格式**：不容易出现在普通文本或代码输出中，避免误触发
2. **明确语义**：`promise` 表示 Agent 主动承诺任务完成，而非被动结束
3. **grep 可检测**：`grep -q "<promise>COMPLETE</promise>"` 简单可靠
4. **可扩展**：也可用 `<promise>BLOCKED</promise>` 等变体传递状态

### 双重验证（关键！）

只检测信号字符串是不够的：

```bash
# ralph.sh 的双重验证逻辑:

# Step 1: 检测文本信号
if grep -q "$COMPLETION_SIGNAL" "$output_file"; then
  
  # Step 2: 验证 prd.json 实际状态 (防止 Agent 撒谎)
  if all_stories_complete; then
    echo "✅ VERIFIED: signal + prd both confirmed"
    exit 0
  else
    echo "⚠ Signal found but prd.json has pending stories, continuing..."
  fi
fi
```

Agent 可能会输出完成信号但 prd.json 里还有未完成的 Story。双重验证确保实际状态与声明一致。

---

## 状态持久化系统——让遗忘变得无所谓

### 四层持久化

```
Agent 会忘记的:               文件系统会记住的:
┌──────────────────┐          ┌──────────────────────────────────┐
│ 上次的对话历史   │    →     │ progress.txt: 交班日记           │
│ 之前写的代码细节 │    →     │ git history: 代码快照            │
│ 测试结果         │    →     │ prd.json: passes 状态            │
│ 发现的规律约定   │    →     │ AGENTS.md: 累积经验手册          │
└──────────────────┘          └──────────────────────────────────┘
```

### prd.json 的状态机

```
Story 的生命周期:

  passes: false (初始)
      ↓
  Agent 实现 + 测试通过
      ↓
  passes: true (持久化)
      ↓
  下一个 Agent 看到，跳过这个 Story
```

prd.json 就是整个系统的**唯一真实状态来源（Single Source of Truth）**。

### progress.txt 的结构

```
# Project: My SaaS App
# Status: IN PROGRESS

### Session 1 (Initializer) — 2026-01-15 09:00
- 初始化项目结构
- 创建 50 个 User Story
- Features completed: 0 / 50
- Next: auth-001

### Session 2 (Iteration #1) — 2026-01-15 09:15
Feature: auth-001 — 用户邮箱注册
Status: COMPLETED
Changes:
  - 创建 /api/auth/register endpoint
  - 创建 RegisterForm 组件
  - 添加邮箱格式验证
Test: PASS (dev-browser verified)
Next: auth-002
Remaining: 49 / 50

### Session 3 (Iteration #2) — 2026-01-15 09:45
...
```

---

## 固定提示栈——确定性上下文分配

每次迭代都向 Agent 的上下文分配**完全相同**的内容：

```markdown
# CLAUDE.md 的固定结构

## 项目背景       ← 每次都分配（"浪费"但必要）
## 核心约束       ← 每次都分配
## 强制启动序列   ← 每次都分配
## 参考文件引用   ← @prd.json @progress.txt @AGENTS.md
```

**为什么"浪费性重复"是必要的？**

```
替代方案：每次只分配"差异"部分
  问题：Agent 可能不知道它不知道什么
  结果：遗漏关键约束 → 上下文腐化的变体
  
Ralph 方案：每次分配完整规范
  代价：N tokens × M 迭代 = 重复分配
  收益：零 compaction 风险，每次迭代都从已知良态开始
  结论：代价值得
```

---

## 子 Agent 模式——保护主上下文

对于昂贵的操作（运行测试套件、编译、截图），应该 offload 给子 Agent：

```
主 Agent 上下文 (调度器):
  "请运行测试并告诉我 auth-001 是否通过"
  
      ↓ spawn subagent
      
  子 Agent 上下文 (执行器):
    运行 npm test -- auth.test.js
    截图 → 分析结果 → 返回: "PASS / FAIL"
    
      ↑ 只返回结论，不污染主上下文
      
主 Agent: 收到结论 → 更新 prd.json → 提交
```

主上下文永远保持精简，只做决策，不做重型执行。

---

## 停止条件与安全机制

```bash
# ralph.sh 的安全机制

# 1. 最大迭代数（防止无限运行）
MAX_ITERATIONS=100

# 2. 双重验证（防止假完成）
has_signal && prd_is_complete → exit 0

# 3. Ctrl+C 优雅退出（进度保存）
trap cleanup INT TERM

# 4. 每次迭代后延迟（允许人工检查）
sleep 3

# 5. 日志持久化（可追溯）
tail -f ralph-run.log
```

---

## 与传统方案对比

| 维度 | 单次长 Session | 多 Agent 并行 | Ralph Loop |
|------|--------------|--------------|------------|
| 上下文污染 | 累积，不可控 | 各自累积 | 每轮清零 |
| 状态持久化 | 上下文内 | 分散 | 统一文件系统 |
| 失败恢复 | 重启失去进度 | 协调困难 | 读文件即恢复 |
| 调试性 | 难，状态在内存 | 极难 | 简单，看文件即可 |
| 任务规模 | 受单窗口限制 | 协调复杂度倍增 | 理论无上限 |
| 实现复杂度 | 低 | 高 | 低（一个 while 循环）|
| 可预测性 | 低 | 极低 | 高（确定性坏 → 确定性结果）|
