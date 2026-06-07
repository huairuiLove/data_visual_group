/**
 * work1 风格衍生指标 — 对齐 visualize_report.py / llm_deep_analysis.py
 */

const EVENT_CATEGORIES = {
  '空袭/轰炸': ['空袭', '轰炸', '打击', '袭击', '导弹', 'airstrike', 'strike', 'bomb', 'attack'],
  '停火/谈判': ['停火', '休战', '谈判', '协议', '和平', 'ceasefire', 'truce', 'negotiation', 'peace'],
  '封锁/航运': ['封锁', '海峡', '港口', '航运', 'blockade', 'strait', 'Hormuz', 'shipping'],
  '外交声明': ['声明', '言论', '警告', '宣布', '呼吁', '谴责', 'statement', 'declare', 'warn'],
  '军事行动': ['军事', '部队', '部署', '军队', 'military', 'troop', 'deploy', 'force', 'navy'],
  '人道主义': ['平民', '伤亡', '难民', '人道', '医院', 'civilian', 'casualty', 'refugee'],
  '经济影响': ['经济', '石油', '制裁', '金融', '油价', 'economic', 'oil', 'sanction'],
};

function categorizeText(text) {
  const lower = text.toLowerCase();
  const cats = [];
  for (const [cat, keywords] of Object.entries(EVENT_CATEGORIES)) {
    if (keywords.some(kw => lower.includes(kw.toLowerCase()))) cats.push(cat);
  }
  return cats.length ? cats : ['其他'];
}

function computeEntityCooccurrence(entities, relations) {
  const pairs = {};
  const entityNames = entities.map(e => e.name || e.id).filter(Boolean);

  // Co-occurrence from relations
  for (const r of relations) {
    const key = [r.source, r.target].sort().join('|||');
    pairs[key] = (pairs[key] || 0) + (r.count || 1);
  }

  // Co-occurrence from shared relation endpoints
  const byRelation = {};
  for (const r of relations) {
    const rt = r.type || 'unknown';
    if (!byRelation[rt]) byRelation[rt] = new Set();
    byRelation[rt].add(r.source);
    byRelation[rt].add(r.target);
  }
  for (const members of Object.values(byRelation)) {
    const arr = [...members];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = [arr[i], arr[j]].sort().join('|||');
        pairs[key] = (pairs[key] || 0) + 1;
      }
    }
  }

  return Object.entries(pairs)
    .map(([key, weight]) => {
      const [a, b] = key.split('|||');
      return { source: a, target: b, weight };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 50);
}

function computeKeywordCooccurrence(docs, topN = 20) {
  const wordFreq = {};
  const cooccur = {};

  for (const doc of docs) {
    const text = typeof doc === 'string' ? doc : (doc.text || '');
    const words = text.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g) || [];
    const unique = [...new Set(words.map(w => w.toLowerCase()))];
    for (const w of unique) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = [unique[i], unique[j]].sort().join('|||');
        cooccur[key] = (cooccur[key] || 0) + 1;
      }
    }
  }

  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term, score]) => ({ term, score }));

  const topTerms = new Set(topWords.map(w => w.term));
  const edges = Object.entries(cooccur)
    .filter(([key]) => {
      const [a, b] = key.split('|||');
      return topTerms.has(a) && topTerms.has(b);
    })
    .map(([key, weight]) => {
      const [source, target] = key.split('|||');
      return { source, target, weight };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 40);

  return { keywords: topWords, edges };
}

