#!/usr/bin/env node
/** 测试：生图 → ReportWriter → Neo4j 存报告（不含代码） */
require('../services/env-loader').loadEnv()

const fs = require('fs')
const path = require('path')
const { validateMiddleEastTheme } = require('../services/article-filter')
const { extractSingleDetailed } = require('../services/extraction')
const { applyCanonicalization } = require('../services/entity-canonicalization')
const { enrichAnalysisResult, computeWork1Metrics } = require('../analysis/work1-metrics')
const { generateNotebookMultiAgent } = require('../services/agents/notebook-pipeline')
const { writeResearchReport } = require('../services/agents/report-writer')
const {
  saveResearchReport,
  listResearchReports,
  getResearchReport,
  ensureSchema,
} = require('../services/research-report-db')

const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function main() {
  const articlePath = path.join(__dirname, '..', 'data', 'test-articles', 'iran_conflict_test.txt')
  const text = fs.readFileSync(articlePath, 'utf8')

  console.log('[1] 主题校验...')
  const theme = await validateMiddleEastTheme(text)
  if (!theme.isValid) throw new Error('主题校验失败')

  console.log('[2] 实体抽取...')
  let entities, relations
  try {
    const ext = await extractSingleDetailed(text, { title: 'Iran Conflict Test', date: '2026-03-20' })
    ;({ entities, relations } = applyCanonicalization(ext.entities, ext.relations))
    console.log(`    LLM: ${entities.length} 实体, ${relations.length} 关系`)
  } catch (e) {
    console.warn(`    LLM 失败: ${e.message}`)
    const { runRuleMining } = require('../analysis/rule-mining')
    const rm = runRuleMining(text)
    entities = Object.entries(rm.actorCounts).map(([name, count]) => ({ name, type: '政治实体', count }))
    relations = []
  }

  let ar = { mode: 'single', entities, relations, themeTags: theme.themeTags, fullText: text }
  ar = enrichAnalysisResult(ar, text, [{ text }])
  ar.work1Metrics = computeWork1Metrics({ entities, relations, docs: [text] })

  console.log('[3] 多智能体 Notebook（仅内存，不存储）...')
  let charts
  try {
    const nb = await generateNotebookMultiAgent(ar, { focusAreas: ['实体分布', '规则挖掘'] })
    console.log(`    Notebook cells: ${nb.notebook?.cells?.length}, source: ${nb.source}`)
    charts = [
      {
        title: '实体类型分布',
        description: '测试图表1',
        imageBase64: TINY_PNG,
        stdout: 'entities: ' + entities.length,
      },
      {
        title: '关系类型分布',
        description: '测试图表2',
        imageBase64: TINY_PNG,
        stdout: 'relations: ' + relations.length,
      },
    ]
  } catch (e) {
    console.warn(`    Notebook 失败: ${e.message}，使用模拟图表`)
    charts = [
      { title: '实体类型分布', imageBase64: TINY_PNG, stdout: `entities: ${entities.length}` },
      { title: '规则挖掘流', imageBase64: TINY_PNG, stdout: `events: ${ar.ruleMining?.eventCount}` },
    ]
  }

  console.log('[4] ReportWriter 撰写报告...')
  let report
  try {
    report = await writeResearchReport({
      title: '测试研究报告: Iran Conflict',
      mode: 'single',
      articles: [{ title: 'Iran Conflict Test' }],
      analysisSummary: {
        entityCount: entities.length,
        relationCount: relations.length,
        ruleEventCount: ar.ruleMining?.eventCount,
        kddClusters: ar.kdd?.clusterCount,
      },
      chartDescriptions: charts,
      executionLog: charts.map((c) => c.stdout).join('\n'),
      themeSummary: theme.themeTags?.join(', '),
    })
  } catch (e) {
    console.warn(`    ReportWriter LLM 失败: ${e.message}，使用模板`)
    const { buildFallbackReport } = require('../services/agents/report-writer')
    report = buildFallbackReport({
      title: '测试研究报告: Iran Conflict',
      mode: 'single',
      chartDescriptions: charts,
      themeSummary: theme.themeTags?.join(', '),
      analysisSummary: { entityCount: entities.length, ruleEventCount: ar.ruleMining?.eventCount },
    })
  }
  console.log(`    报告来源: ${report.source}, 标题: ${report.title}`)

  console.log('[5] 存入 Neo4j...')
  await ensureSchema()
  const saved = await saveResearchReport({
    title: report.title,
    mode: 'single',
    markdown: report.markdown,
    highlights: report.highlights,
    riskLevel: report.riskLevel,
    reportSource: report.source,
    articles: [{ title: 'Iran Conflict Test' }],
    themeTags: theme.themeTags,
    analysisSummary: { entityCount: entities.length, relationCount: relations.length },
    charts,
  })
  console.log(`    已保存: ${saved.id}`)

  const loaded = await getResearchReport(saved.id)
  const list = await listResearchReports(5)
  console.log(
    `[6] 验证: 报告库共 ${list.length} 条, 加载 markdown ${loaded.markdown?.length} 字, 图表 ${loaded.charts?.length} 张`
  )
  console.log('\n✅ 报告存库测试完成')
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
