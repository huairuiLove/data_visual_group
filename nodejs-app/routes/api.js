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
const { computeWork1Metrics, enrichAnalysisResult } = require('../analysis/work1-metrics');
const { applyCanonicalization } = require('../services/entity-canonicalization');
const { updateEnvFile } = require('../services/env');
const { AppError, sendError } = require('../services/errors');
const { validateFileType, validateMiddleEastTheme } = require('../services/article-filter');
const { extractFromChunks } = require('../services/extraction');
const { generateNotebook } = require('../services/notebook-generator');
const { writeResearchReport } = require('../services/agents/report-writer');
const { saveResearchReport, listResearchReports, getResearchReport, ensureSchema } = require('../services/research-report-db');
const {
  loadArticleIndex, ingestArticle, filterArticles, runJointAnalysis,
} = require('../services/multi-article');
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

async function persistExtractionToNeo4j(entities, relations) {
  await runQuery('MATCH (n) WHERE NOT n:Document DETACH DELETE n');

  const seenNodeIds = new Set();
  const allNodes = [];
  const allRels = [];

  for (const entity of entities) {
    const nid = String(entity.name || entity.id).trim();
    const ntype = String(entity.type).trim();
    const label = config.graph.allowedNodes.includes(ntype) ? ntype : ntype;
    if (!nid || seenNodeIds.has(nid)) continue;
    seenNodeIds.add(nid);
    const text = [nid, entity.summary].filter(Boolean).join(' — ').slice(0, 200);
    allNodes.push({ id: nid, type: ntype, text, summary: entity.summary || '' });

    await runQuery(
      `MERGE (n:\`${label}\` {id: $id})
       SET n.text = $text, n.summary = $summary, n.aliases = $aliases`,
      { id: nid, text, summary: entity.summary || '', aliases: entity.aliases || [] },
    );
  }

  for (const rel of relations) {
    const src = String(rel.source).trim();
    const tgt = String(rel.target).trim();
    const rtype = String(rel.type).trim();
    if (!seenNodeIds.has(src) || !seenNodeIds.has(tgt)) continue;
    allRels.push({ source: src, target: tgt, type: rtype });
    await runQuery(
      `MATCH (a {id: $src}), (b {id: $tgt})
       MERGE (a)-[r:\`${rtype}\`]->(b)
       SET r.summary = $summary`,
      { src, tgt, summary: rel.summary || '' },
    );
  }

  return {
    nodes: allNodes.map(n => ({ id: n.id, type: n.type, properties: { text: n.text, summary: n.summary } })),
    relationships: allRels.map(r => ({ source: r.source, target: r.target, type: r.type, properties: {} })),
  };
}

