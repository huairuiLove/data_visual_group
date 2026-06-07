/**
 * ReportWriter Agent — 根据生图结果撰写研究报告
 */

const { chat } = require('../llm');
const { REPORT_WRITER_SYSTEM, buildReportUserPrompt } = require('../prompts/report');
const { parseJsonFromResponse } = require('../extraction');

async function writeResearchReport(payload, provider = 'deepseek') {
  const response = await chat([
    { role: 'system', content: REPORT_WRITER_SYSTEM },
    { role: 'user', content: buildReportUserPrompt(payload) },
  ], provider, {
    model: 'deepseek-v4-pro',
    temperature: 0.3,
    maxTokens: 6000,
    extra: {
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    },
  });

  const parsed = parseJsonFromResponse(response);
  if (parsed?.markdown) {
    return {
      title: parsed.title || payload.title || '中东冲突研究报告',
      markdown: parsed.markdown,
      highlights: parsed.highlights || [],
      riskLevel: parsed.risk_level || 'medium',
      source: 'llm',
    };
  }

  return buildFallbackReport(payload);
}

function buildFallbackReport(payload) {
  const s = payload.analysisSummary || {};
  const charts = payload.chartDescriptions || [];
  const lines = [
    `# ${payload.title || '中东冲突态势研究报告'}`,
    '',
    `> 分析模式: ${payload.mode || 'single'} | 生成时间: ${new Date().toISOString().slice(0, 16)}`,
    '',
    '## 执行摘要',
    payload.themeSummary || payload.profile?.analysis_narrative || '基于用户上传文章的结构化分析。',
    '',
    '## 核心数据',
    `- 实体数: ${s.entityCount ?? '—'}`,
    `- 关系数: ${s.relationCount ?? '—'}`,
    `- 规则挖掘事件: ${s.ruleEventCount ?? '—'}`,
    `- KDD 聚类数: ${s.kddClusters ?? '—'}`,
    '',
    '## 可视化解读',
    ...charts.map((c, i) => `### 图 ${i + 1}: ${c.title}\n${c.description || c.stdout || '图表已生成'}`),
    '',
    '## 结论',
    payload.conflictEvolution || '建议结合图谱与时间线持续跟踪态势演化。',
  ];

  return {
    title: payload.title || '中东冲突态势研究报告',
    markdown: lines.join('\n'),
    highlights: charts.map(c => c.title).slice(0, 5),
    riskLevel: 'medium',
    source: 'fallback',
  };
}

module.exports = { writeResearchReport, buildFallbackReport };
