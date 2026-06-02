<script setup>
import { ref, onMounted, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { usePlotly } from '../composables/usePlotly'
import KpiCard from '../components/KpiCard.vue'

const store = useAppStore()

const entityPie = ref(null)
const relBar = ref(null)
const docuburst = ref(null)
const keywordChart = ref(null)
const categoryChart = ref(null)
const { render: renderEntityPie } = usePlotly(entityPie)
const { render: renderRelBar } = usePlotly(relBar)
const { render: renderDocuburst } = usePlotly(docuburst, { layout: { height: 600 } })
const { render: renderKeywords } = usePlotly(keywordChart, { layout: { height: 380, yaxis: { categoryorder: 'total ascending' } } })
const { render: renderCategories } = usePlotly(categoryChart, { layout: { height: 380 } })

function renderCharts() {
  if (!store.analysisResult) return
  const { stats, entityData, keywordData } = store

  // Entity pie
  const entityDist = stats?.entityDistribution || {}
  if (Object.keys(entityDist).length) {
    renderEntityPie([{
      type: 'pie', values: Object.values(entityDist), labels: Object.keys(entityDist),
      hole: 0.3, textposition: 'inside', textinfo: 'percent+label',
    }], { height: 350, showlegend: false })
  }

  // Rel bar
  const relDist = stats?.relationDistribution || {}
  if (Object.keys(relDist).length) {
    renderRelBar([{
      type: 'bar', x: Object.keys(relDist), y: Object.values(relDist),
      marker: { color: '#4a9eff' },
    }], { height: 350, xaxis: { tickangle: -30 } })
  }

  // DocuBurst
  const allNodes = entityData?.allNodes || []
  if (allNodes.length) {
    const data = [{ id: 'root', labels: '全部文档', parent: '', value: allNodes.length }]
    const typeCounts = {}, typeSet = new Set()
    allNodes.forEach(n => {
      const nt = n.type || 'Unknown', typeId = 'type_' + nt
      typeSet.add(typeId)
      typeCounts[typeId] = (typeCounts[typeId] || 0) + 1
      data.push({ id: typeId, labels: nt, parent: 'root', value: 0 })
      data.push({ id: 'e_' + n.id + '_' + nt, labels: ((n.text || n.id || '').slice(0, 20)), parent: typeId, value: 1 })
    })
    data.forEach(d => { if (typeSet.has(d.id)) d.value = typeCounts[d.id] || 0 })
    renderDocuburst([{ type: 'sunburst', ids: data.map(d => d.id), labels: data.map(d => d.labels), parents: data.map(d => d.parent), values: data.map(d => d.value), branchvalues: 'total', textinfo: 'label+percent parent', maxdepth: 3 }])
  }

  // Keywords
  const keywords = keywordData?.keywords || []
  if (keywords.length) {
    const top = keywords.slice(0, 15)
    renderKeywords([{ type: 'bar', x: top.map(k => k.score), y: top.map(k => k.term), orientation: 'h', marker: { color: '#ff7f50' } }])
  }

  // Categories
  const catDist = keywordData?.categoryDistribution || {}
  if (Object.keys(catDist).length) {
    renderCategories([{ type: 'pie', values: Object.values(catDist), labels: Object.keys(catDist), hole: 0.35, textposition: 'inside', textinfo: 'percent+label' }])
  }
}

onMounted(renderCharts)
watch(() => store.analysisResult, renderCharts)
</script>

<template>
  <div v-if="!store.fileProcessed" class="empty"><p>请先上传并处理文档。</p></div>
  <div v-else class="view">
    <h2 class="view-title">态势总览</h2>

    <div class="kpi-row">
      <KpiCard label="文本块数" :value="store.meta.totalChunks || 0" />
      <KpiCard label="识别实体" :value="store.meta.totalEntities || 0" />
      <KpiCard label="发现关系" :value="store.meta.totalRelations || 0" />
      <KpiCard label="识别人物" :value="store.personData.totalPersons || 0" />
      <KpiCard label="地理位置" :value="store.spatialData.totalLocations || 0" />
      <KpiCard label="总字符数" :value="(store.stats.totalChars || 0).toLocaleString()" />
    </div>

    <hr>

    <div class="chart-row">
      <div class="chart-half"><h4>实体类型分布</h4><div ref="entityPie" class="chart"/></div>
      <div class="chart-half"><h4>关系类型分布</h4><div ref="relBar" class="chart"/></div>
    </div>

    <details open><summary>文档内容层级结构 (DocuBurst)</summary><div ref="docuburst" class="chart"/></details>

    <hr>

    <div class="chart-row">
      <div class="chart-half"><h4>文档关键词 (TF-IDF)</h4><div ref="keywordChart" class="chart"/></div>
      <div class="chart-half"><h4>事件类别分布</h4><div ref="categoryChart" class="chart"/></div>
    </div>

    <h4>识别的人物名称</h4>
    <table class="table">
      <thead><tr><th>#</th><th>姓名</th><th>次数</th><th>头衔</th><th>上下文</th></tr></thead>
      <tbody>
        <tr v-for="(p, i) in (store.personData.personList || []).slice(0, 15)" :key="i">
          <td>{{ i + 1 }}</td><td>{{ p.name }}</td><td>{{ p.count }}</td>
          <td>{{ p.title || '-' }}</td><td class="ctx">{{ (p.context || '').slice(0, 80) }}</td>
        </tr>
      </tbody>
    </table>

    <h4>自动洞察</h4>
    <ul><li v-for="(ins, i) in store.insights" :key="i">{{ ins }}</li></ul>

    <hr>
    <h4>数据处理管线</h4>
    <div class="kpi-row">
      <KpiCard label="文档加载" :value="store.meta.totalChunks || 0" />
      <KpiCard label="关键词分析" :value="(store.keywordData.keywords || []).length" />
      <KpiCard label="人物识别" :value="store.personData.totalPersons || 0" />
      <KpiCard label="图谱构建" :value="`${store.meta.totalEntities || 0}实体/${store.meta.totalRelations || 0}关系`" />
      <KpiCard label="时间线" :value="`${store.meta.timelineEvents || 0}事件/${store.timeline.length}节点`" />
      <KpiCard label="空间提取" :value="store.spatialData.totalLocations || 0" />
    </div>
  </div>
</template>

<style scoped>
.view { max-width: 1400px; }
.view-title { font-size: 1.4rem; margin-bottom: 1rem; color: var(--accent); }
.kpi-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1rem 0; }
.chart-row { display: flex; gap: 1rem; }
.chart-half { flex: 1; min-width: 0; }
.chart { background: var(--bg-card); border-radius: 8px; min-height: 300px; }
h4 { font-size: 0.95rem; margin: 0.8rem 0 0.4rem; }
hr { border: none; border-top: 1px solid var(--border); margin: 1rem 0; }
.table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table th { background: var(--bg-sidebar); color: var(--text-muted); padding: 0.5rem 0.8rem; text-align: left; border-bottom: 2px solid var(--border); }
.table td { padding: 0.4rem 0.8rem; border-bottom: 1px solid var(--border); }
.ctx { color: var(--text-muted); font-size: 0.8rem; }
.empty { display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); }
details { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.8rem; margin: 0.5rem 0; }
details summary { cursor: pointer; font-weight: 600; }
</style>
