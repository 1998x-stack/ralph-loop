---
name: ralph-loop
version: 1.0.0
description: >
  Complete autonomous AI agent loop system based on the Geoffrey Huntley "Ralph Wiggum"
  technique. Runs AI coding agents (Claude Code / Amp) in continuous iterations until
  all PRD items are verifiably complete. Each iteration is a fresh agent instance with
  clean context; memory persists via git, prd.json, progress.txt, and AGENTS.md.
  
  Use when: building software autonomously AFK, spanning tasks beyond a single context
  window, structuring a project for continuous AI iteration, setting up PRD-driven
  development loops, preventing premature agent completion.

trigger_phrases:
  - "run ralph"
  - "ralph loop"
  - "autonomous coding loop"
  - "set up ralph for"
  - "run until complete"
  - "AFK agent"
  - "continuous agent"
  - "让 AI 自动跑"

author: based on Geoffrey Huntley's ralph-wiggum technique
references:
  - https://ghuntley.com/ralph/
  - https://github.com/snarktank/ralph
  - https://github.com/vercel-labs/ralph-loop-agent
---

# Ralph Loop Skill

## 核心哲学

> **"The technique is deterministically bad in an undeterministic world."**  
> — Geoffrey Huntley

Ralph Loop 是一个 **Bash 外循环 + 新鲜 Agent 实例 + 文件持久化状态** 的自主开发模式。

不试图让单个 Agent 记住一切 —— 而是把状态全部写进文件，让每一个新鲜的 Agent 从文件中快速定位，继续上一个 Agent 中断的工作。

```
上下文窗口的本质：工作台（working memory）
文件系统的本质：  长期记忆（persistent memory）

Ralph 的核心原则：
  工作台用完就扔，换一张新的
  所有重要东西只放在文件系统里
```

---

## 五个核心组件

| 组件 | 文件 | 作用 |
|------|------|------|
| **外循环** | `scripts/ralph.sh` | Bash while 循环，驱动整个系统 |
| **固定提示栈** | `templates/CLAUDE.md` | 每次迭代喂给 Agent 的不变 Prompt |
| **任务清单** | `prd.json` | 结构化需求，每条带 `passes: bool` |
| **跨会话记忆** | `progress.txt` | Agent 交班日记 |
| **累积经验** | `AGENTS.md` | Agent 自我学习的约定手册 |

---

## 快速启动流程

### Step 1：生成 PRD（项目需求文档）

```bash
# 触发 PRD 生成模式
# 参考：scripts/prd-generator-prompt.md
# 输出：prd.json（50-200 个细粒度 User Story）
```

### Step 2：项目初始化（仅一次）

```bash
# 用 initializer agent 建立脚手架
# 参考：references/initializer-agent.md
# 输出：init.sh, prd.json, progress.txt, AGENTS.md, 初始 git commit
```

### Step 3：启动 Ralph 循环

```bash
cd your-project/
bash scripts/ralph/ralph.sh
```

Ralph 会：
1. 读取 `CLAUDE.md`，启动新鲜 Claude Code 实例
2. Agent 读取 prd.json → 选最高优先级未完成 Story → 实现 → 测试 → 提交
3. Agent 输出 `<promise>COMPLETE</promise>` → ralph.sh 检测 → 循环
4. 所有 Story `passes: true` → 循环退出

---

## 关键约束（每次必须）

```
✅ 每次迭代只做 ONE 个 User Story
✅ 前端变更必须用 browser automation 验证
✅ 每次迭代结束必须 git commit
✅ 每次迭代必须更新 progress.txt
✅ 完成时必须输出 <promise>COMPLETE</promise>

❌ 不允许修改或删除已通过的测试
❌ 不允许在 Bug 卡住 2 次后继续强行修
❌ 不允许主观判断"完成了"，必须基于验证
```

---

## 文件结构

```
your-project/
├── AGENTS.md                    ← Agent 经验手册（自动更新）
├── prd.json                     ← 任务清单（核心状态）
├── progress.txt                 ← 交班日记
├── init.sh                      ← 环境启动脚本
│
└── scripts/ralph/
    ├── ralph.sh                 ← 外循环主控脚本
    ├── ralph-advanced.sh        ← 高级版（成本控制/通知）
    ├── ralph-node.js            ← TypeScript/Node 实现
    └── prd-generator-prompt.md  ← PRD 生成提示词
```

---

## 参考文件

- `references/how-the-loop-works.md` — 循环原理深度解析
- `references/initializer-agent.md` — 初始化 Agent 完整指南
- `references/coding-agent.md` — 编码 Agent 提示词 & 协议
- `references/context-strategies.md` — 上下文窗口管理策略
- `references/testing-patterns.md` — E2E 测试模式

## 模板文件

- `templates/CLAUDE.md` — Claude Code 固定提示词模板
- `templates/prd.json` — PRD 结构模板
- `templates/AGENTS.md` — AGENTS.md 初始模板
- `templates/progress.txt` — progress.txt 初始模板