// --- API: Upload and process document ---
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未选择文件' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const typeCheck = validateFileType(fileName);
    if (!typeCheck.valid) {
      await fsp.unlink(filePath).catch(() => {});
      throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', typeCheck.reason);
    }

    const fileContent = await fsp.readFile(filePath);
    const fileHash = generateFileHash(fileContent);
    const provider = req.body.llmProvider || 'deepseek';
    const analysisMode = req.body.analysisMode || config.analysis.defaultMode;

    const existing = await runQuery(
      'MATCH (d:Document {hash: $hash}) RETURN d',
      { hash: fileHash },
    );

    const needProcessing = existing.length === 0;
    const chunks = await processDocument(filePath, fileName);
    const fullText = chunks.map(c => c.text).join('\n');

    if (config.analysis.requireMiddleEastTheme) {
      const theme = await validateMiddleEastTheme(fullText, provider);
      if (!theme.isValid) {
        await fsp.unlink(filePath).catch(() => {});
        throw new AppError(422, 'THEME_MISMATCH', `文章主题不符合中东冲突要求: ${theme.reason}`);
      }
      appState.themeValidation = theme;
    }

    let extractedEntities = [];
    let extractedRelations = [];

    if (!needProcessing) {
      const cachedGraph = await loadGraphData(fileHash);
      if (cachedGraph) {
        extractedEntities = (cachedGraph.nodes || []).map(n => ({
          id: n.id,
          name: n.id,
          type: n.type,
          summary: n.properties?.summary || '',
          aliases: n.properties?.aliases || [],
        }));
        extractedRelations = (cachedGraph.relationships || []).map(r => ({
          source: r.source,
          target: r.target,
          type: r.type,
        }));
      }
    }

    if (needProcessing) {
      const extraction = await extractFromChunks(chunks, analysisMode, provider, {
        title: fileName,
        date: new Date().toISOString().slice(0, 10),
      });
      const canon = applyCanonicalization(extraction.entities, extraction.relations);
      extractedEntities = canon.entities;
      extractedRelations = canon.relations;

      const graphData = await persistExtractionToNeo4j(extractedEntities, extractedRelations);
      await saveGraphData(fileHash, graphData);

      await runQuery(
        'CREATE (d:Document {name: $name, hash: $hash, processed: true, mode: $mode})',
        { name: fileName, hash: fileHash, mode: analysisMode },
      );
    }

    const analysisResult = await runDataAnalysis(chunks, fileName);

    // Try loading graph data from cache
    const cachedGraph = await loadGraphData(fileHash);
    if (cachedGraph) {
      analysisResult.graphData = parseGraphDataForViz(cachedGraph);
    }

    analysisResult.mode = 'single';
    analysisResult.analysisMode = analysisMode;
    analysisResult.entities = extractedEntities;
    analysisResult.relations = extractedRelations;
    analysisResult.themeTags = appState.themeValidation?.themeTags || [];
    analysisResult.fullText = fullText;

    const enriched = enrichAnalysisResult(analysisResult, fullText, chunks);
    Object.assign(analysisResult, enriched);
    analysisResult.work1Metrics = computeWork1Metrics({
      entities: analysisResult.entities,
      relations: analysisResult.relations,
      docs: chunks.map(c => c.text),
    });

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

// --- API: Batch upload to article library ---
router.post('/upload-batch', upload.array('files', 20), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: '未选择文件' });
    }

    const provider = req.body.llmProvider || 'deepseek';
    const results = [];

    for (const file of files) {
      try {
        const article = await ingestArticle(file.path, file.originalname, provider);
        results.push({ success: true, article: { id: article.id, title: article.title, themeTags: article.themeTags } });
      } catch (e) {
        results.push({ success: false, fileName: file.originalname, error: e.message });
      }
      await fsp.unlink(file.path).catch(() => {});
    }

    res.json({ success: true, results, total: results.filter(r => r.success).length });
  } catch (e) {
    sendError(res, e, 'Batch upload error');
  }
});

