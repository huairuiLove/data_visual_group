# DataGraphX 中东冲突态势智能分析台

数据可视化课程小组作业。项目用于对中东冲突相关报道或文献做结构化抽取、知识图谱构建、多视图可视化、Notebook 生成和研究报告整理。

当前版本已经统一到 **Bun + Nuxt 3 + Vuetify + Nuxt Server API + Neo4j**。前端页面和后端 API 都由 Nuxt 提供，不再使用 Python 后端、Express 后端、Vite dist 托管或跨端口代理。

默认访问地址：

```text
http://127.0.0.1:3001
```

## 功能概览

- 上传 PDF、DOCX、Markdown、TXT、CSV、JSON 等文档
- 自动解析文本、切块、主题检查、实体关系抽取
- 写入 Neo4j，并缓存图谱数据
- 支持单文档分析和多文章联合分析
- 提供态势总览、知识图谱、动态可视化、时间线、空间态势、来源分析、问答、Notebook 实验室、报告库
- API 设置只使用 OpenAI-compatible 形式：Base URL、模型名称、API Key，本地模型 API Key 可留空
- 前端状态会持久化到浏览器本地存储，切换标签页不会丢失已加载分析结果

## 技术栈

| 层级 | 技术 |
| ---- | ---- |
| 包管理 | Bun workspace |
| Web/API | Nuxt 3.15 |
| UI | Vue 3、Vuetify、Pinia |
| 可视化 | D3、Plotly、vis-network |
| API 运行时 | Nuxt Server API / Nitro / h3 |
| 图数据库 | Neo4j |
| LLM | OpenAI-compatible Chat Completions |
| Embedding | LM Studio / llama.cpp OpenAI-compatible embeddings |

## 目录结构

```text
data_visual_group/
  package.json                         # 根目录 Bun workspace 脚本
  bun.lock
  README.md
  nodejs-app/
    .env.example                       # 开发默认配置
    .env                               # 本地配置，不提交
    config/                            # LLM、Embedding、Neo4j、分析参数
    analysis/                          # 统计、KDD、Notebook 数据整理
    services/                          # 文档解析、LLM、Neo4j、报告、抽取等业务逻辑
    scripts/                           # 测试和维护脚本
    data/                              # 本地运行数据、缓存、报告
    client/
      nuxt.config.js
      src/
        server/api/[...path].js        # 统一 Nuxt API 入口
        pages/                         # Nuxt 页面路由
        layouts/default.vue
        components/
        views/
        stores/
        plugins/
```

## 快速启动

### 1. 安装依赖

```bash
bun install
```

本项目使用 Bun。不要再用 pnpm/npm/yarn 生成新的锁文件或 node_modules 布局。

### 2. 创建本地环境配置

```bash
cp nodejs-app/.env.example nodejs-app/.env
```

`.env.example` 已包含开发默认值，可以直接启动测试。生产或共享环境必须改掉默认密码和密钥。

### 3. 启动 Neo4j

Docker 推荐命令：

```bash
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/dev_password_change_me \
  neo4j:latest
```

已有容器时：

```bash
docker start neo4j
```

Homebrew 也可以：

```bash
brew install neo4j
neo4j start
```

### 4. 启动本地 LLM / Embedding 服务

推荐使用 LM Studio 或 llama.cpp server，开启 OpenAI-compatible API：

```text
Base URL: http://localhost:1234/v1
API Key: 本地服务通常留空
```

### 5. 启动 DataGraphX

```bash
bun run dev
```

访问：

```text
http://127.0.0.1:3001
```

## Docker Compose 一键部署

Compose 会启动三类服务：

| 服务 | 说明 | 默认端口 |
| ---- | ---- | -------- |
| `datagraphx` | Bun + Nuxt/Nitro 应用，包含前端和 `/api/*` | `3001` |
| `neo4j` | 图数据库 | `7474` / `7687` |
| `llamacpp-llm` | llama.cpp OpenAI-compatible Chat API | `1234` |
| `llamacpp-embedding` | llama.cpp OpenAI-compatible Embeddings API | `1235` |

准备模型目录：

```bash
mkdir -p models
```

把 GGUF 模型放进去，默认文件名为：

```text
models/Qwen3-14B-Q4_K_M.gguf
models/nomic-embed-text-v1.5.Q4_K_M.gguf
```

如果你的文件名不同，复制配置示例并修改：

```bash
cp .env.docker.example .env
```

常用修改项：

