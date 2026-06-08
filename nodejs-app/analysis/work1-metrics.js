/**
 * work1 风格衍生指标 — 对齐 visualize_report.py / llm_deep_analysis.py
 */

const EVENT_CATEGORIES = {
  '空袭/轰炸': ['空袭', '轰炸', '打击', '袭击', '导弹', 'airstrike', 'strike', 'bomb', 'attack'],
  '停火/谈判': ['停火', '休战', '谈判', '协议', '和平', 'ceasefire', 'truce', 'negotiation', 'peace'],
  '封锁/航运': ['封锁', '海峡', '港口', '航运', 'blockade', 'strait', 'Hormuz', 'shipping'],
  外交声明: ['声明', '言论', '警告', '宣布', '呼吁', '谴责', 'statement', 'declare', 'warn'],
  军事行动: ['军事', '部队', '部署', '军队', 'military', 'troop', 'deploy', 'force', 'navy'],
  人道主义: ['平民', '伤亡', '难民', '人道', '医院', 'civilian', 'casualty', 'refugee'],
  经济影响: ['经济', '石油', '制裁', '金融', '油价', 'economic', 'oil', 'sanction'],
}

function categorizeText(text) {
  const lower = text.toLowerCase()
  const cats = []
  for (const [cat, keywords] of Object.entries(EVENT_CATEGORIES)) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) cats.push(cat)
  }
  return cats.length ? cats : ['其他']
}

function computeEntityCooccurrence(entities, relations) {
  const pairs = {}

  // Co-occurrence from relations
  for (const r of relations) {
    const key = [r.source, r.target].sort().join('|||')
    pairs[key] = (pairs[key] || 0) + (r.count || 1)
  }

  // Co-occurrence from shared relation endpoints
  const byRelation = {}
  for (const r of relations) {
    const rt = r.type || 'unknown'
    if (!byRelation[rt]) byRelation[rt] = new Set()
    byRelation[rt].add(r.source)
    byRelation[rt].add(r.target)
  }
  for (const members of Object.values(byRelation)) {
    const arr = [...members]
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = [arr[i], arr[j]].sort().join('|||')
        pairs[key] = (pairs[key] || 0) + 1
      }
    }
  }

  return Object.entries(pairs)
    .map(([key, weight]) => {
      const [a, b] = key.split('|||')
      return { source: a, target: b, weight }
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 50)
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'having',
  'do',
  'does',
  'did',
  'doing',
  'will',
  'would',
  'shall',
  'should',
  'can',
  'could',
  'may',
  'might',
  'must',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'it',
  'they',
  'them',
  'their',
  'his',
  'her',
  'its',
  'and',
  'or',
  'but',
  'not',
  'no',
  'nor',
  'so',
  'if',
  'then',
  'than',
  'that',
  'this',
  'these',
  'those',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'out',
  'off',
  'over',
  'under',
  'again',
  'further',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'both',
  'each',
  'every',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'only',
  'own',
  'same',
  'up',
  'down',
  'just',
  'about',
  'now',
  'also',
  'very',
  'too',
  'well',
  'back',
  'still',
  'even',
  'said',
  'reuters',
  'ap',
  'news',
  'report',
  'reported',
  'told',
  'new',
  'one',
  'two',
  'like',
  'get',
  'make',
  'year',
  'time',
  'people',
  'day',
  'way',
  '的',
  '了',
  '在',
  '是',
  '我',
  '有',
  '和',
  '就',
  '不',
  '人',
  '都',
  '一',
  '上',
  '也',
  '很',
  '到',
  '说',
  '要',
  '去',
  '你',
  '会',
  '着',
  '没有',
  '看',
  '好',
  '自己',
  '这',
  '他',
  '她',
  '它',
  '们',
  '那',
  '些',
  '什么',
  '怎么',
  '如何',
  '因为',
  '所以',
  '但是',
  '如果',
  '虽然',
  '可以',
  '可能',
  '应该',
  '已经',
  '正在',
  '将',
  '还',
  '又',
  '再',
  '能',
  '被',
  '把',
  '让',
  '从',
  '对',
  '向',
  '与',
  '或',
  '而',
  '且',
  '并',
  '中',
  '等',
  '其',
  '之',
  '年',
  '月',
  '日',
  '进行',
  '通过',
  '根据',
  '按照',
  '关于',
  '对于',
  '由于',
  '为了',
  '作为',
  '表示',
  '称',
  '报道',
  '新闻',
  '消息',
  '记者',
  '据悉',
  '据',
  '指出',
  '认为',
  '显示',
  '其中',
  '包括',
  '目前',
  '相关',
  '方面',
  '情况',
  '问题',
  '需要',
  '继续',
  '开始',
  '结束',
  '发展',
  '影响',
  '主要',
  '重要',
  '特别',
  '非常',
  '可能',
  '一定',
  '必须',
  '能够',
  '可以',
  '已经',
])

function computeKeywordCooccurrence(docs, topN = 20) {
  const wordFreq = {}
  const cooccur = {}

  for (const doc of docs) {
    const text = typeof doc === 'string' ? doc : doc.text || ''
    const rawWords = text.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g) || []
    const words = rawWords.map((w) => w.toLowerCase()).filter((w) => !STOP_WORDS.has(w))
    const unique = [...new Set(words)]
    for (const w of unique) {
      wordFreq[w] = (wordFreq[w] || 0) + 1
    }
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = [unique[i], unique[j]].sort().join('|||')
        cooccur[key] = (cooccur[key] || 0) + 1
      }
    }
  }

  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term, score]) => ({ term, score }))

  const topTerms = new Set(topWords.map((w) => w.term))
  const edges = Object.entries(cooccur)
    .filter(([key]) => {
      const [a, b] = key.split('|||')
      return topTerms.has(a) && topTerms.has(b)
    })
    .map(([key, weight]) => {
      const [source, target] = key.split('|||')
      return { source, target, weight }
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 40)

  return { keywords: topWords, edges }
}

