/**
 * 研究报告持久化 — Neo4j + 本地图表文件
 * 不存储 Notebook 代码，仅存储报告正文与图表
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const neo4j = require('neo4j-driver');
const { runQuery } = require('./neo4j');

const REPORTS_DIR = path.join(__dirname, '..', 'data', 'reports');

async function ensureSchema() {
  await fsp.mkdir(REPORTS_DIR, { recursive: true });
  try {
    await runQuery(`
      CREATE CONSTRAINT research_report_id IF NOT EXISTS
      FOR (r:ResearchReport) REQUIRE r.id IS UNIQUE
    `);
  } catch {
    // constraint may already exist with different name
  }
}

function generateReportId() {
  return `rpt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

async function saveChartImages(reportId, charts) {
  const dir = path.join(REPORTS_DIR, reportId);
  await fsp.mkdir(dir, { recursive: true });

  const saved = [];
  for (let i = 0; i < charts.length; i++) {
    const chart = charts[i];
    if (!chart.imageBase64) continue;
    const filename = `chart_${i}.png`;
    const filepath = path.join(dir, filename);
    const buf = Buffer.from(chart.imageBase64, 'base64');
    await fsp.writeFile(filepath, buf);
    saved.push({
      index: i,
      title: chart.title || `图表 ${i + 1}`,
      filename,
      relativePath: `data/reports/${reportId}/${filename}`,
    });
  }
  return saved;
}

async function saveResearchReport({
  title,
  mode = 'single',
  markdown,
  highlights = [],
  riskLevel = 'medium',
  reportSource = 'llm',
  articles = [],
  themeTags = [],
  analysisSummary = {},
  charts = [],
  fileHash = '',
}) {
  await ensureSchema();

  const id = generateReportId();
  const createdAt = new Date().toISOString();
  const savedCharts = await saveChartImages(id, charts);

  const dir = path.join(REPORTS_DIR, id);
  await fsp.writeFile(path.join(dir, 'report.md'), markdown, 'utf8');
  await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify({
    id, title, mode, createdAt, highlights, riskLevel, reportSource,
    articles, themeTags, analysisSummary, charts: savedCharts,
  }, null, 2), 'utf8');

  await runQuery(`
    CREATE (r:ResearchReport {
      id: $id,
      title: $title,
      mode: $mode,
      createdAt: $createdAt,
      markdown: $markdown,
      highlights: $highlights,
      riskLevel: $riskLevel,
      reportSource: $reportSource,
      articleTitles: $articleTitles,
      themeTags: $themeTags,
      entityCount: $entityCount,
      relationCount: $relationCount,
      chartCount: $chartCount,
      fileHash: $fileHash
    })
  `, {
    id,
    title,
    mode,
    createdAt,
    markdown: markdown.slice(0, 50000),
    highlights,
    riskLevel,
    reportSource,
    articleTitles: articles.map(a => a.title || a).slice(0, 20),
    themeTags,
    entityCount: analysisSummary.entityCount || 0,
    relationCount: analysisSummary.relationCount || 0,
    chartCount: savedCharts.length,
    fileHash: fileHash || '',
  });

  for (const chart of savedCharts) {
    await runQuery(`
      MATCH (r:ResearchReport {id: $reportId})
      CREATE (c:ReportChart {
        reportId: $reportId,
        index: $index,
        title: $chartTitle,
        filePath: $filePath
      })
      CREATE (r)-[:HAS_CHART]->(c)
    `, {
      reportId: id,
      index: chart.index,
      chartTitle: chart.title,
      filePath: chart.relativePath,
    });
  }

  return { id, title, mode, createdAt, chartCount: savedCharts.length, highlights };
}

async function listResearchReports(limit = 50) {
  await ensureSchema();
  const lim = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const rows = await runQuery(`
    MATCH (r:ResearchReport)
    RETURN r.id AS id, r.title AS title, r.mode AS mode,
           r.createdAt AS createdAt, r.chartCount AS chartCount,
           r.entityCount AS entityCount, r.riskLevel AS riskLevel,
           r.articleTitles AS articleTitles
    ORDER BY r.createdAt DESC
    LIMIT $limit
  `, { limit: neo4j.int(lim) });

  return rows;
}

async function getResearchReport(id) {
  await ensureSchema();
  const rows = await runQuery(`
    MATCH (r:ResearchReport {id: $id})
    RETURN r.id AS id, r.title AS title, r.mode AS mode, r.createdAt AS createdAt,
           r.markdown AS markdown, r.highlights AS highlights, r.riskLevel AS riskLevel,
           r.reportSource AS reportSource, r.articleTitles AS articleTitles,
           r.themeTags AS themeTags, r.entityCount AS entityCount,
           r.relationCount AS relationCount, r.chartCount AS chartCount
  `, { id });

  if (!rows.length) return null;

  const report = rows[0];
  const chartRows = await runQuery(`
    MATCH (r:ResearchReport {id: $id})-[:HAS_CHART]->(c:ReportChart)
    RETURN c.index AS index, c.title AS title, c.filePath AS filePath
    ORDER BY c.index
  `, { id });
  const charts = chartRows || [];

  const chartData = [];
  for (const c of charts) {
    const fp = path.join(__dirname, '..', c.filePath || '');
    try {
      const buf = await fsp.readFile(fp);
      chartData.push({
        index: c.index,
        title: c.title,
        imageBase64: buf.toString('base64'),
        filePath: c.filePath,
      });
    } catch {
      chartData.push({ index: c.index, title: c.title, imageBase64: null });
    }
  }

  return {
    id: report.id,
    title: report.title,
    mode: report.mode,
    createdAt: report.createdAt,
    markdown: report.markdown,
    highlights: report.highlights || [],
    riskLevel: report.riskLevel,
    reportSource: report.reportSource,
    articleTitles: report.articleTitles || [],
    themeTags: report.themeTags || [],
    entityCount: report.entityCount,
    relationCount: report.relationCount,
    chartCount: report.chartCount,
    charts: chartData,
  };
}


module.exports = {
  REPORTS_DIR,
  ensureSchema,
  saveResearchReport,
  listResearchReports,
  getResearchReport,
};
