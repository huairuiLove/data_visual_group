const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const { runQuery } = require('../services/neo4j');
const { chat, testConnection } = require('../services/llm');
const { LocalEmbeddings, testEmbeddings } = require('../services/embeddings');
const {
  processDocument, generateFileHash, saveGraphData, loadGraphData,
} = require('../services/document');
const { runDataAnalysis } = require('../analysis/pipeline');
const { updateEnvFile } = require('../services/env');
const { AppError, sendError } = require('../services/errors');
const config = require('../config');

const router = express.Router();

// --- File upload ---
const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
const MAX_UPLOAD_SIZE = 200 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.doc', '.docx', '.pdf', '.tex',
  '.md', '.markdown', '.txt', '.text',
  '.csv', '.tsv', '.json', '.jsonl',
  '.log', '.rst', '.rtf', '.yaml', '.yml',
  '.xml', '.html', '.htm',
]);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ALLOWED_UPLOAD_EXTENSIONS.has(ext)) return cb(null, true);
    return cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', '仅支持 doc、docx、tex、markdown、pdf 和常见文本类文件'));
  },
});

// In-memory state (would use Redis/DB in production)
let appState = {};

// --- API: Test LLM connection ---
router.post('/test-llm', async (req, res) => {
  const { provider, apiKey, model } = req.body;
  const result = await testConnection(provider, apiKey, model);
  res.json(result);
});

// --- API: Test embeddings ---
router.post('/test-embeddings', async (req, res) => {
  const { type, apiKey, baseURL, model } = req.body;
  const result = await testEmbeddings(type, { apiKey, baseURL, model });
  res.json(result);
});

// --- API: Persist LLM settings to local .env ---
router.post('/settings/llm', async (req, res) => {
  try {
    const { provider, apiKey, model, baseURL } = req.body;
    if (!['deepseek', 'openai'].includes(provider)) {
      throw new AppError(400, 'INVALID_PROVIDER', '请选择有效的 API 类型');
    }
    if (!apiKey || typeof apiKey !== 'string') {
      throw new AppError(400, 'MISSING_API_KEY', 'API 密钥不能为空');
    }

    const envPrefix = provider === 'deepseek' ? 'DEEPSEEK' : 'OPENAI';
    const updates = {
      [`${envPrefix}_API_KEY`]: apiKey.trim(),
      [`${envPrefix}_MODEL`]: String(model || config.llm[provider].model).trim(),
    };

    if (baseURL) {
      updates[`${envPrefix}_BASE_URL`] = String(baseURL).trim();
    }

    await updateEnvFile(updates);
    config.setLLMConfig(provider, {
      apiKey: updates[`${envPrefix}_API_KEY`],
      model: updates[`${envPrefix}_MODEL`],
      ...(baseURL ? { baseURL: updates[`${envPrefix}_BASE_URL`] } : {}),
    });

    res.json({
      success: true,
      provider,
      model: config.llm[provider].model,
      message: 'API 设置已保存到本地 .env',
    });
  } catch (e) {
    sendError(res, e, 'Persist LLM settings error');
  }
});

