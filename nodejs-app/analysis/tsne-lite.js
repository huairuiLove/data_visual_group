/**
 * 语义景观 — 2D 投影 (Truncated SVD 近似，无需 sklearn)
 * 对齐 work1 adv_01_semantic_landscape
 */

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(v) {
  return Math.sqrt(dot(v, v)) || 1;
}

function powerIteration(matrix, k = 2, iterations = 50) {
  const n = matrix.length;
  const dim = matrix[0]?.length || 0;
  if (!n || !dim) return [];

  const components = [];
  let working = matrix.map(row => [...row]);

  for (let c = 0; c < k; c++) {
    let vec = new Array(dim).fill(0).map(() => Math.random() - 0.5);
    let nv = norm(vec);
    vec = vec.map(v => v / nv);

    for (let iter = 0; iter < iterations; iter++) {
      const newVec = new Array(dim).fill(0);
      for (let i = 0; i < n; i++) {
        const coeff = dot(working[i], vec);
        for (let j = 0; j < dim; j++) newVec[j] += coeff * working[i][j];
      }
      nv = norm(newVec);
      vec = newVec.map(v => v / nv);
    }

    components.push(vec);

    for (let i = 0; i < n; i++) {
      const coeff = dot(working[i], vec);
      for (let j = 0; j < dim; j++) working[i][j] -= coeff * vec[j];
    }
  }

  return components;
}

function project2D(vectors) {
  if (!vectors.length) return [];
  const components = powerIteration(vectors, 2);
  if (components.length < 2) {
    return vectors.map((_, i) => ({ x: i * 0.5, y: 0, index: i }));
  }

  return vectors.map((v, i) => ({
    x: dot(v, components[0]),
    y: dot(v, components[1]),
    index: i,
  }));
}

function buildSemanticLandscape(texts, labels = []) {
  const { buildTfidf } = require('./kdd-analysis');
  const docs = texts.filter(t => (t || '').length > 20);
  if (!docs.length) return { points: [], topics: [] };

  const { vectors } = buildTfidf(docs);
  const points = project2D(vectors).map((p, i) => ({
    ...p,
    label: labels[i] ?? 0,
    textPreview: docs[i].slice(0, 80),
  }));

  return { points, docCount: docs.length };
}

module.exports = { project2D, buildSemanticLandscape, powerIteration };
