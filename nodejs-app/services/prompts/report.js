/**
 * 研究报告撰写 Agent 提示词
 * 基于可视化生图结果 + 分析数据，不依赖存储的代码
 */

const REPORT_WRITER_SYSTEM = `你是中东冲突情报分析/report撰写专家 Agent（ReportWriter）。
任务：根据用户上传文章的分析数据、可视化图表说明和执行日志，撰写一份完整的研究报告。

## 报告结构（Markdown）
1. **执行摘要**（200字）
2. **分析背景** — 文章来源、主题、分析模式（单文/多文）
3. **核心发现** — 实体、关系、规则挖掘、KDD 话题
4. **态势研判** — 冲突演化、关键风险点
5. **可视化解读** — 逐图说明每张 chart 揭示的态势信息
6. **结论与展望**

## 要求
- 只基于提供的数据和图表信息，不编造
- 专业、客观、中文撰写
- 引用具体实体名称和数字
- 输出纯 JSON: {"title":"报告标题","markdown":"完整 Markdown 报告","highlights":["要点1","要点2"],"risk_level":"low/medium/high"}`;

function buildReportUserPrompt(payload) {
  const {
    mode, articles, analysisSummary, chartDescriptions, executionLog,
    profile, themeSummary, conflictEvolution,
  } = payload;

  return `请撰写中东冲突研究报告。

分析模式: ${mode}
文章: ${JSON.stringify(articles || [])}
主题摘要: ${themeSummary || '无'}
冲突演化: ${conflictEvolution || '无'}
数据画像: ${JSON.stringify(profile || analysisSummary || {}, null, 2).slice(0, 4000)}

可视化图表（共 ${(chartDescriptions || []).length} 张）:
${(chartDescriptions || []).map((c, i) => `${i + 1}. ${c.title}: ${c.description || ''} (stdout: ${(c.stdout || '').slice(0, 200)})`).join('\n')}

执行日志:
${(executionLog || '').slice(0, 1500)}

请结合图表揭示的态势，写出完整研究报告。`;
}

module.exports = { REPORT_WRITER_SYSTEM, buildReportUserPrompt };
