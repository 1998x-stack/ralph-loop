# Context Strategies — 上下文窗口管理策略

## 核心概念：上下文的 malloc/free 问题

```
每次工具调用 = malloc() 向上下文追加内容
没有对应的 free() = 上下文只增不减

工具调用链示意:
  [系统提示]        → 分配 ~5,000 tokens
  read_file(a.py)   → 分配 ~2,000 tokens
  run_tests()       → 分配 ~3,000 tokens  (测试输出)
  read_file(b.py)   → 分配 ~1,500 tokens
  run_tests()       → 分配 ~3,000 tokens  (又一次测试输出)
  read_file(c.py)   → 分配 ~2,000 tokens
  ...
  [上下文已 65% → 进入 Dumb Zone]
```

**Ralph 的根本解法**：在进入 Dumb Zone 之前，主动退出，让外循环重启新实例。

---

## 策略一：固定栈分配（Static Stack Allocation）

**原则**：每次迭代，以完全相同的方式分配上下文栈。

```markdown
# CLAUDE.md 固定分配顺序:
[System Prompt]        ← 总是第一个 (~3k tokens)
[Project conventions]  ← 总是第二个 (~2k tokens)
[Core constraints]     ← 总是第三个 (~1k tokens)
[File references]      ← 总是最后 (@prd.json @progress.txt @AGENTS.md)
```

**为什么顺序重要？**

LLM 对上下文开头和结尾的注意力高于中间部分（"lost in the middle"问题）。把最重要的约束放在最前面，确保 Agent 不会忘记它们。

```
注意力曲线:
高 ──┐                    ┌── 高
     │  (开头内容)        │   (结尾内容)
     └────────────────────┘
低       (中间内容最容易被忽略)
          ↑
    避免把重要约束放这里
```

---

## 策略二：子 Agent 卸载（Subagent Offloading）

对于"消耗大量 tokens 但只需要结论"的操作，卸载给子 Agent：

```markdown
# 主 Agent (调度层，保持精简):
"请用子 Agent 运行完整测试套件，告诉我哪些通过，哪些失败"

    ↓ spawn subagent

# 子 Agent (执行层，消耗但不污染主上下文):
npm test 2>&1  →  生成 50,000 字符测试输出
               →  总结为: "3 pass, 1 fail: auth.test.js line 45"
               →  返回简洁结论给主 Agent

# 主 Agent 收到: "3 pass, 1 fail: auth.test.js line 45"
# 主上下文增加: ~20 tokens（而非 50,000）
```

**适合卸载的操作**：

| 操作 | 原始 tokens | 卸载后 tokens |
|------|------------|-------------|
| 运行完整测试套件 | ~50,000 | ~100 |
| 编译大型项目 | ~20,000 | ~50 |
| 截图分析 | ~8,000 | ~50 |
| 文件树扫描 | ~10,000 | ~100 |
| Git diff 大型变更 | ~30,000 | ~100 |

---

## 策略三：观察遮蔽（Observation Masking）

当上下文接近限制时（而非 Ralph 的清空策略），可以用"遮蔽"保留最近的 N 轮：

```python
# 示意：保留最近 10 轮，其余替换为摘要占位符
def mask_old_observations(messages, keep_last_n=10):
    if len(messages) <= keep_last_n:
        return messages
    
    old_messages = messages[:-keep_last_n]
    recent_messages = messages[-keep_last_n:]
    
    # 用摘要替换旧消息
    summary_msg = {
        "role": "system",
        "content": f"[Previous {len(old_messages)} messages summarized: "
                   f"Implemented features auth-001 through auth-005, "
                   f"all tests passing, last commit: feat(auth-005)]"
    }
    
    return [summary_msg] + recent_messages
```

**Ralph 的立场**：Observation Masking 不适合 Ralph 的"每 Story 一迭代"模式，因为每次都重启新实例。但在 Story 实现**过程中**，子任务之间可以使用 Masking 来延长单个 Session 的有效工作时间。

---

