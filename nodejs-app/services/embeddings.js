const fetch = require('node-fetch');
const config = require('../config');

class LocalEmbeddings {
  constructor(baseURL, model) {
    this.baseURL = baseURL || config.embeddings.local.baseURL;
    this.model = model || config.embeddings.local.model;
  }

  async embedQuery(text) {
    const resp = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text, model: this.model }),
    });
    const json = await resp.json();
    return json.data[0].embedding;
  }

  async embedDocuments(texts) {
    const results = [];
    for (const text of texts) {
      results.push(await this.embedQuery(text));
    }
    return results;
  }
}

let embeddingsInstance = null;

function getEmbeddings() {
  if (!embeddingsInstance) {
    embeddingsInstance = new LocalEmbeddings();
  }
  return embeddingsInstance;
}

async function testEmbeddings(type, options = {}) {
  try {
    let result;
    if (type === 'local' || type === '本地') {
      const emb = new LocalEmbeddings(options.baseURL, options.model);
      result = await emb.embedQuery('test');
    } else {
      // OpenAI embeddings
      const OpenAI = require('openai');
      const client = new OpenAI({
        apiKey: options.apiKey,
        baseURL: 'https://api.chatanywhere.tech/v1',
      });
      const resp = await client.embeddings.create({
        model: 'text-embedding-ada-002',
        input: 'test',
      });
      result = resp.data[0].embedding;
    }
    return { success: true, message: `成功生成嵌入向量，维度: ${result.length}` };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

module.exports = { LocalEmbeddings, getEmbeddings, testEmbeddings };
