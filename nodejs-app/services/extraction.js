/**
 * 统一实体抽取服务 — 单文精细 / 多文轻量
 */

const { chat } = require('./llm');
const config = require('../config');
const {
  SINGLE_SYSTEM_PROMPT,
  MULTI_SYSTEM_PROMPT,
  buildSingleArticlePrompt,
  buildMultiArticlePrompt,
  SINGLE_ENTITY_TYPES,
  SINGLE_RELATION_TYPES,
} = require('./prompts/extraction');

function parseJsonFromResponse(response) {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

function normalizeEntity(e) {
  const name = String(e.name || e.id || '').trim();
  if (!name) return null;
  const type = String(e.type || '').trim();
  const validType = SINGLE_ENTITY_TYPES.includes(type)
    ? type
    : (config.graph.allowedNodes.includes(type) ? type : '政治实体');
  return {
    id: name,
    name,
    type: validType,
    aliases: Array.isArray(e.aliases) ? e.aliases : [],
    summary: String(e.summary || '').slice(0, 200),
    attributes: e.attributes || {},
    text: name,
  };
}

function normalizeRelation(r) {
  const source = String(r.source || '').trim();
  const target = String(r.target || '').trim();
  const type = String(r.type || '').trim();
  if (!source || !target) return null;
  const validType = SINGLE_RELATION_TYPES.includes(type)
    ? type
    : (config.graph.allowedRelationships.includes(type) ? type : '参与');
  return {
    source,
    target,
    type: validType,
    summary: String(r.summary || '').slice(0, 200),
    attributes: r.attributes || {},
  };
}

async function extractSingleDetailed(text, meta = {}, provider = 'deepseek', options = {}) {
  const prompt = buildSingleArticlePrompt(
    meta.title || '',
    meta.summary || '',
    text,
    meta.date || '',
  );

  const response = await chat([
    { role: 'system', content: SINGLE_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ], provider, {
    model: options.model || 'deepseek-v4-flash',
    temperature: 0.2,
    maxTokens: 4096,
    extra: { thinking: { type: 'disabled' } },
  });

  const data = parseJsonFromResponse(response);
  if (!data) return { entities: [], relations: [], raw: response };

  const entities = (data.entities || [])
    .map(normalizeEntity)
    .filter(Boolean);

  const entityNames = new Set(entities.map(e => e.name));
  const relations = (data.relations || [])
    .map(normalizeRelation)
    .filter(r => r && entityNames.has(r.source) && entityNames.has(r.target));

  return { entities, relations, raw: data };
}

async function extractChunkLegacy(text, provider = 'deepseek') {
  const nodeHint = config.graph.allowedNodes.map(t => `- ${t}`).join('\n');
  const relHint = config.graph.allowedRelationships.map(t => `- ${t}`).join('\n');

  const entityPrompt = `你是一个军事情报实体关系提取专家。从给定的文本片段中提取实体和关系。

## 允许的实体类型
${nodeHint}

## 允许的关系类型
${relHint}

## 输出格式 (严格JSON，不要markdown代码块)
{"nodes":[{"id":"实体唯一名称","type":"实体类型"}],"relationships":[{"source":"源","target":"目标","type":"关系类型"}]}

## 规则
1. 只提取文本中明确出现的信息
2. 实体类型必须从允许列表中选择`;

  const response = await chat([
    { role: 'system', content: entityPrompt },
    { role: 'user', content: `待提取文本:\n${text.slice(0, 2500)}` },
  ], provider, { model: 'deepseek-v4-flash', temperature: 0.2 });

  const data = parseJsonFromResponse(response);
  if (!data) return { entities: [], relations: [] };

  const entities = (data.nodes || []).map(n => ({
    id: String(n.id).trim(),
    name: String(n.id).trim(),
    type: String(n.type).trim(),
    aliases: [],
    summary: '',
    attributes: {},
    text: String(n.id).trim(),
  })).filter(e => e.id && config.graph.allowedNodes.includes(e.type));

  const ids = new Set(entities.map(e => e.id));
  const relations = (data.relationships || []).map(r => ({
    source: String(r.source).trim(),
    target: String(r.target).trim(),
    type: String(r.type).trim(),
    summary: '',
    attributes: {},
  })).filter(r => ids.has(r.source) && ids.has(r.target)
    && config.graph.allowedRelationships.includes(r.type));

  return { entities, relations };
}

async function extractFromChunks(chunks, mode = 'single_detailed', provider = 'deepseek', meta = {}) {
  if (mode === 'single_detailed') {
    const fullText = chunks.map(c => c.text || c).join('\n\n');
    const result = await extractSingleDetailed(fullText, meta, provider);
    return mergeExtractionResults([result]);
  }

  // multi_corpus: per-chunk legacy extraction
  const results = [];
  for (const chunk of chunks) {
    const text = typeof chunk === 'string' ? chunk : (chunk.text || '');
    try {
      const r = await extractChunkLegacy(text, provider);
      results.push(r);
    } catch (e) {
      console.error('Chunk extraction failed:', e.message);
    }
  }
  return mergeExtractionResults(results);
}

function mergeExtractionResults(results) {
  const entityMap = new Map();
  const relations = [];
  const seenRels = new Set();

  for (const r of results) {
    for (const e of (r.entities || [])) {
      const key = e.name || e.id;
      if (!entityMap.has(key)) {
        entityMap.set(key, { ...e, count: 1 });
      } else {
        const existing = entityMap.get(key);
        existing.count = (existing.count || 1) + 1;
        existing.aliases = [...new Set([...(existing.aliases || []), ...(e.aliases || [])])];
        if (e.summary && !existing.summary) existing.summary = e.summary;
      }
    }
    for (const rel of (r.relations || [])) {
      const rk = `${rel.source}|${rel.type}|${rel.target}`;
      if (!seenRels.has(rk)) {
        seenRels.add(rk);
        relations.push({ ...rel, count: 1 });
      } else {
        const found = relations.find(x => `${x.source}|${x.type}|${x.target}` === rk);
        if (found) found.count = (found.count || 1) + 1;
      }
    }
  }

  return {
    entities: [...entityMap.values()],
    relations,
  };
}

async function extractMultiArticleJoint(articles, provider = 'deepseek', options = {}) {
  const prompt = buildMultiArticlePrompt(articles);

  const response = await chat([
    { role: 'system', content: MULTI_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ], provider, {
    model: options.model || 'deepseek-v4-flash',
    temperature: 0.3,
    maxTokens: 4096,
    extra: { thinking: { type: 'enabled' }, reasoning_effort: 'medium' },
  });

  const data = parseJsonFromResponse(response);
  if (!data) {
    return {
      sharedEntities: [],
      crossRelations: [],
      themeSummary: '',
      conflictEvolution: '',
      raw: response,
    };
  }

  return {
    sharedEntities: data.shared_entities || [],
    crossRelations: data.cross_relations || [],
    themeSummary: data.theme_summary || '',
    conflictEvolution: data.conflict_evolution || '',
    raw: data,
  };
}

module.exports = {
  parseJsonFromResponse,
  extractSingleDetailed,
  extractChunkLegacy,
  extractFromChunks,
  mergeExtractionResults,
  extractMultiArticleJoint,
};
