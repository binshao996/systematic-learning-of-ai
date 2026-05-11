# AI 全栈系统性学习计划 — 设计文档

## 背景

- **当前水平**：前端开发 13 年，Prompt Engineering 熟练，LLM APIs/RAG/Agents/AI Engineering/Frontend+AI 了解，AI DevOps 不了解
- **目标**：AI 应用开发 + AI 工程化 + AI 全栈创业者（全部）
- **学习风格**：项目驱动为主，辅以结构化学习
- **时间投入**：每周 6-8 小时（碎片化时间）
- **AI API**：统一使用 DeepSeek API
- **预计周期**：~24 周（约 6 个月）

## 技能树总览

| 技能域 | 子技能 | 项目1 类Notion | 项目2 类Coze | 项目3 类Cursor |
|--------|--------|:--:|:--:|:--:|
| 1. LLM APIs & SDKs | DeepSeek SDK, streaming, tool use, structured output, token管理, 错误重试, rate limiting | 深入 | 深入 | 深入 |
| 2. Prompt Engineering | System prompt设计, 多级指令, 动态prompt模板, prompt versioning, A/B测试, 安全护栏 | 强化 | 深入 | 深入 |
| 3. RAG & Vector Search | Embedding, 向量DB(Qdrant), 文档解析, chunking策略, 混合检索, reranking, 引用溯源 | 深入 | 入门 | 强化 |
| 4. AI Agents | Tool-calling agent, ReAct模式, 多agent编排, agent通信, HITL, 上下文窗口管理 | 接触 | 深入 | 深入 |
| 5. AI Engineering | Evals, guardrails, 可观测性, cost tracking, prompt管理, 反馈闭环 | 入门 | 强化 | 深入 |
| 6. Frontend + AI | Streaming UX, AI聊天UI, agent协作可视化, 主题, 无障碍, 性能优化 | 强化 | 强化 | 深入 |
| 7. AI DevOps | Docker, CI/CD, 模型部署, GPU资源管理, 自托管vs API, 监控告警 | 入门 | 入门 | 深入 |

## 项目1：类 Notion AI 知识平台（7周）

### 核心目标
深度掌握 RAG 全链路、DeepSeek API 全家桶、AI Engineering 基础意识。

### 系统架构
- **前端**: Next.js 14 (App Router) + TipTap block editor + TailwindCSS + shadcn/ui
- **后端**: Bun + Hono + PostgreSQL (Drizzle ORM)
- **AI**: DeepSeek Chat API + DeepSeek Embedding API + DeepSeek Structured Output
- **向量存储**: Qdrant
- **文件存储**: MinIO

### MVP 功能（3-4周）
1. 富文本编辑器（类 Notion block-based, TipTap, Markdown 快捷输入, 实时保存）
2. 文档管理（树形目录, 嵌套页面, 拖拽排序, 面包屑导航）
3. 混合检索（全文检索 + 向量语义搜索, Qdrant 多向量集合, 高亮匹配）
4. AI 对话 per doc（基于单文档或知识库的 Q&A, 流式输出, 引用回溯原文）
5. 文档上传&解析（PDF/Word/Markdown, 自动解析→分块→embedding 入库）

### 进阶功能（2-3周）
1. 智能 Chunking（语义分块 + 滑动窗口 + 元数据保留）
2. 引用追踪闭环（答案→引用块→原文反查, 👍👎反馈→embedding调优）
3. Eval & 可观测性（RAGAS 评估, tracing, token 消耗 tracking）
4. AI 辅助写作（内联 AI 续写/改写/翻译/摘要, 选中文本即调 AI）

### 结构化学习模块（前 2 周）
- RAG 深度指南：Embedding原理, 向量检索, chunking策略, 混合检索, reranking
- DeepSeek API 精通：Chat/Embedding/Structured Output APIs, streaming, token管理, 错误处理
- Qdrant 实战：Collection设计, payload索引, 稀疏+稠密向量, 过滤查询
- 文档解析流水线：PDF解析(unpdf/pdf.js), Word(mammoth), Markdown

### 企业级难点
- 多格式文档解析精度（PDF 表格/图片/代码块的准确提取和 chunking）
- 混合检索调优（BM25 + Dense 检索权重, reranking 策略, 中英文混合搜索）
- 长文档处理（超长文档的分块策略, 摘要链, 层级关系保留）
- 引用溯源（AI 回答精确追溯到原文段落）
- Feedback Loop（用户反馈驱动的检索质量改进）

### 成功标准
- 给任何人讲明白 RAG 的完整原理和工程实现
- 独立设计文档解析→chunking→embedding→检索→生成的 pipeline
- DeepSeek API 全家桶熟练使用
- 搭建 RAGAS 评估体系并定位检索质量瓶颈

