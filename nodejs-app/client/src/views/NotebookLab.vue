<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { usePyodide } from '../composables/usePyodide'

const store = useAppStore()
const router = useRouter()
const { loadPyodide, runNotebook } = usePyodide()

const generating = ref(false)
const running = ref(false)
const finalizing = ref(false)
const pyodideReady = ref(false)
const showCode = ref(false)
const ephemeralNotebook = ref(null)
const analysisData = ref(null)
const cellResults = ref([])
const progress = ref('')
const source = ref('')
const agentTrace = ref([])
const profile = ref(null)
const validation = ref([])
const savedReport = ref(null)
const chartPreviews = ref([])
const focusAreas = ref(['实体分布', '关系网络', '共现热力图', '规则挖掘'])
const customRequest = ref('')

const CHART_TITLES = [
  '实体类型分布', '关系类型分布', 'Top 实体排名', '实体共现热力图',
  'Actor-Action 规则流', '事件分类分布', '关系三元组流', '语义景观',
  '聚类分析', '主题词云', '时间演化', '异常关系',
]
const FOCUS_OPTIONS = [
  '实体分布', '关系网络', '共现热力图', '事件分类', '规则挖掘', '三元组流',
  '时间演化', '语义聚类', '主题建模', '词云', '地理/区域对比', '异常值检测',
]
const REQUEST_EXAMPLES = [
  '生成 8 张图，重点比较各组织/国家在不同事件类别中的角色，并加入聚类散点图。',
  '我想看时间线上的冲突升级趋势、关键词词云、实体共现社区网络和关系强度排名。',
  '请用 seaborn/sklearn/scipy 做更丰富的统计图，突出异常关系和核心行动者。',
]

function useExample(text) {
  customRequest.value = text
}

async function initPyodide() {
  progress.value = '加载 Pyodide 运行环境...'
  try {
    await loadPyodide()
    pyodideReady.value = true
    progress.value = 'Pyodide 就绪'
  } catch (e) {
    progress.value = `Pyodide 加载失败: ${e.message}`
  }
}

function clearEphemeral() {
  ephemeralNotebook.value = null
  analysisData.value = null
  cellResults.value = []
  chartPreviews.value = []
  source.value = ''
  agentTrace.value = []
  profile.value = null
  validation.value = []
}

async function runPyodideAndCollect() {
  if (!ephemeralNotebook.value || !analysisData.value) return []
  if (!pyodideReady.value) await initPyodide()

  const results = await runNotebook(ephemeralNotebook.value, analysisData.value, (i, total, state) => {
    progress.value = state === 'done' ? '图表生成完成' : `执行单元格 ${i + 1}/${total}...`
  })
  cellResults.value = results

  const charts = []
  let chartIdx = 0
  for (const r of results) {
    if (r.type !== 'code' || !r.output) continue
    for (const img of (r.output.images || [])) {
      charts.push({
        title: CHART_TITLES[chartIdx] || `可视化图表 ${chartIdx + 1}`,
        description: `Pyodide 生成的第 ${chartIdx + 1} 张态势图`,
        imageBase64: img,
        stdout: (r.output.stdout || '').slice(0, 300),
      })
      chartIdx++
    }
  }
  chartPreviews.value = charts
  return charts
}

async function finalizeReport(charts, executionLog) {
  return store.finalizeResearchReport({
    charts,
    executionLog,
    profile: profile.value,
  })
}

async function runFullPipeline() {
  if (!store.fileProcessed) return
  generating.value = true
  running.value = true
  finalizing.value = false
  savedReport.value = null
  clearEphemeral()

  try {
    progress.value = '① 多智能体生成代码（浏览器临时内存，不存储）...'
    const res = await store.generateNotebook({
      focusAreas: focusAreas.value,
      customRequest: customRequest.value,
    })
    ephemeralNotebook.value = res.notebook
    analysisData.value = res.analysisData
    source.value = res.source
    agentTrace.value = res.trace || []
    profile.value = res.profile
    validation.value = res.validation || []

    progress.value = '② Pyodide 执行代码并生图...'
    const charts = await runPyodideAndCollect()
    if (!charts.length) {
      progress.value = '未生成图表，无法撰写报告'
      return
    }

    finalizing.value = true
    progress.value = '③ ReportWriter 根据图表撰写报告并写入数据库...'
    const log = cellResults.value
      .filter(r => r.output?.stdout)
      .map(r => r.output.stdout)
      .join('\n')

    const reportRes = await finalizeReport(charts, log)
    savedReport.value = reportRes.report

    progress.value = `✅ 报告已保存至数据库 (ID: ${reportRes.report?.id})`
  } catch (e) {
    progress.value = `失败: ${e.message}`
  } finally {
    generating.value = false
    running.value = false
    finalizing.value = false
    ephemeralNotebook.value = null
    analysisData.value = null
  }
}

const hasSavedReport = computed(() => !!savedReport.value?.id)
</script>

