import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../services/api'

export const useAppStore = defineStore('app', () => {
  // State
  const apiConfigured = ref(false)
  const neo4jConnected = ref(false)
  const fileProcessed = ref(false)
  const llmProvider = ref('openai-compatible')
  const baseURL = ref('http://localhost:1234/v1')
  const modelName = ref('qwen3-14b')
  const analysisMode = ref('single_detailed')
  const apiKey = ref('')
  const currentFile = ref('')
  const currentFileHash = ref('')
  const analysisResult = ref(null)
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
  const graphData = computed(() => analysisResult.value?.graphData || { nodes: [], links: [] })
  const edges = computed(() => analysisResult.value?.edges || [])
  const insights = computed(() => analysisResult.value?.insights || [])
  const work1Metrics = computed(() => analysisResult.value?.work1Metrics || {})

  const isReady = computed(() => apiConfigured.value && neo4jConnected.value && fileProcessed.value)

  // Actions
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

  async function uploadFile(file) {
    loading.value = true
    error.value = ''
    try {
      const formData = new FormData()
      formData.append('file', file)
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
    fileProcessed.value = false
    analysisResult.value = null
    await api.post('/reset', {})
  }

  async function runMultiAnalysis(articleIds) {
    loading.value = true
    try {
      const res = await api.post('/analyze-multi', {
        articleIds,
        llmProvider: llmProvider.value,
      })
      if (res.success) {
        analysisResult.value = res.analysisResult
        currentFile.value = res.analysisResult.fileName
        fileProcessed.value = true
      }
      return res
    } catch (e) {
      error.value = e.message
      return { success: false, error: e.message }
    } finally {
      loading.value = false
    }
  }

  async function generateNotebook(focusAreas = []) {
    return api.post('/generate-notebook', {
      focusAreas,
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
    testLLM,
    testEmbeddings,
    connectNeo4j,
    confirmSetup,
    confirmEmbeddings,
    uploadFile,
    reanalyze,
    runMultiAnalysis,
    generateNotebook,
    finalizeResearchReport,
    listResearchReports,
    getResearchReport,
    askQuestion,
  }
})