```env
LLAMACPP_LLM_MODEL=Qwen3-14B-Q4_K_M.gguf
LLM_MODEL_NAME=qwen3-14b
LLM_MAX_TOKEN_MULTIPLIER=100
LLM_MAX_TOKENS_CAP=1000000

LLAMACPP_EMBED_MODEL=nomic-embed-text-v1.5.Q4_K_M.gguf
EMBED_MODEL_NAME=text-embedding-nomic-embed-text-v1.5

NEO4J_PASSWORD=dev_password_change_me
```

启动：

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f datagraphx
docker compose logs -f llamacpp-llm
docker compose logs -f llamacpp-embedding
```

停止：

```bash
docker compose down
```

连同 Neo4j 数据卷一起删除：

```bash
docker compose down -v
```

容器内服务互联配置已经写在 `docker-compose.yml`：

```env
NEO4J_URL=neo4j://neo4j:7687
LLM_BASE_URL=http://llamacpp-llm:8080/v1
LM_STUDIO_BASE_URL=http://llamacpp-embedding:8080/v1
```

浏览器仍然访问宿主机端口：

```text
DataGraphX: http://127.0.0.1:3001
Neo4j Browser: http://127.0.0.1:7474
LLM API: http://127.0.0.1:1234/v1
Embedding API: http://127.0.0.1:1235/v1
```

Apple Silicon 上 Docker GPU 加速能力有限，llama.cpp 容器可能主要走 CPU。需要最佳 Metal 性能时，建议 Neo4j 和 DataGraphX 用 Docker，LLM/Embedding 继续在宿主机用 LM Studio 或本地 llama.cpp 跑，然后把 `.env` 里的 Base URL 指向宿主机服务。

## 常用脚本

| 命令 | 说明 |
| ---- | ---- |
| `bun run dev` | 启动 Nuxt 开发服务，页面和 API 都在 3001 |
| `bun run build` | 构建 Nuxt/Nitro 生产产物 |
| `bun start` | 预览构建后的 Nuxt 产物 |
| `bun run lint` | 运行 ESLint |
| `bun run test:notebook` | Notebook 端到端测试 |
| `bun run test:notebook:offline` | 强制 fallback 的 Notebook 测试 |
| `bun run test:report` | 研究报告保存测试 |

## 环境变量

配置文件位置：

```text
nodejs-app/.env
```

默认配置：

```env
NEO4J_URL=neo4j://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=dev_password_change_me

LLM_BASE_URL=http://localhost:1234/v1
LLM_MODEL=qwen3-14b
LLM_API_KEY=
LLM_MAX_TOKEN_MULTIPLIER=100
LLM_MAX_TOKENS_CAP=1000000

LM_STUDIO_BASE_URL=http://localhost:1234/v1
LM_STUDIO_EMBED_MODEL=text-embedding-nomic-embed-text-v1.5
```

说明：

- `LLM_*` 用于聊天、抽取、Notebook 生成、报告生成
- `LLM_MAX_TOKEN_MULTIPLIER` 默认把代码中的生成预算放大 100 倍，避免模型只输出 reasoning 而正文为空
- `LLM_MAX_TOKENS_CAP` 是最终 `max_tokens` 上限，默认 1000000；如果你的服务端上下文较小，可以下调
- `LM_STUDIO_*` 用于 embedding
- 本地 OpenAI-compatible 服务一般不需要 API Key
- 侧边栏保存 API 或 embedding 设置时，会写回 `nodejs-app/.env`
- Nuxt 开发端口由 `nodejs-app/client/package.json` 固定为 `127.0.0.1:3001`

## Neo4j 配置

当前测试版本默认使用：

| 配置项 | 默认值 |
| ------ | ------ |
| Browser | `http://localhost:7474` |
| Bolt URL | `neo4j://localhost:7687` |
| 用户名 | `neo4j` |
| 密码 | `dev_password_change_me` |

这组账号仅供本地开发。不要在生产、共享服务器或公开演示环境继续使用该密码。

连接检查：

```bash
# Browser
open http://localhost:7474

# Bolt 端口
nc -vz localhost 7687
```

应用内检查：

1. 打开左侧设置栏
2. Neo4j 保持默认 URL、用户名、密码
3. 点击连接
4. 成功后再上传文档，否则图谱写入和问答检索会失败

左侧设置栏还提供数据库管理：

- 刷新数据库状态：查看节点、关系、Document 记录和标签
- 清空错误分析数据：删除 Neo4j 中全部分析节点/关系/Document 记录，并删除本地图谱缓存
- 清空后会同步清理前端持久化的当前分析状态，方便重新上传同一文档重新抽取

## LLM 推荐

