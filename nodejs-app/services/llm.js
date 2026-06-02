const OpenAI = require('openai');
const config = require('../config');

function createLLMClient(provider = 'deepseek') {
  const cfg = config.llm[provider];
  if (!cfg || !cfg.apiKey) {
    throw new Error(`LLM provider "${provider}" not configured`);
  }
  return new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
  });
}

function getModelName(provider = 'deepseek') {
  return config.llm[provider]?.model || 'deepseek-chat';
}

async function chat(messages, provider = 'deepseek', options = {}) {
  const client = createLLMClient(provider);
  const model = options.model || getModelName(provider);

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 2000,
    ...options.extra,
  });

  // Clean DeepSeek response if needed
  let content = response.choices[0].message.content;
  if (provider === 'deepseek') {
    content = content.replace(/<｜end▁of▁sentence｜>/g, '').trim();
  }
  return content;
}

async function testConnection(provider, apiKey, model) {
  try {
    const client = new OpenAI({ apiKey, baseURL: config.llm[provider]?.baseURL });
    const resp = await client.chat.completions.create({
      model: model || getModelName(provider),
      messages: [{ role: 'user', content: 'Hi!' }],
      max_tokens: 10,
    });
    return { success: true, message: resp.choices[0].message.content };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

module.exports = { createLLMClient, getModelName, chat, testConnection };