// --- API: List articles ---
router.get('/articles', async (req, res) => {
  try {
    const index = await loadArticleIndex();
    const filtered = filterArticles(index, {
      themeTag: req.query.themeTag,
      keyword: req.query.keyword,
      minConfidence: req.query.minConfidence ? parseFloat(req.query.minConfidence) : undefined,
    });
    res.json({
      articles: filtered.map(a => ({
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
    });
  } catch (e) {
    sendError(res, e, 'List articles error');
  }
});

// --- API: Multi-article joint analysis ---
router.post('/analyze-multi', async (req, res) => {
  try {
    const { articleIds, llmProvider } = req.body;
    if (!articleIds?.length) {
      return res.status(400).json({ error: '请选择至少 2 篇文章' });
    }

    const result = await runJointAnalysis(articleIds, llmProvider || 'deepseek');

    const graphNodes = result.entities.map(e => ({
      id: e.name || e.id,
      type: e.type,
      text: [e.name, e.summary].filter(Boolean).join(' — ').slice(0, 100),
    }));
    const graphLinks = result.relations.map(r => ({
      source: r.source,
      target: r.target,
      type: r.type,
    }));

    const analysisResult = {
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
    };

    appState.fileProcessed = true;
    appState.currentFile = analysisResult.fileName;
    appState.analysisResult = analysisResult;
    appState.multiAnalysis = result;

    res.json({ success: true, analysisResult });
  } catch (e) {
    sendError(res, e, 'Multi-article analysis error');
  }
});

// --- API: Generate Jupyter Notebook ---
router.post('/generate-notebook', async (req, res) => {
  try {
    const analysisResult = appState.analysisResult;
    if (!analysisResult) {
      return res.status(400).json({ error: '请先完成单文或多文分析' });
    }

    const { focusAreas, llmProvider } = req.body;
    const result = await generateNotebook(analysisResult, {
      focusAreas,
      provider: llmProvider || 'deepseek',
      mode: analysisResult.mode,
    });

    // 代码仅 ephemeral 下发给浏览器执行，服务端不存储
    res.json({
      success: true,
      ephemeral: true,
      notebook: result.notebook,
      analysisData: result.analysisData,
      source: result.source,
      trace: result.trace || [],
      profile: result.profile || null,
      plan: result.plan || null,
      validation: result.validation || [],
    });
  } catch (e) {
    sendError(res, e, 'Notebook generation error');
  }
});

// --- API: Finalize research report (after browser chart generation, NO code stored) ---
router.post('/research-report/finalize', async (req, res) => {
  try {
    const analysisResult = appState.analysisResult;
    if (!analysisResult) {
      return res.status(400).json({ error: '请先完成文章分析' });
    }

    const { charts, executionLog, llmProvider } = req.body;
    if (!charts?.length) {
      return res.status(400).json({ error: '需要至少一张可视化图表' });
    }

    const analysisSummary = {
      entityCount: analysisResult.entities?.length || analysisResult.stats?.meta?.totalEntities || 0,
      relationCount: analysisResult.relations?.length || analysisResult.stats?.meta?.totalRelations || 0,
      ruleEventCount: analysisResult.ruleMining?.eventCount || 0,
      kddClusters: analysisResult.kdd?.clusterCount || 0,
    };

    const articles = analysisResult.articles || [{
      title: analysisResult.stats?.meta?.title || appState.currentFile || '当前文档',
    }];

    const reportContent = await writeResearchReport({
      title: analysisResult.mode === 'multi'
        ? `多文联合研究报告 (${articles.length} 篇)`
        : `研究报告: ${articles[0]?.title || '中东冲突分析'}`,
      mode: analysisResult.mode || 'single',
      articles,
      analysisSummary,
      chartDescriptions: charts.map(c => ({
        title: c.title,
        description: c.description,
        stdout: c.stdout,
      })),
      executionLog,
      profile: req.body.profile,
      themeSummary: analysisResult.themeSummary || analysisResult.jointAnalysis?.themeSummary,
      conflictEvolution: analysisResult.conflictEvolution || analysisResult.jointAnalysis?.conflictEvolution,
    }, llmProvider || 'deepseek');

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
      charts: charts.map(c => ({
        title: c.title,
        imageBase64: c.imageBase64,
      })),
      fileHash: appState.currentFileHash || '',
    });

    res.json({
      success: true,
      report: saved,
      markdown: reportContent.markdown,
      highlights: reportContent.highlights,
      riskLevel: reportContent.riskLevel,
      reportSource: reportContent.source,
    });
  } catch (e) {
    sendError(res, e, 'Finalize research report error');
  }
});

// --- API: List research reports ---
router.get('/research-reports', async (req, res) => {
  try {
    await ensureSchema();
    const reports = await listResearchReports(parseInt(req.query.limit, 10) || 50);
    res.json({ reports, total: reports.length });
  } catch (e) {
    sendError(res, e, 'List research reports error');
  }
});

// --- API: Get single research report ---
router.get('/research-reports/:id', async (req, res) => {
  try {
    const report = await getResearchReport(req.params.id);
    if (!report) {
      return res.status(404).json({ error: '报告不存在' });
    }
    res.json({ report });
  } catch (e) {
    sendError(res, e, 'Get research report error');
  }
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
