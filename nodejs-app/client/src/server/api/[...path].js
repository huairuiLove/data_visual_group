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
  chunkDocument,
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
const TECHNICAL_NODE_LABELS = [
  'Document',
  'RagChunk',
  'RagSection',
  'RagParentChunk',
  'RagCommunity',
  'GraphRelation',
  'ResearchReport',
]
const TECHNICAL_REL_TYPES = [
  'HAS_CHUNK',
  'HAS_SECTION',
  'HAS_PARENT_CHUNK',
  'HAS_CHILD_CHUNK',
  'HAS_GRAPH_RELATION',
  'HAS_COMMUNITY',
  'CONTAINS_ENTITY',
  'AS_RELATION_SOURCE',
  'AS_RELATION_TARGET',
]

function businessLabel(labels = []) {
  return labels.find((label) => label !== 'VectorNode' && !TECHNICAL_NODE_LABELS.includes(label)) || ''
}

function isBusinessEntity(entity) {
  const type = String(entity?.type || '')
  return Boolean(entity?.id || entity?.name) && type && type !== 'VectorNode' && !TECHNICAL_NODE_LABELS.includes(type)
}

let appState = {}
let vectorIndexAvailable = null
const MAX_RAG_CHUNKS = 300

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

async function ensureVectorIndex(dimension) {
  if (!dimension) return false
  if (vectorIndexAvailable === true) return true

  const existing = await runQuery(
    `SHOW INDEXES
     YIELD name, type
     WHERE name = 'vector_index' AND type = 'VECTOR'
     RETURN name
     LIMIT 1`
  ).catch(() => [])
  if (existing.length) {
    vectorIndexAvailable = true
    return true
  }

  await runQuery(
    `CREATE VECTOR INDEX vector_index IF NOT EXISTS
     FOR (n:VectorNode) ON (n.embedding)
     OPTIONS {indexConfig: {
       \`vector.dimensions\`: ${Number(dimension)},
       \`vector.similarity_function\`: 'cosine'
     }}`
  )
  await runQuery('CALL db.awaitIndexes(30)').catch(() => {})
  vectorIndexAvailable = true
  return true
}

async function embedVectorNodes(items) {
  const candidates = items.filter((item) => item.id && item.text)
  if (!candidates.length) return { success: false, indexed: 0 }

  try {
    const embeddings = new LocalEmbeddings()
    let indexed = 0
    let dimension = 0

    for (const item of candidates) {
      const vector = await embeddings.embedQuery(item.text)
      dimension = dimension || vector.length
      await ensureVectorIndex(dimension)
      await item.persist(vector)
      indexed += 1
    }

    return { success: true, indexed }
  } catch (error) {
    vectorIndexAvailable = null
    console.warn('Vector embedding indexing skipped:', error.message)
    return { success: false, indexed: 0, message: error.message }
  }
}

async function ensureDocumentEmbedding(fileHash, fileName, fullText) {
  const text = compactText(fullText, 3000)
  if (!fileHash || !text) return { success: false, indexed: 0 }

  return embedVectorNodes([
    {
      id: fileHash,
      text: [fileName, text].filter(Boolean).join('\n'),
      persist: (embedding) =>
        runQuery(
          `MERGE (d:Document {hash: $hash})
           SET d:VectorNode,
               d.name = $name,
               d.text = $text,
               d.embedding = $embedding,
               d.embeddingText = $embeddingText,
               d.vectorKind = 'document'`,
          { hash: fileHash, name: fileName, text, embedding, embeddingText: [fileName, text].filter(Boolean).join('\n') }
        ),
    },
  ])
}

async function ensureSectionEmbeddings(fileHash, fileName, chunks) {
  const sectionMap = new Map()
  for (const chunk of chunks || []) {
    const key = chunk.sectionId || `${chunk.source || fileName}:section:0`
    const id = `${fileHash}:section:${sectionMap.size}:${String(chunk.sectionTitle || '全文').slice(0, 40)}`
    const existing = sectionMap.get(key)
    if (existing) {
      existing.texts.push(chunk.text)
      continue
    }
    sectionMap.set(key, {
      id,
      sourceSectionId: key,
      title: chunk.sectionTitle || '全文',
      path: chunk.sectionPath || [chunk.sectionTitle || '全文'],
      level: chunk.sectionLevel || 0,
      index: chunk.sectionIndex || 0,
      source: chunk.source || fileName,
      texts: [chunk.text],
    })
  }

  const sections = [...sectionMap.values()].map((section) => ({
    ...section,
    text: compactText(`${section.path.join(' > ')}\n${section.texts.join('\n')}`, 3000),
  }))

  if (!sections.length) return { success: false, indexed: 0, sectionMap: new Map() }

  await runQuery(
    `MATCH (:Document {hash: $hash})-[:HAS_SECTION]->(s:RagSection)
     DETACH DELETE s`,
    { hash: fileHash }
  ).catch(() => {})

  const indexed = await embedVectorNodes(
    sections.map((section) => ({
      id: section.id,
      text: section.text,
      persist: (embedding) =>
        runQuery(
          `MATCH (d:Document {hash: $hash})
           MERGE (s:RagSection {id: $id})
           SET s:VectorNode,
               s.title = $title,
               s.path = $path,
               s.level = $level,
               s.sectionIndex = $sectionIndex,
               s.source = $source,
               s.text = $text,
               s.embedding = $embedding,
               s.embeddingText = $text,
               s.vectorKind = 'section'
           MERGE (d)-[:HAS_SECTION]->(s)`,
          {
            hash: fileHash,
            id: section.id,
            title: section.title,
            path: section.path,
            level: section.level,
            sectionIndex: section.index,
            source: section.source,
            text: section.text,
            embedding,
          }
        ),
    }))
  )

  const idBySourceSection = new Map([...sectionMap.entries()].map(([sourceId, section]) => [sourceId, section.id]))
  return { ...indexed, sectionMap: idBySourceSection }
}

