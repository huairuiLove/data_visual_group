import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { api } from '../services/api'

const PERSIST_KEY = 'datagraphx.app.v1'
const TECHNICAL_GRAPH_TYPES = new Set([
  'Document',
  'VectorNode',
  'RagChunk',
  'RagSection',
  'RagParentChunk',
  'RagCommunity',
  'GraphRelation',
  'ResearchReport',
])

function endpointId(value) {
  if (value && typeof value === 'object') return String(value.id ?? value.name ?? value.text ?? '')
  return String(value ?? '')
}

function isContentGraphNode(node) {
  const id = String(node?.id || '')
  const type = String(node?.type || '')
  if (!id || TECHNICAL_GRAPH_TYPES.has(type)) return false
  return !/:(chunk|parent|section|relation|community):/i.test(id)
}

function contentGraphData(raw = { nodes: [], links: [] }) {
  const nodes = (raw.nodes || []).filter(isContentGraphNode)
  const ids = new Set(nodes.map((node) => String(node.id)))
  const links = (raw.links || [])
    .filter((link) => ids.has(endpointId(link.source)) && ids.has(endpointId(link.target)))
    .filter((link) => !String(link.type || link.relation || '').startsWith('HAS_'))
  return { nodes, links }
}

function loadPersistedState() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function withoutLargeText(result) {
  if (!result) return null
  const rest = { ...result }
  delete rest.fullText
  return rest
}

function savePersistedState(state) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PERSIST_KEY, JSON.stringify(state))
  } catch {
    const compactState = {
      ...state,
      analysisResult: withoutLargeText(state.analysisResult),
    }
    try {
      window.localStorage.setItem(PERSIST_KEY, JSON.stringify(compactState))
    } catch {
      // Ignore quota errors; the next smaller analysis result can still persist.
    }
  }
}

function clearPersistedState() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(PERSIST_KEY)
}

