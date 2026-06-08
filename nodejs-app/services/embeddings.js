const fetch = require('node-fetch')
const config = require('../config')

class LocalEmbeddings {
  constructor(baseURL, model) {
    this.baseURL = baseURL || config.embeddings.lmstudio.baseURL
    this.model = model || config.embeddings.lmstudio.model
  }

  async embedQuery(text) {
    const resp = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text, model: this.model }),
    })
    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`Embedding request failed (${resp.status}): ${body.slice(0, 200)}`)
    }
    const json = await resp.json()
    return json.data[0].embedding
  }

  async embedDocuments(texts) {
    const results = []
    for (const text of texts) {
      results.push(await this.embedQuery(text))
    }
    return results
  }
}

let embeddingsInstance = null

function resetEmbeddings() {
  embeddingsInstance = null
}

function getEmbeddings() {
  if (!embeddingsInstance) {
    embeddingsInstance = new LocalEmbeddings()
  }
  return embeddingsInstance
}

async function testEmbeddings(type, options = {}) {
  try {
    let result
    if (type === 'lmstudio' || type === 'local' || type === '本地') {
      const emb = new LocalEmbeddings(
        options.baseURL || config.embeddings.lmstudio.baseURL,
        options.model || config.embeddings.lmstudio.model
      )
      result = await emb.embedQuery('test')
    } else {
      const OpenAI = require('openai')
      const client = new OpenAI({
        apiKey: options.apiKey || config.llm.apiKey || 'not-needed',
        baseURL: config.llm.baseURL,
      })
      const resp = await client.embeddings.create({
        model: options.model || 'text-embedding-ada-002',
        input: 'test',
      })
      result = resp.data[0].embedding
    }
    return { success: true, message: `成功生成嵌入向量，维度: ${result.length}` }
  } catch (e) {
    return { success: false, message: e.message }
  }
}

module.exports = { LocalEmbeddings, getEmbeddings, resetEmbeddings, testEmbeddings }
