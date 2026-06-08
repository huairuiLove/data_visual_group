/**
 * 多智能体 Notebook 生成管线
 * Profiler → Planner → Coder → Reviewer
 * 仅基于用户上传文章数据
 */

const { chat, getModelName } = require('../llm')
const { parseJsonFromResponse } = require('../extraction')
const { buildNotebookAnalysisData } = require('../../analysis/work1-metrics')
const { createFallbackNotebook } = require('../notebook-templates')
const {
  PROFILER_SYSTEM,
  PLANNER_SYSTEM,
  CODER_SYSTEM,
  REVIEWER_SYSTEM,
  buildProfilerUserPrompt,
  buildPlannerUserPrompt,
  buildCoderUserPrompt,
  buildReviewerUserPrompt,
} = require('../prompts/agents')

function parseAgentJson(response) {
  const match = response.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return parseJsonFromResponse(response)
  }
}

function normalizeNotebook(notebook) {
  if (!notebook?.cells) return null
  notebook.nbformat = notebook.nbformat || 4
  notebook.nbformat_minor = notebook.nbformat_minor || 5
  notebook.metadata = notebook.metadata || {}
  notebook.metadata.kernelspec = notebook.metadata.kernelspec || {
    display_name: 'Python 3 (Pyodide)',
    language: 'python',
    name: 'python3',
  }
  notebook.cells = notebook.cells.map((cell) => ({
    ...cell,
    source: Array.isArray(cell.source) ? cell.source : [String(cell.source || '')],
    metadata: cell.metadata || {},
    outputs: cell.outputs || [],
    execution_count: cell.execution_count ?? null,
  }))
  return notebook
}

function validatePythonCells(notebook) {
  const issues = []
  const codeCells = (notebook.cells || []).filter((c) => c.cell_type === 'code')

  for (const cell of codeCells) {
    const code = cell.source.join('')
    if (/import\s+seaborn|from\s+seaborn/.test(code)) issues.push('使用了 seaborn')
    if (/import\s+sklearn|from\s+sklearn/.test(code)) issues.push('使用了 sklearn')
    if (/\bopen\s*\(/.test(code)) issues.push('使用了 open() 读文件')
    if (!/matplotlib\.use\s*\(\s*['"]Agg['"]\s*\)/.test(code) && /import matplotlib/.test(code)) {
      issues.push('缺少 matplotlib.use Agg')
    }
  }

  return issues
}

function autoFixNotebook(notebook) {
  const fixed = normalizeNotebook({ ...notebook })
  if (!fixed) return null

  for (const cell of fixed.cells) {
    if (cell.cell_type !== 'code') continue
    let code = cell.source.join('')

    if (/import matplotlib/.test(code) && !/matplotlib\.use/.test(code)) {
      code = "import matplotlib\nmatplotlib.use('Agg')\n" + code.replace(/import matplotlib\n?/, '')
    }
    code = code.replace(/import seaborn[^\n]*\n/g, '')
    code = code.replace(/sns\.\w+/g, '# seaborn removed')

    cell.source = code.split('\n').map((line, i, arr) => (i < arr.length - 1 ? `${line}\n` : line))
  }

  return fixed
}

async function runAgent(name, systemPrompt, userPrompt, provider, model, options = {}) {
  const start = Date.now()
  const response = await chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    provider,
    {
      model,
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens ?? 4096,
      extra: {
        ...(options.reasoning_effort ? { reasoning_effort: options.reasoning_effort } : {}),
      },
    }
  )

  const parsed = parseAgentJson(response)
  return {
    agent: name,
    duration_ms: Date.now() - start,
    raw: response.slice(0, 500),
    result: parsed,
    success: !!parsed,
  }
}

async function generateNotebookMultiAgent(analysisResult, options = {}) {
  const provider = options.provider || 'openai-compatible'
  const flashModel = options.flashModel || getModelName(provider)
  const proModel = options.proModel || getModelName(provider, 'code')
  const trace = []

  const analysisData = buildNotebookAnalysisData(analysisResult, options)

  // Agent 1: DataProfiler
  let profile
  try {
    const profilerStep = await runAgent(
      'DataProfiler',
      PROFILER_SYSTEM,
      buildProfilerUserPrompt(analysisData),
      provider,
      flashModel,
      { maxTokens: 2000 }
    )
    trace.push(profilerStep)
    profile = profilerStep.result
  } catch (e) {
    trace.push({ agent: 'DataProfiler', success: false, error: e.message })
  }

  if (!profile) {
    profile = {
      data_quality: { entity_count: analysisData.entities?.length || 0, coverage: 'medium' },
      dominant_themes: analysisData.articles?.map((a) => a.title).slice(0, 2) || [],
      recommended_focus: options.focusAreas || ['实体分布', '关系网络'],
      analysis_narrative: analysisData.themeSummary || '基于用户上传文章的分析数据',
    }
  }

  // Agent 2: VizPlanner
  let plan
  try {
    const plannerStep = await runAgent(
      'VizPlanner',
      PLANNER_SYSTEM,
      buildPlannerUserPrompt(profile, options.focusAreas),
      provider,
      flashModel,
      { reasoning_effort: 'medium', maxTokens: 3000 }
    )
    trace.push(plannerStep)
    plan = plannerStep.result
  } catch (e) {
    trace.push({ agent: 'VizPlanner', success: false, error: e.message })
  }

  // Agent 3: CodeWriter
  let notebook
  try {
    const coderStep = await runAgent(
      'CodeWriter',
      CODER_SYSTEM,
      buildCoderUserPrompt(plan || { cells_plan: [] }, analysisData),
      provider,
      proModel,
      { reasoning_effort: 'high', maxTokens: 8192 }
    )
    trace.push(coderStep)
    notebook = normalizeNotebook(coderStep.result?.cells ? coderStep.result : coderStep.result?.notebook)
    if (!notebook && coderStep.result?.nbformat) {
      notebook = normalizeNotebook(coderStep.result)
    }
  } catch (e) {
    trace.push({ agent: 'CodeWriter', success: false, error: e.message })
  }

  // Agent 4: CodeReviewer
  if (notebook) {
    const preIssues = validatePythonCells(notebook)
    if (preIssues.length) {
      try {
        const reviewerStep = await runAgent(
          'CodeReviewer',
          REVIEWER_SYSTEM,
          buildReviewerUserPrompt(notebook),
          provider,
          proModel,
          { reasoning_effort: 'high', maxTokens: 8192 }
        )
        trace.push(reviewerStep)

        if (reviewerStep.result?.notebook) {
          notebook = normalizeNotebook(reviewerStep.result.notebook)
        }
      } catch (e) {
        trace.push({ agent: 'CodeReviewer', success: false, error: e.message })
        notebook = autoFixNotebook(notebook)
      }
    } else {
      trace.push({ agent: 'CodeReviewer', success: true, skipped: true, reason: '无问题，跳过' })
    }
  }

  // Fallback
  if (!notebook?.cells?.length) {
    notebook = createFallbackNotebook(analysisData)
    trace.push({ agent: 'Fallback', success: true, reason: 'LLM 生成失败，使用 work1 内置模板' })
    return {
      notebook,
      analysisData,
      source: 'fallback',
      trace,
      profile,
      plan,
    }
  }

  notebook = autoFixNotebook(notebook) || notebook

  return {
    notebook,
    analysisData,
    source: 'multi_agent',
    trace,
    profile,
    plan,
    validation: validatePythonCells(notebook),
  }
}

module.exports = {
  generateNotebookMultiAgent,
  runAgent,
  validatePythonCells,
  autoFixNotebook,
  normalizeNotebook,
}
