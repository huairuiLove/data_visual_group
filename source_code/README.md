# 中东冲突态势智能分析台 v2.0

数据可视化课程小组作业 - 知识图谱增强版。基于公开的中东冲突报道(123篇)，支持上传PDF/DOCX/TXT文献自动完成数据清洗、知识图谱构建和6视图可视化分析。

## 运行方式

### 启动与关闭汇总

| 服务 | 端口 | 启动命令 | 关闭命令 |
|------|------|----------|----------|
| Neo4j (Homebrew) | 7474 / 7687 | `neo4j start` | `neo4j stop` |
| Neo4j (Docker) | 7474 / 7687 | `docker run -d --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest` | `docker stop neo4j` |
| Ollama | 11434 | `ollama serve &` | `pkill ollama` |
| Streamlit | 8501 | `cd Agent-main && streamlit run app.py` | `Ctrl+C` |

> **启动顺序：** Neo4j → Ollama → Streamlit。**关闭顺序：** Streamlit → Ollama → Neo4j。

---

### 1. Python 依赖

```bash
pip install -r requirements.txt
```

### 2. Neo4j 图数据库

**安装与启动：**

```bash
# Homebrew（macOS）
brew install neo4j
```
```bash
neo4j start
```
```bash
# Docker
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest
```

启动后访问 `http://localhost:7474` 确认运行正常。首次登录默认用户名 `neo4j`，密码 `password`（会要求修改）。

**关闭：**

```bash
# Homebrew
neo4j stop
```
```bash
# Docker
docker stop neo4j
docker rm neo4j           # 可选：删除容器
```

### 3. 本地嵌入模型 (Ollama)

嵌入模型用于将文本转为向量，支持语义相似度检索。使用小模型即可。

**安装与启动：**

```bash
brew install ollama
```
```bash
ollama serve &             # 后台启动服务
```
```bash
ollama pull nomic-embed-text   # 下载嵌入模型 (274MB)
```

验证安装：
```bash
curl http://localhost:11434/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"input": "test", "model": "nomic-embed-text"}'
```

**关闭：**

```bash
pkill ollama
# 或
killall ollama
```

> 如果不想用本地嵌入模型，也可以在侧边栏选择"OpenAI"嵌入，走远程 API。

### 4. Streamlit 应用

**启动：**

```bash
cd Agent-main
streamlit run app.py
```

浏览器打开 `http://localhost:8501`。

**关闭：**

```bash
# 在运行 streamlit 的终端按 Ctrl+C
```

### 5. 使用流程

1. **配置 API** — 侧边栏选择 DeepSeek 或 OpenAI，输入 API Key 和模型名称，点击测试
2. **配置嵌入模型** — 选择"本地"(Ollama)或"OpenAI"，点击测试。(需要先启动 Ollama 并下载 `nomic-embed-text`)
3. **连接 Neo4j** — 输入地址 `neo4j://localhost:7687`、用户名、密码，点击连接
4. **上传 PDF 文献** — 选择一篇军事/国际局势主题的 PDF 上传
5. **自动处理** — 系统自动完成文本提取、实体抽取、知识图谱构建、5步数据分析
6. **6视图分析** — 态势总览、事件时间线、知识图谱、空间态势、来源分析、证据问答

## 功能视图

| 视图 | 说明 | 类型 |
|------|------|------|
| 态势总览 | KPI卡片、实体分布、处理流水线、自动洞察 | 综合看板 |
| 事件时间线 | 天级事件链展示，按事件类别分层 | 时间维度 |
| 知识图谱 | 实体-关系网络，支持类型筛选和节点探索 | 关系维度 |
| 空间态势 | Plotly地图，标记地理位置与区域覆盖 | 空间维度 |
| 来源对比 | 文档统计分析、关系桑基图、实体热力图 | 来源维度 |
| 证据问答 | GraphRAG增强问答，带证据溯源 | 问答交互 |

## 目录结构

```
work_group/
  Agent-main/
    app.py                         # Streamlit 主应用(6视图仪表板)
    config.py                      # 系统配置(API/Neo4j/图谱参数)
    api_utils.py                   # API连接与嵌入模型工具
    data_analyzer.py               # 数据清洗与分析管线
    views.py                       # 6视图可视化渲染模块
    knowledge_graph_utils.py       # 知识图谱构建与可视化
    data_persistence_utils.py      # 数据缓存与持久化
    requirements.txt               # Python 依赖
    cache/                         # 处理结果缓存
  data/
    knowledge_graph.json           # 知识图谱数据
    app_data.json                  # 前端数据
    raw_middle_east_conflict_articles.csv   # 原始数据
    report_outputs/                # 数据处理结果
  requirements.txt                 # 项目级依赖
  README.md                       # 本文件
```

## 数据处理管线

上传文档后系统自动执行7步分析：

| 步骤 | 说明 |
|------|------|
| 实体提取 | 从Neo4j查询节点类型分布、关系类型、边连接 |
| 关键词分析 | TF-IDF提取文档核心术语 + 事件类型分类统计 |
| 人物提取 | jieba词性标注 + 中文姓名正则 + 上下文约束英文名正则 |
| 时间线提取 | 正则+关键词匹配提取日期和7类事件分类 |
| 空间提取 | 匹配20+中东地名及坐标，统计提及频次 |
| 统计计算 | 文本长度、实体/关系占比、人物/关键词综合统计 |
| 洞察生成 | 基于分析结果自动生成多维度文档洞察 |

## 相比示例代码的扩展

| 对比维度 | 示例 Agent-main | 本作品 v2.0 |
|----------|----------------|-------------|
| 架构 | Streamlit + Neo4j + 单一问答 | Streamlit + Neo4j + 6视图仪表板 |
| 知识图谱 | 基础LLM抽取 | 增强抽取 + 类型筛选 + 交互探索 |
| 可视化 | 基础图谱 | 6视图联动：总览/时间线/图谱/地图/来源/问答 |
| 问答 | 基础GraphRAG | GraphRAG增强 + 证据溯源展示 |
| 文档输入 | PDF上传 | PDF上传 + 自动触发全量分析管线 |
| 空间展示 | 无 | Plotly地图 + 地点标记 + 频次分析 |
| 事件链 | 无 | 天级事件时间线 + 7类事件分类筛选 |
| 数据分析 | 无 | 实体/关系统计 + 桑基图 + 热力图 + 自动洞察 |
