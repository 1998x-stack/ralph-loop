# PRD Generator — Ralph Loop 前置技能

## 触发方式

在开始 Ralph Loop 之前，必须先生成结构化的 PRD（产品需求文档）。

```
Load the prd skill and create a PRD for [your feature description].
Answer the clarifying questions.
```

---

## 核心原则

> **每个 User Story 必须足够小，能在单个上下文窗口内完成。**
> 任务太大 → LLM 在完成前耗尽上下文 → 产出质量下降

Story 粒度标准：
- ✅ "用户可以通过邮箱注册账户" （30-60 分钟实现）
- ✅ "用户可以上传头像图片" （30-60 分钟实现）
- ❌ "实现完整的用户认证系统" （太大！）
- ❌ "构建聊天功能" （太大！）

---

## PRD 生成提示词（复制此 Prompt 发送给 Claude）

```markdown
你是一个产品经理和需求分析专家。我要使用 Ralph Loop 自主开发以下项目：

**项目描述：**
[在这里描述你的项目]

你的任务：
1. 向我提问，充分理解需求（5-10个问题）
2. 根据我的回答，生成完整的 prd.json 文件

**prd.json 格式要求：**

```json
{
  "project": "项目名称",
  "version": "1.0.0",
  "created": "YYYY-MM-DD",
  "tech_stack": ["Next.js", "Prisma", "PostgreSQL"],
  "userStories": [
    {
      "id": "auth-001",
      "category": "Authentication",
      "title": "用户注册",
      "description": "用户可以通过邮箱和密码注册新账户",
      "acceptanceCriteria": [
        "导航到 /register 页面",
        "填写有效的邮箱和密码（8位以上）",
        "点击注册按钮",
        "验证成功跳转到 /dashboard",
        "Verify in browser using dev-browser skill"
      ],
      "passes": false,
      "priority": 1,
      "estimatedMinutes": 45,
      "dependencies": []
    }
  ]
}
```

**故事分类示例（根据项目调整）：**
- Authentication（认证）
- User Profile（用户资料）
- Core Feature（核心功能）
- API Integration（API集成）
- UI/UX（界面交互）
- Data Management（数据管理）
- Performance（性能优化）
- Admin（管理后台）

**数量要求：**
- 简单项目（1-2周）：20-50 个 Story
- 中型项目（1个月）：50-100 个 Story  
- 复杂项目（3个月+）：100-200 个 Story

**优先级规则：**
- Priority 1：核心功能，项目无法运行的
- Priority 2：主要功能，用户主要使用的
- Priority 3：增强功能，让体验更好的
- Priority 4：边缘功能，可以最后做的

**注意：**
- 每个前端/UI 相关的 Story，acceptanceCriteria 必须包含 "Verify in browser using dev-browser skill"
- Story 描述以用户视角写："用户可以..." 而非 "实现..."
- 每个 Story 可独立测试，不依赖未完成的 Story（或在 dependencies 中标明）

请先问我问题，然后生成完整的 prd.json。
```

---

## 生成后的验证清单

运行以下命令验证 prd.json 的质量：

```bash
# 检查基本格式
python3 -c "
import json
with open('prd.json') as f:
    data = json.load(f)
stories = data.get('userStories', [])
print(f'Total stories: {len(stories)}')

# 检查每个 story 的必填字段
required = ['id', 'description', 'acceptanceCriteria', 'passes', 'priority']
issues = []
for s in stories:
    missing = [r for r in required if r not in s]
    if missing:
        issues.append(f'{s[\"id\"]}: missing {missing}')

# 检查是否有重复 ID
ids = [s['id'] for s in stories]
dups = [id for id in ids if ids.count(id) > 1]
if dups:
    issues.append(f'Duplicate IDs: {list(set(dups))}')

# 检查前端 story 是否有 browser 验证
ui_stories = [s for s in stories if 'ui' in s.get('category','').lower() 
              or any('browser' in str(c).lower() or 'navigate' in str(c).lower() 
                    for c in s.get('acceptanceCriteria', []))]
missing_browser = [s['id'] for s in ui_stories 
                  if not any('dev-browser' in str(c).lower() 
                            for c in s.get('acceptanceCriteria', []))]
if missing_browser:
    issues.append(f'UI stories missing browser verify: {missing_browser}')

if issues:
    print('⚠ Issues found:')
    for issue in issues:
        print(f'  - {issue}')
else:
    print('✅ prd.json validation passed')
"

# 查看优先级分布
python3 -c "
import json
from collections import Counter
with open('prd.json') as f:
    data = json.load(f)
stories = data.get('userStories', [])
priority_dist = Counter(s.get('priority', 0) for s in stories)
cat_dist = Counter(s.get('category', 'unknown') for s in stories)
print('Priority distribution:', dict(sorted(priority_dist.items())))
print('Category distribution:', dict(sorted(cat_dist.items())))
"
```

---

## 专项场景 PRD 模板

### 场景 A：SaaS 应用

```bash
# 典型分类结构
Categories:
  - Landing Page       (5-10 stories)
  - Authentication     (8-12 stories)
  - Dashboard         (10-15 stories)
  - Core Feature      (20-40 stories)
  - Settings          (8-12 stories)
  - Billing           (10-15 stories)
  - Admin             (10-20 stories)
  - Email             (5-10 stories)
```

### 场景 B：CLI 工具

```bash
Categories:
  - Core Commands     (10-20 stories)
  - Config Management (5-10 stories)
  - Output Formatting (5-8 stories)
  - Error Handling    (8-12 stories)
  - Plugin System     (10-15 stories)
  - Documentation     (3-5 stories)
```

### 场景 C：API 服务

```bash
Categories:
  - Core Endpoints    (15-25 stories)
  - Authentication    (8-12 stories)
  - Data Validation   (8-12 stories)
  - Error Responses   (5-10 stories)
  - Rate Limiting     (3-5 stories)
  - Documentation     (3-5 stories)
  - Testing           (5-10 stories)
```
