<script setup>
import { ref, watch } from 'vue'
import { useAppStore } from '../stores/app'

const store = useAppStore()

// API Setup
const provider = ref('deepseek')
const modelName = ref('deepseek-chat')
const apiKey = ref('')
const embedType = ref('local')
const embedUrl = ref('http://localhost:11434/v1')
const embedModelName = ref('nomic-embed-text')
const testLlmStatus = ref('')
const testEmbedStatus = ref('')
const setupStatus = ref('')

// Neo4j
const neo4jUrl = ref('neo4j://localhost:7687')
const neo4jUser = ref('neo4j')
const neo4jPassword = ref('password123')
const neo4jStatus = ref('')

// Upload
const uploadStatus = ref('')
const fileInput = ref(null)

watch(provider, (v) => {
  modelName.value = v === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini'
})

async function handleTestLLM() {
  const res = await store.testLLM(provider.value, apiKey.value, modelName.value)
  testLlmStatus.value = res.success ? `Success: ${res.message}` : `Failed: ${res.message}`
}

async function handleTestEmbed() {
  const res = await store.testEmbeddings(
    embedType.value,
    embedType.value === 'local' ? { baseURL: embedUrl.value, model: embedModelName.value } : { apiKey: apiKey.value }
  )
  testEmbedStatus.value = res.success ? `Success: ${res.message}` : `Failed: ${res.message}`
}

async function handleConfirmSetup() {
  const res = await store.confirmSetup(provider.value, modelName.value, apiKey.value)
  setupStatus.value = res.success ? 'API 设置已保存到本地 .env' : `Failed: ${res.message}`
}

async function handleConnectNeo4j() {
  const res = await store.connectNeo4j(neo4jUrl.value, neo4jUser.value, neo4jPassword.value)
  neo4jStatus.value = res.success ? 'Connected to Neo4j' : `Failed: ${res.message}`
}

async function handleUpload() {
  const file = fileInput.value?.files?.[0]
  if (!file) {
    uploadStatus.value = 'Please select a file'
    return
  }
  uploadStatus.value = 'Processing...'
  const res = await store.uploadFile(file)
  uploadStatus.value = res.success ? `${file.name} processed` : (res.error || 'Failed')
}