function computeRelationTriples(relations) {
  const triples = {}
  for (const r of relations) {
    const key = `${r.source}|${r.type}|${r.target}`
    triples[key] = (triples[key] || 0) + (r.count || 1)
  }
  return Object.entries(triples)
    .map(([key, count]) => {
      const [source, type, target] = key.split('|')
      return { source, type, target, count }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)
}

function computeWork1Metrics({ entities = [], relations = [], docs = [] }) {
  const entityTypeDist = {}
  const relationTypeDist = {}
  const entityFreq = {}

  // Count entity frequencies from relations (how many times each entity appears)
  for (const r of relations) {
    const src = r.source || r.source_id || ''
    const tgt = r.target || r.target_id || ''
    if (src) entityFreq[src] = (entityFreq[src] || 0) + 1
    if (tgt) entityFreq[tgt] = (entityFreq[tgt] || 0) + 1
  }

  for (const e of entities) {
    const t = e.type || '未知'
    entityTypeDist[t] = (entityTypeDist[t] || 0) + 1
    const name = e.name || e.id
    // Ensure every entity appears at least once; prefer relation-degree count
    if (!entityFreq[name]) entityFreq[name] = entityFreq[name] || 1
  }

  for (const r of relations) {
    const t = r.type || '未知'
    relationTypeDist[t] = (relationTypeDist[t] || 0) + (r.count || 1)
  }

  const eventCategories = {}
  for (const doc of docs) {
    for (const cat of categorizeText(typeof doc === 'string' ? doc : doc.text || '')) {
      eventCategories[cat] = (eventCategories[cat] || 0) + 1
    }
  }

  const topEntities = Object.entries(entityFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }))

  return {
    entityTypeDist,
    relationTypeDist,
    topEntities,
    eventCategories,
    cooccurrence: computeEntityCooccurrence(entities, relations),
    relationTriples: computeRelationTriples(relations),
    keywordCooccurrence: computeKeywordCooccurrence(docs),
  }
}

function enrichAnalysisResult(analysisResult, fullText, chunks) {
  const { runRuleMining } = require('./rule-mining')
  const { runKddAnalysis } = require('./kdd-analysis')
  const { buildSemanticLandscape } = require('./tsne-lite')
  const { applyCanonicalization } = require('../services/entity-canonicalization')

  const texts = chunks?.map((c) => c.text || c) || [fullText].filter(Boolean)
  const ruleMining = runRuleMining(fullText || texts.join('\n'))
  const kdd = runKddAnalysis(texts)
  const semanticLandscape = buildSemanticLandscape(texts, kdd.labels)

  let entities = analysisResult.entities || analysisResult.entityData?.allNodes || []
  let relations = analysisResult.relations || []

  if (entities.length) {
    const canon = applyCanonicalization(entities, relations)
    entities = canon.entities
    relations = canon.relations
  }

  return {
    ...analysisResult,
    entities,
    relations,
    ruleMining,
    kdd,
    semanticLandscape,
  }
}

function buildNotebookAnalysisData(analysisResult, options = {}) {
  const entities = analysisResult.entities || analysisResult.entityData?.allNodes || []
  const relations =
    analysisResult.relations ||
    analysisResult.edges?.map((e) => ({
      source: e.source_id || e.source,
      target: e.target_id || e.target,
      type: e.relation || e.type,
      count: 1,
    })) ||
    []

  const docs =
    analysisResult.lcDocsTexts || analysisResult.docs || [analysisResult.fullText || ''].filter(Boolean)

  const metrics = analysisResult.work1Metrics || computeWork1Metrics({ entities, relations, docs })

  return {
    mode: analysisResult.mode || options.mode || 'single',
    entities: entities.map((e) => ({
      name: e.name || e.id,
      type: e.type,
      aliases: e.aliases || [],
      summary: e.summary || '',
      attributes: e.attributes || {},
      count: e.count || 1,
    })),
    relations: relations.map((r) => ({
      source: r.source || r.source_id,
      target: r.target || r.target_id,
      type: r.type || r.relation,
      summary: r.summary || '',
      count: r.count || 1,
    })),
    articles: analysisResult.articles || [
      {
        title: analysisResult.meta?.title || analysisResult.currentFile || '当前文档',
        date: analysisResult.meta?.date,
        themeTags: analysisResult.themeTags || [],
      },
    ],
    keywords: metrics.keywordCooccurrence?.keywords || [],
    eventCategories: metrics.eventCategories || {},
    cooccurrence: metrics.cooccurrence || [],
    relationTriples: metrics.relationTriples || [],
    themeSummary: analysisResult.themeSummary || analysisResult.jointAnalysis?.themeSummary || '',
    conflictEvolution:
      analysisResult.conflictEvolution || analysisResult.jointAnalysis?.conflictEvolution || '',
    ruleMining: analysisResult.ruleMining || null,
    kdd: analysisResult.kdd || null,
    semanticLandscape: analysisResult.semanticLandscape || null,
  }
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
}
