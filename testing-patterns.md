# Testing Patterns — E2E 验证模式

## 核心原则：外部验证，不信任自评估

```
❌ 错误: 让 Agent 阅读自己写的代码并判断"应该能用"
✅ 正确: 启动真实浏览器，执行真实操作，验证真实结果
```

LLM 极容易在查看自己写的代码时产生确认偏误。唯一可靠的验证是**外部运行时验证**。

---

## 模式一：Dev-Browser Skill（浏览器自动化）

这是最重要的验证手段，适用于所有前端 UI Story。

### 在 CLAUDE.md 中声明 Skill

```markdown
## Dev-Browser Skill

对于所有前端 UI 相关的 Story，你必须使用 dev-browser skill 验证：

1. 用 dev-browser 工具打开 http://localhost:3000
2. 模拟用户操作（点击、输入、提交）
3. 截图并检查 DOM 元素
4. 确认 acceptanceCriteria 中的每一条
5. 只有全部验证通过才能将 passes 改为 true
```

### 使用 Puppeteer MCP 验证（Claude Code 方式）

Claude Code 可以通过 Puppeteer MCP Server 操控浏览器：

```bash
# 在 Claude Code 配置中添加 Puppeteer MCP:
# ~/.claude/config.json 或 .claude/config.json

{
  "mcpServers": {
    "puppeteer": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-puppeteer"]
    }
  }
}
```

**在 CLAUDE.md Prompt 中引导 Agent 使用**：

```markdown
## 前端验证流程

当实现 UI Story 时:

1. 用 Puppeteer MCP 打开浏览器:
   puppeteer_navigate(url="http://localhost:3000/register")

2. 截图检查初始状态:
   puppeteer_screenshot(name="register-initial")

3. 模拟用户操作:
   puppeteer_fill(selector="#email", value="test@example.com")
   puppeteer_fill(selector="#password", value="TestPass123!")
   puppeteer_click(selector="button[type='submit']")

4. 等待并截图结果:
   puppeteer_screenshot(name="register-after-submit")

5. 验证最终状态:
   puppeteer_evaluate(script="window.location.pathname")
   // 期望: "/dashboard"

6. 只有全部通过才标记 passes: true
```

### 使用 Playwright 脚本验证（独立脚本方式）

```python
# scripts/verify-story.py
# 用法: python3 scripts/verify-story.py auth-001

import sys
import asyncio
from playwright.async_api import async_playwright

STORY_TESTS = {
    "auth-001": {
        "description": "用户邮箱注册",
        "test": lambda page: test_auth_001(page),
    },
    "auth-002": {
        "description": "用户登录",
        "test": lambda page: test_auth_002(page),
    },
}

async def test_auth_001(page):
    """验证: 用户可以通过邮箱注册"""
    await page.goto("http://localhost:3000/register")
    
    # 填写表单
    await page.fill("#email", "test@example.com")
    await page.fill("#password", "TestPass123!")
    await page.click("button[type='submit']")
    
    # 等待跳转
    await page.wait_for_url("**/dashboard", timeout=5000)
    
    # 验证欢迎信息
    welcome = await page.locator(".welcome-message").text_content()
    assert "Welcome" in welcome or "欢迎" in welcome, f"Missing welcome message, got: {welcome}"
    
    print("✅ auth-001: 注册流程验证通过")
    return True

async def test_auth_002(page):
    """验证: 用户可以登录"""
    await page.goto("http://localhost:3000/login")
    await page.fill("#email", "test@example.com")
    await page.fill("#password", "TestPass123!")
    await page.click("button[type='submit']")
    await page.wait_for_url("**/dashboard", timeout=5000)
    print("✅ auth-002: 登录流程验证通过")
    return True

async def main():
    story_id = sys.argv[1] if len(sys.argv) > 1 else None
    if not story_id or story_id not in STORY_TESTS:
        print(f"Usage: python3 verify-story.py <story-id>")
        print(f"Available: {list(STORY_TESTS.keys())}")
        sys.exit(1)
    
    story = STORY_TESTS[story_id]
    print(f"Verifying: {story_id} — {story['description']}")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            result = await story["test"](page)
            print(f"RESULT: {'PASS' if result else 'FAIL'}")
            sys.exit(0 if result else 1)
        except Exception as e:
            print(f"RESULT: FAIL — {e}")
            # 保存截图帮助调试
            await page.screenshot(path=f"debug-{story_id}.png")
            sys.exit(1)
        finally:
            await browser.close()

asyncio.run(main())
```

**在 CLAUDE.md 中引用**：

```markdown
## 验证命令

完成前端功能后，运行:
python3 scripts/verify-story.py [story-id]

PASS → 更新 prd.json, passes: true → git commit
FAIL → 查看 debug-*.png → 调试 → 重新验证
```

---

