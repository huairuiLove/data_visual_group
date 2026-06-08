import { createRequire } from 'node:module'
import path from 'node:path'
import { promises as fsp } from 'node:fs'
import process from 'node:process'
import {
  createError,
  defineEventHandler,
  getQuery,
  readBody,
  readMultipartFormData,
} from 'h3'

const require = createRequire(path.join(process.cwd(), 'package.json'))

const { runQuery, closeDriver } = require('../services/neo4j')
const { chat, testConnection } = require('../services/llm')
const { LocalEmbeddings, resetEmbeddings, testEmbeddings } = require('../services/embeddings')
const {
  processDocument,
  parseArticleMeta,
  generateFileHash,
  saveGraphData,
  loadGraphData,
  chunkText,
} = require('../services/document')
const { runDataAnalysis } = require('../analysis/pipeline')
const { computeWork1Metrics, enrichAnalysisResult } = require('../analysis/work1-metrics')
const { applyCanonicalization } = require('../services/entity-canonicalization')
const { updateEnvFile } = require('../services/env')
const { validateFileType, validateMiddleEastTheme } = require('../services/article-filter')
const { extractFromChunks } = require('../services/extraction')
const { generateNotebook } = require('../services/notebook-generator')
const { writeResearchReport } = require('../services/agents/report-writer')
const {
  saveResearchReport,
  listResearchReports,
  getResearchReport,
  ensureSchema,
} = require('../services/research-report-db')
const {
  loadArticleIndex,
  ingestArticle,
  filterArticles,
  runJointAnalysis,
} = require('../services/multi-article')
const config = require('../config')

const UPLOAD_DIR = path.join(process.cwd(), '..', 'data', 'uploads')
const CACHE_DIR = path.join(process.cwd(), '..', 'data', 'cache')
const MAX_UPLOAD_SIZE = 200 * 1024 * 1024
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.pdf',
  '.tex',
  '.md',
  '.markdown',
  '.txt',
  '.text',
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.log',
  '.rst',
  '.rtf',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.htm',
])

let appState = {}

function apiError(statusCode, message, code = 'API_ERROR') {
  return createError({
    statusCode,
    statusMessage: message,
    data: { error: { code, message } },
  })
}

function normalizePath(rawPath) {
  const pathValue = Array.isArray(rawPath) ? rawPath.join('/') : rawPath || ''
  return `/${pathValue}`.replace(/\/+/g, '/')
}

async function readJsonBody(event) {
  return (await readBody(event)) || {}
}

