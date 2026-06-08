<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAppStore } from '../stores/app'

const store = useAppStore()

const llmBaseURL = ref('http://localhost:1234/v1')
const modelName = ref('qwen3-14b')
const apiKey = ref('')
const embedType = ref('lmstudio')
const embedUrl = ref('http://localhost:1234/v1')
const embedModelName = ref('text-embedding-nomic-embed-text-v1.5')
const testLlmStatus = ref(null)
const testEmbedStatus = ref(null)
const setupStatus = ref(null)

const neo4jUrl = ref('neo4j://localhost:7687')
const neo4jUser = ref('neo4j')
const neo4jPassword = ref('dev_password_change_me')
const neo4jStatus = ref(null)

const llmBaseUrlOptions = [
  'http://localhost:1234/v1',
  'http://127.0.0.1:11434/v1',
  'https://api.openai.com/v1',
  'https://api.chatanywhere.tech/v1',
]

const modelOptions = [
  'qwen3-14b',
  'qwen3-8b',
  'gpt-4o-mini',
  'gpt-4.1-mini',
  'qwen2.5-7b-instruct',
  'llama-3.1-8b-instruct',
]

const setupItems = computed(() => [
  { label: 'API', done: store.apiConfigured },
  { label: 'Neo4j', done: store.neo4jConnected },
])

function statusColor(status) {
  if (!status) return undefined
  return status.ok ? 'success' : 'error'
}

function setStatus(target, ok, message) {
  target.value = { ok, message }
}

async function handleTestLLM() {
  const res = await store.testLLM(llmBaseURL.value, apiKey.value, modelName.value)
  setStatus(testLlmStatus, res.success, res.message)
}

async function handleTestEmbed() {
  const res = await store.testEmbeddings(
    embedType.value,
    embedType.value === 'lmstudio'
      ? { baseURL: embedUrl.value, model: embedModelName.value }
      : { apiKey: apiKey.value }
  )
  setStatus(testEmbedStatus, res.success, res.message)
}

async function handleConfirmSetup() {
  const res = await store.confirmSetup(llmBaseURL.value, modelName.value, apiKey.value)
  if (!res.success) {
    setStatus(setupStatus, false, res.message)
    return
  }

  const embedRes = await store.confirmEmbeddings(
    embedType.value,
    embedType.value === 'lmstudio' ? embedUrl.value : '',
    embedType.value === 'lmstudio' ? embedModelName.value : ''
  )
  setStatus(
    setupStatus,
    embedRes.success,
    embedRes.success ? 'API 与嵌入设置已保存' : `LLM 已保存，嵌入失败: ${embedRes.message}`
  )
}

async function handleConnectNeo4j() {
  const res = await store.connectNeo4j(neo4jUrl.value, neo4jUser.value, neo4jPassword.value)
  setStatus(neo4jStatus, res.success, res.success ? 'Neo4j 已连接' : res.message)
}

onMounted(async () => {
  try {
    const settings = await store.loadSettings()
    if (settings.llm?.baseURL) llmBaseURL.value = settings.llm.baseURL
    if (settings.llm?.model) modelName.value = settings.llm.model
    if (settings.embeddings?.baseURL) embedUrl.value = settings.embeddings.baseURL
    if (settings.embeddings?.model) embedModelName.value = settings.embeddings.model
    if (settings.neo4j?.url) neo4jUrl.value = settings.neo4j.url
    if (settings.neo4j?.username) neo4jUser.value = settings.neo4j.username
  } catch (e) {
    setStatus(setupStatus, false, `读取配置失败: ${e.message}`)
  }
})
</script>