async function handleReanalyze() {
  await store.reanalyze()
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>DataGraphX</h2>
      <small>中东冲突态势智能分析台</small>
    </div>

    <!-- Intro -->
    <section class="sidebar-section">
      <details>
        <summary>项目介绍</summary>
        <p>上传PDF/DOCX/TXT文件，自动完成实体抽取、知识图谱构建与多视图可视化。</p>
      </details>
    </section>

    <!-- API Setup -->
    <section class="sidebar-section">
      <h3>API 设置</h3>
      <div class="form-group">
        <label>API 类型</label>
        <select v-model="provider">
          <option value="deepseek">DeepSeek</option>
          <option value="openai">OpenAI</option>
        </select>
      </div>
      <div class="form-group">
        <label>{{ provider === 'deepseek' ? 'DeepSeek' : 'OpenAI' }} API 密钥</label>
        <input v-model="apiKey" type="password" placeholder="输入 API 密钥">
      </div>
      <div class="form-group">
        <label>模型名称</label>
        <input v-model="modelName" type="text">
      </div>
      <button class="btn btn-outline" @click="handleTestLLM">测试 API 连接</button>
      <div v-if="testLlmStatus" class="status" :class="testLlmStatus.startsWith('Success') ? 'success' : 'error'">
        {{ testLlmStatus }}
      </div>

      <h4 style="margin-top:1rem;">嵌入模型</h4>
      <div class="form-group">
        <label>嵌入来源</label>
        <select v-model="embedType">
          <option value="local">本地 (Ollama)</option>
          <option value="openai">OpenAI</option>
        </select>
      </div>
      <template v-if="embedType === 'local'">
        <div class="form-group">
          <label>API URL</label>
          <input v-model="embedUrl" type="text">
        </div>
        <div class="form-group">
          <label>模型</label>
          <input v-model="embedModelName" type="text">
        </div>
      </template>
      <button class="btn btn-outline" @click="handleTestEmbed">测试嵌入模型</button>
      <div v-if="testEmbedStatus" class="status" :class="testEmbedStatus.startsWith('Success') ? 'success' : 'error'">
        {{ testEmbedStatus }}
      </div>

      <button class="btn btn-primary full-width" @click="handleConfirmSetup" style="margin-top:0.75rem;">
        确认设置
      </button>
      <div v-if="setupStatus" class="status" :class="setupStatus.startsWith('Failed') ? 'error' : 'success'">{{ setupStatus }}</div>
    </section>

    <!-- Neo4j Connection -->
    <section v-if="store.apiConfigured" class="sidebar-section">
      <h3>连接到 Neo4j 数据库</h3>
      <div class="form-group">
        <label>Neo4j URL</label>
        <input v-model="neo4jUrl" type="text">
      </div>
      <div class="form-group">
        <label>用户名</label>
        <input v-model="neo4jUser" type="text">
      </div>
      <div class="form-group">
        <label>密码</label>
        <input v-model="neo4jPassword" type="password">
      </div>
      <button class="btn btn-primary full-width" @click="handleConnectNeo4j">连接</button>
      <div v-if="neo4jStatus" class="status" :class="neo4jStatus.startsWith('Connected') ? 'success' : 'error'">
        {{ neo4jStatus }}
      </div>
    </section>

    <!-- File Upload -->
    <section v-if="store.neo4jConnected" class="sidebar-section">
      <h3>上传文档</h3>
      <input ref="fileInput" type="file" accept=".pdf,.docx,.txt" style="width:100%">
      <button class="btn btn-primary full-width" @click="handleUpload" :disabled="store.loading" style="margin-top:0.5rem;">
        {{ store.loading ? '处理中...' : '处理文档' }}
      </button>
      <div class="progress-bar" v-if="store.loading"><div class="progress-fill"/></div>
      <div v-if="uploadStatus" class="status" :class="uploadStatus.includes('processed') ? 'success' : 'error'">
        {{ uploadStatus }}
      </div>
    </section>

    <!-- Doc Info -->
    <section v-if="store.fileProcessed" class="sidebar-section">
      <details>
        <summary>文档信息</summary>
        <p>文件名: {{ store.meta.title || 'N/A' }}</p>
        <p>文本块: {{ store.meta.totalChunks || 0 }}</p>
        <p>实体数: {{ store.meta.totalEntities || 0 }}</p>
        <p>关系数: {{ store.meta.totalRelations || 0 }}</p>
        <button class="btn btn-outline" @click="handleReanalyze" style="margin-top:0.5rem;">重新分析文档</button>
      </details>
    </section>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 300px; min-width: 300px;
  background: var(--bg-sidebar);
  padding: 1.25rem;
  border-right: 1px solid var(--border);
  overflow-y: auto; height: 100vh;
  position: sticky; top: 0;
}
.sidebar-header h2 { font-size: 1.3rem; color: var(--accent); }
.sidebar-header small { color: var(--text-muted); font-size: 0.75rem; }
.sidebar-section {
  margin-top: 1rem; padding: 0.75rem;
  background: var(--bg-card); border-radius: 8px;
  border: 1px solid var(--border);
}
.sidebar-section h3 { font-size: 0.9rem; margin-bottom: 0.5rem; color: var(--accent); }
.sidebar-section h4 { font-size: 0.85rem; color: var(--accent); }
.form-group { margin-bottom: 0.6rem; }
.form-group label { display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.2rem; }
.form-group input, .form-group select {
  width: 100%; padding: 0.4rem 0.6rem;
  background: #1e1e3a; border: 1px solid var(--border);
  border-radius: 6px; color: var(--text); font-size: 0.85rem;
}
.form-group input:focus, .form-group select:focus { outline: none; border-color: var(--accent); }
details { cursor: pointer; }
details p { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem; }
details summary { font-weight: 600; }
.status { padding: 0.3rem 0.5rem; border-radius: 4px; font-size: 0.78rem; margin-top: 0.4rem; }
.status.success { background: rgba(76,175,80,0.15); color: var(--success); }
.status.error { background: rgba(244,67,54,0.15); color: var(--error); }
.progress-bar { width: 100%; height: 4px; background: var(--border); border-radius: 2px; margin-top: 0.5rem; overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent); width: 100%; animation: progress 2s ease-in-out infinite; }
.full-width { width: 100%; }
@keyframes progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
</style>
