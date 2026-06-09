<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const router = useRouter()

const selectedFiles = ref([])
const analysisMode = ref(store.analysisMode)
const uploadStatus = ref(null)
const selectedDocumentName = computed(() => {
  const file = Array.isArray(selectedFiles.value) ? selectedFiles.value[0] : selectedFiles.value
  return file?.name || store.currentFile || store.meta.title || ''
})

function setStatus(ok, message) {
  uploadStatus.value = { ok, message }
}

async function handleUpload() {
  const files = Array.isArray(selectedFiles.value) ? selectedFiles.value.filter(Boolean) : [selectedFiles.value].filter(Boolean)
  if (!files.length) {
    setStatus(false, '请选择文件')
    return
  }

  store.analysisMode = analysisMode.value
  setStatus(true, '正在处理文档...')
  const res = await store.uploadFile(files)
  const label = files.length === 1 ? files[0].name : `${files.length} 个文档`
  setStatus(res.success, res.success ? `${label} 已处理` : res.error || '处理失败')
}

async function handleReanalyze() {
  const files = Array.isArray(selectedFiles.value) ? selectedFiles.value.filter(Boolean) : [selectedFiles.value].filter(Boolean)
  if (files.length) {
    await handleUpload()
    return
  }
  await store.reanalyze()
  setStatus(true, store.currentFile ? `${store.currentFile} 已保留，选择文件后可重新分析` : '已重置分析任务')
}

function goToDashboard() {
  router.push('/overview')
}
</script>

<template>
  <div class="home-view">
    <section class="page-head">
      <div>
        <h1>DataGraphX</h1>
        <p>上传文档后生成知识图谱、动态可视化、来源分析和研究报告。</p>
      </div>
      <v-btn
        v-if="store.fileProcessed"
        color="primary"
        prepend-icon="mdi-view-dashboard-outline"
        @click="goToDashboard"
      >
        进入总览
      </v-btn>
    </section>

    <v-row>
      <v-col cols="12" md="8">
        <v-sheet class="work-panel" rounded="sm">
          <div class="panel-title">
            <v-icon icon="mdi-file-upload-outline" />
            <span>文档导入</span>
          </div>

          <v-alert
            v-if="!store.apiConfigured"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-4"
          >
            请先在左侧设置中保存 API 配置。
          </v-alert>
          <v-alert
            v-else-if="!store.neo4jConnected"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-4"
          >
            请先在左侧设置中连接 Neo4j。
          </v-alert>

          <v-select
            v-model="analysisMode"
            :items="[
              { title: '单文精细分析', value: 'single_detailed' },
              { title: '多文/长文分块抽取', value: 'multi_corpus' },
            ]"
            label="分析模式"
            hide-details="auto"
            :disabled="!store.neo4jConnected || store.loading"
          />
          <v-file-input
            v-model="selectedFiles"
            accept=".pdf,.docx,.txt,.md,.csv,.json"
            label="选择文档"
            prepend-icon="mdi-paperclip"
            multiple
            hide-details="auto"
            class="mt-4"
            :disabled="!store.neo4jConnected || store.loading"
          />
          <div v-if="selectedDocumentName" class="selected-doc">
            <v-icon icon="mdi-file-document-outline" size="18" />
            <span>{{ selectedDocumentName }}</span>
          </div>

          <div class="actions">
            <v-btn
              color="primary"
              prepend-icon="mdi-play-circle-outline"
              :loading="store.loading"
              :disabled="!store.neo4jConnected"
              @click="handleUpload"
            >
              处理文档
            </v-btn>
            <v-btn
              v-if="store.fileProcessed"
              variant="outlined"
              color="primary"
              prepend-icon="mdi-refresh"
              @click="handleReanalyze"
            >
              重新分析
            </v-btn>
          </div>

          <v-progress-linear v-if="store.loading" indeterminate color="primary" class="mt-4" />
          <v-alert
            v-if="uploadStatus"
            :type="uploadStatus.ok ? 'success' : 'error'"
            variant="tonal"
            density="compact"
            class="mt-4"
          >
            {{ uploadStatus.message }}
          </v-alert>
        </v-sheet>
      </v-col>

      <v-col cols="12" md="4">
        <v-sheet class="work-panel" rounded="sm">
          <div class="panel-title">
            <v-icon icon="mdi-database-check-outline" />
            <span>当前状态</span>
          </div>

          <div class="status-list">
            <div class="status-row">
              <span>API</span>
              <v-chip size="small" :color="store.apiConfigured ? 'success' : 'warning'" variant="tonal">
                {{ store.apiConfigured ? '已配置' : '待配置' }}
              </v-chip>
            </div>
            <div class="status-row">
              <span>Neo4j</span>
              <v-chip size="small" :color="store.neo4jConnected ? 'success' : 'warning'" variant="tonal">
                {{ store.neo4jConnected ? '已连接' : '待连接' }}
              </v-chip>
            </div>
            <div class="status-row">
              <span>文档</span>
              <v-chip size="small" :color="store.fileProcessed ? 'success' : 'warning'" variant="tonal">
                {{ store.fileProcessed ? '已处理' : '待上传' }}
              </v-chip>
            </div>
          </div>

          <template v-if="store.fileProcessed">
            <v-divider class="my-4" />
            <div class="doc-name">{{ store.meta.title || store.currentFile || 'N/A' }}</div>
            <div class="metric-grid">
              <div>
                <span>文本块</span>
                <strong>{{ store.meta.totalChunks || 0 }}</strong>
              </div>
              <div>
                <span>实体</span>
                <strong>{{ store.meta.totalEntities || 0 }}</strong>
              </div>
              <div>
                <span>关系</span>
                <strong>{{ store.meta.totalRelations || 0 }}</strong>
              </div>
            </div>
          </template>
        </v-sheet>
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
.home-view {
  max-width: 1180px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.page-head h1 {
  margin: 0 0 6px;
  font-size: 1.8rem;
}

.page-head p {
  margin: 0;
  color: var(--text-muted);
}

.work-panel {
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #181b20;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.selected-doc {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  color: #aeb6bf;
  font-size: 0.85rem;
}

.selected-doc span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-list {
  display: grid;
  gap: 10px;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #aeb6bf;
}

.doc-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 12px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.metric-grid div {
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}

.metric-grid span,
.metric-grid strong {
  display: block;
}

.metric-grid span {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.metric-grid strong {
  margin-top: 3px;
  font-size: 1.05rem;
}
</style>
