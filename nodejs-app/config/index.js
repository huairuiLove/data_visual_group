const { loadEnv } = require('../services/env-loader')
loadEnv()

const config = {
  neo4j: {
    url: process.env.NEO4J_URL || 'neo4j://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'dev_password_change_me',
  },

  llm: {
    baseURL: process.env.LLM_BASE_URL || 'http://localhost:1234/v1',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'qwen3-14b',
  },

  embeddings: {
    lmstudio: {
      baseURL: process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1',
      model: process.env.LM_STUDIO_EMBED_MODEL || 'text-embedding-nomic-embed-text-v1.5',
    },
  },

  doc: {
    chunkSize: 1000,
    chunkOverlap: 40,
  },

  analysis: {
    defaultMode: 'single_detailed', // single_detailed | multi_corpus
    requireMiddleEastTheme: true,
  },

  graph: {
    allowedNodes: [
      '军事组织',
      '政府机构',
      '政治人物',
      '武器装备',
      '武器系统',
      '地理位置',
      '地理区域',
      '冲突事件',
      '行动计划',
      '外交事件',
      '时间节点',
      '情报来源',
    ],
    allowedRelationships: [
      '部署于',
      '位于',
      '发生于',
      '隶属于',
      '指挥',
      '盟友',
      '敌对',
      '打击目标',
      '参与',
      '导致',
      '升级为',
      '响应于',
      '研发自',
      '装备',
      '使用',
      '报道',
      '证实',
      '矛盾',
    ],
  },

  host: process.env.HOST || '127.0.0.1',
  port: process.env.PORT || 3000,
}

config.setLLMConfig = function setLLMConfig(values) {
  config.llm = {
    ...config.llm,
    ...values,
  }
}

config.setEmbeddingConfig = function setEmbeddingConfig(values) {
  config.embeddings.lmstudio = {
    ...config.embeddings.lmstudio,
    ...values,
  }
}

module.exports = config
