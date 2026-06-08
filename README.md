# 中东冲突态势智能分析台 v2.0

数据可视化课程小组作业 - 知识图谱增强版。基于公开的中东冲突报道(123篇)，支持上传 PDF/DOCX/TXT 文献自动完成数据清洗、知识图谱构建和 6 视图可视化分析。

技术栈：**Express + Vue 3 + Vite build**，单端口部署（`http://localhost:3000`）。

---

## 运行方式

### 快速对照

| 服务             | 端口        | 启动                             | 关闭                |
| ---------------- | ----------- | -------------------------------- | ------------------- |
| Neo4j (Homebrew) | 7474 / 7687 | `neo4j start`                    | `neo4j stop`        |
| Neo4j (Docker)   | 7474 / 7687 | `docker start neo4j`             | `docker stop neo4j` |
| LM Studio        | 1234        | 在 LM Studio 中开启 Local Server | 关闭 LM Studio      |
| DataGraphX       | 3000        | `bun run dev` 或 `bun start`     | 终端 `Ctrl+C`       |

> **启动顺序：** Neo4j → LM Studio（若用本地嵌入）→ DataGraphX

---

### 一、初始化（首次部署）

```bash
# Node.js 依赖
bun install
cd nodejs-app
cp .env.example .env    # 开发默认可直接使用；生产环境必须修改密码
cd ..

# Neo4j
brew install neo4j
neo4j start
# 或 Docker:
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/dev_password_change_me \
  neo4j:latest

# llama.cpp / LM Studio：加载 LLM 与 embedding 模型，开启 OpenAI-compatible server
```

> 若不想使用本地嵌入，可在侧边栏选择 **OpenAI** 嵌入，复用 API 设置里的 OpenAI-compatible Base URL 和 API Key。

---

### 二、启动服务

```bash
# 开发（自动 build 前端 + 启动，访问 http://localhost:3000）
bun run dev

# 生产（需先 build）
bun run build
bun start
```

前端改动后重新执行 `bun run build`（或再次 `bun run dev`）。

---

### 三、使用流程

1. **配置 API** — 侧边栏填写 OpenAI-compatible Base URL、模型名称和 API Key（本地服务可留空），点击测试
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

| 配置项            | 默认值                        | 说明                                      |
| ----------------- | ----------------------------- | ----------------------------------------- |
| LM Studio API URL | `http://localhost:1234/v1`    | Local Server 地址                         |
| 嵌入模型名称      | 与 LM Studio 中加载的模型一致 | 如 `text-embedding-nomic-embed-text-v1.5` |

侧边栏「确认设置」会将嵌入配置写入 `nodejs-app/.env`。

---

## Neo4j 配置说明

本项目当前测试版本默认使用以下 Neo4j 账号，仅用于本地开发：

| 配置项 | 默认值 |
| ------ | ------ |
| URL | `neo4j://localhost:7687` |
| 用户名 | `neo4j` |
| 密码 | `dev_password_change_me` |
| Browser | `http://localhost:7474` |

`nodejs-app/.env.example` 已内置这组开发配置，复制为 `.env` 后后端和侧边栏默认都可以直接加载。生产或共享环境不要继续使用这个密码。

### Docker 启动

```bash
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/dev_password_change_me \
  neo4j:latest
```

如果容器已经存在：

```bash
docker start neo4j
```

### Homebrew 启动

```bash
brew install neo4j
neo4j start
```

首次使用 Homebrew 版 Neo4j 时，打开 `http://localhost:7474`，用初始账号登录后把密码改成 `dev_password_change_me`；或者按当前 Neo4j 版本文档使用 `neo4j-admin` 设置初始密码。完成后确认 `.env` 中为：

```env
NEO4J_URL=neo4j://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=dev_password_change_me
```

### 连接检查

1. Neo4j Browser 能打开：`http://localhost:7474`
2. 后端能连 Bolt：`neo4j://localhost:7687`
3. 侧边栏「连接到 Neo4j 数据库」保持默认值，点击「连接」应显示 `Connected to Neo4j`

---

## 本地 LLM 推荐

本项目调用的是 OpenAI-compatible Chat Completions API，因此 llama.cpp、LM Studio、Ollama 这类本地服务都可以接入。默认建议给本地非 embedding LLM 使用：

| 场景 | 推荐 |
| ---- | ---- |
| 默认模型 | `Qwen3-14B` 的 GGUF 量化版 |
| 建议量化 | `Q4_K_M` 优先；内存更充裕可试 `Q5_K_M` |
| 应用里的模型名 | `qwen3-14b` |
| Base URL | `http://localhost:1234/v1` |
| API Key | 本地服务留空 |
| 低内存备用 | `Qwen3-8B` / `qwen3-8b` |

选择理由：14B 级别在实体抽取、结构化 JSON、中文/英文混合文本分析上比 4B/8B 更稳，但仍低于 20B，Q4 量化后适合 16GB 或更高内存的 MacBook Air M 系列本地运行。8GB 内存机器建议直接用 8B 或更小模型。

`gemma-4-e4b` 这类 4B 级模型可以很快，但对本项目的长文本抽取、多步分析和 JSON 稳定输出可能不够稳。它适合作为快速预览模型，不建议作为默认分析模型。

### llama.cpp 示例

将下载好的 GGUF 文件放到本地模型目录后，用 `llama-server` 暴露 OpenAI-compatible API。关键是加 `--alias qwen3-14b`，这样前端默认模型名可以直接匹配。

```bash
llama-server \
  -m ~/models/Qwen3-14B-Q4_K_M.gguf \
  --host 127.0.0.1 \
  --port 1234 \
  --alias qwen3-14b \
  -c 8192 \
  -ngl 999
```

然后在侧边栏填写：

```text
Base URL: http://localhost:1234/v1
模型名称: qwen3-14b
API 密钥: 留空
```

如果响应速度明显影响使用，把模型换成 8B 并同步 alias：

```bash
llama-server \
  -m ~/models/Qwen3-8B-Q4_K_M.gguf \
  --host 127.0.0.1 \
  --port 1234 \
  --alias qwen3-8b \
  -c 8192 \
  -ngl 999
```

侧边栏模型名称改为 `qwen3-8b`。
