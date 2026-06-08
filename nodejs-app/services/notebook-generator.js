/**
 * Jupyter Notebook 生成 — OpenAI-compatible 代码大模型
 */

const { chat, getModelName } = require('./llm')
const { NOTEBOOK_SYSTEM_PROMPT, buildNotebookUserPrompt } = require('./prompts/notebook')
const { buildNotebookAnalysisData } = require('../analysis/work1-metrics')
const { createFallbackNotebook } = require('./notebook-templates')

async function generateNotebook(analysisResult, options = {}) {
  // 默认走多智能体管线
  if (options.useMultiAgent !== false) {
    const { generateNotebookMultiAgent } = require('./agents/notebook-pipeline')
    return generateNotebookMultiAgent(analysisResult, options)
  }

  const analysisData = buildNotebookAnalysisData(analysisResult, options)
  const provider = options.provider || 'openai-compatible'
  const model = options.model || getModelName(provider, 'code')

  try {
    const response = await chat(
      [
        { role: 'system', content: NOTEBOOK_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildNotebookUserPrompt(analysisData, {
            focusAreas: options.focusAreas,
            articleCount: (analysisData.articles || []).length || 1,
          }),
        },
      ],
      provider,
      {
        model,
        temperature: 0.2,
        maxTokens: 8192,
        extra: {
          reasoning_effort: 'high',
          response_format: { type: 'json_object' },
        },
      }
    )

    const data = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || response)
    if (data.cells && Array.isArray(data.cells)) {
      data.metadata = data.metadata || {}
      data.metadata.kernelspec = data.metadata.kernelspec || {
        display_name: 'Python 3 (Pyodide)',
        language: 'python',
        name: 'python3',
      }
      return { notebook: data, analysisData, source: 'llm' }
    }
  } catch (e) {
    console.warn('LLM notebook generation failed, using fallback:', e.message)
  }

  return {
    notebook: createFallbackNotebook(analysisData),
    analysisData,
    source: 'fallback',
  }
}

module.exports = {
  createFallbackNotebook,
  generateNotebook,
}
