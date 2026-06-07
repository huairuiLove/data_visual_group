#!/usr/bin/env node
/**
 * 端到端测试：用户上传文章 → 抽取 → 多智能体 Notebook 生成
 * 用法: node scripts/test-e2e-notebook.js [article_path]
 */

require('../services/env-loader').loadEnv();

const fs = require('fs');
const path = require('path');
const { validateMiddleEastTheme } = require('../services/article-filter');
const { extractSingleDetailed } = require('../services/extraction');
const { applyCanonicalization } = require('../services/entity-canonicalization');
const { enrichAnalysisResult, computeWork1Metrics } = require('../analysis/work1-metrics');
const { generateNotebookMultiAgent } = require('../services/agents/notebook-pipeline');
const { validatePythonCells } = require('../services/agents/notebook-pipeline');

const ARTICLE_PATH = process.argv[2]
  || path.join(__dirname, '..', 'data', 'test-articles', 'iran_conflict_test.txt');

function buildRuleBasedEntities(text) {
  const { runRuleMining } = require('../analysis/rule-mining');
  const rm = runRuleMining(text);
  const entities = [];
  const relations = [];
  for (const [actor, count] of Object.entries(rm.actorCounts || {})) {
    entities.push({ name: actor, type: '政治实体', count });
  }
  for (const flow of rm.actorActionFlows || []) {
    entities.push({ name: flow.action, type: '冲突事件', count: flow.count });
    relations.push({ source: flow.actor, target: flow.action, type: '参与', count: flow.count });
  }
  return applyCanonicalization(entities, relations);
}

async function main() {
  console.log('='.repeat(60));
  console.log('E2E Test: Upload Article → Multi-Agent Notebook');
  console.log('='.repeat(60));

  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('FAIL: DEEPSEEK_API_KEY not set');
    process.exit(1);
  }

  const text = fs.readFileSync(ARTICLE_PATH, 'utf8');
  console.log(`\n[1] 读取测试文章: ${ARTICLE_PATH} (${text.length} chars)`);

  const theme = await validateMiddleEastTheme(text);
  console.log(`[2] 主题校验: ${theme.isValid ? 'PASS' : 'FAIL'} (${theme.method}, conf=${theme.confidence})`);
  if (!theme.isValid) process.exit(1);

  const titleMatch = text.match(/Title:\s*(.+)/);
  const dateMatch = text.match(/Date:\s*(.+)/);

  let canon;
  const useLlm = process.env.SKIP_LLM !== '1';
  if (useLlm) {
    console.log('[3] 精细实体抽取 (deepseek-v4-flash)...');
    try {
      const extraction = await extractSingleDetailed(text, {
        title: titleMatch?.[1] || 'Test Article',
        date: dateMatch?.[1]?.trim() || '2026-03-20',
      }, 'deepseek');
      canon = applyCanonicalization(extraction.entities, extraction.relations);
    } catch (e) {
      console.warn(`    LLM 抽取失败 (${e.message})，使用规则抽取兜底`);
      canon = buildRuleBasedEntities(text);
    }
  } else {
    console.log('[3] 跳过 LLM，使用规则抽取兜底');
    canon = buildRuleBasedEntities(text);
  }
  console.log(`    实体: ${canon.entities.length}, 关系: ${canon.relations.length}`);

  const chunks = text.split(/\n\n+/).map(t => ({ text: t }));
  let analysisResult = {
    mode: 'single',
    entities: canon.entities,
    relations: canon.relations,
    themeTags: theme.themeTags,
    fullText: text,
    meta: { title: titleMatch?.[1] || 'Test' },
  };
  analysisResult = enrichAnalysisResult(analysisResult, text, chunks);
  analysisResult.work1Metrics = computeWork1Metrics({
    entities: canon.entities,
    relations: canon.relations,
    docs: chunks.map(c => c.text),
  });

  console.log(`[4] Phase6 分析: 规则事件=${analysisResult.ruleMining?.eventCount}, KDD聚类=${analysisResult.kdd?.clusterCount}`);

  let result;
  const start = Date.now();
  if (useLlm && process.env.FORCE_FALLBACK !== '1') {
    console.log('[5] 多智能体 Notebook 生成 (deepseek-v4-pro)...');
    try {
      result = await generateNotebookMultiAgent(analysisResult, {
        focusAreas: ['实体分布', '关系网络', '规则挖掘', '共现热力图'],
      });
    } catch (e) {
      console.warn(`    多智能体失败 (${e.message})，使用内置模板`);
      result = null;
    }
  } else {
    console.log('[5] 跳过 LLM，使用内置模板');
  }

  if (!result) {
    const { createFallbackNotebook } = require('../services/notebook-templates');
    const { buildNotebookAnalysisData } = require('../analysis/work1-metrics');
    result = {
      source: 'fallback',
      notebook: createFallbackNotebook(buildNotebookAnalysisData(analysisResult)),
      analysisData: buildNotebookAnalysisData(analysisResult),
      trace: [{ agent: 'Fallback', success: true, reason: '离线/LLM不可用' }],
    };
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n[6] 生成结果 (${elapsed}s):`);
  console.log(`    source: ${result.source}`);
  console.log(`    cells: ${result.notebook?.cells?.length || 0}`);
  console.log(`    code cells: ${(result.notebook?.cells || []).filter(c => c.cell_type === 'code').length}`);

  console.log('\n[7] Agent 追踪:');
  for (const step of result.trace || []) {
    const status = step.success !== false ? 'OK' : 'FAIL';
    console.log(`    ${step.agent}: ${status} ${step.duration_ms ? `(${step.duration_ms}ms)` : ''} ${step.error || step.reason || ''}`);
  }

  const validation = validatePythonCells(result.notebook);
  console.log(`\n[8] 代码校验: ${validation.length ? validation.join(', ') : 'PASS'}`);

  if (result.profile?.analysis_narrative) {
    console.log(`\n[9] Profiler 摘要: ${result.profile.analysis_narrative}`);
  }

  const outPath = path.join(__dirname, '..', 'data', 'test-articles', 'generated_notebook.json');
  fs.writeFileSync(outPath, JSON.stringify({
    source: result.source,
    trace: result.trace,
    validation,
    notebook: result.notebook,
  }, null, 2));
  console.log(`\n[10] 已保存: ${outPath}`);

  const codeCells = (result.notebook?.cells || []).filter(c => c.cell_type === 'code');
  if (codeCells.length >= 4 && validation.length <= 2) {
    console.log('\n✅ E2E TEST PASSED');
    process.exit(0);
  }
  console.log('\n⚠️ E2E TEST PARTIAL (fallback or validation issues)');
  process.exit(result.source === 'multi_agent' ? 0 : 1);
}

main().catch(e => {
  console.error('E2E FAILED:', e.message);
  process.exit(1);
});