// --- API: Connect to Neo4j ---
router.post('/neo4j/connect', async (req, res) => {
  try {
    // Neo4j credentials are loaded from local .env; the request body is kept for UI compatibility.
    const driver = require('../services/neo4j').getDriver();
    await driver.verifyConnectivity();
    res.json({ success: true, message: '已成功连接到Neo4j数据库' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// --- API: Upload and process document ---
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未选择文件' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileContent = await fsp.readFile(filePath);
    const fileHash = generateFileHash(fileContent);

    // Check if already processed in Neo4j
    const existing = await runQuery(
      'MATCH (d:Document {hash: $hash}) RETURN d',
      { hash: fileHash }
    );

    let needProcessing = existing.length === 0;

    // Process document into chunks
    const chunks = await processDocument(filePath, fileName);

    if (needProcessing) {
      // Clear database
      await runQuery('MATCH (n) DETACH DELETE n');

      // Build entity extraction prompt
      const nodeHint = config.graph.allowedNodes.map(t => `- ${t}`).join('\n');
      const relHint = config.graph.allowedRelationships.map(t => `- ${t}`).join('\n');

      const entityPrompt = `你是一个军事情报实体关系提取专家。从给定的文本片段中提取实体和关系。

## 允许的实体类型
${nodeHint}

## 允许的关系类型
${relHint}

## 输出格式 (严格JSON，不要markdown代码块)
{
    "nodes": [
        {"id": "实体唯一名称", "type": "实体类型(从允许列表选)"}
    ],
    "relationships": [
        {"source": "源实体名称", "target": "目标实体名称", "type": "关系类型(从允许列表选)"}
    ]
}

## 规则
1. 只提取文本中明确出现的信息，不要编造
2. 实体类型必须从允许列表中选择最适合的
3. 每个实体的id必须唯一，用具体名称(如"伊朗革命卫队"而非"军事组织A")
4. 关系中的source和target必须出现在nodes的id中
5. 如果不确定类型，宁可跳过也不要乱填`;

      // Process chunks through LLM
      const allNodes = [];
      const allRels = [];
      const seenNodeIds = new Set();

      for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i].text.slice(0, 2500);
        const provider = req.body.llmProvider || 'deepseek';

        try {
          const response = await chat([
            { role: 'system', content: entityPrompt },
            { role: 'user', content: `待提取文本:\n${text}` },
          ], provider);

          // Parse JSON from response
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);

            for (const node of (data.nodes || [])) {
              const nid = String(node.id).trim();
              const ntype = String(node.type).trim();
              if (config.graph.allowedNodes.includes(ntype) && nid && !seenNodeIds.has(nid)) {
                seenNodeIds.add(nid);
                allNodes.push({ id: nid, type: ntype, text: nid });

                // Add to Neo4j
                await runQuery(
                  `MERGE (n:\`${ntype}\` {id: $id}) SET n.text = $text`,
                  { id: nid, text: nid }
                );
              }
            }

            for (const rel of (data.relationships || [])) {
              const src = String(rel.source || '').trim();
              const tgt = String(rel.target || '').trim();
              const rtype = String(rel.type || '').trim();
              if (config.graph.allowedRelationships.includes(rtype) && seenNodeIds.has(src) && seenNodeIds.has(tgt)) {
                allRels.push({ source: src, target: tgt, type: rtype });
                await runQuery(
                  `MATCH (a {id: $src}), (b {id: $tgt})
                   MERGE (a)-[r:\`${rtype}\`]->(b)`,
                  { src, tgt }
                );
              }
            }
          }
        } catch (e) {
          console.error(`Chunk ${i} extraction failed:`, e.message);
        }
      }

      // Save graph data
      const graphData = {
        nodes: allNodes.map(n => ({ id: n.id, type: n.type, properties: { text: n.text } })),
        relationships: allRels.map(r => ({
          source: r.source, target: r.target, type: r.type, properties: {},
        })),
      };
      await saveGraphData(fileHash, graphData);

      // Mark document as processed
      await runQuery(
        'CREATE (d:Document {name: $name, hash: $hash, processed: true})',
        { name: fileName, hash: fileHash }
      );
    }

    // Run data analysis pipeline
    const analysisResult = await runDataAnalysis(chunks, fileName);

    // Try loading graph data from cache
    const cachedGraph = await loadGraphData(fileHash);
    if (cachedGraph) {
      analysisResult.graphData = parseGraphDataForViz(cachedGraph);
    }

    // Store in session state
    appState.fileProcessed = true;
    appState.currentFile = fileName;
    appState.currentFileHash = fileHash;
    appState.analysisResult = analysisResult;
    appState.lcDocsTexts = chunks.map(c => c.text);

    // Clean up uploaded file
    await fsp.unlink(filePath).catch(() => {});

    res.json({
      success: true,
      fileName,
      fileHash,
      analysisResult,
    });
  } catch (e) {
    sendError(res, e, 'Upload/process error');
  }
});

// --- API: Get analysis data ---
router.get('/analysis', (req, res) => {
  res.json(appState.analysisResult || null);
});

// --- API: Q&A endpoint ---
router.post('/qa', async (req, res) => {
  try {
    const { question, provider } = req.body;
    if (!question) {
      return res.status(400).json({ error: '问题不能为空' });
    }

    // Simple keyword-based search in Neo4j
    const terms = question.split(/[\s，。！？、]+/).filter(t => t.length >= 2);

    const results = [];
    for (const term of terms) {
      const termResults = await runQuery(
        `MATCH (n)
         WHERE n.text IS NOT NULL AND toLower(n.text) CONTAINS toLower($term)
         RETURN n.text AS content, 1.0 AS score
         LIMIT 3`,
        { term }
      );
      results.push(...termResults);
    }

    // Try vector search
    try {
      const embeddings = new LocalEmbeddings();
      const questionEmbedding = await embeddings.embedQuery(question);
      const vectorResults = await runQuery(
        `CALL db.index.vector.queryNodes('vector_index', 5, $embedding)
         YIELD node, score
         WHERE node.text IS NOT NULL AND score > 0.3
         RETURN node.text AS content, score
         ORDER BY score DESC`,
        { embedding: questionEmbedding }
      );
      results.push(...vectorResults);
    } catch {
      // Vector search is optional; keyword evidence still works without the index.
    }

    // Build context
    const seen = new Set();
    const context = [];
    for (const r of results) {
      if (r.content && !seen.has(r.content)) {
        seen.add(r.content);
        const scoreText = r.score ? `(相关度: ${Number(r.score).toFixed(2)})` : '';
        context.push(`- ${r.content} ${scoreText}`);
      }
    }

    if (!context.length) {
      return res.json({ answer: '未找到相关信息。', sources: [] });
    }

    const llmResponse = await chat([
      {
        role: 'user',
        content: `基于以下检索到的信息回答问题：

问题：${question}

检索到的信息：
${context.join('\n')}

请直接基于检索到的信息回答，如果信息不充分请说明。`,
      },
    ], provider || 'deepseek');

    res.json({ answer: llmResponse, sources: context });
  } catch (e) {
    sendError(res, e, 'Q&A error');
  }
});

// --- API: Get app state ---
router.get('/state', (req, res) => {
  res.json(appState);
});

// --- API: Reset ---
router.post('/reset', (req, res) => {
  appState = {};
  res.json({ success: true });
});

// Helper
function parseGraphDataForViz(cachedData) {
  const nodes = (cachedData.nodes || []).map(n => ({
    id: String(n.id),
    type: n.type || 'Unknown',
    text: (n.properties?.text || n.id || '').slice(0, 100),
  }));

  const links = (cachedData.relationships || []).map(r => ({
    source: String(r.source),
    target: String(r.target),
    type: r.type || 'UNKNOWN',
    source_type: 'Unknown',
    target_type: 'Unknown',
  }));

  return { nodes, links };
}

module.exports = { router, appState };