## 项目2：类 Coze 多智能体平台（7周）

### 核心目标
深度掌握 LangChain + LangGraph、Agent 编排、Tool Calling、平台工程。

### 系统架构
- **前端**: Next.js 14 + ReactFlow (DAG画布) + Zustand + TailwindCSS + shadcn/ui
- **后端**: Bun + Hono + PostgreSQL (Drizzle ORM) + Redis (BullMQ)
- **AI**: LangChain.js + LangGraph.js + DeepSeek Tool Use API
- **工具协议**: MCP Protocol + 自定义 REST API 工具

### MVP 功能（4周）
1. 可视化工作流编辑器（ReactFlow DAG 画布, 拖拽节点, 生成 LangGraph StateGraph JSON）
2. Agent 节点配置（LangChain Agent Executor, Prompt 模板 + 工具绑定 + DeepSeek 模型）
3. 工具/插件系统（LangChain Tool 抽象 → 内置工具 + 自定义 REST API 工具注册 + MCP 协议）
4. 工作流执行（LangGraph StateGraph 编译执行, conditional edge, 并行节点, checkpoint）
5. 对话测试&调试（内置聊天面板, LangChain Callbacks 实时输出每步 trace）
6. 运行历史（LangGraph Checkpoint → PostgreSQL 持久化, 完整回放）

### 进阶功能（3周）
1. 人机协作 HITL（LangGraph interrupt → 工作流暂停 → 人工审批 → 继续, Redis 通知）
2. 记忆系统（LangChain Memory + 长期记忆写回知识库）
3. 触发器&发布（Webhook/定时触发 → Redis Queue → LangGraph 执行, 发布为 API）
4. Guardrails（输入/输出校验层, 敏感词过滤, 工具调用权限, token 预算硬限制）
5. 使用仪表盘（工作流调用量/成功率/耗时/token 开销, 按用户/Agent 维度）

### 结构化学习模块（前 2 周）
- LangChain 核心概念：Chain/Agent/Tool/Memory/Callbacks 五大抽象, 源码级理解
- LangGraph 实战：StateGraph, Node, Edge, Conditional Edge, Checkpointer, interrupt
- Agent 架构模式：ReAct, Plan-Execute, Supervisor, Multi-Agent 协作
- Tool Calling 深度：Tool 定义, MCP 协议, 并行调用, 错误处理, 沙箱执行

### 企业级难点
- ReactFlow → LangGraph StateGraph 编译器（前端可视化 DAG 如何准确编译为后端执行图）
- HITL 长时间等待（LangGraph interrupt 后可能等待数小时, 可靠的通知、超时、恢复机制）
- MCP 工具生态接入
- 多租户执行隔离（不同 Agent 执行的 Callbacks/Tracing 不能串数据）

### 成功标准
- 用 LangGraph 独立实现 ReAct / Supervisor / Multi-Agent 三种模式
- ReactFlow → LangGraph StateGraph 的编译器自己写
- 理解 Tool Calling 的完整链路：定义→调用→结果→错误处理
- 实现带 HITL 审批的生产级工作流（中断→等待→恢复）

## 项目3：类 Cursor 代码 AI 编辑器（10周）

### 核心目标
全技能收束：RAG + Agents + Streaming UX + DevOps。产出可安装的桌面应用。

### 系统架构
- **桌面框架**: Electron（Main Process: Node.js 文件系统/Git/AI请求/代码索引, Renderer Process: React + Monaco）
- **编辑器**: Monaco Editor（VS Code 同款内核）
- **AI**: DeepSeek Chat API + DeepSeek FIM API + LangChain + LangGraph
- **代码分析**: tree-sitter（AST 解析, 多语言支持）
- **本地存储**: SQLite（用户数据）, SQLite vector extension 或嵌入式 Qdrant（向量索引）
- **分发**: electron-builder（macOS .dmg + Windows .exe）, electron-updater

### MVP 功能（5周）
1. Electron 壳 + IDE（窗口管理, 原生文件系统, Monaco Editor, 文件树+Tab）
2. AI Chat Panel（侧边栏对话, @file 引用上下文, 流式输出, 代码块识别）
3. **Inline Diff + Apply（核心差异化）**：AI 生成 unified diff → Monaco decoration 红/绿渲染 → 逐块 Accept/Reject → 快捷键操作
4. Inline 代码补全（DeepSeek FIM API, 光标处触发, ghost text 渲染, Tab 接受）
5. Code RAG 搜索（tree-sitter AST 解析 → 函数/类级分块 → 本地 Qdrant 索引 → 语义搜索）
6. 本地项目管理（打开文件夹, Git 状态展示）