本项目更看重结构化输出稳定性，而不是纯聊天速度。默认推荐：

| 场景 | 推荐 |
| ---- | ---- |
| 默认本地模型 | `Qwen3-14B` GGUF 量化版 |
| 建议量化 | `Q4_K_M` 优先，内存更充裕可试 `Q5_K_M` |
| 应用模型名 | `qwen3-14b` |
| Base URL | `http://localhost:1234/v1` |
| API Key | 留空 |
| 低内存备用 | `Qwen3-8B` / `qwen3-8b` |

14B 级别在实体抽取、关系抽取、中文英文混合文本和 JSON 稳定性上通常比 4B/8B 更稳，同时不超过 20B，适合 16GB 或更高内存的 MacBook Air M 系列尝试。8GB 内存机器建议直接用 8B 或更小模型。

`gemma-4-e4b` 这类 4B 级模型可以做快速预览，但长文本抽取、多步规划和 JSON 输出更容易不稳定，不建议作为默认分析模型。

llama.cpp 示例：

```bash
llama-server \
  -m ~/models/Qwen3-14B-Q4_K_M.gguf \
  --host 127.0.0.1 \
  --port 1234 \
  --alias qwen3-14b \
  -c 8192 \
  -ngl 999
```

然后在应用设置中填写：

```text
Base URL: http://localhost:1234/v1
模型名称: qwen3-14b
API Key: 留空
```

## Embedding 配置

默认 embedding 服务同样走 OpenAI-compatible `/v1/embeddings`：

| 配置项 | 默认值 |
| ------ | ------ |
| Base URL | `http://localhost:1234/v1` |
| 模型 | `text-embedding-nomic-embed-text-v1.5` |

如果使用 LM Studio：

1. 下载并加载 embedding 模型
2. 开启 Local Server
3. 确认 `/v1/embeddings` 可用
4. 在应用设置中填写 Base URL 和模型名称

## 使用流程

1. 启动 Neo4j
2. 启动本地 LLM / embedding 服务，或准备远程 OpenAI-compatible API
3. `bun run dev`
4. 打开 `http://127.0.0.1:3001`
5. 在顶部点击设置，左侧配置 API、embedding、Neo4j
6. 在首页主区域上传文档并开始分析
7. 查看总览、图谱、动态可视化、时间线、空间、来源、问答、Notebook、报告库

## API 说明

所有 API 都挂在同一个 Nuxt 服务下：

```text
/api/settings
/api/settings/llm
/api/settings/embeddings
/api/test-llm
/api/test-embeddings
/api/neo4j/connect
/api/upload
/api/upload-batch
/api/analysis
/api/state
/api/reset
/api/articles
/api/analyze-multi
/api/qa
/api/generate-notebook
/api/research-report/finalize
/api/research-reports
```

前端默认使用相对路径 `/api`，不会走 CORS，也不会再启动第二套 API 服务。

## 数据和缓存

运行时数据主要写入：

```text
nodejs-app/data/
  uploads/       # 上传临时文件
  cache/         # 图谱缓存
  articles/      # 多文章索引和内容
  reports/       # 研究报告和图表
```

这些目录属于本地运行产物，通常不提交。缺失时服务会按需创建。

## 常见问题

### 端口 3001 被占用

查找并停止旧进程：

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
kill <PID>
```

### Bun 不读取 `.env`

配置由后端服务层 `nodejs-app/services/env-loader.js` 加载，默认读取 `nodejs-app/.env`。确认文件位置不是根目录 `.env`。

### 上传时报 `ENOENT data/cache`

运行时目录缺失会导致写缓存失败。当前代码会按需创建目录；如果仍失败，先确认进程对 `nodejs-app/data` 有写权限。

### 下拉框或输入框 label 重叠

不要给 Vuetify 输入组件写全局 reset 或覆盖内部 padding。当前样式保留 Vuetify 原生输入布局，只保留项目级颜色、滚动条和可视化组件样式。

### 知识图谱、动态可视化、来源分析没有内容

通常有三类原因：

- 文档尚未成功完成上传分析
- LLM 抽取失败或返回 JSON 不稳定
- Neo4j 没有连接，图谱写入失败

先检查设置栏的 API、embedding、Neo4j 三项状态，再看首页上传结果和浏览器控制台错误。

## 开发约束

- 使用 Bun，不再使用 pnpm/npm/yarn
- 不使用 Python 后端
- 不使用 Express 后端
- 不提交 `.env`、`.nuxt`、`.output`、`dist`、运行缓存和本地数据
- API 入口保持统一，优先放在 Nuxt server API 中维护
