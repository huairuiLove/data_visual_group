/**
 * KDD 分析 — TF-IDF + KMeans 聚类 + 关联规则 (纯 JS，基于上传文本)
 */

const natural = require('natural');
const tokenizer = new natural.WordTokenizer();

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had',
  'that', 'this', 'it', 'as', 'not', 'no', 'said', 'says', 'will', 'would',
  '的', '了', '在', '是', '和', '与', '对', '也', '都', '而', '被', '将', '已',
]);

function tokenize(text) {
  return tokenizer.tokenize(text.toLowerCase())
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
}

function buildTfidf(docs) {
  const docTokens = docs.map(tokenize);
  const df = {};
  const tf = docTokens.map(tokens => {
    const counts = {};
    for (const t of tokens) counts[t] = (counts[t] || 0) + 1;
    for (const t of new Set(tokens)) df[t] = (df[t] || 0) + 1;
    return counts;
  });

  const n = docs.length;
  const vocab = [...new Set(docTokens.flat())].slice(0, 200);
  const vectors = tf.map(counts => {
    const vec = new Array(vocab.length).fill(0);
    vocab.forEach((term, i) => {
      if (counts[term]) {
        const idf = Math.log((n + 1) / ((df[term] || 0) + 1)) + 1;
        vec[i] = counts[term] * idf;
      }
    });
    return vec;
  });

  return { vocab, vectors, docTokens };
}

function euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

function kMeans(vectors, k = 3, maxIter = 30) {
  if (vectors.length <= k) {
    return vectors.map((_, i) => i);
  }

  const dim = vectors[0].length;
  const centroids = vectors.slice(0, k).map(v => [...v]);
  let labels = new Array(vectors.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    const newLabels = vectors.map(v => {
      let best = 0, bestDist = Infinity;
      centroids.forEach((c, ci) => {
        const d = euclidean(v, c);
        if (d < bestDist) { bestDist = d; best = ci; }
      });
      return best;
    });

    if (newLabels.every((l, i) => l === labels[i])) break;
    labels = newLabels;

    for (let ci = 0; ci < k; ci++) {
      const members = vectors.filter((_, i) => labels[i] === ci);
      if (!members.length) continue;
      for (let d = 0; d < dim; d++) {
        centroids[ci][d] = members.reduce((s, v) => s + v[d], 0) / members.length;
      }
    }
  }

  return labels;
}

function extractTopicTerms(docTokens, labels, k) {
  const topics = [];
  for (let ci = 0; ci < k; ci++) {
    const wordCounts = {};
    docTokens.forEach((tokens, i) => {
      if (labels[i] !== ci) return;
      for (const t of tokens) wordCounts[t] = (wordCounts[t] || 0) + 1;
    });
    const terms = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([term, count]) => ({ term, count }));
    topics.push({ clusterId: ci, terms, docCount: labels.filter(l => l === ci).length });
  }
  return topics;
}

function mineAssociationRules(labels, featureSets) {
  const pairCounts = {};
  const itemCounts = {};

  featureSets.forEach((features, i) => {
    const items = [...new Set([`cluster_${labels[i]}`, ...features])];
    for (const item of items) itemCounts[item] = (itemCounts[item] || 0) + 1;
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const key = [items[a], items[b]].sort().join(' -> ');
        pairCounts[key] = (pairCounts[key] || 0) + 1;
      }
    }
  });

  const n = featureSets.length;
  return Object.entries(pairCounts)
    .map(([rule, count]) => ({
      rule,
      count,
      support: count / n,
      confidence: count / Math.max(1, Math.min(
        itemCounts[rule.split(' -> ')[0]] || 1,
        itemCounts[rule.split(' -> ')[1]] || 1,
      )),
    }))
    .filter(r => r.count >= 2)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 15);
}

function runKddAnalysis(texts, options = {}) {
  const docs = texts.filter(t => (t || '').length > 30);
  if (docs.length < 2) {
    const tokens = tokenize(docs[0] || '');
    return {
      clusterCount: 1,
      topics: [{ clusterId: 0, terms: tokens.slice(0, 8).map(t => ({ term: t, count: 1 })), docCount: 1 }],
      labels: [0],
      associationRules: [],
      vocabSize: tokens.length,
    };
  }

  const k = Math.min(options.clusters || 3, docs.length);
  const { vocab, vectors, docTokens } = buildTfidf(docs);
  const labels = kMeans(vectors, k);
  const topics = extractTopicTerms(docTokens, labels, k);

  const featureSets = docTokens.map((tokens, i) => {
    const features = [];
    if (tokens.some(t => /iran|以色列|gaza|hamas|houthi/i.test(t))) features.push('actor_mention');
    if (tokens.some(t => /strike|attack|ceasefire|sanction|blockade/i.test(t))) features.push('action_mention');
    return features;
  });

  const associationRules = mineAssociationRules(labels, featureSets);

  return {
    clusterCount: k,
    topics,
    labels,
    associationRules,
    vocabSize: vocab.length,
    silhouette: computeSilhouette(vectors, labels, k),
  };
}

function computeSilhouette(vectors, labels, k) {
  if (vectors.length < 3 || k < 2) return 0;
  let total = 0;
  for (let i = 0; i < vectors.length; i++) {
    const same = [], diff = [];
    for (let j = 0; j < vectors.length; j++) {
      if (i === j) continue;
      const d = euclidean(vectors[i], vectors[j]);
      if (labels[j] === labels[i]) same.push(d);
      else diff.push(d);
    }
    if (!same.length || !diff.length) continue;
    const a = same.reduce((s, v) => s + v, 0) / same.length;
    const b = Math.min(...diff);
    total += (b - a) / Math.max(a, b);
  }
  return total / vectors.length;
}

module.exports = { runKddAnalysis, buildTfidf, kMeans, tokenize };