async function ensureParentChunkEmbeddings(fileHash, fileName, chunks, sectionMap = new Map()) {
  const parentMap = new Map()
  for (const chunk of chunks || []) {
    if (!chunk?.parentText) continue
    const parentId = `${fileHash}:parent:${chunk.parentIndex ?? parentMap.size}`
    if (!parentMap.has(parentId)) {
      parentMap.set(parentId, {
        id: parentId,
        sourceParentId: chunk.parentId,
        source: chunk.source || fileName,
        parentIndex: chunk.parentIndex ?? parentMap.size,
        text: compactText(chunk.parentText, 2600),
        sectionId: chunk.sectionId || '',
        sectionNodeId: sectionMap.get(chunk.sectionId || '') || '',
      })
    }
  }

  const parentItems = [...parentMap.values()].map((parent) => ({
    id: parent.id,
    text: parent.text,
    persist: (embedding) =>
      runQuery(
        `MATCH (d:Document {hash: $hash})
         OPTIONAL MATCH (s:RagSection {id: $sectionNodeId})
         MERGE (p:RagParentChunk {id: $id})
         SET p:VectorNode,
             p.text = $text,
             p.source = $source,
             p.parentIndex = $parentIndex,
             p.embedding = $embedding,
             p.embeddingText = $text,
             p.vectorKind = 'parent-chunk'
         MERGE (d)-[:HAS_PARENT_CHUNK]->(p)
         FOREACH (_ IN CASE WHEN s IS NULL THEN [] ELSE [1] END |
           MERGE (s)-[:HAS_PARENT_CHUNK]->(p)
         )`,
        {
          hash: fileHash,
          id: parent.id,
          sectionNodeId: parent.sectionNodeId || '',
          text: parent.text,
          source: parent.source || fileName,
          parentIndex: parent.parentIndex,
          embedding,
        }
      ),
  }))

  if (!parentItems.length) return { success: false, indexed: 0 }
  await runQuery(
    `MATCH (:Document {hash: $hash})-[:HAS_PARENT_CHUNK]->(p:RagParentChunk)
     DETACH DELETE p`,
    { hash: fileHash }
  ).catch(() => {})
  return embedVectorNodes(parentItems)
}

async function ensureChunkEmbeddings(fileHash, fileName, chunks, sectionMap = new Map()) {
  const chunkItems = (chunks || [])
    .slice(0, MAX_RAG_CHUNKS)
    .map((chunk, index) => {
      const text = compactText(typeof chunk === 'string' ? chunk : chunk.text, 1800)
      const id = `${fileHash}:chunk:${index}`
      const parentId = chunk?.parentText ? `${fileHash}:parent:${chunk.parentIndex ?? 0}` : ''
      const sourceName = chunk?.source || fileName
      const sectionNodeId = sectionMap.get(chunk?.sectionId || '') || ''
      return {
        id,
        text,
        persist: (embedding) =>
          runQuery(
            `MATCH (d:Document {hash: $hash})
             OPTIONAL MATCH (p:RagParentChunk {id: $parentId})
             OPTIONAL MATCH (s:RagSection {id: $sectionNodeId})
             MERGE (c:RagChunk {id: $id})
             SET c:VectorNode,
                 c.text = $text,
                 c.source = $source,
                 c.chunkIndex = $index,
                 c.parentIndex = $parentIndex,
                 c.sectionTitle = $sectionTitle,
                 c.embedding = $embedding,
                 c.embeddingText = $text,
                 c.vectorKind = 'chunk'
             MERGE (d)-[:HAS_CHUNK]->(c)
             FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END |
               MERGE (p)-[:HAS_CHILD_CHUNK]->(c)
             )
             FOREACH (_ IN CASE WHEN s IS NULL THEN [] ELSE [1] END |
               MERGE (s)-[:HAS_CHILD_CHUNK]->(c)
             )`,
            {
              hash: fileHash,
              parentId,
              sectionNodeId,
              id,
              text,
              source: sourceName,
              index,
              parentIndex: chunk?.parentIndex ?? null,
              sectionTitle: chunk?.sectionTitle || '',
              embedding,
            }
          ),
      }
    })

  if (!chunkItems.length) return { success: false, indexed: 0 }
  await runQuery(
    `MATCH (:Document {hash: $hash})-[:HAS_CHUNK]->(c:RagChunk)
     DETACH DELETE c`,
    { hash: fileHash }
  ).catch(() => {})
  return embedVectorNodes(chunkItems)
}

