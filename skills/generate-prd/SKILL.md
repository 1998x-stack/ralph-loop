---
name: ralph-loop:generate-prd
description: >
  Generate a structured prd.json for the Ralph Loop autonomous agent system.
  Asks 5-10 clarifying questions about the project, then produces 50-200
  fine-grained user stories — each small enough for one context window.
trigger_phrases:
  - "generate prd"
  - "create prd"
  - "make prd.json"
  - "plan features"
  - "define user stories"
---

# Generate PRD

## What This Does

Generates a `prd.json` file — the single source of truth for Ralph Loop. Contains 50-200 user stories, each with acceptance criteria, priorities, dependencies, and estimated effort.

## Story Granularity Rules

Each story MUST be completable in one context window (~120k tokens):

- ✅ "User can register with email and password" (30-60 min)
- ✅ "User can upload a profile avatar" (30-60 min)
- ❌ "Implement full authentication system" (too large)
- ❌ "Build the chat feature" (too large)

## Process

1. Ask 5-10 clarifying questions about the project (tech stack, features, scope, constraints)
2. Based on answers, generate prd.json with the correct story count:
   - Simple project (1-2 weeks): 20-50 stories
   - Medium project (1 month): 50-100 stories
   - Complex project (3+ months): 100-200 stories
3. Validate prd.json for:
   - No duplicate IDs
   - All required fields present
   - Frontend stories include "Verify in browser using dev-browser skill"
   - No dependency cycles
   - No stories with `estimatedMinutes > 120` (suggest splitting)
4. Write `prd.json` to the target project root

## prd.json Format

```json
{
  "project": "Project Name",
  "version": "1.0.0",
  "created": "YYYY-MM-DD",
  "description": "Brief project description",
  "tech_stack": ["Next.js 14", "Prisma", "PostgreSQL", "Tailwind CSS"],
  "baseUrl": "http://localhost:3000",
  "userStories": [
    {
      "id": "auth-001",
      "category": "Authentication",
      "title": "User Registration",
      "description": "User can register with email and password",
      "acceptanceCriteria": [
        "Navigate to /register page",
        "Fill in valid email and password (8+ chars)",
        "Click register button",
        "Verify redirect to /dashboard",
        "Verify in browser using dev-browser skill"
      ],
      "passes": false,
      "status": "pending",
      "priority": 1,
      "estimatedMinutes": 45,
      "dependencies": [],
      "verificationMethod": "browser"
    }
  ]
}
```

## Priority Rules

- **Priority 1**: Core infrastructure — project won't run without these
- **Priority 2**: Primary features — what users mainly interact with
- **Priority 3**: Enhancements — polish and quality-of-life
- **Priority 4**: Edge cases — nice-to-have, can ship without

## Categories (adapt to project)

- Authentication, User Profile, Core Feature, API Integration, UI/UX, Data Management, Performance, Admin, Email, Billing, Settings, Landing Page
