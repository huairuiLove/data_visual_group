# 中东冲突态势智能分析台 v2.0

数据可视化课程小组作业 - 知识图谱增强版。基于公开的中东冲突报道(123篇)，支持上传 PDF/DOCX/TXT 文献自动完成数据清洗、知识图谱构建和 6 视图可视化分析。

本项目提供两套前端：

| 版本 | 技术栈 | 访问地址 |
|------|--------|----------|
| **Node.js 版（推荐）** | Express + Vue 3 + Vite | 开发：`http://localhost:5173`；API：`http://localhost:3000` |
| **Streamlit 版** | Python Streamlit | `http://localhost:8501` |

---

## 运行方式

### 快速对照

| 服务 | 端口 | 启动 | 关闭 |
|------|------|------|------|
| Neo4j (Homebrew) | 7474 / 7687 | `neo4j start` | `neo4j stop` |
| Neo4j (Docker) | 7474 / 7687 | `docker start neo4j`（首次见下方初始化） | `docker stop neo4j` |
| Ollama | 11434 | `ollama serve &` | `pkill ollama` |
| Node.js API | 3000 | `npm run dev` | 终端 `Ctrl+C` |
| Vue 开发服 | 5173 | `npm run dev:ui` | 终端 `Ctrl+C` |
| Streamlit | 8501 | `streamlit run app.py` | 终端 `Ctrl+C` |

> **启动顺序：** Neo4j → Ollama → 应用（Node 或 Streamlit）  
> **关闭顺序：** 应用 → Ollama → Neo4j（与启动相反）

---

### 一、初始化（首次部署，按顺序执行）

以下命令只需在第一次搭建环境时运行；日常开发请直接跳到「二、启动服务」。

```bash
# ── 1. Python 依赖（Streamlit 版）────────────────────────────
cd Agent-main
pip install -r requirements.txt
cd ..

# ── 2. Node.js 依赖（Vue + Express 版，推荐）──────────────────
cd nodejs-app
npm install                          # 后端依赖
cd client && npm install && cd ..    # 前端依赖
cp .env.example .env                 # 复制环境变量模板，再编辑填入 API Key / Neo4j 密码
cd ..

# ── 3. Neo4j 图数据库 ─────────────────────────────────────────
# macOS Homebrew 安装
brew install neo4j

# 或使用 Docker 创建容器（只需执行一次）
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest

# 首次启动后访问 http://localhost:7474 验证；默认用户 neo4j，密码 password（会要求修改）

# ── 4. Ollama 本地嵌入模型 ─────────────────────────────────────
brew install ollama
ollama pull nomic-embed-text         # 下载嵌入模型（约 274MB）

# 验证嵌入接口是否正常
curl http://localhost:11434/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"input": "test", "model": "nomic-embed-text"}'
```

> 若不想使用本地嵌入，可在应用侧边栏选择 **OpenAI** 嵌入，走远程 API（需配置 `OPENAI_API_KEY`）。

---

### 二、启动服务（日常开发）

按依赖顺序依次启动；Neo4j 与 Ollama 各只需启动一次，应用层按需选择 Node 版或 Streamlit 版。

```bash
# ── 1. Neo4j ──────────────────────────────────────────────────
neo4j start                          # Homebrew 安装时

# docker start neo4j                 # Docker 安装时（容器已存在则用 start）

# ── 2. Ollama 嵌入服务 ────────────────────────────────────────
ollama serve &                       # 后台运行；模型需已 pull（见初始化）

# ── 3a. Node.js 版（推荐，需两个终端）────────────────────────
# 终端 1：Express API
cd /path/to/work_group
npm run dev                          # → http://localhost:3000

# 终端 2：Vue 开发服（HMR，/api 自动代理到 3000）
npm run dev:ui                       # → http://localhost:5173（开发时访问此地址）

# 生产模式（单进程，需先构建前端）
npm run build
NODE_ENV=production npm start        # Express 直接 serve 构建产物

# ── 3b. Streamlit 版（备选）───────────────────────────────────
cd Agent-main
streamlit run app.py                 # → http://localhost:8501
```

---

### 三、关闭服务（退出时）

与启动顺序相反：先停应用，再停 Ollama，最后停 Neo4j。

```bash
# ── 1. 应用层 ─────────────────────────────────────────────────
# Node / Streamlit：在对应终端按 Ctrl+C

# 若后台仍有 node 进程占用端口，可按需清理：
# lsof -ti:3000 | xargs kill
# lsof -ti:5173 | xargs kill

# ── 2. Ollama ─────────────────────────────────────────────────
pkill ollama
# killall ollama                     # 备选写法

# ── 3. Neo4j ──────────────────────────────────────────────────
neo4j stop                           # Homebrew

# docker stop neo4j                  # Docker（仅停止，保留数据）
# docker stop neo4j && docker rm neo4j   # 停止并删除容器（可选）
```