async function ensureEntityEmbeddings(entities, fileHash) {
  const candidates = (entities || [])
    .map((entity) => ({
      id: String(entity.name || entity.id || '').trim(),
      text: [entity.name || entity.id, entity.type, entity.summary, ...(entity.aliases || [])]
        .filter(Boolean)
        .join(' ')
        .slice(0, 1200),
    }))
    .filter((entity) => entity.id && entity.text)

  return embedVectorNodes(
    candidates.map((item) => ({
      ...item,
      persist: (embedding) =>
        runQuery(
          fileHash
            ? `MATCH (n {id: $id})
               MATCH (d:Document {hash: $hash})
               SET n:VectorNode,
                   n.embedding = $embedding,
                   n.embeddingText = $text,
                   n.vectorKind = 'entity'
               MERGE (d)-[:MENTIONS]->(n)`
            : `MATCH (n {id: $id})
               SET n:VectorNode,
                   n.embedding = $embedding,
                   n.embeddingText = $text,
                   n.vectorKind = 'entity'`,
          { id: item.id, hash: fileHash, embedding, text: item.text }
        ),
    }))
  )
}

async function ensureRelationEmbeddings(relations, fileHash) {
  const candidates = (relations || [])
    .map((rel, index) => {
      const source = String(rel.source || rel.source_id || '').trim()
      const target = String(rel.target || rel.target_id || '').trim()
      const type = String(rel.type || rel.relation || '关系').trim()
      const summary = rel.summary || ''
      return {
        id: `${fileHash}:relation:${index}:${source}->${target}`.slice(0, 220),
        source,
        target,
        relationType: type,
        text: compactText(`${source} -[${type}]-> ${target}. ${summary}`, 1200),
      }
    })
    .filter((rel) => rel.source && rel.target && rel.text)

  if (!candidates.length) return { success: false, indexed: 0 }
  await runQuery(
    `MATCH (:Document {hash: $hash})-[:HAS_GRAPH_RELATION]->(gr:GraphRelation)
     DETACH DELETE gr`,
    { hash: fileHash }
  ).catch(() => {})

  return embedVectorNodes(
    candidates.map((rel) => ({
      id: rel.id,
      text: rel.text,
      persist: (embedding) =>
        runQuery(
          `MATCH (d:Document {hash: $hash})
           OPTIONAL MATCH (s {id: $source})
           OPTIONAL MATCH (t {id: $target})
           MERGE (gr:GraphRelation {id: $id})
           SET gr:VectorNode,
               gr.source = $source,
               gr.target = $target,
               gr.relationType = $relationType,
               gr.text = $text,
               gr.embedding = $embedding,
               gr.embeddingText = $text,
               gr.vectorKind = 'graph-relation'
           MERGE (d)-[:HAS_GRAPH_RELATION]->(gr)
           FOREACH (_ IN CASE WHEN s IS NULL THEN [] ELSE [1] END |
             MERGE (s)-[:AS_RELATION_SOURCE]->(gr)
           )
           FOREACH (_ IN CASE WHEN t IS NULL THEN [] ELSE [1] END |
             MERGE (gr)-[:AS_RELATION_TARGET]->(t)
           )`,
          { hash: fileHash, id: rel.id, source: rel.source, target: rel.target, relationType: rel.relationType, text: rel.text, embedding }
        ),
    }))
  )
}

