<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { api } from '../services/api'
import KpiCard from '../components/KpiCard.vue'

const store = useAppStore()
const router = useRouter()

const articles = ref([])
const selectedIds = ref([])
const loading = ref(false)
const uploading = ref(false)
const status = ref('')
const filterKeyword = ref('')
const filterTheme = ref('')
const batchInput = ref(null)

async function loadArticles() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (filterKeyword.value) params.set('keyword', filterKeyword.value)
    if (filterTheme.value) params.set('themeTag', filterTheme.value)
    const res = await api.get(`/articles?${params}`)
    articles.value = res.articles || []
  } catch (e) {
    status.value = `加载失败: ${e.message}`
  } finally {
    loading.value = false
  }
}

function toggleSelect(id) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

async function handleBatchUpload() {
  const files = batchInput.value?.files
  if (!files?.length) {
    status.value = '请选择文件'
    return
  }
  uploading.value = true
  status.value = '上传中...'
  try {
    const formData = new FormData()
    for (const f of files) formData.append('files', f)
    formData.append('llmProvider', store.llmProvider)
    const res = await api.upload('/upload-batch', formData)
    status.value = `成功导入 ${res.total} 篇文章`
    await loadArticles()
  } catch (e) {
    status.value = `上传失败: ${e.message}`
  } finally {
    uploading.value = false
  }
}

async function runJointAnalysis() {
  if (selectedIds.value.length < 2) {
    status.value = '请至少选择 2 篇文章'
    return
  }
  loading.value = true
  status.value = '联合分析中...'
  try {
    const res = await store.runMultiAnalysis(selectedIds.value)
    if (res.success) {
      status.value = '联合分析完成'
      router.push('/overview')
    }
  } catch (e) {
    status.value = `分析失败: ${e.message}`
  } finally {
    loading.value = false
  }
}

onMounted(loadArticles)
</script>

<template>
  <div class="view">
    <h2 class="view-title">多文联合分析</h2>
    <p class="desc">筛选共同主题的中东冲突文章，LLM 串接分析跨文档实体与冲突演化。</p>

    <div class="panel">
      <h3>批量上传</h3>
      <p class="hint">支持 txt, md, pdf, docx, csv, json 等文本类新闻文件</p>
      <input ref="batchInput" type="file" multiple accept=".txt,.md,.pdf,.docx,.csv,.json,.jsonl" style="width:100%">
      <button class="btn btn-primary" :disabled="uploading" @click="handleBatchUpload" style="margin-top:0.5rem">
        {{ uploading ? '导入中...' : '导入文章库' }}
      </button>
    </div>

    <div class="panel">
      <h3>文章筛选</h3>
      <div class="filters">
        <input v-model="filterKeyword" placeholder="关键词筛选" @keyup.enter="loadArticles">
        <input v-model="filterTheme" placeholder="主题标签 (如: 加沙, 伊朗)" @keyup.enter="loadArticles">
        <button class="btn btn-outline" @click="loadArticles">筛选</button>
      </div>
    </div>

    <div class="kpi-row">
      <KpiCard label="文章库总数" :value="articles.length" />
      <KpiCard label="已选文章" :value="selectedIds.length" />
    </div>

    <div v-if="loading && !articles.length" class="hint">加载中...</div>
    <div v-else-if="!articles.length" class="hint">文章库为空，请先批量上传。</div>

    <div v-else class="article-list">
      <div
        v-for="a in articles"
        :key="a.id"
        class="article-card"
        :class="{ selected: selectedIds.includes(a.id) }"
        @click="toggleSelect(a.id)"
      >
        <div class="article-title">{{ a.title }}</div>
        <div class="article-meta">
          <span>{{ a.date }}</span>
          <span>实体 {{ a.entityCount }} / 关系 {{ a.relationCount }}</span>
          <span v-if="a.themeConfidence">置信度 {{ (a.themeConfidence * 100).toFixed(0) }}%</span>
        </div>
        <div class="tags">
          <span v-for="tag in (a.themeTags || []).slice(0, 4)" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <p class="summary">{{ a.summary }}</p>
      </div>
    </div>

    <button
      class="btn btn-primary full-width"
      :disabled="selectedIds.length < 2 || loading"
      @click="runJointAnalysis"
      style="margin-top:1rem"
    >
      {{ loading ? '分析中...' : `联合分析 (${selectedIds.length} 篇)` }}
    </button>

    <div v-if="status" class="status">{{ status }}</div>
  </div>
</template>

<style scoped>
.view { max-width: 1200px; }
.view-title { font-size: 1.4rem; margin-bottom: 0.5rem; color: var(--accent); }
.desc { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem; }
.panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
.panel h3 { font-size: 0.95rem; color: var(--accent); margin-bottom: 0.5rem; }
.hint { color: var(--text-muted); font-size: 0.85rem; }
.filters { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.filters input { flex: 1; min-width: 150px; padding: 0.4rem 0.6rem; background: #1e1e3a; border: 1px solid var(--border); border-radius: 6px; color: var(--text); }
.kpi-row { display: flex; gap: 0.75rem; margin: 1rem 0; }
.article-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 0.75rem; }
.article-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; cursor: pointer; transition: all 0.2s; }
.article-card:hover { border-color: var(--accent); }
.article-card.selected { border-color: var(--accent); background: rgba(74,158,255,0.1); }
.article-title { font-weight: 600; font-size: 0.9rem; margin-bottom: 0.3rem; }
.article-meta { display: flex; gap: 0.75rem; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.4rem; }
.tags { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.4rem; }
.tag { font-size: 0.7rem; padding: 0.15rem 0.4rem; background: rgba(74,158,255,0.15); border-radius: 10px; color: var(--accent); }
.summary { font-size: 0.78rem; color: var(--text-muted); line-height: 1.4; }
.full-width { width: 100%; }
.status { margin-top: 0.75rem; padding: 0.5rem; background: var(--bg-card); border-radius: 6px; font-size: 0.85rem; color: var(--text-muted); }
</style>
