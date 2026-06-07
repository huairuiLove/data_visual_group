/**
 * Notebook 内置模板 — work1 风格兜底
 */

function createFallbackNotebook(analysisData) {
  const cells = [
    {
      cell_type: 'markdown',
      metadata: {},
      source: [
        '# 中东冲突态势可视化分析\n',
        '> 基于用户上传文章的分析数据（非爬虫）\n',
        `\n分析模式: ${analysisData.mode}\n`,
        analysisData.themeSummary ? `\n**主题**: ${analysisData.themeSummary}\n` : '',
      ],
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: null,
      outputs: [],
      source: [
        'import matplotlib\n',
        "matplotlib.use('Agg')\n",
        'import matplotlib.pyplot as plt\n',
        'import numpy as np\n',
        '\n',
        'entities = analysis_data.get("entities", [])\n',
        'relations = analysis_data.get("relations", [])\n',
        'print(f"实体: {len(entities)}, 关系: {len(relations)}")\n',
      ],
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: null,
      outputs: [],
      source: [
        '# llm_01 实体类型分布\n',
        'tc = {}\n',
        'for e in entities:\n',
        '    t = e.get("type", "未知")\n',
        '    tc[t] = tc.get(t, 0) + e.get("count", 1)\n',
        'if tc:\n',
        '    fig, ax = plt.subplots(figsize=(10, 5))\n',
        '    ax.barh(list(tc.keys()), list(tc.values()), color="#4c72b0")\n',
        '    ax.set_title("实体类型分布")\n',
        '    plt.tight_layout(); plt.show()\n',
      ],
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: null,
      outputs: [],
      source: [
        '# llm_02 关系类型分布\n',
        'rc = {}\n',
        'for r in relations:\n',
        '    t = r.get("type", "未知")\n',
        '    rc[t] = rc.get(t, 0) + r.get("count", 1)\n',
        'if rc:\n',
        '    fig, ax = plt.subplots(figsize=(10, 5))\n',
        '    ax.bar(list(rc.keys()), list(rc.values()), color="#dd8452")\n',
        '    ax.set_title("关系类型分布")\n',
        '    plt.xticks(rotation=45, ha="right")\n',
        '    plt.tight_layout(); plt.show()\n',
      ],
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: null,
      outputs: [],
      source: [
        '# llm_03 Top 实体\n',
        'freq = sorted([(e.get("name",""), e.get("count",1)) for e in entities], key=lambda x:-x[1])[:15]\n',
        'if freq:\n',
        '    fig, ax = plt.subplots(figsize=(10, 6))\n',
        '    ax.barh([f[0][:20] for f in freq], [f[1] for f in freq], color="#55a868")\n',
        '    ax.set_title("Top 实体")\n',
        '    ax.invert_yaxis()\n',
        '    plt.tight_layout(); plt.show()\n',
      ],
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: null,
      outputs: [],
      source: [
        '# 实体共现热力图\n',
        'co = analysis_data.get("cooccurrence", [])\n',
        'if len(co) >= 3:\n',
        '    ents = list(set([c["source"] for c in co] + [c["target"] for c in co]))[:10]\n',
        '    idx = {e: i for i, e in enumerate(ents)}\n',
        '    mat = [[0]*len(ents) for _ in ents]\n',
        '    for c in co:\n',
        '        if c["source"] in idx and c["target"] in idx:\n',
        '            i, j = idx[c["source"]], idx[c["target"]]\n',
        '            mat[i][j] = mat[j][i] = c.get("weight", 1)\n',
        '    fig, ax = plt.subplots(figsize=(8, 8))\n',
        '    ax.imshow(mat, cmap="YlOrRd")\n',
        '    ax.set_xticks(range(len(ents))); ax.set_xticklabels([e[:8] for e in ents], rotation=45)\n',
        '    ax.set_yticks(range(len(ents))); ax.set_yticklabels([e[:8] for e in ents])\n',
        '    ax.set_title("实体共现热力图")\n',
        '    plt.tight_layout(); plt.show()\n',
      ],
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: null,
      outputs: [],
      source: [
        '# 规则挖掘: actor-action 流\n',
        'rm = analysis_data.get("ruleMining", {})\n',
        'flows = rm.get("actorActionFlows", [])\n',
        'if flows:\n',
        '    fig, ax = plt.subplots(figsize=(10, 6))\n',
        '    labels = [f"{f.get(\'actor\',\'\')[:12]}→{f.get(\'action\',\'\')[:12]}" for f in flows[:12]]\n',
        '    ax.barh(labels, [f.get("count",1) for f in flows[:12]], color="#c44e52")\n',
        '    ax.set_title("Actor-Action 规则流")\n',
        '    ax.invert_yaxis()\n',
        '    plt.tight_layout(); plt.show()\n',
      ],
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: null,
      outputs: [],
      source: [
        '# 事件分类\n',
        'cats = analysis_data.get("eventCategories", {})\n',
        'if cats:\n',
        '    fig, ax = plt.subplots(figsize=(8, 8))\n',
        '    ax.pie(cats.values(), labels=cats.keys(), autopct="%1.1f%%")\n',
        '    ax.set_title("事件分类分布")\n',
        '    plt.tight_layout(); plt.show()\n',
      ],
    },
    {
      cell_type: 'markdown',
      metadata: {},
      source: [
        '## 结论\n',
        (analysisData.conflictEvolution || '基于用户上传文章的自动分析。') + '\n',
      ],
    },
  ];

  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: 'Python 3 (Pyodide)', language: 'python', name: 'python3' },
    },
    cells,
  };
}

module.exports = { createFallbackNotebook };