<template>
  <div class="view">
    <h2 class="view-title">Notebook 实验室</h2>
    <p class="desc">
      一键流程：多智能体写代码 → 浏览器生图 → AI 撰写报告 → <strong>自动存入 Neo4j</strong>。
      代码仅在内存中临时存在，<strong>不存储</strong>。
    </p>

    <div v-if="!store.fileProcessed" class="empty">
      <p>请先完成单文分析或多文联合分析。</p>
    </div>

    <template v-else>
      <div class="panel">
        <h3>一键生成研究报告</h3>
        <div class="focus-tags">
          <label v-for="area in FOCUS_OPTIONS" :key="area" class="tag-check">
            <input type="checkbox" :value="area" v-model="focusAreas"> {{ area }}
          </label>
        </div>
        <div class="custom-request">
          <label for="notebook-custom-request">自定义希望看到的图</label>
          <textarea
            id="notebook-custom-request"
            v-model="customRequest"
            rows="4"
            maxlength="800"
            placeholder="例如：希望看实体社区发现、关键词词云、时间演化、关系强度异常值、国家/组织对比，图表不少于 8 张。"
          />
          <div class="example-row">
            <button v-for="ex in REQUEST_EXAMPLES" :key="ex" type="button" class="chip-btn" @click="useExample(ex)">
              {{ ex.slice(0, 18) }}...
            </button>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-primary" :disabled="generating || running || finalizing" @click="runFullPipeline">
            {{ finalizing ? '撰写报告中...' : (running ? '生图中...' : (generating ? '生成代码...' : '一键生成研究报告')) }}
          </button>
          <button v-if="hasSavedReport" class="btn btn-outline" @click="router.push('/research-reports')">
            查看已存报告
          </button>
        </div>
        <div v-if="progress" class="progress-text">{{ progress }}</div>

        <details v-if="agentTrace.length" class="trace-panel">
          <summary>多智能体追踪（代码阶段）</summary>
          <div v-for="(step, i) in agentTrace" :key="i" class="trace-step">
            <span class="agent-name">{{ step.agent }}</span>
            <span :class="step.success !== false ? 'ok' : 'fail'">
              {{ step.success !== false ? '✓' : '✗' }} {{ step.duration_ms ? `${step.duration_ms}ms` : '' }}
            </span>
          </div>
        </details>
      </div>

      <div v-if="chartPreviews.length" class="panel">
        <h3>本次生成的图表（已随报告入库）</h3>
        <div class="chart-grid">
          <div v-for="(c, i) in chartPreviews" :key="i" class="chart-card">
            <img :src="`data:image/png;base64,${c.imageBase64}`" :alt="c.title">
            <span>{{ c.title }}</span>
          </div>
        </div>
      </div>

      <div v-if="savedReport" class="panel success-panel">
        <h3>✅ 报告已自动保存</h3>
        <p>ID: <code>{{ savedReport.id }}</code> | 图表: {{ savedReport.chartCount }} 张</p>
        <button class="btn btn-primary" @click="router.push('/research-reports')">打开报告库</button>
      </div>

      <details v-if="ephemeralNotebook && showCode" class="ephemeral-note">
        <summary>临时代码（关闭后清除，不存储）</summary>
        <div v-for="(cell, i) in ephemeralNotebook.cells" :key="i" class="cell" :class="cell.cell_type">
          <pre v-if="cell.cell_type === 'code'" class="cell-source">{{ Array.isArray(cell.source) ? cell.source.join('') : cell.source }}</pre>
        </div>
      </details>
      <button v-if="ephemeralNotebook" class="btn-link" @click="showCode = !showCode">
        {{ showCode ? '隐藏' : '显示' }}临时代码
      </button>
    </template>
  </div>
</template>

<style scoped>
.view { max-width: 1100px; }
.view-title { font-size: 1.4rem; color: var(--accent); margin-bottom: 0.5rem; }
.desc { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem; }
.panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
.panel h3 { font-size: 0.95rem; color: var(--accent); margin-bottom: 0.5rem; }
.success-panel { border-color: #4caf50; background: rgba(76,175,80,0.08); }
.focus-tags { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
.tag-check { font-size: 0.82rem; color: var(--text-muted); cursor: pointer; }
.custom-request { display: grid; gap: 0.4rem; margin-bottom: 0.75rem; }
.custom-request label { font-size: 0.82rem; color: var(--text-muted); }
.custom-request textarea {
  width: 100%;
  resize: vertical;
  min-height: 88px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-sidebar);
  color: var(--text-main);
  padding: 0.65rem;
  font: inherit;
  font-size: 0.84rem;
  line-height: 1.45;
}
.example-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.chip-btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  font-size: 0.74rem;
  cursor: pointer;
}
.chip-btn:hover { color: var(--accent); border-color: var(--accent); }
.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.progress-text { margin-top: 0.5rem; font-size: 0.82rem; color: var(--accent); }
.chart-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.75rem; }
.chart-card { background: var(--bg-sidebar); border-radius: 6px; padding: 0.5rem; text-align: center; }
.chart-card img { width: 100%; border-radius: 4px; }
.chart-card span { font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 0.3rem; }
.trace-panel { margin-top: 0.75rem; font-size: 0.8rem; }
.trace-step { display: flex; gap: 0.75rem; padding: 0.15rem 0; }
.agent-name { color: var(--accent); font-weight: 600; min-width: 110px; }
.ok { color: #4caf50; }
.fail { color: var(--error); }
.cell-source { font-size: 0.78rem; color: #888; padding: 0.5rem; overflow-x: auto; }
.btn-link { background: none; border: none; color: var(--text-muted); font-size: 0.78rem; cursor: pointer; margin-top: 0.5rem; }
.empty { display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); }
code { font-size: 0.8rem; color: var(--accent); }
</style>