### 进阶功能（5周）
1. Code Agent（Plan→Edit→Verify 循环, 读写文件系统, 跨文件修改, 每步出 diff 供审查）
2. 多文件 Diff（Agent 多文件修改时, diff 面板列出所有变更, 逐个审查）
3. AI Code Review（选中代码 → 一键审查 → 问题列表 + 每个问题带 inline diff fix）
4. Eval & 统计（补全接受率, Agent 任务成功率, token 消耗, 延迟, 本地 SQLite 存储）
5. 主题&配置（亮/暗主题, 快捷键配置, 模型参数, Prompt 模板管理）
6. 打包&分发（electron-builder 打包 macOS/Windows, 自动更新）

### 结构化学习模块（前 3 周）
- Monaco Editor 深度：Editor API, decoration, ghost text, inline completion provider, diff editor
- DeepSeek FIM：Fill-in-the-Middle API, 上下文构建策略, 补全触发机制, 缓存策略
- Code RAG 专项：tree-sitter AST 解析, 代码 chunking（函数/类级别）, 仓库级索引, 增量更新
- DevOps 实战：Electron 打包, 跨平台分发, 自动更新

### 企业级难点
- **Inline Diff 渲染**：unified diff → Monaco decoration 转换, 处理行号偏移、冲突合并、undo 支持
- **FIM 上下文构建**：如何从当前光标位置提取最有价值的上下文（前后代码、相关文件、最近编辑）
- **AST-aware Chunking**：tree-sitter 按函数/类/模块语义分块 — 代码 RAG 和文本 RAG 的本质区别
- **Electron IPC 架构**：Main/Renderer 进程分离, 文件操作走 Main, UI 走 Renderer
- **Agent Plan-Edit-Verify 循环**：让 Agent 自主分析、修改、验证代码, 每一步可审查可撤销

### 成功标准
- Electron Main/Renderer IPC 架构独立设计和实现
- Inline Diff (unified diff → Monaco decoration) 完整实现
- tree-sitter AST 解析 + 代码语义 chunking 能解释清楚原理
- DeepSeek FIM 的上下文构建策略能和他人讨论优劣
- 打包出可安装的 macOS/Windows 桌面应用

## 学习节奏

### 单周时间分配模板（6-8h）
| 时段 | 内容 | 时间 |
|------|------|------|
| 平日 2-3 晚 | 项目编码 — 按计划推进功能 | 1-2h × 3 |
| 周末 1 个半天 | 结构化学习 — 攻克理论模块, 代码实验 | 3-4h × 1 |
| 周末剩余 | 复盘 + 笔记沉淀 | 1h |

### 每 Phase 三阶段
1. **先学（1-2周）**：啃理论模块, 写实验代码验证, 不碰项目代码
2. **再练（4-7周）**：用学到的知识建项目对应模块, 遇到问题回头查
3. **复盘（最后 1 周）**：写项目复盘笔记, 代码 Review, 知识库沉淀

### 知识沉淀
- **项目代码**：GitHub 开源, README + 架构图, 可演示 Demo → AI 全栈作品集
- **知识库**：用项目1的产品记录学习笔记, 每个技能点一篇文章
- **复盘输出**：每个项目结束写深度复盘（踩坑记录 + 架构决策 + 技术选型理由 + 量化成果）

## 总路线图

| Phase | 周数 | 学习重点 | 项目重点 | 核心产出 |
|-------|------|---------|---------|---------|
| 项目1 类Notion AI | 7周 | RAG全链路, DeepSeek全家桶, 文档解析 | 富文本编辑器, 混合检索, AI对话+引用, Eval体系 | 可用的AI知识库产品, RAG全链路代码 |
| 项目2 类Coze平台 | 7周 | LangChain/LangGraph源码级, Agent编排, Tool Calling | 可视化工作流, Agent引擎, 工具系统, HITL | 可用的Agent工作流平台 |
| 项目3 类Cursor AI | 10周 | Electron, Code RAG, FIM, DevOps | 代码编辑器, Inline Diff, Code Agent, 打包分发 | 可安装的桌面AI编辑器 |
| **合计** | **~24周** | **7大AI技能域全覆盖** | **3个企业级项目** | **AI全栈作品集** |

## 实施说明

本项目分解为 3 个独立的子项目，按顺序实施：
1. **impl-plan-1**: 类 Notion AI 知识平台（项目1）
2. **impl-plan-2**: 类 Coze 多智能体平台（项目2）
3. **impl-plan-3**: 类 Cursor 代码 AI 编辑器（项目3）

每个子项目有独立的 implementation plan，先完成项目1再进入项目2，依次推进。
