# 知序 ZHIXU

让知识有据可循，让学习循序向前。

2026 第九届传智杯 AI WEB 网页开发挑战赛，研究生组、省赛作品开发仓库。当前为可运行开发版本，尚未完成真实大模型联调，不能直接视为已满足全部参赛要求。

## 作品与场景

面向拥有课程讲义、阅读资料和笔记的学习者，把“阅读过”转化为“有证据地理解”：

1. 导入资料，保留页码和文本位置。
2. 提出问题，查看资料证据及其完整上下文。
3. 进行资料对应练习，核对答案依据。
4. 根据错题形成复习任务，并记录完成情况。

## 当前能力与真实边界

| 能力 | 当前状态 |
|---|---|
| PDF / Markdown / TXT 导入、粘贴笔记 | 已实现，本机解析，PDF 支持文字层 |
| BM25 词法检索、原文定位、无命中拒答 | 已实现并测试，未配置模型时只显示原文摘录 |
| 基于资料的 Gemini 回答与 Function Calling | 代码与模拟协议测试完成，缺 API，未真实联调 |
| 可选 Gemini Embedding + RRF 混合检索 | 代码已实现，未连接真实服务；最多 80 个片段，否则使用 BM25 |
| 图片转录与结果核对 | 接口与界面已实现，缺 API，未真实联调 |
| 知识脉络 | 规则提取的文档章节结构图，不是语义知识图谱 |
| 诊断练习 | 规则生成的主题与原文对应题，不代表全面的能力诊断 |
| 复习计划 | 错题次日安排，支持修改日期和完成状态，不是训练所得的自适应模型 |
| 数据保存 | 当前浏览器 IndexedDB；可备份与恢复，不跨设备同步 |

没有虚构用户数量、学习提升比例或模型效果。示例讲义为本项目原创。真实测试结果与失败样例见 `docs/检索评测报告.md`。

## 安装和启动

需要 Node.js >=22.13、npm、Git。Windows PowerShell 可直接运行：

```powershell
npm ci --include=dev --include=optional
npm run dev
```

打开 http://127.0.0.1:5173 。默认无需密钥即可体验原文检索、诊断、复习和备份。

仓库包含 PDF.js 运行时 worker，与锁定依赖版本匹配。升级 PDF.js 后执行 `npm run sync:pdf-worker`。

## 配置 Gemini（可选，但参赛前必须完成真实 AI 联调）

复制 `.env.example` 为 `.dev.vars`。从 Google AI Studio API 项目创建密钥，并选择该项目可用的模型。

```dotenv
GEMINI_API_KEY=填入你自己的密钥
GEMINI_MODEL=填入账号可用的模型标识
GEMINI_EMBEDDING_MODEL=
```

可选的 `GEMINI_EMBEDDING_MODEL` 用于真实向量检索，例如 `gemini-embedding-001`，会产生额外请求。默认空值时只有 BM25，不标称语义检索。

保存后重启开发服务。在“偏好设置”确认资料发送选项，再切换 Gemini。图片识别亦需要该确认。模型 ID 和额度以账号实际可用情况为准。

密钥不得写进源码、浏览器变量、截图或公开仓库。`.dev.vars` 已被 Git 忽略。部署时通过 Sites 的环境变量设置保存为 secret，并重新部署。当前线上演示默认是 owner-private，**评委无法直接访问**，参赛前需要另行准备可访问的演示环境。

## 验证

```powershell
npm run typecheck
npm test
npm run evaluate
npm run build
```

浏览器回归脚本 `scripts/browser-check.mjs` 使用 Playwright。若本地安装了 Playwright，可直接运行 `node scripts/browser-check.mjs`；也可通过 `PLAYWRIGHT_MODULE` 指定模块文件、`CHROME_PATH` 指定 Chrome 路径、`PREVIEW_URL` 指定本地服务。脚本在独立浏览器上下文创建测试资料，不会修改日常浏览器数据。

核心测试覆盖出处偏移、分块边界、检索、拒答、引用编号、RRF、练习、复习任务、备份格式和 Gemini 模拟工具协议。模拟测试不证明真实模型效果。

## 技术架构

- React 19 + TypeScript，Vinext 提供 Next.js App Router 兼容运行方式。
- Cloudflare Worker 提供 API 接入，保留 Sites 构建集成。
- 浏览器 PDF.js 提取文本，IndexedDB 保存资料和记录。
- 结构化分块 + BM25；可选 Gemini Embedding 和 RRF。
- Gemini 工具白名单：`search_materials`、`read_source`；最多 4 轮，SSE 回传实际执行阶段和最终结果。
- SSE 当前传输执行事件和完整回答，不标称逐 token 文本流。

## 目录

```text
app/components/       界面、状态与交互
app/api/              问答、模型状态、图片识别
lib/retrieval.ts      可回溯分块、BM25、RRF
lib/learning.ts       练习与复习规则
lib/server/gemini.ts  模型调用与工具执行
tests/                核心逻辑与模拟协议测试
eval/                 可复现的小样本开发评测
docs/                 技术说明、演示脚本与参赛清单
output/pdf/           技术文档开发稿
```

## 团队信息（提交前填写）

- 队伍名称：待填写
- 学校：待填写
- 队员与分工：待填写（同校 1-3 人）
- 指导教师：待填写（最多 2 人）
- AI 辅助说明：项目使用 AI 编程助手辅助设计、编码、测试与文档，参赛选手须实际理解、核验并能够解释代码。

## 参赛前仍需完成

真实模型与图片联调；独立课程资料评测；用户访谈和试用；真实模型演示录屏；填写署名；GitHub/Gitee 可访问仓库；正式 PDF 与视频审查；按官网流程提交。完整清单见 `docs/参赛准备清单.md`。

官方规则：https://www.boxuegu.com/matchTrack/detail/?id=10037

Gemini 参考：https://ai.google.dev/api/generate-content 、https://ai.google.dev/gemini-api/docs/function-calling 、https://ai.google.dev/gemini-api/docs/embeddings 。
