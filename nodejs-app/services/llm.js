const OpenAI = require('openai')
const config = require('../config')

function createLLMClient() {
  const cfg = config.llm
  if (!cfg || !cfg.baseURL) {
    throw new Error('LLM Base URL 未配置，请在 API 设置中填写 OpenAI-compatible Base URL')
  }
  return new OpenAI({
    apiKey: (cfg.apiKey || 'not-needed').trim(),
    baseURL: normalizeBaseURL(cfg.baseURL),
  })
}

function normalizeBaseURL(baseURL) {
  return (baseURL || 'http://localhost:1234/v1').replace(/\/+$/, '')
}

function getModelName(_provider = 'openai-compatible', _role = 'chat') {
  return config.llm?.model || 'gpt-4o-mini'
}

function buildChatParams(model, messages, options = {}) {
  const params = {
    model,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? (model.includes('pro') ? 8192 : 4096),
    stream: false,
  }

  if (options.extra?.reasoning_effort && /^o\d|reasoning/i.test(model)) {
    params.reasoning_effort = options.extra.reasoning_effort
  }
  if (options.extra?.response_format) {
    params.response_format = options.extra.response_format
  }

  return params
}

function extractMessageContent(message) {
  if (!message) return ''
  let content = message.content || ''
  content = content.replace(/<\|redacted_end_of_sentence\|>/g, '').trim()

  if (!content && message.reasoning_content && !message.content) {
    return ''
  }
  return content
}

async function chat(messages, provider = 'openai-compatible', options = {}) {
  const client = createLLMClient(provider)
  const model = options.model || getModelName(provider, options.role || 'chat')
  let params = buildChatParams(model, messages, options)

  let response = await client.chat.completions.create(params)
  let content = extractMessageContent(response.choices[0]?.message)

  if (!content) {
    throw new Error(`LLM 返回空内容 (model=${model})，请检查模型名称或 max_tokens 设置`)
  }
  return content
}

async function testConnection({ baseURL, apiKey, model } = {}) {
  try {
    const normalizedBaseURL = normalizeBaseURL(baseURL || config.llm.baseURL)
    const client = new OpenAI({
      apiKey: (apiKey || 'not-needed').trim(),
      baseURL: normalizedBaseURL,
    })
    const testModel = model || getModelName()
    const resp = await client.chat.completions.create({
      model: testModel,
      messages: [{ role: 'user', content: 'Hi!' }],
      max_tokens: 20,
      stream: false,
    })
    const msg = extractMessageContent(resp.choices[0]?.message)
    return { success: true, message: msg, model: testModel, baseURL: normalizedBaseURL }
  } catch (e) {
    return { success: false, message: e.message }
  }
}

module.exports = {
  createLLMClient,
  getModelName,
  buildChatParams,
  extractMessageContent,
  normalizeBaseURL,
  chat,
  testConnection,
}