export const useAppStore = defineStore('app', () => {
  const persisted = loadPersistedState()

  // State
  const apiConfigured = ref(Boolean(persisted.apiConfigured))
  const neo4jConnected = ref(Boolean(persisted.neo4jConnected))
  const fileProcessed = ref(Boolean(persisted.fileProcessed))
  const llmProvider = ref(persisted.llmProvider || 'openai-compatible')
  const baseURL = ref(persisted.baseURL || 'http://localhost:1234/v1')
  const modelName = ref(persisted.modelName || 'qwen3-14b')
  const analysisMode = ref(persisted.analysisMode || 'single_detailed')
  const apiKey = ref('')
  const currentFile = ref(persisted.currentFile || '')
  const currentFileHash = ref(persisted.currentFileHash || '')
  const analysisResult = ref(persisted.analysisResult || null)
  const loading = ref(false)
  const error = ref('')

  // Computed
  const stats = computed(() => analysisResult.value?.stats || {})
  const meta = computed(() => stats.value.meta || {})
  const entityData = computed(() => analysisResult.value?.entityData || {})
  const keywordData = computed(() => analysisResult.value?.keywordData || {})
  const personData = computed(() => analysisResult.value?.personData || {})
  const timeline = computed(() => analysisResult.value?.timeline || [])
  const spatialData = computed(() => analysisResult.value?.spatialData || {})
  const graphData = computed(() => contentGraphData(analysisResult.value?.graphData || { nodes: [], links: [] }))
  const edges = computed(() => analysisResult.value?.edges || [])
  const insights = computed(() => analysisResult.value?.insights || [])
  const work1Metrics = computed(() => analysisResult.value?.work1Metrics || {})

  const isReady = computed(() => apiConfigured.value && neo4jConnected.value && fileProcessed.value)

  watch(
    [
      apiConfigured,
      neo4jConnected,
      fileProcessed,
      llmProvider,
      baseURL,
      modelName,
      analysisMode,
      currentFile,
      currentFileHash,
      analysisResult,
    ],
    () => {
      savePersistedState({
        apiConfigured: apiConfigured.value,
        neo4jConnected: neo4jConnected.value,
        fileProcessed: fileProcessed.value,
        llmProvider: llmProvider.value,
        baseURL: baseURL.value,
        modelName: modelName.value,
        analysisMode: analysisMode.value,
        currentFile: currentFile.value,
        currentFileHash: currentFileHash.value,
        analysisResult: withoutLargeText(analysisResult.value),
        savedAt: new Date().toISOString(),
      })
    },
    { deep: true }
  )

  // Actions
  async function loadSettings() {
    const settings = await api.get('/settings')
    if (settings.llm?.baseURL) baseURL.value = settings.llm.baseURL
    if (settings.llm?.model) modelName.value = settings.llm.model
    return settings
  }

  async function testLLM(url, key, model) {
    try {
      const res = await api.post('/test-llm', { baseURL: url, apiKey: key, model })
      return res
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  async function testEmbeddings(type, opts) {
    try {
      const res = await api.post('/test-embeddings', { type, ...opts })
      return res
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  async function connectNeo4j(url, username, password) {
    try {
      const res = await api.post('/neo4j/connect', { url, username, password })
      if (res.success) neo4jConnected.value = true
      return res
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  async function loadNeo4jSummary() {
    try {
      return await api.get('/neo4j/summary')
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  async function clearNeo4jAnalysisData(includeCache = true) {
    try {
      const res = await api.post('/neo4j/clear', { confirm: 'DELETE', includeCache })
      if (res.success) {
        fileProcessed.value = false
        currentFile.value = ''
        currentFileHash.value = ''
        analysisResult.value = null
        clearPersistedState()
      }
      return res
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  async function confirmSetup(url, model, key) {
    try {
      const res = await api.post('/settings/llm', { baseURL: url, apiKey: key, model })
      llmProvider.value = 'openai-compatible'
      baseURL.value = res.baseURL || url
      modelName.value = res.model || model
      apiKey.value = key
      apiConfigured.value = true
      return res
    } catch (e) {
      apiConfigured.value = false
      return { success: false, message: e.message }
    }
  }

  async function confirmEmbeddings(type, baseURL, model) {
    try {
      return await api.post('/settings/embeddings', { type, baseURL, model })
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  async function uploadFile(input) {
    loading.value = true
    error.value = ''
    try {
      const files = Array.isArray(input) ? input : [input]
      const formData = new FormData()
      for (const file of files.filter(Boolean)) formData.append('file', file)
      formData.append('llmProvider', llmProvider.value)
      formData.append('analysisMode', analysisMode.value)

      const res = await api.upload('/upload', formData)
      if (res.success) {
        analysisResult.value = res.analysisResult
        currentFile.value = res.fileName
        currentFileHash.value = res.fileHash
        fileProcessed.value = true
      } else {
        error.value = res.error || 'Upload failed'
      }
      return res
    } catch (e) {
      error.value = e.message
      return { success: false, error: e.message }
    } finally {
      loading.value = false
    }
  }

  async function reanalyze() {
    await api.post('/reset', {})
    savePersistedState({
      apiConfigured: apiConfigured.value,
      neo4jConnected: neo4jConnected.value,
      fileProcessed: fileProcessed.value,
      llmProvider: llmProvider.value,
      baseURL: baseURL.value,
      modelName: modelName.value,
      analysisMode: analysisMode.value,
      currentFile: currentFile.value,
      currentFileHash: currentFileHash.value,
      analysisResult: withoutLargeText(analysisResult.value),
      savedAt: new Date().toISOString(),
    })
  }

  async function listUploadedDocuments() {
    try {
      const res = await api.get('/documents')
      return res.documents || []
    } catch {
      return []
    }
  }

  async function analyzeUploadedDocuments(hashes) {
    loading.value = true
    error.value = ''
    try {
      const res = await api.post('/documents/analyze', { hashes })
      if (res.success) {
        analysisResult.value = res.analysisResult
        currentFile.value = res.fileName
        currentFileHash.value = res.fileHash
        fileProcessed.value = true
      } else {
        error.value = res.error || '分析失败'
      }
      return res
    } catch (e) {
      error.value = e.message
      return { success: false, error: e.message }
    } finally {
      loading.value = false
    }
  }

  async function generateNotebook(options = {}) {
    const payload = Array.isArray(options) ? { focusAreas: options } : options
    return api.post('/generate-notebook', {
      focusAreas: payload.focusAreas || [],
      customRequest: payload.customRequest || '',
      llmProvider: llmProvider.value,
    })
  }

  async function finalizeResearchReport(payload) {
    return api.post('/research-report/finalize', {
      ...payload,
      llmProvider: llmProvider.value,
    })
  }

  async function listResearchReports() {
    return api.get('/research-reports')
  }

  async function getResearchReport(id) {
    return api.get(`/research-reports/${id}`)
  }

  async function askQuestion(question) {
    try {
      return await api.post('/qa', {
        question,
        provider: llmProvider.value,
      })
    } catch (e) {
      return { answer: `Error: ${e.message}`, sources: [] }
    }
  }

  return {
    apiConfigured,
    neo4jConnected,
    fileProcessed,
    llmProvider,
    baseURL,
    modelName,
    apiKey,
    currentFile,
    currentFileHash,
    analysisResult,
    loading,
    error,
    analysisMode,
    stats,
    meta,
    entityData,
    keywordData,
    personData,
    timeline,
    spatialData,
    graphData,
    edges,
    insights,
    work1Metrics,
    isReady,
    loadSettings,
    testLLM,
    testEmbeddings,
    connectNeo4j,
    loadNeo4jSummary,
    clearNeo4jAnalysisData,
    confirmSetup,
    confirmEmbeddings,
    uploadFile,
    reanalyze,
    listUploadedDocuments,
    analyzeUploadedDocuments,
    generateNotebook,
    finalizeResearchReport,
    listResearchReports,
    getResearchReport,
    askQuestion,
  }
})
