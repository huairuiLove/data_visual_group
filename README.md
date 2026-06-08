# 中东冲突态势智能分析台 v2.0

数据可视化课程小组作业 - 知识图谱增强版。基于公开的中东冲突报道(123篇)，支持上传 PDF/DOCX/TXT 文献自动完成数据清洗、知识图谱构建和 6 视图可视化分析。

技术栈：**Express + Vue 3 + Vite build**，单端口部署（`http://localhost:3000`）。

---

## 运行方式

### 快速对照

| 服务 | 端口 | 启动 | 关闭 |
|------|------|------|------|
| Neo4j (Homebrew) | 7474 / 7687 | `neo4j start` | `neo4j stop` |
| Neo4j (Docker) | 7474 / 7687 | `docker start neo4j` | `docker stop neo4j` |
| LM Studio | 1234 | 在 LM Studio 中开启 Local Server | 关闭 LM Studio |
| DataGraphX | 3000 | `npm run dev` 或 `npm start` | 终端 `Ctrl+C` |

> **启动顺序：** Neo4j → LM Studio（若用本地嵌入）→ DataGraphX

---

### 一、初始化（首次部署）

```bash
# Node.js 依赖
cd nodejs-app
npm install
cd client && npm install && cd ..
cp .env.example .env    # 填入 API Key / Neo4j 密码
cd ..

# Neo4j
brew install neo4j
neo4j start
# 或 Docker: docker run -d --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest

# LM Studio：加载 embedding 模型，开启 Local Server（默认 http://localhost:1234/v1）
```

> 若不想使用本地嵌入，可在侧边栏选择 **OpenAI** 嵌入（需配置 `OPENAI_API_KEY`）。

---

### 二、启动服务

```bash
# 开发（自动 build 前端 + 启动，访问 http://localhost:3000）
npm run dev

# 生产（需先 build）
npm run build
npm start
```

前端改动后重新执行 `npm run build`（或再次 `npm run dev`）。

---

### 三、使用流程

1. **配置 API** — 侧边栏选择 DeepSeek 或 OpenAI，输入 API Key，点击测试
2. **配置嵌入模型** — 选择「本地 (LM Studio)」或 OpenAI；LM Studio 填 API URL（默认 `http://localhost:1234/v1`）和模型名
3. **连接 Neo4j** — 地址 `neo4j://localhost:7687`、用户名、密码，点击连接
4. **上传 PDF 文献** — 选择军事/国际局势主题 PDF 上传
5. **自动处理** — 文本提取、实体抽取、知识图谱构建、多步数据分析
6. **6 视图分析** — 态势总览、事件时间线、知识图谱、空间态势、来源分析、证据问答

---

## 目录结构

```
work_group/
  package.json                     # 根目录快捷脚本（build / dev / start）
  nodejs-app/
    server.js                      # Express 入口（API + 静态 dist）
    .env.example
    client/                        # Vue 3 前端源码
    client/dist/                   # vite build 产物（由 Express 托管）
    data/
  README.md
```

---

## LM Studio 嵌入配置说明

LM Studio 提供 OpenAI 兼容的 `/v1/embeddings` 接口，与 llama.cpp server 用法相同：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| LM Studio API URL | `http://localhost:1234/v1` | Local Server 地址 |
| 嵌入模型名称 | 与 LM Studio 中加载的模型一致 | 如 `text-embedding-nomic-embed-text-v1.5` |

侧边栏「确认设置」会将嵌入配置写入 `nodejs-app/.env`。