## 策略四：规范文件 vs 上下文内容

**黄金规则**：任何需要跨会话持久化的信息，必须在文件里，不能只在上下文里。

```
上下文里的信息:    ← 迭代结束即消失
  "我刚发现 PostgreSQL 连接超时需要设置 pool_timeout=30"
  
文件里的信息:      ← 永久保存，下一个 Agent 能看到
  AGENTS.md:
    "## Known Issues
     - PostgreSQL connections: must set pool_timeout=30 in db config"
```

**何时写入文件？**
- 发现新的项目约定 → 更新 AGENTS.md
- 发现环境配置问题 → 更新 init.sh + AGENTS.md
- 完成一个 Story → 更新 prd.json + progress.txt
- 遇到 Bug（即使没解决）→ 记录 progress.txt + AGENTS.md

---

## 策略五：上下文预算管理

在编写 CLAUDE.md 时，估算每个部分消耗的 tokens，确保总量合理：

```
理想的 CLAUDE.md 上下文预算 (模型: ~200k context):
┌────────────────────────────────────────────────────────┐
│ CLAUDE.md 固定内容          ~5,000  tokens (2.5%)      │
│ prd.json（当前状态）        ~15,000 tokens (7.5%)      │
│ progress.txt                ~3,000  tokens (1.5%)      │
│ AGENTS.md                   ~2,000  tokens (1.0%)      │
│ 实现过程中的工具调用结果    ~50,000 tokens (25%)       │
│ 代码文件读取               ~30,000 tokens (15%)        │
│                            ─────────────────────────── │
│ 小计                       ~105,000 tokens (52.5%)     │
│                                                        │
│ 安全缓冲区（48% 余量）      ← 避免进入 Dumb Zone       │
└────────────────────────────────────────────────────────┘
```

**优化 prd.json 大小**：

```python
# 问题：随着 stories 增加，prd.json 越来越大

# 解决方案 A：只加载未完成的 Story
python3 - <<'EOF'
import json
with open('prd.json') as f:
    data = json.load(f)
stories = data.get('userStories', [])
pending = [s for s in stories if not s.get('passes', False)]
# 只展示待完成的，减少 Agent 读取的 tokens
mini_prd = {**data, 'userStories': pending[:10]}  # 只显示前 10 个
print(json.dumps(mini_prd, indent=2, ensure_ascii=False))
EOF

# 解决方案 B：在 CLAUDE.md 中用脚本动态加载，而不是 @prd.json 全量引用
```

---

## 策略六：Clean State Protocol（干净状态协议）

每次迭代结束前必须确保：

```bash
# 验证干净状态的检查清单:

echo "1. Checking git status..."
git status --short
# 期望: 空输出（所有变更已提交）

echo "2. Checking build..."
npm run build 2>&1 | tail -5
# 期望: 无错误

echo "3. Checking tests..."
npm test -- --passWithNoTests 2>&1 | tail -5
# 期望: 所有测试通过

echo "4. Checking prd.json syntax..."
python3 -c "import json; json.load(open('prd.json')); print('OK')"
# 期望: OK

echo "5. Checking progress.txt was updated..."
tail -10 progress.txt
# 期望: 包含当前 session 的记录
```

**若检查失败**：在提交前修复，不要把破损状态传递给下一个 Agent。

---

## 不同模型的上下文策略

| 模型 | Context | 推荐每迭代目标 | Dumb Zone 估计 |
|------|---------|--------------|----------------|
| Claude 3.5 Sonnet | 200k tokens | 完成 1 Story | >120k tokens |
| Claude 3 Opus | 200k tokens | 完成 1 Story | >120k tokens |
| GPT-4o | 128k tokens | 完成 1 Story | >80k tokens |
| Gemini 1.5 Pro | 1M tokens | 完成 2-3 Stories | >700k tokens |

**注意**：即使 Gemini 有 1M context，Ralph 仍然推荐每迭代 1 Story。原因：小粒度意味着每个迭代的 git commit 更清晰，失败恢复成本更低。