async function readUploadParts(event, multiple = false) {
  const parts = await readMultipartFormData(event)
  const fields = {}
  const files = []

  for (const part of parts || []) {
    if (part.filename) {
      if (!part.data?.length) continue
      const ext = path.extname(part.filename || '').toLowerCase()
      if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
        throw apiError(415, '仅支持 doc、docx、tex、markdown、pdf 和常见文本类文件', 'UNSUPPORTED_FILE_TYPE')
      }
      if (part.data.length > MAX_UPLOAD_SIZE) {
        throw apiError(413, '上传文件不能超过 200MB', 'UPLOAD_TOO_LARGE')
      }

      await fsp.mkdir(UPLOAD_DIR, { recursive: true })
      const tempPath = path.join(UPLOAD_DIR, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`)
      await fsp.writeFile(tempPath, part.data)
      files.push({
        path: tempPath,
        originalname: part.filename,
        mimetype: part.type,
        size: part.data.length,
      })
    } else if (part.name) {
      fields[part.name] = part.data?.toString('utf8') || ''
    }
  }

  if (!multiple && files.length > 1) return { fields, files: files.slice(0, 1) }
  return { fields, files }
}

async function persistExtractionToNeo4j(entities, relations) {
  await runQuery('MATCH (n) WHERE NOT n:Document DETACH DELETE n')

  const seenNodeIds = new Set()
  const allNodes = []
  const allRels = []

  for (const entity of entities) {
    const nid = String(entity.name || entity.id).trim()
    const ntype = String(entity.type).trim()
    const label = config.graph.allowedNodes.includes(ntype) ? ntype : ntype
    if (!nid || seenNodeIds.has(nid)) continue
    seenNodeIds.add(nid)
    const text = [nid, entity.summary].filter(Boolean).join(' — ').slice(0, 200)
    allNodes.push({ id: nid, type: ntype, text, summary: entity.summary || '' })

    await runQuery(
      `MERGE (n:\`${label}\` {id: $id})
       SET n.text = $text, n.summary = $summary, n.aliases = $aliases`,
      { id: nid, text, summary: entity.summary || '', aliases: entity.aliases || [] }
    )
  }

  for (const rel of relations) {
    const src = String(rel.source).trim()
    const tgt = String(rel.target).trim()
    const rtype = String(rel.type).trim()
    if (!seenNodeIds.has(src) || !seenNodeIds.has(tgt)) continue
    allRels.push({ source: src, target: tgt, type: rtype })
    await runQuery(
      `MATCH (a {id: $src}), (b {id: $tgt})
       MERGE (a)-[r:\`${rtype}\`]->(b)
       SET r.summary = $summary`,
      { src, tgt, summary: rel.summary || '' }
    )
  }

  return {
    nodes: allNodes.map((n) => ({
      id: n.id,
      type: n.type,
      properties: { text: n.text, summary: n.summary },
    })),
    relationships: allRels.map((r) => ({ source: r.source, target: r.target, type: r.type, properties: {} })),
  }
}

async function handleUpload(event) {
  const { fields, files } = await readUploadParts(event)
  const file = files[0]
  if (!file) throw apiError(400, '未选择文件', 'MISSING_FILE')

  try {
    const filePath = file.path
    const fileName = file.originalname
    const typeCheck = validateFileType(fileName)
    if (!typeCheck.valid) throw apiError(415, typeCheck.reason, 'UNSUPPORTED_FILE_TYPE')

    const fileContent = await fsp.readFile(filePath)
    const fileHash = generateFileHash(fileContent)
    const provider = fields.llmProvider || 'openai-compatible'
    const analysisMode = fields.analysisMode || config.analysis.defaultMode

    const existing = await runQuery('MATCH (d:Document {hash: $hash}) RETURN d', { hash: fileHash })
    const needProcessing = existing.length === 0
    const chunks = await processDocument(filePath, fileName)
    const fullText = chunks.map((c) => c.text).join('\n')
    const articleMeta = parseArticleMeta(fullText)
    const bodyText = articleMeta.body && articleMeta.body.length > 100 ? articleMeta.body : fullText
    const bodyChunks =
      bodyText !== fullText
        ? chunkText(bodyText).map((text, i) => ({ text, source: fileName, index: i }))
        : chunks

    if (config.analysis.requireMiddleEastTheme) {
      const theme = await validateMiddleEastTheme(fullText, provider)
      if (!theme.isValid) {
        throw apiError(422, `文章主题不符合中东冲突要求: ${theme.reason}`, 'THEME_MISMATCH')
      }
      appState.themeValidation = theme
    }

    let extractedEntities = []
    let extractedRelations = []

    if (!needProcessing) {
      const cachedGraph = await loadGraphData(fileHash)
      if (cachedGraph) {
        extractedEntities = (cachedGraph.nodes || []).map((n) => ({
          id: n.id,
          name: n.id,
          type: n.type,
          summary: n.properties?.summary || '',
          aliases: n.properties?.aliases || [],
        }))
        extractedRelations = (cachedGraph.relationships || []).map((r) => ({
          source: r.source,
          target: r.target,
          type: r.type,
        }))
      }
    }

    if (needProcessing) {
      const extraction = await extractFromChunks(bodyChunks, analysisMode, provider, {
        title: articleMeta.title || fileName,
        date: articleMeta.date || new Date().toISOString().slice(0, 10),
        source: articleMeta.source || '',
        summary: articleMeta.summary || '',
      })
      const canon = applyCanonicalization(extraction.entities, extraction.relations)
      extractedEntities = canon.entities
      extractedRelations = canon.relations

      const graphData = await persistExtractionToNeo4j(extractedEntities, extractedRelations)
      await saveGraphData(fileHash, graphData)

      await runQuery('CREATE (d:Document {name: $name, hash: $hash, processed: true, mode: $mode})', {
        name: fileName,
        hash: fileHash,
        mode: analysisMode,
      })
    }

    const analysisResult = await runDataAnalysis(chunks, fileName)
    analysisResult.mode = 'single'
    analysisResult.analysisMode = analysisMode
    analysisResult.entities = extractedEntities
    analysisResult.relations = extractedRelations

    const cachedGraph = await loadGraphData(fileHash)
    const cachedVizGraph = cachedGraph ? parseGraphDataForViz(cachedGraph) : null
    analysisResult.graphData = cachedVizGraph?.nodes?.length
      ? cachedVizGraph
      : buildGraphDataFromExtraction(extractedEntities, extractedRelations)

    if (!analysisResult.edges?.length) {
      analysisResult.edges = buildEdgesFromExtraction(extractedEntities, extractedRelations)
    }
    applyExtractionStatsFallback(analysisResult, extractedEntities, extractedRelations)

    analysisResult.themeTags = appState.themeValidation?.themeTags || []
    analysisResult.fullText = fullText
    Object.assign(analysisResult, enrichAnalysisResult(analysisResult, fullText, chunks))
    analysisResult.work1Metrics = computeWork1Metrics({
      entities: analysisResult.entities,
      relations: analysisResult.relations,
      docs: chunks.map((c) => c.text),
    })

    appState.fileProcessed = true
    appState.currentFile = fileName
    appState.currentFileHash = fileHash
    appState.analysisResult = analysisResult
    appState.lcDocsTexts = chunks.map((c) => c.text)

    return { success: true, fileName, fileHash, analysisResult }
  } finally {
    await fsp.unlink(file.path).catch(() => {})
  }
}

async function handleBatchUpload(event) {
  const { fields, files } = await readUploadParts(event, true)
  if (!files.length) throw apiError(400, '未选择文件', 'MISSING_FILE')

  const provider = fields.llmProvider || 'openai-compatible'
  const results = []

  for (const file of files.slice(0, 20)) {
    try {
      const article = await ingestArticle(file.path, file.originalname, provider)
      results.push({
        success: true,
        article: { id: article.id, title: article.title, themeTags: article.themeTags },
      })
    } catch (e) {
      results.push({ success: false, fileName: file.originalname, error: e.message })
    } finally {
      await fsp.unlink(file.path).catch(() => {})
    }
  }

  return { success: true, results, total: results.filter((r) => r.success).length }
}

async function getNeo4jSummary() {
  const [nodeRows, relRows, docRows, labelRows] = await Promise.all([
    runQuery('MATCH (n) RETURN count(n) AS count'),
    runQuery('MATCH ()-[r]->() RETURN count(r) AS count'),
    runQuery('MATCH (d:Document) RETURN count(d) AS count'),
    runQuery('CALL db.labels() YIELD label RETURN label ORDER BY label'),
  ])

  return {
    nodes: nodeRows[0]?.count || 0,
    relationships: relRows[0]?.count || 0,
    documents: docRows[0]?.count || 0,
    labels: labelRows.map((row) => row.label).filter(Boolean),
  }
}

async function clearGraphCache() {
  const entries = await fsp.readdir(CACHE_DIR).catch(() => [])
  const files = entries.filter((name) => name.endsWith('.json'))
  await Promise.all(files.map((name) => fsp.unlink(path.join(CACHE_DIR, name)).catch(() => {})))
  return files.length
}

async function clearNeo4jAnalysisData(includeCache = true) {
  const before = await getNeo4jSummary()
  await runQuery('MATCH (n) DETACH DELETE n')
  const deletedCacheFiles = includeCache ? await clearGraphCache() : 0
  appState = {}
  const after = await getNeo4jSummary()
  return {
    success: true,
    before,
    after,
    deleted: {
      nodes: before.nodes,
      relationships: before.relationships,
      documents: before.documents,
      cacheFiles: deletedCacheFiles,
    },
  }
}

async function routeRequest(event, pathname, method) {
  if (method === 'GET' && pathname === '/settings') {
    return {
      llm: {
        baseURL: config.llm.baseURL,
        model: config.llm.model,
        hasApiKey: Boolean(config.llm.apiKey),
      },
      embeddings: {
        type: 'lmstudio',
        baseURL: config.embeddings.lmstudio.baseURL,
        model: config.embeddings.lmstudio.model,
      },
      neo4j: {
        url: config.neo4j.url,
        username: config.neo4j.username,
      },
    }
  }

  if (method === 'POST' && pathname === '/test-llm') {
    const { baseURL, apiKey, model } = await readJsonBody(event)
    return testConnection({ baseURL, apiKey, model })
  }

  if (method === 'POST' && pathname === '/test-embeddings') {
    const { type, apiKey, baseURL, model } = await readJsonBody(event)
    return testEmbeddings(type, { apiKey, baseURL, model })
  }

  if (method === 'POST' && pathname === '/settings/embeddings') {
    const { type, baseURL, model } = await readJsonBody(event)
    if (type === 'openai') {
      return { success: true, message: 'OpenAI 嵌入设置已确认（使用 LLM API Key）' }
    }

    const updates = {}
    if (baseURL) updates.LM_STUDIO_BASE_URL = String(baseURL).trim()
    if (model) updates.LM_STUDIO_EMBED_MODEL = String(model).trim()
    await updateEnvFile(updates)
    config.setEmbeddingConfig({
      ...(updates.LM_STUDIO_BASE_URL ? { baseURL: updates.LM_STUDIO_BASE_URL } : {}),
      ...(updates.LM_STUDIO_EMBED_MODEL ? { model: updates.LM_STUDIO_EMBED_MODEL } : {}),
    })
    resetEmbeddings()

    return {
      success: true,
      baseURL: config.embeddings.lmstudio.baseURL,
      model: config.embeddings.lmstudio.model,
      message: 'LM Studio 嵌入设置已保存到本地 .env',
    }
  }

  if (method === 'POST' && pathname === '/settings/llm') {
    const { apiKey, model, baseURL } = await readJsonBody(event)
    if (!baseURL || typeof baseURL !== 'string') throw apiError(400, 'Base URL 不能为空', 'MISSING_BASE_URL')
    if (!model || typeof model !== 'string') throw apiError(400, '模型名称不能为空', 'MISSING_MODEL')

    const updates = {
      LLM_BASE_URL: baseURL.trim(),
      LLM_MODEL: model.trim(),
      LLM_API_KEY: String(apiKey || '').trim(),
    }
    await updateEnvFile(updates)
    config.setLLMConfig({
      apiKey: updates.LLM_API_KEY,
      model: updates.LLM_MODEL,
      baseURL: updates.LLM_BASE_URL,
    })

    return {
      success: true,
      model: config.llm.model,
      baseURL: config.llm.baseURL,
      message: 'API 设置已保存到本地 .env',
    }
  }

  if (method === 'POST' && pathname === '/neo4j/connect') {
    try {
      const { url, username, password } = await readJsonBody(event)
      const updates = {}
      if (url) updates.NEO4J_URL = String(url).trim()
      if (username) updates.NEO4J_USERNAME = String(username).trim()
      if (password) updates.NEO4J_PASSWORD = String(password).trim()
      if (Object.keys(updates).length) {
        await updateEnvFile(updates)
        config.neo4j = {
          ...config.neo4j,
          ...(updates.NEO4J_URL ? { url: updates.NEO4J_URL } : {}),
          ...(updates.NEO4J_USERNAME ? { username: updates.NEO4J_USERNAME } : {}),
          ...(updates.NEO4J_PASSWORD ? { password: updates.NEO4J_PASSWORD } : {}),
        }
        await closeDriver()
      }

      const driver = require('../services/neo4j').getDriver()
      await driver.verifyConnectivity()
      return { success: true, message: '已成功连接到Neo4j数据库' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  if (method === 'GET' && pathname === '/neo4j/summary') {
    return { success: true, summary: await getNeo4jSummary() }
  }

  if (method === 'POST' && pathname === '/neo4j/clear') {
    const { confirm, includeCache } = await readJsonBody(event)
    if (confirm !== 'DELETE') throw apiError(400, '清空数据库需要 confirm=DELETE', 'CONFIRM_REQUIRED')
    return clearNeo4jAnalysisData(includeCache !== false)
  }

  if (method === 'POST' && pathname === '/upload') return handleUpload(event)
  if (method === 'GET' && pathname === '/analysis') return appState.analysisResult || null
  if (method === 'GET' && pathname === '/state') return appState
  if (method === 'POST' && pathname === '/reset') {
    appState = {}
    return { success: true }
  }
  if (method === 'POST' && pathname === '/upload-batch') return handleBatchUpload(event)

  if (method === 'GET' && pathname === '/articles') {
    const query = getQuery(event)
    const index = await loadArticleIndex()
    const filtered = filterArticles(index, {
      themeTag: query.themeTag,
      keyword: query.keyword,
      minConfidence: query.minConfidence ? parseFloat(query.minConfidence) : undefined,
    })
    return {
      articles: filtered.map((a) => ({
        id: a.id,
        title: a.title,
        date: a.date,
        themeTags: a.themeTags,
        themeConfidence: a.themeConfidence,
        entityCount: a.entityCount,
        relationCount: a.relationCount,
        summary: (a.summary || '').slice(0, 150),
      })),
      total: filtered.length,
    }
  }

  if (method === 'POST' && pathname === '/analyze-multi') {
    const { articleIds, llmProvider } = await readJsonBody(event)
    if (!articleIds?.length) throw apiError(400, '请选择至少 2 篇文章', 'MISSING_ARTICLES')
    const result = await runJointAnalysis(articleIds, llmProvider || 'openai-compatible')
    const analysisResult = buildMultiAnalysisResult(result)
    appState.fileProcessed = true
    appState.currentFile = analysisResult.fileName
    appState.analysisResult = analysisResult
    appState.multiAnalysis = result
    return { success: true, analysisResult }
  }

  if (method === 'POST' && pathname === '/qa') {
    const { question, provider } = await readJsonBody(event)
    if (!question) throw apiError(400, '问题不能为空', 'MISSING_QUESTION')
    return answerQuestion(question, provider)
  }

  if (method === 'POST' && pathname === '/generate-notebook') {
    if (!appState.analysisResult) throw apiError(400, '请先完成单文或多文分析', 'NO_ANALYSIS')
    const { focusAreas, customRequest, llmProvider } = await readJsonBody(event)
    const result = await generateNotebook(appState.analysisResult, {
      focusAreas,
      customRequest,
      provider: llmProvider || 'openai-compatible',
      mode: appState.analysisResult.mode,
    })
    return {
      success: true,
      ephemeral: true,
      notebook: result.notebook,
      analysisData: result.analysisData,
      source: result.source,
      trace: result.trace || [],
      profile: result.profile || null,
      plan: result.plan || null,
      validation: result.validation || [],
    }
  }

  if (method === 'POST' && pathname === '/research-report/finalize') {
    return finalizeResearchReport(await readJsonBody(event))
  }

  if (method === 'GET' && pathname === '/research-reports') {
    const query = getQuery(event)
    await ensureSchema()
    const reports = await listResearchReports(parseInt(query.limit, 10) || 50)
    return { reports, total: reports.length }
  }

  const reportMatch = pathname.match(/^\/research-reports\/([^/]+)$/)
  if (method === 'GET' && reportMatch) {
    const report = await getResearchReport(reportMatch[1])
    if (!report) throw apiError(404, '报告不存在', 'REPORT_NOT_FOUND')
    return { report }
  }

  throw apiError(404, `未找到 API: ${method} ${pathname}`, 'NOT_FOUND')
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text)
  } catch {
    return null
  }
}

function compactText(text, max = 600) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function extractTerms(text) {
  const raw = String(text || '')
    .split(/[\s,，。！？；;:：、"'“”‘’()[\]{}<>《》|/\\]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
  const cjk = [...String(text || '').matchAll(/[\u4e00-\u9fa5A-Za-z0-9_-]{2,}/g)].map((m) => m[0])
  return [...new Set([...raw, ...cjk])].slice(0, 20)
}

function scoreTextByTerms(text, terms) {
  const lower = String(text || '').toLowerCase()
  return terms.reduce((score, term) => score + (lower.includes(String(term).toLowerCase()) ? 1 : 0), 0)
}

function sourceKey(source) {
  return `${source.type || ''}:${source.title || ''}:${source.content || ''}`.slice(0, 500)
}

async function planGraphRagQuestion(question, analysisResult, provider) {
  const knownEntities = (analysisResult.entities || analysisResult.entityData?.allNodes || [])
    .map((e) => e.name || e.id)
    .filter(Boolean)
    .slice(0, 80)
  const knownRelations = [...new Set((analysisResult.relations || []).map((r) => r.type).filter(Boolean))].slice(0, 40)
  const fallbackTerms = extractTerms(question)

  try {
    const response = await chat(
      [
        {
          role: 'system',
          content: `你是 GraphRAG 查询规划 Agent。请把用户问题拆成可检索计划，只输出 JSON。
字段:
{
  "intent": "用户真正想问什么",
  "search_queries": ["3-8 个中文/英文检索词或短语"],
  "entities": ["应重点查的实体名，必须尽量来自已知实体"],
  "relation_types": ["应重点查的关系类型"],
  "need_reports": true,
  "reasoning_steps": ["你会如何查证"]
}
不要回答问题，只规划检索。`,
        },
        {
          role: 'user',
          content: `问题: ${question}

已知实体样例: ${knownEntities.join(', ')}
已知关系类型: ${knownRelations.join(', ')}`,
        },
      ],
      provider || 'openai-compatible',
      { temperature: 0.1, maxTokens: 2000 }
    )
    const plan = parseJsonObject(response)
    if (plan) {
      return {
        intent: plan.intent || question,
        searchQueries: [...new Set([...(plan.search_queries || []), ...fallbackTerms])].slice(0, 12),
        entities: [...new Set(plan.entities || [])].slice(0, 12),
        relationTypes: [...new Set(plan.relation_types || [])].slice(0, 8),
        needReports: plan.need_reports !== false,
        reasoningSteps: plan.reasoning_steps || [],
      }
    }
  } catch (error) {
    console.warn('QA planning skipped:', error.message)
  }

  return {
    intent: question,
    searchQueries: fallbackTerms,
    entities: [],
    relationTypes: [],
    needReports: true,
    reasoningSteps: ['按问题关键词检索图谱节点、关系、文本块和历史报告'],
  }
}

function retrieveFromAnalysisResult(question, plan, analysisResult) {
  const terms = [...new Set([question, ...plan.searchQueries, ...plan.entities].filter(Boolean))]
  const sources = []

  const entities = analysisResult.entities || analysisResult.entityData?.allNodes || []
  for (const e of entities) {
    const content = [e.name || e.id, e.type, e.summary, e.text].filter(Boolean).join(' — ')
    const score = scoreTextByTerms(content, terms)
    if (score > 0 || plan.entities.some((name) => String(e.name || e.id || '').includes(name))) {
      sources.push({ type: 'entity', title: e.name || e.id, score: score + 2, content: compactText(content) })
    }
  }

  const relations = analysisResult.relations || []
  for (const r of relations) {
    const content = `${r.source} -[${r.type}]-> ${r.target}. ${r.summary || ''}`
    const score = scoreTextByTerms(content, terms) + (plan.relationTypes.includes(r.type) ? 2 : 0)
    if (score > 0) sources.push({ type: 'relation', title: r.type, score, content: compactText(content) })
  }

  const docs = appState.lcDocsTexts || analysisResult.docs || []
  const textChunks = docs.length ? docs : chunkText(analysisResult.fullText || '').map((text) => text)
  textChunks.forEach((text, index) => {
    const score = scoreTextByTerms(text, terms)
    if (score > 0) sources.push({ type: 'chunk', title: `文本块 ${index + 1}`, score, content: compactText(text, 900) })
  })

  const derived = [
    ...(analysisResult.insights || []).map((content, i) => ({ type: 'insight', title: `自动洞察 ${i + 1}`, content })),
    analysisResult.themeSummary ? { type: 'analysis', title: '主题摘要', content: analysisResult.themeSummary } : null,
    analysisResult.conflictEvolution ? { type: 'analysis', title: '冲突演化', content: analysisResult.conflictEvolution } : null,
    analysisResult.ruleMining ? { type: 'analysis', title: '规则挖掘', content: JSON.stringify(analysisResult.ruleMining).slice(0, 1200) } : null,
    analysisResult.kdd ? { type: 'analysis', title: 'KDD 聚类/主题', content: JSON.stringify(analysisResult.kdd).slice(0, 1200) } : null,
  ].filter(Boolean)

  derived.forEach((item) => {
    const score = scoreTextByTerms(item.content, terms)
    if (score > 0 || item.type === 'analysis') sources.push({ ...item, score: score + 0.5, content: compactText(item.content, 1000) })
  })

  return sources
}

async function retrieveFromNeo4j(plan) {
  const sources = []
  const terms = [...new Set([...plan.searchQueries, ...plan.entities].filter(Boolean))].slice(0, 12)

  for (const term of terms) {
    const nodeRows = await runQuery(
      `MATCH (n)
       WHERE (n.text IS NOT NULL AND toLower(n.text) CONTAINS toLower($term))
          OR (n.id IS NOT NULL AND toLower(toString(n.id)) CONTAINS toLower($term))
          OR (n.summary IS NOT NULL AND toLower(n.summary) CONTAINS toLower($term))
       OPTIONAL MATCH (n)-[r]-(m)
       RETURN coalesce(n.id, n.name, n.text) AS title,
              labels(n) AS labels,
              n.text AS text,
              n.summary AS summary,
              collect(DISTINCT coalesce(n.id, n.name, n.text) + ' -[' + type(r) + ']- ' + coalesce(m.id, m.name, m.text))[0..8] AS neighborhood
       LIMIT 5`,
      { term }
    )
    for (const row of nodeRows) {
      sources.push({
        type: 'neo4j-node',
        title: row.title || term,
        score: 2,
        content: compactText(`${(row.labels || []).join('/')} ${row.text || ''} ${row.summary || ''} ${(row.neighborhood || []).join('; ')}`, 1000),
      })
    }
  }

  if (plan.needReports) {
    const reportRows = await runQuery(
      `MATCH (r:ResearchReport)
       WHERE any(term IN $terms WHERE toLower(r.markdown) CONTAINS toLower(term)
          OR toLower(r.title) CONTAINS toLower(term))
       RETURN r.title AS title, r.createdAt AS createdAt, r.markdown AS markdown, r.highlights AS highlights
       ORDER BY r.createdAt DESC
       LIMIT 3`,
      { terms }
    ).catch(() => [])
    for (const row of reportRows) {
      sources.push({
        type: 'research-report',
        title: row.title,
        score: 1.5,
        content: compactText([row.createdAt, ...(row.highlights || []), row.markdown].filter(Boolean).join('\n'), 1200),
      })
    }
  }

  return sources
}

async function retrieveVectorEvidence(question) {
  try {
    const embeddings = new LocalEmbeddings()
    const questionEmbedding = await embeddings.embedQuery(question)
    const vectorResults = await runQuery(
      `CALL db.index.vector.queryNodes('vector_index', 8, $embedding)
       YIELD node, score
       WHERE node.text IS NOT NULL AND score > 0.25
       RETURN coalesce(node.id, node.name, node.text) AS title, node.text AS content, score
       ORDER BY score DESC`,
      { embedding: questionEmbedding }
    )
    return vectorResults.map((r) => ({
      type: 'vector',
      title: r.title,
      score: Number(r.score || 0),
      content: compactText(r.content, 900),
    }))
  } catch (error) {
    console.warn('Vector QA lookup skipped:', error.message)
    return []
  }
}

async function answerQuestion(question, provider) {
  const analysisResult = appState.analysisResult
  if (!analysisResult) throw apiError(400, '请先完成单文或多文分析', 'NO_ANALYSIS')

  const plan = await planGraphRagQuestion(question, analysisResult, provider)
  const sources = [
    ...retrieveFromAnalysisResult(question, plan, analysisResult),
    ...(await retrieveFromNeo4j(plan).catch((error) => {
      console.warn('Neo4j QA lookup skipped:', error.message)
      return []
    })),
    ...(await retrieveVectorEvidence(question)),
  ]

  const deduped = []
  const seen = new Set()
  for (const source of sources.sort((a, b) => (b.score || 0) - (a.score || 0))) {
    const key = sourceKey(source)
    if (!source.content || seen.has(key)) continue
    seen.add(key)
    deduped.push(source)
    if (deduped.length >= 18) break
  }

  if (!deduped.length) {
    return {
      answer: '未找到足够证据。建议换用更具体的实体名、事件名、国家/组织名称，或先重新运行文档分析。',
      sources: [],
      trace: plan,
    }
  }

  const evidence = deduped
    .map((s, i) => `[${i + 1}] 类型=${s.type} 标题=${s.title || '-'} 相关度=${Number(s.score || 0).toFixed(2)}\n${s.content}`)
    .join('\n\n')

  const llmResponse = await chat(
    [
      {
        role: 'system',
        content: `你是 GraphRAG + Agentic 分析问答助手。你必须:
1. 先理解问题意图，再综合图谱节点、关系、文本块、自动洞察和历史报告。
2. 只基于证据回答；证据不足时明确说不足。
3. 回答要给出关键实体、关系链、依据编号，例如 [1][3]。
4. 如果问题有歧义，说明你采用的解释。`,
      },
      {
        role: 'user',
        content: `问题:
${question}

检索计划:
${JSON.stringify(plan, null, 2)}

证据:
${evidence}

请用中文回答，先给结论，再列依据和不确定性。`,
      },
    ],
    provider || 'openai-compatible',
    { temperature: 0.2, maxTokens: 6000 }
  )

  return {
    answer: llmResponse,
    sources: deduped,
    trace: plan,
  }
}

async function finalizeResearchReport(payload) {
  const analysisResult = appState.analysisResult
  if (!analysisResult) throw apiError(400, '请先完成文章分析', 'NO_ANALYSIS')

  const { charts, executionLog, llmProvider } = payload
  if (!charts?.length) throw apiError(400, '需要至少一张可视化图表', 'MISSING_CHARTS')

  const analysisSummary = {
    entityCount: analysisResult.entities?.length || analysisResult.stats?.meta?.totalEntities || 0,
    relationCount: analysisResult.relations?.length || analysisResult.stats?.meta?.totalRelations || 0,
    ruleEventCount: analysisResult.ruleMining?.eventCount || 0,
    kddClusters: analysisResult.kdd?.clusterCount || 0,
  }

  const articles = analysisResult.articles || [
    {
      title: analysisResult.stats?.meta?.title || appState.currentFile || '当前文档',
    },
  ]

  const reportContent = await writeResearchReport(
    {
      title:
        analysisResult.mode === 'multi'
          ? `多文联合研究报告 (${articles.length} 篇)`
          : `研究报告: ${articles[0]?.title || '中东冲突分析'}`,
      mode: analysisResult.mode || 'single',
      articles,
      analysisSummary,
      chartDescriptions: charts.map((c) => ({
        title: c.title,
        description: c.description,
        stdout: c.stdout,
      })),
      executionLog,
      profile: payload.profile,
      themeSummary: analysisResult.themeSummary || analysisResult.jointAnalysis?.themeSummary,
      conflictEvolution: analysisResult.conflictEvolution || analysisResult.jointAnalysis?.conflictEvolution,
    },
    llmProvider || 'openai-compatible'
  )

  const saved = await saveResearchReport({
    title: reportContent.title,
    mode: analysisResult.mode || 'single',
    markdown: reportContent.markdown,
    highlights: reportContent.highlights,
    riskLevel: reportContent.riskLevel,
    reportSource: reportContent.source,
    articles,
    themeTags: analysisResult.themeTags || [],
    analysisSummary,
    charts: charts.map((c) => ({
      title: c.title,
      imageBase64: c.imageBase64,
    })),
    fileHash: appState.currentFileHash || '',
  })

  return {
    success: true,
    report: saved,
    markdown: reportContent.markdown,
    highlights: reportContent.highlights,
    riskLevel: reportContent.riskLevel,
    reportSource: reportContent.source,
  }
}

function buildMultiAnalysisResult(result) {
  const graphNodes = result.entities.map((e) => ({
    id: e.name || e.id,
    type: e.type,
    text: [e.name, e.summary].filter(Boolean).join(' — ').slice(0, 100),
  }))
  const graphLinks = result.relations.map((r) => ({
    source: r.source,
    target: r.target,
    type: r.type,
  }))

  return {
    mode: 'multi',
    fileName: `联合分析 (${result.articleCount} 篇)`,
    articles: result.articles,
    jointAnalysis: result.jointAnalysis,
    themeSummary: result.themeSummary,
    conflictEvolution: result.conflictEvolution,
    entities: result.entities,
    relations: result.relations,
    work1Metrics: result.work1Metrics,
    graphData: { nodes: graphNodes, links: graphLinks },
    stats: {
      meta: {
        title: `多文联合分析 (${result.articleCount} 篇)`,
        totalEntities: result.entities.length,
        totalRelations: result.relations.length,
      },
      entityDistribution: result.work1Metrics.entityTypeDist,
      relationDistribution: result.work1Metrics.relationTypeDist,
    },
    insights: [
      `联合分析 **${result.articleCount}** 篇同主题文章`,
      result.themeSummary ? `共同主题: **${result.themeSummary}**` : '',
      result.conflictEvolution ? `冲突演化: ${result.conflictEvolution}` : '',
    ].filter(Boolean),
    analysisComplete: true,
  }
}

function parseGraphDataForViz(cachedData) {
  const nodes = (cachedData.nodes || []).map((n) => ({
    id: String(n.id),
    type: n.type || 'Unknown',
    text: (n.properties?.text || n.id || '').slice(0, 100),
  }))

  const links = (cachedData.relationships || []).map((r) => ({
    source: String(r.source),
    target: String(r.target),
    type: r.type || 'UNKNOWN',
    source_type: 'Unknown',
    target_type: 'Unknown',
  }))

  return { nodes, links }
}

function buildGraphDataFromExtraction(entities, relations) {
  const entityMap = new Map()
  for (const entity of entities || []) {
    const id = String(entity.id || entity.name || '').trim()
    if (!id || entityMap.has(id)) continue
    entityMap.set(id, {
      id,
      type: entity.type || 'Unknown',
      text: [entity.name || id, entity.summary].filter(Boolean).join(' — ').slice(0, 160),
    })
  }

  const links = []
  for (const rel of relations || []) {
    const source = String(rel.source || '').trim()
    const target = String(rel.target || '').trim()
    if (!source || !target || !entityMap.has(source) || !entityMap.has(target)) continue
    links.push({
      source,
      target,
      type: rel.type || 'UNKNOWN',
      source_type: entityMap.get(source)?.type || 'Unknown',
      target_type: entityMap.get(target)?.type || 'Unknown',
    })
  }

  return { nodes: [...entityMap.values()], links }
}

function buildEdgesFromExtraction(entities, relations) {
  const typeById = new Map()
  const textById = new Map()
  for (const entity of entities || []) {
    const id = String(entity.id || entity.name || '').trim()
    if (!id) continue
    typeById.set(id, entity.type || 'Unknown')
    textById.set(id, [entity.name || id, entity.summary].filter(Boolean).join(' — ').slice(0, 160))
  }

  return (relations || []).map((rel) => {
    const source = String(rel.source || '').trim()
    const target = String(rel.target || '').trim()
    return {
      source_type: typeById.get(source) || 'Unknown',
      source_id: source,
      source_text: textById.get(source) || source,
      relation: rel.type || 'UNKNOWN',
      target_type: typeById.get(target) || 'Unknown',
      target_id: target,
      target_text: textById.get(target) || target,
    }
  })
}

function countBy(items, getKey) {
  return (items || []).reduce((acc, item) => {
    const key = getKey(item) || 'Unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

function applyExtractionStatsFallback(analysisResult, entities, relations) {
  analysisResult.stats = analysisResult.stats || {}
  analysisResult.stats.meta = analysisResult.stats.meta || {}

  const entityDistribution = countBy(entities, (entity) => entity.type)
  const relationDistribution = countBy(relations, (rel) => rel.type)

  if (!analysisResult.stats.meta.totalEntities) {
    analysisResult.stats.meta.totalEntities = (entities || []).length
  }
  if (!analysisResult.stats.meta.totalRelations) {
    analysisResult.stats.meta.totalRelations = (relations || []).length
  }
  if (!Object.keys(analysisResult.stats.entityDistribution || {}).length) {
    analysisResult.stats.entityDistribution = entityDistribution
  }
  if (!Object.keys(analysisResult.stats.relationDistribution || {}).length) {
    analysisResult.stats.relationDistribution = relationDistribution
  }
}

export default defineEventHandler(async (event) => {
  const method = event.method || event.node.req.method || 'GET'
  const pathname = normalizePath(event.context.params?.path)

  try {
    return await routeRequest(event, pathname, method)
  } catch (error) {
    if (error.statusCode) throw error
    console.error(`Nuxt API error: ${method} ${pathname}`, error)
    throw apiError(500, error.message || '服务器处理请求时发生错误', 'INTERNAL_SERVER_ERROR')
  }
})