function computeRelationTriples(relations) {
  const triples = {};
  for (const r of relations) {
    const key = `${r.source}|${r.type}|${r.target}`;
    triples[key] = (triples[key] || 0) + (r.count || 1);
  }
  return Object.entries(triples)
    .map(([key, count]) => {
      const [source, type, target] = key.split('|');
      return { source, type, target, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}

function computeWork1Metrics({ entities = [], relations = [], docs = [] }) {
  const entityTypeDist = {};
  const relationTypeDist = {};
  const entityFreq = {};

  for (const e of entities) {
    const t = e.type || '未知';
    entityTypeDist[t] = (entityTypeDist[t] || 0) + (e.count || 1);
    const name = e.name || e.id;
    entityFreq[name] = (entityFreq[name] || 0) + (e.count || 1);
  }

  for (const r of relations) {
    const t = r.type || '未知';
    relationTypeDist[t] = (relationTypeDist[t] || 0) + (r.count || 1);
  }

  const eventCategories = {};
  for (const doc of docs) {
    for (const cat of categorizeText(typeof doc === 'string' ? doc : (doc.text || ''))) {
      eventCategories[cat] = (eventCategories[cat] || 0) + 1;
    }
  }

  const topEntities = Object.entries(entityFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  return {
    entityTypeDist,
    relationTypeDist,
    topEntities,
    eventCategories,
    cooccurrence: computeEntityCooccurrence(entities, relations),
    relationTriples: computeRelationTriples(relations),
    keywordCooccurrence: computeKeywordCooccurrence(docs),
  };
}

function enrichAnalysisResult(analysisResult, fullText, chunks) {
  const { runRuleMining } = require('./rule-mining');
  const { runKddAnalysis } = require('./kdd-analysis');
  const { buildSemanticLandscape } = require('./tsne-lite');
  const { applyCanonicalization } = require('../services/entity-canonicalization');

  const texts = chunks?.map(c => c.text || c) || [fullText].filter(Boolean);
  const ruleMining = runRuleMining(fullText || texts.join('\n'));
  const kdd = runKddAnalysis(texts);
  const semanticLandscape = buildSemanticLandscape(texts, kdd.labels);

  let entities = analysisResult.entities || analysisResult.entityData?.allNodes || [];
  let relations = analysisResult.relations || [];

  if (entities.length) {
    const canon = applyCanonicalization(entities, relations);
    entities = canon.entities;
    relations = canon.relations;
  }

  return {
    ...analysisResult,
    entities,
    relations,
    ruleMining,
    kdd,
    semanticLandscape,
  };
}

function buildNotebookAnalysisData(analysisResult, options = {}) {
  const entities = analysisResult.entities
    || analysisResult.entityData?.allNodes
    || [];
  const relations = analysisResult.relations
    || analysisResult.edges?.map(e => ({
      source: e.source_id || e.source,
      target: e.target_id || e.target,
      type: e.relation || e.type,
      count: 1,
    }))
    || [];

  const docs = analysisResult.lcDocsTexts
    || analysisResult.docs
    || [analysisResult.fullText || ''].filter(Boolean);

  const metrics = analysisResult.work1Metrics
    || computeWork1Metrics({ entities, relations, docs });

  return {
    mode: analysisResult.mode || options.mode || 'single',
    entities: entities.map(e => ({
      name: e.name || e.id,
      type: e.type,
      aliases: e.aliases || [],
      summary: e.summary || '',
      attributes: e.attributes || {},
      count: e.count || 1,
    })),
    relations: relations.map(r => ({
      source: r.source || r.source_id,
      target: r.target || r.target_id,
      type: r.type || r.relation,
      summary: r.summary || '',
      count: r.count || 1,
    })),
    articles: analysisResult.articles || [{
      title: analysisResult.meta?.title || analysisResult.currentFile || '当前文档',
      date: analysisResult.meta?.date,
      themeTags: analysisResult.themeTags || [],
    }],
    keywords: metrics.keywordCooccurrence?.keywords || [],
    eventCategories: metrics.eventCategories || {},
    cooccurrence: metrics.cooccurrence || [],
    relationTriples: metrics.relationTriples || [],
    themeSummary: analysisResult.themeSummary || analysisResult.jointAnalysis?.themeSummary || '',
    conflictEvolution: analysisResult.conflictEvolution || analysisResult.jointAnalysis?.conflictEvolution || '',
    ruleMining: analysisResult.ruleMining || null,
    kdd: analysisResult.kdd || null,
    semanticLandscape: analysisResult.semanticLandscape || null,
  };
}

module.exports = {
  enrichAnalysisResult,
  EVENT_CATEGORIES,
  categorizeText,
  computeWork1Metrics,
  computeEntityCooccurrence,
  computeKeywordCooccurrence,
  computeRelationTriples,
  buildNotebookAnalysisData,
};
