const OpenAI = require('openai');
const config = require('../config');

const V4_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner']);

function createLLMClient(provider = 'deepseek') {
  const cfg = config.llm[provider];
  if (!cfg || !cfg.apiKey) {
    throw new Error(`LLM provider "${provider}" not configured. 请检查 Agent-main/.env 或 nodejs-app/.env 中的 DEEPSEEK_API_KEY`);
  }
  return new OpenAI({
    apiKey: cfg.apiKey.trim(),
    baseURL: normalizeBaseURL(cfg.baseURL),
  });
}

function normalizeBaseURL(baseURL) {
  const url = (baseURL || 'https://api.deepseek.com').replace(/\/+$/, '');
  // OpenAI SDK 会自动拼接 /chat/completions；官方文档两种写法均可用
  return url;
}

function getModelName(provider = 'deepseek', role = 'chat') {
  const cfg = config.llm[provider];
  if (!cfg) return 'deepseek-v4-flash';
  if (role === 'code') return cfg.codeModel || 'deepseek-v4-pro';
  return cfg.model || 'deepseek-v4-flash';
}

function defaultThinkingForModel(model, role) {
  if (!model.startsWith('deepseek-v4')) return undefined;
  if (role === 'code' || model.includes('pro')) {
    return { type: 'enabled' };
  }
  return { type: 'disabled' };
}

function buildChatParams(model, messages, options = {}) {
  const role = options.role || 'chat';
  const params = {
    model,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? (model.includes('pro') ? 8192 : 4096),
    stream: false,
  };

  const thinking = options.extra?.thinking ?? defaultThinkingForModel(model, role);
  if (thinking && (V4_MODELS.has(model) || model.startsWith('deepseek-v4'))) {
    params.thinking = thinking;
  }
  if (options.extra?.reasoning_effort) {
    params.reasoning_effort = options.extra.reasoning_effort;
  }
  if (options.extra?.response_format) {
    params.response_format = options.extra.response_format;
  }

  return params;
}

function extractMessageContent(message) {
  if (!message) return '';
  let content = message.content || '';
  content = content.replace(/<\|redacted_end_of_sentence\|>/g, '').trim();

  // V4 思考模式：content 可能为空，reasoning_content 是推理过程而非最终答案
  // 仅当 content 为空且没有 reasoning 时返回空
  if (!content && message.reasoning_content && !message.content) {
    // 推理未完成导致无 content — 调用方应增大 max_tokens 或关闭 thinking
    return '';
  }
  return content;
}

async function chat(messages, provider = 'deepseek', options = {}) {
  const client = createLLMClient(provider);
  const model = options.model || getModelName(provider, options.role || 'chat');
  let params = buildChatParams(model, messages, options);

  let response = await client.chat.completions.create(params);
  let content = extractMessageContent(response.choices[0]?.message);

  // V4 思考模式 token 不足时 content 为空，自动降级重试
  if (!content && params.thinking?.type === 'enabled') {
    params = { ...params, thinking: { type: 'disabled' }, max_tokens: options.maxTokens ?? 4096 };
    response = await client.chat.completions.create(params);
    content = extractMessageContent(response.choices[0]?.message);
  }

  if (!content) {
    throw new Error(`LLM 返回空内容 (model=${model})，请检查 max_tokens 或 thinking 设置`);
  }
  return content;
}

async function testConnection(provider, apiKey, model) {
  try {
    const baseURL = normalizeBaseURL(config.llm[provider]?.baseURL);
    const client = new OpenAI({ apiKey: apiKey.trim(), baseURL });
    const testModel = model || getModelName(provider);
    const resp = await client.chat.completions.create({
      model: testModel,
      messages: [{ role: 'user', content: 'Hi!' }],
      max_tokens: 20,
      thinking: testModel.startsWith('deepseek-v4') ? { type: 'disabled' } : undefined,
      stream: false,
    });
    const msg = extractMessageContent(resp.choices[0]?.message);
    return { success: true, message: msg, model: testModel, baseURL };
  } catch (e) {
    return { success: false, message: e.message };
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
  V4_MODELS,
};