---

### 四、使用流程

1. **配置 API** — 侧边栏选择 DeepSeek 或 OpenAI，输入 API Key 和模型名称，点击测试
2. **配置嵌入模型** — 选择「本地」(Ollama) 或「OpenAI」，点击测试（本地需已启动 Ollama 并下载 `nomic-embed-text`）
3. **连接 Neo4j** — 地址 `neo4j://localhost:7687`、用户名、密码，点击连接
4. **上传 PDF 文献** — 选择军事/国际局势主题 PDF 上传
5. **自动处理** — 文本提取、实体抽取、知识图谱构建、多步数据分析
6. **6 视图分析** — 态势总览、事件时间线、知识图谱、空间态势、来源分析、证据问答

---

## 功能视图

| 视图 | 说明 | 类型 |
|------|------|------|
| 态势总览 | KPI 卡片、实体分布、处理流水线、自动洞察 | 综合看板 |
| 事件时间线 | 天级事件链展示，按事件类别分层 | 时间维度 |
| 知识图谱 | 实体-关系网络，支持类型筛选和节点探索 | 关系维度 |
| 空间态势 | Plotly 地图，标记地理位置与区域覆盖 | 空间维度 |
| 来源对比 | 文档统计分析、关系桑基图、实体热力图 | 来源维度 |
| 证据问答 | GraphRAG 增强问答，带证据溯源 | 问答交互 |

---

## 目录结构

```
work_group/
  package.json                     # 根目录快捷脚本（dev / dev:ui / build / start）
  nodejs-app/                      # Node.js 版（推荐）
    server.js                      # Express 入口
    .env.example                   # 环境变量模板
    client/                        # Vue 3 + Vite 前端
    data/                          # 图谱与缓存数据
  Agent-main/                      # Streamlit 版
    app.py                         # Streamlit 主应用（6 视图仪表板）
    config.py                      # 系统配置（API / Neo4j / 图谱参数）
    api_utils.py                   # API 连接与嵌入模型工具
    data_analyzer.py               # 数据清洗与分析管线
    views.py                       # 6 视图可视化渲染
    knowledge_graph_utils.py       # 知识图谱构建与可视化
    data_persistence_utils.py      # 数据缓存与持久化
    requirements.txt               # Python 依赖
    cache/                         # 处理结果缓存
  data/
    knowledge_graph.json           # 知识图谱数据
    app_data.json                  # 前端数据
    raw_middle_east_conflict_articles.csv
    report_outputs/                # 数据处理结果
  README.md                        # 本文件
```

---

## 数据处理管线

上传文档后系统自动执行 7 步分析：

| 步骤 | 说明 |
|------|------|
| 实体提取 | 从 Neo4j 查询节点类型分布、关系类型、边连接 |
| 关键词分析 | TF-IDF 提取文档核心术语 + 事件类型分类统计 |
| 人物提取 | jieba 词性标注 + 中文姓名正则 + 上下文约束英文名正则 |
| 时间线提取 | 正则 + 关键词匹配提取日期和 7 类事件分类 |
| 空间提取 | 匹配 20+ 中东地名及坐标，统计提及频次 |
| 统计计算 | 文本长度、实体/关系占比、人物/关键词综合统计 |
| 洞察生成 | 基于分析结果自动生成多维度文档洞察 |

---

## 相比示例代码的扩展

| 对比维度 | 示例 Agent-main | 本作品 v2.0 |
|----------|----------------|-------------|
| 架构 | Streamlit + Neo4j + 单一问答 | Streamlit / Node+Vue + Neo4j + 6 视图仪表板 |
| 知识图谱 | 基础 LLM 抽取 | 增强抽取 + 类型筛选 + 交互探索 |
| 可视化 | 基础图谱 | 6 视图联动：总览/时间线/图谱/地图/来源/问答 |
| 问答 | 基础 GraphRAG | GraphRAG 增强 + 证据溯源展示 |
| 文档输入 | PDF 上传 | PDF 上传 + 自动触发全量分析管线 |
| 空间展示 | 无 | Plotly 地图 + 地点标记 + 频次分析 |
| 事件链 | 无 | 天级事件时间线 + 7 类事件分类筛选 |
| 数据分析 | 无 | 实体/关系统计 + 桑基图 + 热力图 + 自动洞察 |