function buildCommunities(entities, relations) {
  const entityById = new Map((entities || []).map((e) => [String(e.id || e.name || '').trim(), e]))
  const adj = new Map()
  for (const id of entityById.keys()) adj.set(id, new Set())
  for (const rel of relations || []) {
    const source = String(rel.source || rel.source_id || '').trim()
    const target = String(rel.target || rel.target_id || '').trim()
    if (!source || !target || !adj.has(source) || !adj.has(target)) continue
    adj.get(source).add(target)
    adj.get(target).add(source)
  }

  const seen = new Set()
  const communities = []
  for (const id of adj.keys()) {
    if (seen.has(id)) continue
    const queue = [id]
    const members = []
    seen.add(id)
    while (queue.length) {
      const current = queue.shift()
      members.push(current)
      for (const next of adj.get(current) || []) {
        if (!seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    if (members.length < 2) continue
    const memberSet = new Set(members)
    const internalRelations = (relations || [])
      .filter((rel) => memberSet.has(String(rel.source || rel.source_id || '').trim()) && memberSet.has(String(rel.target || rel.target_id || '').trim()))
      .slice(0, 30)
    communities.push({
      members,
      internalRelations,
      text: compactText(
        `社区实体: ${members.join(', ')}\n关系: ${internalRelations.map((r) => `${r.source || r.source_id} -[${r.type || r.relation}]-> ${r.target || r.target_id}`).join('; ')}`,
        2500
      ),
    })
  }
  return communities.sort((a, b) => b.members.length - a.members.length).slice(0, 10)
}

async function ensureCommunityEmbeddings(entities, relations, fileHash) {
  const communities = buildCommunities(entities, relations)
  if (!communities.length) return { success: false, indexed: 0 }
  await runQuery(
    `MATCH (:Document {hash: $hash})-[:HAS_COMMUNITY]->(c:RagCommunity)
     DETACH DELETE c`,
    { hash: fileHash }
  ).catch(() => {})

  return embedVectorNodes(
    communities.map((community, index) => ({
      id: `${fileHash}:community:${index}`,
      text: community.text,
      persist: (embedding) =>
        runQuery(
          `MATCH (d:Document {hash: $hash})
           MERGE (c:RagCommunity {id: $id})
           SET c:VectorNode,
               c.members = $members,
               c.text = $text,
               c.embedding = $embedding,
               c.embeddingText = $text,
               c.vectorKind = 'community'
           MERGE (d)-[:HAS_COMMUNITY]->(c)
           WITH c
           UNWIND $members AS memberId
           MATCH (n {id: memberId})
           MERGE (c)-[:CONTAINS_ENTITY]->(n)`,
          { hash: fileHash, id: `${fileHash}:community:${index}`, members: community.members, text: community.text, embedding }
        ),
    }))
  )
}

async function linkChunksToMentionedEntities(fileHash, entities) {
  const entityIds = (entities || []).map((entity) => String(entity.name || entity.id || '').trim()).filter(Boolean)
  for (const id of entityIds.slice(0, 150)) {
    await runQuery(
      `MATCH (d:Document {hash: $hash})-[:HAS_CHUNK]->(c:RagChunk)
       MATCH (n {id: $id})
       WHERE c.text CONTAINS $id
       MERGE (c)-[:MENTIONS]->(n)`,
      { hash: fileHash, id }
    ).catch(() => {})
  }
}

async function ensureRagEmbeddings({ fileHash, fileName, fullText, chunks, entities, relations }) {
  await runQuery(
    `MERGE (d:Document {hash: $hash})
     SET d.name = $name,
         d.processed = true`,
    { hash: fileHash, name: fileName }
  )
  const [documentIndex, chunkIndex, entityIndex, relationIndex, communityIndex] = await Promise.all([
    ensureDocumentEmbedding(fileHash, fileName, fullText),
    ensureSectionEmbeddings(fileHash, fileName, chunks).then((sectionIndex) =>
      ensureParentChunkEmbeddings(fileHash, fileName, chunks, sectionIndex.sectionMap).then((parentIndex) =>
        ensureChunkEmbeddings(fileHash, fileName, chunks, sectionIndex.sectionMap).then((childIndex) => ({ sectionIndex, parentIndex, childIndex }))
      )
    ),
    ensureEntityEmbeddings(entities, fileHash),
    ensureRelationEmbeddings(relations, fileHash),
    ensureCommunityEmbeddings(entities, relations, fileHash),
  ])
  await linkChunksToMentionedEntities(fileHash, entities)
  return { documentIndex, chunkIndex, entityIndex, relationIndex, communityIndex }
}

async function handleUpload(event) {
  const { fields, files } = await readUploadParts(event, true)
  if (!files.length) throw apiError(400, '未选择文件', 'MISSING_FILE')

  try {
    const fileContents = []
    const allChunks = []
    const fileNames = []
    for (const file of files) {
      const fileName = file.originalname
      const typeCheck = validateFileType(fileName)
      if (!typeCheck.valid) throw apiError(415, `${fileName}: ${typeCheck.reason}`, 'UNSUPPORTED_FILE_TYPE')
      const fileContent = await fsp.readFile(file.path)
      fileContents.push(fileContent)
      fileNames.push(fileName)
      allChunks.push(...(await processDocument(file.path, fileName)))
    }

    const isMultiUpload = files.length > 1
    const fileName = isMultiUpload ? `联合上传 (${files.length} 篇): ${fileNames.join(', ')}` : fileNames[0]
    const fileHash = generateFileHash(Buffer.concat(fileContents))
    const provider = fields.llmProvider || 'openai-compatible'
    const analysisMode = fields.analysisMode || config.analysis.defaultMode

    const existing = await runQuery('MATCH (d:Document {hash: $hash}) RETURN d', { hash: fileHash })
    const needProcessing = existing.length === 0
    const chunks = allChunks
    const fullText = chunks.map((c) => c.text).join('\n')
    const articleMeta = parseArticleMeta(fullText)
    const bodyText = articleMeta.body && articleMeta.body.length > 100 ? articleMeta.body : fullText
    const bodyChunks =
      !isMultiUpload && bodyText !== fullText
        ? chunkDocument(bodyText, { source: fileName, page: 1 })
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
        title: isMultiUpload ? fileName : articleMeta.title || fileName,
        date: articleMeta.date || new Date().toISOString().slice(0, 10),
        source: isMultiUpload ? fileNames.join('; ') : articleMeta.source || '',
        summary: isMultiUpload ? `联合分析 ${files.length} 个首页上传文档` : articleMeta.summary || '',
      })
      const canon = applyCanonicalization(extraction.entities, extraction.relations)
      extractedEntities = canon.entities
      extractedRelations = canon.relations

      const graphData = await persistExtractionToNeo4j(extractedEntities, extractedRelations)
      await saveGraphData(fileHash, graphData)

      await runQuery('MERGE (d:Document {hash: $hash}) SET d.name = $name, d.processed = true, d.mode = $mode', {
        name: fileName,
        hash: fileHash,
        mode: analysisMode,
      })
    }

    await ensureRagEmbeddings({
      fileHash,
      fileName,
      fullText,
      chunks,
      entities: extractedEntities,
      relations: extractedRelations,
    })

    const analysisResult = await runDataAnalysis(chunks, fileName)
    analysisResult.mode = isMultiUpload ? 'multi' : 'single'
    analysisResult.analysisMode = analysisMode
    analysisResult.articles = fileNames.map((name, index) => ({ id: String(index + 1), title: name, source: name }))
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
    await Promise.all(files.map((file) => fsp.unlink(file.path).catch(() => {})))
  }
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

async function listUploadedDocuments() {
  const rows = await runQuery(
    `MATCH (d:Document)
     OPTIONAL MATCH (d)-[:HAS_CHUNK]->(c:RagChunk)
     OPTIONAL MATCH (d)-[:MENTIONS]->(e)
     OPTIONAL MATCH (d)-[:HAS_GRAPH_RELATION]->(gr:GraphRelation)
     RETURN d.hash AS hash,
            d.name AS name,
            d.mode AS mode,
            d.processed AS processed,
            d.text AS text,
            count(DISTINCT c) AS chunkCount,
            count(DISTINCT e) AS entityCount,
            count(DISTINCT gr) AS relationCount
     ORDER BY d.name`,
  ).catch(() => [])
  return rows
    .filter((row) => row.hash)
    .map((row) => ({
      hash: row.hash,
      name: row.name || row.hash,
      mode: row.mode || 'single',
      processed: Boolean(row.processed),
      chunkCount: row.chunkCount || 0,
      entityCount: row.entityCount || 0,
      relationCount: row.relationCount || 0,
      preview: compactText(row.text, 180),
    }))
}

async function analyzeExistingDocuments(hashes) {
  const selectedHashes = [...new Set((hashes || []).map((hash) => String(hash || '').trim()).filter(Boolean))]
  if (!selectedHashes.length) throw apiError(400, '请选择至少 1 篇已上传文档', 'MISSING_DOCUMENTS')

  const docRows = await runQuery(
    `MATCH (d:Document)
     WHERE d.hash IN $hashes
     RETURN d.hash AS hash, d.name AS name
     ORDER BY d.name`,
    { hashes: selectedHashes }
  )
  if (!docRows.length) throw apiError(404, '未找到已上传文档', 'DOCUMENTS_NOT_FOUND')

  const chunkRows = await runQuery(
    `MATCH (d:Document)-[:HAS_CHUNK]->(c:RagChunk)
     WHERE d.hash IN $hashes
     OPTIONAL MATCH (p:RagParentChunk)-[:HAS_CHILD_CHUNK]->(c)
     RETURN d.hash AS hash,
            d.name AS documentName,
            c.text AS text,
            c.source AS source,
            c.chunkIndex AS chunkIndex,
            c.childIndex AS childIndex,
            c.parentIndex AS parentIndex,
            c.sectionId AS sectionId,
            c.sectionTitle AS sectionTitle,
            c.sectionPath AS sectionPath,
            c.sectionLevel AS sectionLevel,
            p.text AS parentText
     ORDER BY d.name, c.chunkIndex`,
    { hashes: selectedHashes }
  )
  if (!chunkRows.length) throw apiError(422, '这些文档没有可用文本块，请在首页重新上传分析一次', 'NO_RAG_CHUNKS')

  const entityRows = await runQuery(
    `MATCH (d:Document)-[:MENTIONS]->(e)
     WHERE d.hash IN $hashes
       AND none(label IN labels(e) WHERE label IN $technicalLabels)
     RETURN DISTINCT coalesce(e.id, e.name) AS id,
            labels(e) AS labels,
            e.text AS text,
            e.summary AS summary,
            e.aliases AS aliases`,
    { hashes: selectedHashes, technicalLabels: TECHNICAL_NODE_LABELS }
  ).catch(() => [])

  const relationRows = await runQuery(
    `MATCH (d:Document)-[:HAS_GRAPH_RELATION]->(gr:GraphRelation)
     WHERE d.hash IN $hashes
     RETURN gr.source AS source,
            gr.target AS target,
            gr.relationType AS type,
            gr.text AS text`,
    { hashes: selectedHashes }
  ).catch(() => [])

  const chunks = chunkRows.map((row, index) => ({
    text: row.text,
    source: row.source || row.documentName,
    index,
    chunkIndex: row.chunkIndex,
    childIndex: row.childIndex,
    parentIndex: row.parentIndex,
    sectionId: row.sectionId,
    parentText: row.parentText,
    sectionTitle: row.sectionTitle,
    sectionPath: row.sectionPath,
    sectionLevel: row.sectionLevel,
  }))
  const fileName = docRows.length > 1
    ? `已上传文档联合分析 (${docRows.length} 篇)`
    : docRows[0].name
  const fullText = chunks.map((chunk) => chunk.text).join('\n')
  const entities = entityRows.map((row) => ({
    id: row.id,
    name: row.id,
    type: businessLabel(row.labels || []) || 'Unknown',
    text: row.text || row.id,
    summary: row.summary || '',
    aliases: row.aliases || [],
  })).filter(isBusinessEntity)
  const relations = relationRows.map((row) => ({
    source: row.source,
    target: row.target,
    type: row.type || '关系',
    summary: row.text || '',
  })).filter((rel) => rel.source && rel.target)

  const analysisResult = await runDataAnalysis(chunks, fileName)
  analysisResult.mode = docRows.length > 1 ? 'multi' : 'single'
  analysisResult.analysisMode = 'existing_documents'
  analysisResult.articles = docRows.map((row) => ({ id: row.hash, title: row.name, hash: row.hash }))
  analysisResult.entities = entities
  analysisResult.relations = relations
  analysisResult.graphData = buildGraphDataFromExtraction(entities, relations)
  analysisResult.edges = buildEdgesFromExtraction(entities, relations)
  applyExtractionStatsFallback(analysisResult, entities, relations)
  analysisResult.fullText = fullText
  Object.assign(analysisResult, enrichAnalysisResult(analysisResult, fullText, chunks))
  analysisResult.work1Metrics = computeWork1Metrics({
    entities,
    relations,
    docs: chunks.map((chunk) => chunk.text),
  })

  appState.fileProcessed = true
  appState.currentFile = fileName
  appState.currentFileHash = selectedHashes.join(',')
  appState.analysisResult = analysisResult
  appState.lcDocsTexts = chunks.map((chunk) => chunk.text)

  return {
    success: true,
    fileName,
    fileHash: appState.currentFileHash,
    analysisResult,
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
  vectorIndexAvailable = null
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
  if (method === 'GET' && pathname === '/documents') {
    return { success: true, documents: await listUploadedDocuments() }
  }
  if (method === 'POST' && pathname === '/documents/analyze') {
    const { hashes } = await readJsonBody(event)
    return analyzeExistingDocuments(hashes)
  }
  if (method === 'GET' && pathname === '/analysis') return appState.analysisResult || null
  if (method === 'GET' && pathname === '/state') return appState
  if (method === 'POST' && pathname === '/reset') {
    appState = {}
    return { success: true }
  }
  if (method === 'POST' && pathname === '/qa') {
    const { question, provider } = await readJsonBody(event)
    if (!question) throw apiError(400, '问题不能为空', 'MISSING_QUESTION')
    return answerQuestion(question, provider)
  }

  if (method === 'POST' && pathname === '/generate-notebook') {
    if (!appState.analysisResult) throw apiError(400, '请先在首页上传并完成分析', 'NO_ANALYSIS')
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
       WHERE none(label IN labels(n) WHERE label IN $technicalLabels)
         AND ((n.text IS NOT NULL AND toLower(n.text) CONTAINS toLower($term))
          OR (n.id IS NOT NULL AND toLower(toString(n.id)) CONTAINS toLower($term))
          OR (n.summary IS NOT NULL AND toLower(n.summary) CONTAINS toLower($term)))
       OPTIONAL MATCH (n)-[r]-(m)
       WHERE m IS NULL OR (
         none(label IN labels(m) WHERE label IN $technicalLabels)
         AND NOT type(r) IN $technicalRelTypes
       )
       RETURN coalesce(n.id, n.name, n.text) AS title,
              labels(n) AS labels,
              n.text AS text,
              n.summary AS summary,
              collect(DISTINCT coalesce(n.id, n.name, n.text) + ' -[' + type(r) + ']- ' + coalesce(m.id, m.name, m.text))[0..8] AS neighborhood
       LIMIT 5`,
      { term, technicalLabels: TECHNICAL_NODE_LABELS, technicalRelTypes: TECHNICAL_REL_TYPES }
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

async function retrieveGraphStructureEvidence(plan) {
  const terms = [...new Set([...plan.searchQueries, ...plan.entities, ...plan.relationTypes].filter(Boolean))].slice(0, 16)
  if (!terms.length) return []
  const sources = []

  const sectionRows = await runQuery(
    `MATCH (s:RagSection)
     WHERE any(term IN $terms WHERE toLower(s.text) CONTAINS toLower(term)
        OR toLower(s.title) CONTAINS toLower(term))
     OPTIONAL MATCH (s)-[:HAS_PARENT_CHUNK]->(p:RagParentChunk)
     RETURN s.title AS title, s.path AS path, s.text AS text, collect(p.text)[0..2] AS parents
     LIMIT 6`,
    { terms }
  ).catch(() => [])
  for (const row of sectionRows) {
    sources.push({
      type: 'section',
      title: row.title,
      score: 3,
      content: compactText(`章节路径: ${(row.path || []).join(' > ')}\n${row.text || ''}\n父块: ${(row.parents || []).join('\n')}`, 1400),
    })
  }

  const relationRows = await runQuery(
    `MATCH (gr:GraphRelation)
     WHERE any(term IN $terms WHERE toLower(gr.text) CONTAINS toLower(term)
        OR toLower(gr.source) CONTAINS toLower(term)
        OR toLower(gr.target) CONTAINS toLower(term)
        OR toLower(gr.relationType) CONTAINS toLower(term))
     OPTIONAL MATCH (src)-[:AS_RELATION_SOURCE]->(gr)-[:AS_RELATION_TARGET]->(dst)
     OPTIONAL MATCH (src)-[r]-(mid)
     RETURN gr.source AS source, gr.target AS target, gr.relationType AS relationType, gr.text AS text,
            collect(DISTINCT coalesce(src.id, src.name, src.text) + ' -[' + type(r) + ']- ' + coalesce(mid.id, mid.name, mid.text))[0..5] AS sourceNeighborhood
     LIMIT 8`,
    { terms }
  ).catch(() => [])
  for (const row of relationRows) {
    sources.push({
      type: 'graph-relation',
      title: `${row.source} -[${row.relationType}]-> ${row.target}`,
      score: 3.5,
      content: compactText(`${row.text || ''}\n源实体邻域: ${(row.sourceNeighborhood || []).join('; ')}`, 1400),
    })
  }

  const communityRows = await runQuery(
    `MATCH (c:RagCommunity)
     WHERE any(term IN $terms WHERE toLower(c.text) CONTAINS toLower(term)
        OR any(member IN c.members WHERE toLower(member) CONTAINS toLower(term)))
     OPTIONAL MATCH (c)-[:CONTAINS_ENTITY]->(n)
     RETURN c.id AS id, c.members AS members, c.text AS text,
            collect(DISTINCT labels(n)[0] + ':' + coalesce(n.id, n.name, n.text))[0..12] AS entities
     LIMIT 5`,
    { terms }
  ).catch(() => [])
  for (const row of communityRows) {
    sources.push({
      type: 'community',
      title: row.id,
      score: 2.8,
      content: compactText(`社区成员: ${(row.members || []).join(', ')}\n${row.text || ''}\n实体类型: ${(row.entities || []).join('; ')}`, 1600),
    })
  }

  const entityNames = plan.entities.filter(Boolean).slice(0, 6)
  for (let i = 0; i < entityNames.length; i++) {
    for (let j = i + 1; j < entityNames.length; j++) {
      const pathRows = await runQuery(
        `MATCH (a), (b)
         WHERE (toLower(coalesce(a.id, a.name, a.text, '')) CONTAINS toLower($a))
           AND (toLower(coalesce(b.id, b.name, b.text, '')) CONTAINS toLower($b))
         MATCH p = shortestPath((a)-[*..3]-(b))
         WHERE all(n IN nodes(p) WHERE NOT n:RagChunk)
         RETURN [n IN nodes(p) | coalesce(n.id, n.name, n.title, n.text)] AS nodes,
                [r IN relationships(p) | type(r)] AS rels
         LIMIT 2`,
        { a: entityNames[i], b: entityNames[j] }
      ).catch(() => [])
      for (const row of pathRows) {
        const pathText = (row.nodes || []).map((node, idx) => (idx < (row.rels || []).length ? `${node} -[${row.rels[idx]}]->` : node)).join(' ')
        sources.push({ type: 'graph-path', title: `${entityNames[i]} ↔ ${entityNames[j]}`, score: 4, content: compactText(pathText, 1200) })
      }
    }
  }

  return sources
}

async function retrieveVectorEvidence(question, analysisResult) {
  try {
    if (vectorIndexAvailable !== true) {
      const indexes = await runQuery(
        `SHOW INDEXES
         YIELD name, type
         WHERE name = 'vector_index' AND type = 'VECTOR'
         RETURN name
         LIMIT 1`
      ).catch(() => [])
      vectorIndexAvailable = indexes.length > 0
      if (!vectorIndexAvailable) {
        await ensureRagEmbeddings({
          fileHash: appState.currentFileHash || 'current-analysis',
          fileName: appState.currentFile || analysisResult?.fileName || '当前分析',
          fullText: analysisResult?.fullText || (analysisResult?.docs || []).join('\n'),
          chunks: (appState.lcDocsTexts || analysisResult?.docs || []).map((text, index) => ({ text, index })),
          entities: analysisResult?.entities || [],
          relations: analysisResult?.relations || [],
        })
      }
      if (!vectorIndexAvailable) return []
    }

    const embeddings = new LocalEmbeddings()
    const questionEmbedding = await embeddings.embedQuery(question)
    const vectorResults = await runQuery(
      `CALL db.index.vector.queryNodes('vector_index', 16, $embedding)
       YIELD node, score
       WHERE node.embedding IS NOT NULL AND score > 0.25
       OPTIONAL MATCH (node)-[r]-(neighbor)
       OPTIONAL MATCH (parent:RagParentChunk)-[:HAS_CHILD_CHUNK]->(node)
       RETURN coalesce(node.name, node.id, node.source, node.text) AS title,
              coalesce(node.vectorKind, head(labels(node)), 'vector') AS kind,
              labels(node) AS labels,
              coalesce(node.text, node.embeddingText, node.summary) AS content,
              parent.text AS parentText,
              collect(DISTINCT type(r) + ':' + coalesce(neighbor.name, neighbor.id, neighbor.text))[0..6] AS neighborhood,
              score
       ORDER BY score DESC`,
      { embedding: questionEmbedding }
    )
    return vectorResults.map((r) => ({
      type: `vector-${r.kind || 'node'}`,
      title: r.title,
      score: Number(r.score || 0) * 4,
      content: compactText(
        `${(r.labels || []).join('/')} ${r.content || ''} ${r.parentText ? `父块上下文: ${r.parentText}` : ''} ${(r.neighborhood || []).join('; ')}`,
        r.kind === 'chunk' ? 1400 : 1000
      ),
    }))
  } catch (error) {
    if (String(error.message || '').includes('There is no such vector schema index')) {
      vectorIndexAvailable = false
      return []
    }
    console.warn('Vector QA lookup skipped:', error.message)
    return []
  }
}

async function answerQuestion(question, provider) {
  const analysisResult = appState.analysisResult
  if (!analysisResult) throw apiError(400, '请先在首页上传并完成分析', 'NO_ANALYSIS')

  const plan = await planGraphRagQuestion(question, analysisResult, provider)
  const sources = [
    ...retrieveFromAnalysisResult(question, plan, analysisResult),
    ...(await retrieveFromNeo4j(plan).catch((error) => {
      console.warn('Neo4j QA lookup skipped:', error.message)
      return []
    })),
    ...(await retrieveGraphStructureEvidence(plan).catch((error) => {
      console.warn('GraphRAG structure lookup skipped:', error.message)
      return []
    })),
    ...(await retrieveVectorEvidence(question, analysisResult)),
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
1. 先理解问题意图，再综合章节、父子文本块、实体、关系节点、实体路径、社区、自动洞察和历史报告。
2. 只基于证据回答；证据不足时明确说不足。
3. 回答要给出关键实体、关系链/路径、章节或文本依据编号，例如 [1][3]。
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
          ? `多文全局研究报告 (${articles.length} 篇)`
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

function parseGraphDataForViz(cachedData) {
  const nodes = (cachedData.nodes || []).map((n) => ({
    id: String(n.id),
    type: n.type || 'Unknown',
    text: (n.properties?.text || n.id || '').slice(0, 100),
  }))
  const typeById = new Map(nodes.map((node) => [node.id, node.type || 'Unknown']))

  const links = (cachedData.relationships || []).map((r) => ({
    source: String(r.source),
    target: String(r.target),
    type: r.type || 'UNKNOWN',
    source_type: typeById.get(String(r.source)) || 'Unknown',
    target_type: typeById.get(String(r.target)) || 'Unknown',
  }))

  return { nodes, links }
}

function buildGraphDataFromExtraction(entities, relations) {
  const entityMap = new Map()
  for (const entity of entities || []) {
    const id = String(entity.id || entity.name || '').trim()
    if (!id || entityMap.has(id) || !isBusinessEntity({ ...entity, id })) continue
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
    const type = rel.type || 'UNKNOWN'
    if (!source || !target || !entityMap.has(source) || !entityMap.has(target) || TECHNICAL_REL_TYPES.includes(type)) continue
    links.push({
      source,
      target,
      type,
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
    const relation = rel.type || 'UNKNOWN'
    if (TECHNICAL_REL_TYPES.includes(relation)) return null
    return {
      source_type: typeById.get(source) || 'Unknown',
      source_id: source,
      source_text: textById.get(source) || source,
      relation,
      target_type: typeById.get(target) || 'Unknown',
      target_id: target,
      target_text: textById.get(target) || target,
    }
  }).filter(Boolean)
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