## 模式二：API 测试（curl 脚本）

对于 API Story，用 curl 链验证：

```bash
#!/usr/bin/env bash
# scripts/verify-api.sh
# 用法: bash scripts/verify-api.sh auth-001

STORY_ID="${1:-}"
BASE_URL="${BASE_URL:-http://localhost:8000}"

case "$STORY_ID" in
  auth-001)
    echo "Testing: auth-001 — 用户注册"
    
    # 清理测试数据
    # (根据数据库清理)
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
      -H "Content-Type: application/json" \
      -d '{"email":"test@example.com","password":"TestPass123!"}')
    
    echo "Response: $RESPONSE"
    
    # 验证响应包含 token
    if echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'token' in d or 'access_token' in d, f'No token: {d}'"; then
      echo "✅ auth-001: PASS"
    else
      echo "❌ auth-001: FAIL"
      exit 1
    fi
    ;;
    
  api-001)
    echo "Testing: api-001 — 获取用户列表"
    
    # 先登录获取 token
    TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
      -H "Content-Type: application/json" \
      -d '{"email":"test@example.com","password":"TestPass123!"}' \
      | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))")
    
    RESPONSE=$(curl -s "$BASE_URL/api/users" \
      -H "Authorization: Bearer $TOKEN")
    
    if echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); assert isinstance(d, list), 'Expected list'"; then
      echo "✅ api-001: PASS"
    else
      echo "❌ api-001: FAIL"
      exit 1
    fi
    ;;
    
  *)
    echo "Unknown story: $STORY_ID"
    exit 1
    ;;
esac
```

---

## 模式三：自动测试套件集成

在 AGENTS.md 中记录测试命令，Agent 每次迭代后运行：

```bash
# 全量测试（迭代结束前）
npm test -- --passWithNoTests         # Jest
python3 -m pytest -v --tb=short       # pytest
go test ./... -v                       # Go
cargo test                             # Rust

# 单文件测试（开发过程中）
npm test -- auth.test.ts --watch=false
python3 -m pytest tests/test_auth.py -v
```

**关键约束**（写入 CLAUDE.md）：

```markdown
## 测试规则

- 完成每个 Story 后，运行与该 Story 相关的测试文件
- 如果测试运行结果破坏了已有的测试，必须在提交前修复
- UNACCEPTABLE: 修改或删除已通过的测试用例
- 如果无法在 2 次尝试内修复，git revert 并记录
```

---

## 模式四：Screenshot-Based Regression（截图回归）

对于 UI 变更，保存截图作为回归基准：

```bash
# 在 AGENTS.md 中记录截图约定:
## Screenshot Convention
- 路径: screenshots/[story-id]-[step].png
- 命名: auth-001-register-form.png, auth-001-dashboard.png
- 用途: 调试 + 未来回归对比
- 清理: 每次 PR 合并后清理 screenshots/ 目录
```

```javascript
// scripts/screenshot-verify.js
// Ralph Agent 可以调用此脚本生成验证截图

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function verifyAndScreenshot(storyId, steps) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  
  const screenshotDir = path.join(process.cwd(), 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });
  
  let allPassed = true;
  
  for (const step of steps) {
    try {
      await step.execute(page);
      const screenshotPath = path.join(screenshotDir, `${storyId}-${step.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`✅ ${step.name}: PASS → ${screenshotPath}`);
    } catch (err) {
      console.error(`❌ ${step.name}: FAIL — ${err.message}`);
      allPassed = false;
    }
  }
  
  await browser.close();
  return allPassed;
}

module.exports = { verifyAndScreenshot };
```

---

## 验证失败处理树

```
验证失败
    │
    ├─ 是功能实现问题?
    │      │
    │      ├─ Attempt 2 修复 → 重新验证
    │      │
    │      └─ 2次都失败 → git revert + 记录 BLOCKED + 下一个 Story
    │
    ├─ 是环境问题? (数据库连接失败、端口占用等)
    │      │
    │      └─ 修复环境 → bash init.sh → 重新验证
    │
    └─ 是测试脚本问题? (测试本身有 bug)
           │
           └─ 修复测试脚本 → 记录到 AGENTS.md → 重新验证
```

---

## 验证命令速查表

将以下内容加入 CLAUDE.md 的工具箱部分：

```markdown
## 验证工具箱

### 前端 Story
puppeteer_navigate + puppeteer_fill + puppeteer_click + puppeteer_screenshot

### API Story  
curl -X POST/GET/PUT/DELETE ... | python3 -c "import json,sys; ..."

### 数据库验证
python3 -c "from app.db import session; print(session.query(User).count())"

### 完整测试套件
npm test -- --passWithNoTests 2>&1 | tail -20

### 服务器健康检查
curl -s http://localhost:3000 -o /dev/null -w "%{http_code}"
# 期望: 200
```
