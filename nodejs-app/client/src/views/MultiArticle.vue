<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import KpiCard from '../components/KpiCard.vue'

const store = useAppStore()
const router = useRouter()

const documents = ref([])
const selectedHashes = ref([])
const loading = ref(false)
const status = ref(null)

const selectedDocuments = computed(() =>
  documents.value.filter((doc) => selectedHashes.value.includes(doc.hash))
)
const totalChunks = computed(() =>
  selectedDocuments.value.reduce((sum, doc) => sum + Number(doc.chunkCount || 0), 0)
)
const totalEntities = computed(() =>
  selectedDocuments.value.reduce((sum, doc) => sum + Number(doc.entityCount || 0), 0)
)
const totalRelations = computed(() =>
  selectedDocuments.value.reduce((sum, doc) => sum + Number(doc.relationCount || 0), 0)
)

function setStatus(ok, message) {
  status.value = { ok, message }
}

function toggleDocument(hash) {
  const index = selectedHashes.value.indexOf(hash)
  if (index >= 0) {
    selectedHashes.value.splice(index, 1)
  } else {
    selectedHashes.value.push(hash)
  }
}

function selectAll() {
  selectedHashes.value = documents.value.map((doc) => doc.hash)
}

function clearSelection() {
  selectedHashes.value = []
}

async function loadDocuments() {
  loading.value = true
  status.value = null
  try {
    documents.value = await store.listUploadedDocuments()
    if (!documents.value.length) {
      setStatus(false, '还没有可管理的已上传文档，请先在首页上传并完成分析。')
    }
  } catch (e) {
    setStatus(false, `读取已上传文档失败: ${e.message}`)
  } finally {
    loading.value = false
  }
}

async function analyzeSelected() {
  if (!selectedHashes.value.length) {
    setStatus(false, '请选择至少 1 篇已上传文档。')
    return
  }

  loading.value = true
  setStatus(true, '正在读取已上传文档的章节、文本块、实体和关系...')
  const res = await store.analyzeUploadedDocuments(selectedHashes.value)
  loading.value = false

  if (!res.success) {
    setStatus(false, res.error || '联合分析失败')
    return
  }

  setStatus(true, '已设为当前全局分析结果')
  router.push('/overview')
}

onMounted(loadDocuments)
</script>

<template>
  <div class="view">
    <div class="head-row">
      <div>
        <h2 class="view-title">多文联合分析</h2>
        <p class="desc">选择首页已经上传并完成入库的文档，基于已有章节、父子文本块、实体和关系做联合分析。</p>
      </div>
      <div class="head-actions">
        <v-btn variant="outlined" color="primary" prepend-icon="mdi-refresh" :loading="loading" @click="loadDocuments">
          刷新
        </v-btn>
        <v-btn color="primary" prepend-icon="mdi-chart-box-outline" :loading="store.loading" @click="analyzeSelected">
          联合分析
        </v-btn>
      </div>
    </div>

    <div class="kpi-row">
      <KpiCard label="已上传文档" :value="documents.length" />
      <KpiCard label="已选文档" :value="selectedHashes.length" />
      <KpiCard label="已选文本块" :value="totalChunks" />
      <KpiCard label="已选实体/关系" :value="`${totalEntities}/${totalRelations}`" />
    </div>

    <div class="panel">
      <div class="toolbar">
        <div class="toolbar-title">
          <v-icon icon="mdi-database-search-outline" size="20" />
          <span>已入库文档</span>
        </div>
        <div class="toolbar-actions">
          <v-btn size="small" variant="text" color="primary" @click="selectAll">全选</v-btn>
          <v-btn size="small" variant="text" color="primary" @click="clearSelection">清空</v-btn>
        </div>
      </div>

      <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

      <div v-if="!documents.length && !loading" class="empty">
        <p>请先在首页上传文档。上传完成后，这里会直接读取已有文档，不需要另开一套上传系统。</p>
      </div>

      <div v-else class="doc-grid">
        <button
          v-for="doc in documents"
          :key="doc.hash"
          type="button"
          class="doc-card"
          :class="{ selected: selectedHashes.includes(doc.hash) }"
          @click="toggleDocument(doc.hash)"
        >
          <div class="doc-main">
            <v-icon
              :icon="selectedHashes.includes(doc.hash) ? 'mdi-checkbox-marked-outline' : 'mdi-checkbox-blank-outline'"
              size="22"
            />
            <div>
              <div class="doc-title">{{ doc.name }}</div>
              <div class="doc-hash">{{ doc.hash }}</div>
            </div>
          </div>
          <div class="doc-stats">
            <span>块 {{ doc.chunkCount || 0 }}</span>
            <span>实体 {{ doc.entityCount || 0 }}</span>
            <span>关系 {{ doc.relationCount || 0 }}</span>
          </div>
          <p v-if="doc.preview" class="doc-preview">{{ doc.preview }}</p>
        </button>
      </div>
    </div>

    <v-alert
      v-if="status"
      :type="status.ok ? 'success' : 'warning'"
      variant="tonal"
      density="compact"
      class="mt-4"
    >
      {{ status.message }}
    </v-alert>
  </div>
</template>

<style scoped>
.view {
  max-width: 1180px;
}

.head-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 1rem;
}

.head-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.view-title {
  font-size: 1.4rem;
  color: var(--accent);
  margin-bottom: 0.5rem;
}

.desc {
  color: var(--text-muted);
  margin: 0;
  max-width: 780px;
}

.kpi-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin: 1rem 0;
}

.panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 1rem;
}

.toolbar-title,
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.doc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.doc-card {
  width: 100%;
  text-align: left;
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  cursor: pointer;
}

.doc-card.selected {
  border-color: var(--accent);
  background: rgba(64, 196, 255, 0.08);
}

.doc-main {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.doc-title {
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.doc-hash {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}

.doc-stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.doc-stats span {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
}

.doc-preview {
  margin: 12px 0 0;
  color: var(--text-muted);
  font-size: 0.82rem;
  line-height: 1.55;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  color: var(--text-muted);
  text-align: center;
}

@media (max-width: 720px) {
  .head-row {
    display: block;
  }

  .head-actions {
    justify-content: flex-start;
    margin-top: 12px;
  }
}
</style>