<template>
  <div class="sidebar-shell">
    <div class="brand">
      <div>
        <h1>DataGraphX</h1>
        <p>冲突态势分析工作台</p>
      </div>
      <v-chip size="small" color="primary" variant="tonal">Nuxt</v-chip>
    </div>

    <div class="steps">
      <div v-for="item in setupItems" :key="item.label" class="step" :class="{ done: item.done }">
        <v-icon :icon="item.done ? 'mdi-check-circle' : 'mdi-circle-outline'" size="16" />
        <span>{{ item.label }}</span>
      </div>
    </div>

    <v-expansion-panels
      multiple
      :model-value="[0, 1]"
      variant="accordion"
      class="sidebar-panels"
    >
      <v-expansion-panel>
        <v-expansion-panel-title>API 设置</v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="field-stack">
            <v-combobox
              v-model="llmBaseURL"
              :items="llmBaseUrlOptions"
              label="Base URL"
              hide-details="auto"
            />
            <v-combobox
              v-model="modelName"
              :items="modelOptions"
              label="模型名称"
              hide-details="auto"
            />
            <v-text-field
              v-model="apiKey"
              label="API Key"
              type="password"
              placeholder="本地服务可留空"
              hide-details="auto"
            />
          </div>

          <div class="button-row">
            <v-btn variant="outlined" color="primary" @click="handleTestLLM">测试 API</v-btn>
            <v-btn color="primary" @click="handleConfirmSetup">保存设置</v-btn>
          </div>
          <v-alert
            v-if="testLlmStatus"
            :type="statusColor(testLlmStatus)"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            {{ testLlmStatus.message }}
          </v-alert>
          <v-alert
            v-if="setupStatus"
            :type="statusColor(setupStatus)"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            {{ setupStatus.message }}
          </v-alert>

          <v-divider class="my-4" />
          <div class="field-stack">
            <v-select
              v-model="embedType"
              :items="[
                { title: '本地 LM Studio', value: 'lmstudio' },
                { title: 'OpenAI', value: 'openai' },
              ]"
              label="嵌入来源"
              hide-details="auto"
            />
            <template v-if="embedType === 'lmstudio'">
              <v-text-field
                v-model="embedUrl"
                label="嵌入 API URL"
                hide-details="auto"
              />
              <v-text-field
                v-model="embedModelName"
                label="嵌入模型"
                hide-details="auto"
              />
            </template>
          </div>
          <v-btn block variant="outlined" color="primary" class="mt-3" @click="handleTestEmbed">
            测试嵌入
          </v-btn>
          <v-alert
            v-if="testEmbedStatus"
            :type="statusColor(testEmbedStatus)"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            {{ testEmbedStatus.message }}
          </v-alert>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel :disabled="!store.apiConfigured">
        <v-expansion-panel-title>Neo4j</v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="field-stack">
            <v-text-field v-model="neo4jUrl" label="URL" hide-details="auto" />
            <v-text-field v-model="neo4jUser" label="用户名" hide-details="auto" />
            <v-text-field
              v-model="neo4jPassword"
              label="密码"
              type="password"
              hide-details="auto"
            />
          </div>
          <v-btn block color="primary" class="mt-4" @click="handleConnectNeo4j">连接数据库</v-btn>
          <v-alert
            v-if="neo4jStatus"
            :type="statusColor(neo4jStatus)"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            {{ neo4jStatus.message }}
          </v-alert>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<style scoped>
.sidebar-shell {
  min-height: 100%;
  padding: 22px;
}

.brand {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.brand h1 {
  margin: 0;
  font-size: 1.3rem;
  line-height: 1.2;
}

.brand p {
  margin: 4px 0 0;
  color: #8e98a3;
  font-size: 0.78rem;
}

.steps {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin-bottom: 14px;
}

.step {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: #8e98a3;
  font-size: 0.74rem;
}

.step.done {
  color: rgb(var(--v-theme-primary));
  background: rgba(79, 179, 165, 0.1);
}

.sidebar-panels {
  border-radius: 4px;
}

.field-stack {
  display: grid;
  gap: 16px;
}

.button-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 18px;
}

:deep(.v-expansion-panel) {
  background: #181b20;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

:deep(.v-expansion-panel + .v-expansion-panel) {
  margin-top: 12px;
}

:deep(.v-expansion-panel-title) {
  min-height: 48px;
  padding-inline: 18px;
}

:deep(.v-expansion-panel-text__wrapper) {
  padding: 8px 18px 22px;
}

:deep(.v-alert) {
  margin-top: 14px;
}
</style>
