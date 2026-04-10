import fs from 'fs';
import fetch from 'node-fetch';

const diff = fs.readFileSync('diff.txt', 'utf-8');
const truncatedDiff = diff.slice(0, 8000);

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
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  });

  const data = await res.json();
  const summary = data.choices?.[0]?.message?.content || '生成失败';

  fs.writeFileSync('summary.txt', `🤖 AI 变更总结：\n\n${summary}`);
}

main();
