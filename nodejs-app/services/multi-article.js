/**
 * 多文章联合分析 — 文章库管理 + 筛选 + 联合抽取
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { processDocument } = require('./document');
const { validateFileType, validateMiddleEastTheme } = require('./article-filter');
const { extractFromChunks, extractMultiArticleJoint } = require('./extraction');
const { computeWork1Metrics } = require('../analysis/work1-metrics');

const ARTICLES_DIR = path.join(__dirname, '..', 'data', 'articles');
const INDEX_FILE = path.join(ARTICLES_DIR, 'index.json');

async function ensureArticlesDir() {
  await fsp.mkdir(ARTICLES_DIR, { recursive: true });
  try {
    await fsp.access(INDEX_FILE);
  } catch {
    await fsp.writeFile(INDEX_FILE, '[]', 'utf8');
  }
}

async function loadArticleIndex() {
  await ensureArticlesDir();
  const raw = await fsp.readFile(INDEX_FILE, 'utf8');
  return JSON.parse(raw || '[]');
}

async function saveArticleIndex(articles) {
  await fsp.writeFile(INDEX_FILE, JSON.stringify(articles, null, 2), 'utf8');
}

async function ingestArticle(filePath, fileName, provider = 'openai-compatible') {
  const typeCheck = validateFileType(fileName);
  if (!typeCheck.valid) {
    throw new Error(typeCheck.reason);
  }

  const chunks = await processDocument(filePath, fileName);
  const fullText = chunks.map(c => c.text).join('\n');

  const theme = await validateMiddleEastTheme(fullText, provider);
  if (!theme.isValid) {
    throw new Error(`文章主题不符合要求: ${theme.reason}`);
  }

  const extraction = await extractFromChunks(
    chunks,
    'single_detailed',
    provider,
    { title: fileName, date: new Date().toISOString().slice(0, 10) },
  );

  const article = {
    id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: fileName.replace(/\.[^.]+$/, ''),
    fileName,
    date: new Date().toISOString().slice(0, 10),
    themeTags: theme.themeTags,
    themeConfidence: theme.confidence,
    summary: fullText.slice(0, 300),
    text: fullText.slice(0, 5000),
    entityCount: extraction.entities.length,
    relationCount: extraction.relations.length,
    entities: extraction.entities,
    relations: extraction.relations,
    createdAt: new Date().toISOString(),
  };

  const index = await loadArticleIndex();
  index.push(article);
  await saveArticleIndex(index);

  return article;
}

function filterArticles(articles, filters = {}) {
  let result = [...articles];

  if (filters.themeTag) {
    const tag = filters.themeTag.toLowerCase();
    result = result.filter(a =>
      (a.themeTags || []).some(t => t.toLowerCase().includes(tag))
    );
  }

  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase();
    result = result.filter(a =>
      (a.title || '').toLowerCase().includes(kw)
      || (a.summary || '').toLowerCase().includes(kw)
      || (a.text || '').toLowerCase().includes(kw)
    );
  }

  if (filters.minConfidence) {
    result = result.filter(a => (a.themeConfidence || 0) >= filters.minConfidence);
  }

  if (filters.ids?.length) {
    const idSet = new Set(filters.ids);
    result = result.filter(a => idSet.has(a.id));
  }

  return result;
}

async function runJointAnalysis(articleIds, provider = 'openai-compatible') {
  const index = await loadArticleIndex();
  const selected = filterArticles(index, { ids: articleIds });

  if (selected.length < 2) {
    throw new Error('联合分析至少需要 2 篇文章');
  }

  const joint = await extractMultiArticleJoint(selected, provider);

  const allEntities = [];
  const allRelations = [];
  for (const a of selected) {
    allEntities.push(...(a.entities || []));
    allRelations.push(...(a.relations || []));
  }

  const work1Metrics = computeWork1Metrics({
    entities: allEntities,
    relations: allRelations,
    docs: selected.map(a => a.text || a.summary || ''),
  });

  return {
    mode: 'multi',
    articleCount: selected.length,
    articles: selected.map(a => ({
      id: a.id,
      title: a.title,
      date: a.date,
      themeTags: a.themeTags,
    })),
    jointAnalysis: joint,
    entities: allEntities,
    relations: allRelations,
    work1Metrics,
    themeSummary: joint.themeSummary,
    conflictEvolution: joint.conflictEvolution,
  };
}

module.exports = {
  ARTICLES_DIR,
  loadArticleIndex,
  ingestArticle,
  filterArticles,
  runJointAnalysis,
};
