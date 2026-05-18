# Initializer Agent — 一次性项目初始化指南

## 职责边界

Initializer Agent **仅运行一次**，在第一个 context window 内。

```
✅ 它的职责:
  - 建立 init.sh 环境启动脚本
  - 生成 prd.json 完整任务清单
  - 创建 progress.txt 日记模板
  - 创建 AGENTS.md 初始手册
  - 制造初始 git commit

❌ 它不应该:
  - 实现任何功能！
  - 写业务代码
  - 运行应用
  - 安装不必要的依赖
```

---

## Initializer 提示词（完整版）

将以下内容作为 Initializer 的 prompt：

```markdown
你是一个软件项目的初始化专家。你的任务是为 Ralph Loop 自主开发系统建立项目脚手架。

**重要：不要实现任何功能。你只负责设置，不负责开发。**

## 项目信息

{{项目描述}}

技术栈：{{技术栈，如 Next.js + Prisma + PostgreSQL}}

## 你需要创建的文件

### 1. init.sh — 环境启动脚本

要求：
- 幂等性（多次运行结果相同）
- 安装依赖（npm install 或 pip install）
- 启动开发服务器（后台进程）
- 等待服务器就绪（健康检查）
- 成功时打印 "=== READY ==="
- 失败时 exit 1

### 2. prd.json — 任务清单

要求：
- 50-200 个 User Story（根据项目复杂度）
- 每个 Story 格式：
  {
    "id": "category-NNN",
    "category": "分类名",
    "title": "简短标题",
    "description": "用户可以...",
    "acceptanceCriteria": [...],
    "passes": false,
    "priority": 1,
    "estimatedMinutes": 45,
    "dependencies": []
  }
- 前端相关 Story 必须在 acceptanceCriteria 中包含：
  "Verify in browser using dev-browser skill"
- priority: 1 = 最高优先级

### 3. progress.txt

创建初始模板（见格式规范）

### 4. AGENTS.md

记录：
- 项目约定（命名规范、文件结构）
- 禁止操作（不要修改什么）
- 运行命令（如何启动、测试、构建）
- 已知坑点（如果有的话）

### 5. 初始 git commit

```bash
git init  # 如果还没初始化
git add -A
git commit -m "Initial project setup by Ralph initializer

- Created prd.json with [N] user stories
- Created init.sh for environment bootstrap  
- Created progress.txt and AGENTS.md
- Tech stack: [stack]
- Ready for Ralph coding agent sessions"
```

## 完成后验证

运行以下命令确认设置正确：
1. bash init.sh 并确认打印 "READY"
2. python3 -c "import json; d=json.load(open('prd.json')); print(f'{len(d[\"userStories\"])} stories created')"
3. git log --oneline -1

完成后输出：
```
=== INITIALIZER COMPLETE ===
Stories created: [N]
init.sh: TESTED OK
Git commit: DONE
Ralph is ready to run.
```
```

---

## init.sh 模板（按技术栈）

### Node.js / Next.js

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Ralph init.sh starting ==="

# 安装依赖
echo "Installing dependencies..."
npm install --silent

# 环境变量检查
if [[ ! -f ".env.local" ]]; then
  echo "Creating .env.local from template..."
  cp .env.example .env.local 2>/dev/null || {
    cat > .env.local << 'EOF'
DATABASE_URL="postgresql://localhost:5432/myapp_dev"
NEXTAUTH_SECRET="ralph-dev-secret-$(date +%s)"
NEXTAUTH_URL="http://localhost:3000"
EOF
  }
fi

# 数据库初始化（如果使用 Prisma）
if [[ -f "prisma/schema.prisma" ]]; then
  echo "Running Prisma migrations..."
  npx prisma migrate dev --name init 2>/dev/null || \
  npx prisma db push --accept-data-loss 2>/dev/null || \
  echo "Database already up to date"
fi

# 启动开发服务器
echo "Starting dev server..."
pkill -f "next dev" 2>/dev/null || true  # 停止旧进程
npm run dev &
DEV_PID=$!

# 等待就绪
echo "Waiting for server..."
MAX_WAIT=60
for i in $(seq 1 $MAX_WAIT); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200\|304"; then
    echo "=== READY (server on http://localhost:3000, PID: $DEV_PID) ==="
    exit 0
  fi
  sleep 1
done

echo "ERROR: Server failed to start within ${MAX_WAIT}s"
exit 1
```

### Python / FastAPI

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Ralph init.sh starting ==="

# 创建虚拟环境（如果不存在）
if [[ ! -d "venv" ]]; then
  python3 -m venv venv
fi
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt -q

# 数据库初始化
python3 -c "from app.db import init_db; init_db()" 2>/dev/null || true

# 启动服务
pkill -f "uvicorn" 2>/dev/null || true
uvicorn app.main:app --reload --port 8000 &
API_PID=$!

# 等待就绪
MAX_WAIT=30
for i in $(seq 1 $MAX_WAIT); do
  if curl -s http://localhost:8000/health 2>/dev/null | grep -q "ok"; then
    echo "=== READY (API on http://localhost:8000, PID: $API_PID) ==="
    exit 0
  fi
  sleep 1
done

echo "ERROR: API failed to start within ${MAX_WAIT}s"
exit 1
```

---

## AGENTS.md 初始模板

```markdown
# AGENTS.md — Project Convention Manual

> This file is maintained by Ralph agents. Update when you discover new patterns.
> Read this at the START of every session.

## Project Overview

**Project**: [项目名]
**Tech Stack**: [技术栈]
**Port**: [端口]

## Running the Project

```bash
bash init.sh          # 启动环境
npm run dev           # 开发服务器
npm test              # 运行测试
npm run build         # 构建
npx prisma studio     # 数据库 GUI（如使用 Prisma）
```

## File Structure

```
src/
  app/          ← Next.js App Router 页面
  components/   ← React 组件
  lib/          ← 工具函数
  types/        ← TypeScript 类型定义
prisma/
  schema.prisma ← 数据库模型
```

## Naming Conventions

- 组件：PascalCase (`UserProfile.tsx`)
- 工具函数：camelCase (`formatDate.ts`)
- API 路由：kebab-case (`/api/user-profile`)
- 数据库模型：PascalCase singular (`User`, `Post`)

## NEVER DO

- ❌ 不要删除或修改已通过的测试
- ❌ 不要修改 prd.json 中已经 passes:true 的 Story
- ❌ 不要在未测试的情况下提交代码
- ❌ 不要修改 init.sh（除非环境发生变化）

## Known Gotchas

<!-- 在这里记录发现的坑点，Ralph 会自动更新这部分 -->
- (空，运行时由 Agent 填充)

## Learnings from Previous Sessions

<!-- 这部分由 Agent 自动维护 -->
- (空，运行时由 Agent 填充)
```

---

## progress.txt 初始模板

```
# Project: [项目名]
# Created: [日期]
# Status: IN PROGRESS

## Ralph Run Log

### Session 1 (Initializer) — [日期时间]
Role: Initializer Agent
Action: Project scaffold setup
Details:
  - Created prd.json with [N] user stories
  - Created init.sh (tested: OK)
  - Created AGENTS.md
  - Initialized git repository
  - Tech stack: [技术栈]
  - Server port: [端口]
Features completed: 0 / [N]
Next session should:
  - Start with: [最高优先级 Story ID，如 auth-001]
  - Run init.sh first, verify READY before working

---
```
