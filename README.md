# AI PR 变更总结工具（MVP）

自动在 PR 创建时，分析代码变更并生成面向产品的说明，评论到 PR 中。

---

## 目录

- [项目目标](#项目目标)
- [核心流程](#核心流程)
- [技术方案](#技术方案)
- [项目结构](#项目结构)
- [实现步骤](#实现步骤)
- [环境变量配置](#环境变量配置)
- [运行效果](#运行效果)
- [注意事项](#注意事项)
- [后续扩展方向](#后续扩展方向)
- [MVP 验收标准](#mvp-验收标准)

---

## 项目目标

开发提交 Pull Request 时，自动完成以下动作：

- 识别 commit 是否以 `feat` 开头
- 分析本次代码变更（`git diff`）
- 生成一份面向产品的变更说明
- 自动评论到 PR 中

---

## 核心流程

```
Pull Request 创建 / 更新
        ↓
GitHub Actions 触发
        ↓
获取 git diff
        ↓
调用 AI 生成总结
        ↓
评论到 PR
```

---

## 技术方案

| 模块 | 选型 |
|------|------|
| CI 工具 | GitHub Actions |
| 运行环境 | Node.js |
| AI 接口 | OpenAI API（gpt-4o-mini） |
| 数据来源 | `git diff` |
| 输出方式 | PR Comment |

---

## 项目结构

```
.github/
  workflows/
    ai-summary.yml   # CI 配置
summarize.js         # AI 总结脚本
```

---

## 实现步骤

### 1. 创建 GitHub Action

路径：`.github/workflows/ai-summary.yml`

```yaml
name: AI PR Summary

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  summarize:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Get latest commit message
        id: check
        run: |
          msg=$(git log -1 --pretty=%s)
          echo "msg=$msg" >> $GITHUB_OUTPUT

      - name: Skip if not feat
        if: "!startsWith(steps.check.outputs.msg, 'feat')"
        run: |
          echo "Not a feat commit, skipping..."
          exit 0

      - name: Get diff
        run: |
          git fetch origin main
          git diff origin/main...HEAD > diff.txt

      - name: Run AI Summary
        run: node summarize.js
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Comment PR
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const body = fs.readFileSync('summary.txt', 'utf-8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body
            });
```

### 2. 创建 AI 总结脚本

路径：`summarize.js`

```js
import fs from 'fs';
import fetch from 'node-fetch';

const diff = fs.readFileSync('diff.txt', 'utf-8');
const truncatedDiff = diff.slice(0, 8000); // 限制长度，避免 token 超限

const prompt = `
你是一个产品经理助手，请根据代码变更生成总结：

要求：
1. 用非技术语言描述
2. 说明新增/修改了什么功能
3. 用户可以感知到什么变化
4. 是否涉及接口或逻辑变化
5. 给出潜在风险提示
6. 如果不确定，请明确说明"不确定"

代码变更如下：
${truncatedDiff}
`;

async function main() {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  });

  const data = await res.json();
  const summary = data.choices?.[0]?.message?.content || '生成失败';

  fs.writeFileSync('summary.txt', `🤖 AI 变更总结：\n\n${summary}`);
}

main();
```

---

## 环境变量配置

在 GitHub 仓库中添加 Secret：

```
Settings → Secrets and variables → Actions → New repository secret

OPENAI_API_KEY = 你的 API Key
```

---

## 运行效果

当 PR 的最新 commit message 以 `feat` 开头时，PR 下会自动生成评论：

```
🤖 AI 变更总结：

本次新增了订单筛选功能：
- 用户可以根据时间范围筛选订单
- 优化了订单列表展示逻辑
- 未影响现有下单流程

⚠️ 风险提示：
- 涉及订单模块，建议重点测试
```

---

## 注意事项

**1. 控制 diff 大小**
- 当前策略：截断前 8000 字符，避免 token 超限
- 后续可优化为按文件筛选

**2. AI 输出不保证准确**
- 允许"不确定"的输出，仅作为辅助信息，不作强校验

**3. 只处理 feat 类型**
- 避免无意义的 AI 调用，控制成本

---

## 后续扩展方向

1. **风险等级判断** — 识别高风险模块（如支付、订单）
2. **自动关联需求** — 解析 commit 中的 issue id，对比需求与实现
3. **飞书审批流** — 推送总结到飞书，产品点击"通过 / 驳回"
4. **阻止合并** — 未通过产品确认则不允许 merge

---

## MVP 验收标准

- [ ] PR 创建时自动触发
- [ ] 仅 `feat` commit 生效
- [ ] 成功获取 diff
- [ ] AI 生成总结
- [ ] 自动评论到 PR
